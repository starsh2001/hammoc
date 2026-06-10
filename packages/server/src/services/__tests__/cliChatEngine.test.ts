/**
 * CliChatEngine Tests (Epic 32 — Story 32.4)
 *
 * The engine is exercised against REAL temp-dir JSONL files (faithful parsing via
 * the real historyParser) with the PTY pool and session-path service mocked. This
 * verifies the parse → emit pipeline without spawning a real claude:
 *   - block emission order (thinking → text) + session init + usage + end_turn
 *   - §6.3 filter (meta / non-assistant / already-emitted excluded)
 *   - S-1 heartbeat: PTY data → onRawMessage during JSONL silence
 *   - abort cleanup, early-exit failure, resume seeding, arg mapping
 *   - rewindFiles delegation to the shared fileRewind helper + permission-mode store/return
 *   - permission round-trip (Story 32.6 — constrained): PTY-dialog detection →
 *     canUseTool reuse → allow/deny key (Enter/Esc) translation, false-positive
 *     guard, no-callback fallback, and the abort-while-awaiting race. All via mock
 *     PTY frames + a mock canUseTool (no real claude / real PTY).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import type { StreamCallbacks } from '@hammoc/shared';

// ---- Hoisted shared mocks (referenced by vi.mock factories) ----
const h = vi.hoisted(() => {
  type DataCb = (data: string) => void;
  type ExitCb = (e: { exitCode: number }) => void;

  const fakePty = {
    write: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
    _onData: null as DataCb | null,
    _onExit: null as ExitCb | null,
  };
  fakePty.onData.mockImplementation((cb: DataCb) => {
    fakePty._onData = cb;
  });
  fakePty.onExit.mockImplementation((cb: ExitCb) => {
    fakePty._onExit = cb;
  });

  const disposers = new Map<string, () => void>();
  const cliSessionPool = {
    spawnClaude: vi.fn((_opts: { cwd?: string; args: string[] }) => ({ handle: 'h1', pty: fakePty })),
    registerDisposer: vi.fn((handle: string, fn: () => void) => {
      disposers.set(handle, fn);
    }),
    interrupt: vi.fn(),
    dispose: vi.fn((handle: string) => {
      const fn = disposers.get(handle);
      if (fn) fn();
      disposers.delete(handle);
    }),
    destroyAll: vi.fn(),
  };

  const state = { sessionsDir: '' };
  const sessionService = {
    encodeProjectPath: (_p: string) => 'slug',
    getSessionsDir: (_p: string) => state.sessionsDir,
    getProjectDir: (_slug: string) => state.sessionsDir,
    getSessionFilePath: (_slug: string, id: string) => path.join(state.sessionsDir, `${id}.jsonl`),
  };

  const rewindSessionFiles = vi.fn();

  return { fakePty, disposers, cliSessionPool, state, sessionService, rewindSessionFiles };
});

vi.mock('../cliSessionPool.js', () => ({ cliSessionPool: h.cliSessionPool }));
vi.mock('../sessionService.js', () => ({ sessionService: h.sessionService, SessionService: class {} }));
vi.mock('../fileRewind.js', () => ({ rewindSessionFiles: h.rewindSessionFiles }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn() }),
}));

// Import after mocks. historyParser (real) is pulled in transitively for parseJSONLFile.
import { CliChatEngine } from '../cliChatEngine.js';
// NOT mocked — the real singleton; spied per-test to drive the usage-limit corroboration guard.
import { rateLimitProbeService } from '../rateLimitProbeService.js';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SID = '11111111-1111-4111-8111-111111111111';

function userLine(uuid: string): string {
  return JSON.stringify({
    type: 'user',
    uuid,
    timestamp: '2026-06-04T00:00:00.000Z',
    cwd: '/proj',
    message: { role: 'user', content: 'hello' },
  });
}

function assistantLine(
  uuid: string,
  opts: {
    parentUuid?: string;
    text?: string;
    thinking?: string;
    stopReason?: string;
    model?: string;
    isMeta?: boolean;
  } = {},
): string {
  const content: Array<Record<string, unknown>> = [];
  if (opts.thinking) content.push({ type: 'thinking', thinking: opts.thinking, signature: 'sig' });
  if (opts.text) content.push({ type: 'text', text: opts.text });
  return JSON.stringify({
    type: 'assistant',
    uuid,
    parentUuid: opts.parentUuid ?? 'u1',
    timestamp: '2026-06-04T00:00:01.000Z',
    entrypoint: 'cli',
    ...(opts.isMeta ? { isMeta: true } : {}),
    message: {
      role: 'assistant',
      model: opts.model ?? 'claude-opus-4-6',
      content,
      stop_reason: opts.stopReason ?? 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 },
    },
  });
}

function compactBoundaryLine(uuid: string, opts: { trigger?: string; preTokens?: number } = {}): string {
  return JSON.stringify({
    type: 'system',
    subtype: 'compact_boundary',
    uuid,
    timestamp: '2026-06-04T00:00:02.000Z',
    isMeta: false,
    content: 'Conversation compacted',
    compactMetadata: { trigger: opts.trigger ?? 'manual', preTokens: opts.preTokens ?? 1000, postTokens: 50 },
  });
}

async function writeSession(sid: string, lines: string[]): Promise<void> {
  await fs.writeFile(path.join(h.state.sessionsDir, `${sid}.jsonl`), lines.join('\n') + '\n', 'utf8');
}

describe('CliChatEngine', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    h.disposers.clear();
    h.fakePty._onData = null;
    h.fakePty._onExit = null;
    h.fakePty.onData.mockImplementation((cb: (d: string) => void) => {
      h.fakePty._onData = cb;
    });
    h.fakePty.onExit.mockImplementation((cb: (e: { exitCode: number }) => void) => {
      h.fakePty._onExit = cb;
    });
    h.cliSessionPool.spawnClaude.mockImplementation(() => ({ handle: 'h1', pty: h.fakePty }));
    h.cliSessionPool.dispose.mockImplementation((handle: string) => {
      const fn = h.disposers.get(handle);
      if (fn) fn();
      h.disposers.delete(handle);
    });
    h.state.sessionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-engine-'));
  });

  afterEach(async () => {
    await fs.rm(h.state.sessionsDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('permission mode', () => {
    it('stores and returns the permission mode', async () => {
      const engine = new CliChatEngine({ permissionMode: 'plan' });
      expect(engine.getPermissionMode()).toBe('plan');
      await engine.setPermissionMode('bypassPermissions');
      expect(engine.getPermissionMode()).toBe('bypassPermissions');
    });

    it('defaults permission mode to "default"', () => {
      expect(new CliChatEngine({}).getPermissionMode()).toBe('default');
    });
  });

  describe('rewindFiles (Story 32.5 — delegates to the shared billing-neutral helper)', () => {
    it('delegates to rewindSessionFiles with the params + workingDirectory and returns its result', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      h.rewindSessionFiles.mockResolvedValue({ canRewind: true, filesChanged: ['a.ts'], insertions: 3, deletions: 1 });

      const result = await engine.rewindFiles({ sessionId: 'sess', messageUuid: 'uuid-1', dryRun: true });

      // (1) delegates with params + cwd; (2) dryRun forwarded
      expect(h.rewindSessionFiles).toHaveBeenCalledWith({ sessionId: 'sess', messageUuid: 'uuid-1', dryRun: true }, '/proj');
      // (3) returns the RewindFilesResult verbatim (canRewind:true case)
      expect(result).toEqual({ canRewind: true, filesChanged: ['a.ts'], insertions: 3, deletions: 1 });
    });

    it('returns a canRewind:false result from the helper verbatim', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      h.rewindSessionFiles.mockResolvedValue({ canRewind: false, error: 'no checkpoint for this message' });

      const result = await engine.rewindFiles({ sessionId: 'sess', messageUuid: 'uuid-1' });

      expect(result).toEqual({ canRewind: false, error: 'no checkpoint for this message' });
      expect(h.rewindSessionFiles).toHaveBeenCalledWith({ sessionId: 'sess', messageUuid: 'uuid-1' }, '/proj');
    });

    it('propagates errors thrown by the helper', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      h.rewindSessionFiles.mockRejectedValue(new Error('rewind boom'));

      await expect(engine.rewindFiles({ sessionId: 'sess', messageUuid: 'uuid-1' })).rejects.toThrow('rewind boom');
    });

    it('returns canRewind:false WITHOUT calling the helper when no workingDirectory is configured', async () => {
      const engine = new CliChatEngine({});

      const result = await engine.rewindFiles({ sessionId: 'sess', messageUuid: 'uuid-1' });

      expect(result.canRewind).toBe(false);
      expect(result.error).toMatch(/workingDirectory/);
      expect(h.rewindSessionFiles).not.toHaveBeenCalled();
    });
  });

  describe('sendMessageWithCallbacks — new session core', () => {
    it('emits thinking → text → complete and resolves the assembled ChatResponse', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj', permissionMode: 'default' });
      const onThinking = vi.fn();
      const onTextChunk = vi.fn();
      const onComplete = vi.fn();
      const onSessionInit = vi.fn();
      const onError = vi.fn();
      const onRawMessage = vi.fn();
      const callbacks: StreamCallbacks = { onThinking, onTextChunk, onComplete, onSessionInit, onError };

      const promise = engine.sendMessageWithCallbacks('hello', callbacks, { sessionId: SID }, undefined, onRawMessage);

      await wait(30);
      expect(h.cliSessionPool.spawnClaude).toHaveBeenCalledTimes(1);

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { thinking: 'pondering', text: 'Hi there' })]);

      const response = await promise;

      expect(onSessionInit).toHaveBeenCalledWith(SID, expect.objectContaining({ model: 'claude-opus-4-6', cwd: '/proj' }));
      expect(onThinking).toHaveBeenCalledWith('pondering');
      expect(onTextChunk).toHaveBeenCalledWith(expect.objectContaining({ sessionId: SID, content: 'Hi there', done: false }));
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();

      expect(response).toMatchObject({ id: 'a1', sessionId: SID, content: 'Hi there', done: true, isError: false });
      expect(response.usage).toMatchObject({ inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 2, cacheCreationInputTokens: 1 });

      // thinking must precede text
      expect(onThinking.mock.invocationCallOrder[0]).toBeLessThan(onTextChunk.mock.invocationCallOrder[0]);
      // PTY pool was disposed exactly once on completion (no leak)
      expect(h.cliSessionPool.dispose).toHaveBeenCalledWith('h1');
    });

    it('emits live context via onContextEstimate per usage line (1M window for Opus; total = input + both caches)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onContextEstimate = vi.fn();
      const callbacks: StreamCallbacks = { onComplete: vi.fn(), onError: vi.fn(), onContextEstimate };

      const promise = engine.sendMessageWithCallbacks('hi', callbacks, { sessionId: SID, model: 'claude-opus-4-8' }, undefined, vi.fn());
      await wait(30);
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'Hi', model: 'claude-opus-4-8' })]);
      const response = await promise;

      // numerator = input(10) + cache_read(2) + cache_creation(1) = 13; Opus → 1M denominator
      expect(onContextEstimate).toHaveBeenCalledWith(13, 1_000_000);
      // final usage carries the same window (ring denominator, no longer the hidden-making 0)
      expect(response.usage?.contextWindow).toBe(1_000_000);
    });

    it('uses the 200K window for a non-1M model (bare Sonnet)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onContextEstimate = vi.fn();
      const callbacks: StreamCallbacks = { onComplete: vi.fn(), onError: vi.fn(), onContextEstimate };

      const promise = engine.sendMessageWithCallbacks('hi', callbacks, { sessionId: SID, model: 'claude-sonnet-4-6' }, undefined, vi.fn());
      await wait(30);
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'Hi', model: 'claude-sonnet-4-6' })]);
      const response = await promise;

      expect(onContextEstimate).toHaveBeenCalledWith(13, 200_000);
      expect(response.usage?.contextWindow).toBe(200_000);
    });

    it('builds interactive args: --session-id (new) + --permission-mode, never --print', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj', permissionMode: 'acceptEdits' });
      const promise = engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());

      await wait(30);
      const spawnArg = h.cliSessionPool.spawnClaude.mock.calls[0][0];
      expect(spawnArg.args).toEqual(expect.arrayContaining(['--session-id', SID, '--permission-mode', 'acceptEdits']));
      expect(spawnArg.args).not.toContain('--print');
      expect(spawnArg.args).not.toContain('-p');
      expect(spawnArg.args).not.toContain('--output-format');
      expect(spawnArg.args).not.toContain('--resume');
      expect(spawnArg.cwd).toBe('/proj');

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'done' })]);
      await promise;
    });

    it('injects --settings with a background-block PreToolUse hook + thinking summaries by default', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const promise = engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());
      await wait(30);
      const spawnArg = h.cliSessionPool.spawnClaude.mock.calls[0][0];
      const i = (spawnArg.args as string[]).indexOf('--settings');
      expect(i).toBeGreaterThanOrEqual(0);
      const settings = JSON.parse((spawnArg.args as string[])[i + 1]);
      // Story 36.1: the background-block command hook is ALWAYS injected
      expect(settings.hooks.PreToolUse[0].matcher).toBe('Bash');
      expect(settings.hooks.PreToolUse[0].hooks[0].type).toBe('command');
      expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain('block-background.cjs');
      // thinking summaries ON by default
      expect(settings.showThinkingSummaries).toBe(true);
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('keeps the background-block hook but omits showThinkingSummaries when cliShowThinkingSummaries is false', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj', cliShowThinkingSummaries: false });
      const promise = engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());
      await wait(30);
      const spawnArg = h.cliSessionPool.spawnClaude.mock.calls[0][0];
      const i = (spawnArg.args as string[]).indexOf('--settings');
      expect(i).toBeGreaterThanOrEqual(0);
      const settings = JSON.parse((spawnArg.args as string[])[i + 1]);
      // background-block hook still present (always-on), only thinking is gated off
      expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain('block-background.cjs');
      expect(settings.showThinkingSummaries).toBeUndefined();
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('submits the prompt as text then a SEPARATE Enter once boot output settles (bracketed-paste safe)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const promise = engine.sendMessageWithCallbacks('hello world', { onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());

      await wait(20);
      // Simulate claude's boot render INCLUDING the input-box marker (❯); the engine
      // only injects once the box is ready and output then goes quiet.
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ Try "fix typecheck"');

      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('hello world'), { timeout: 2000 });
      // Enter is a SEPARATE write sent a clear gap (>CLI_SUBMIT_GAP_MS) after the text.
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('\r'), { timeout: 3000 });

      const writes = h.fakePty.write.mock.calls.map((c) => c[0]);
      expect(writes).not.toContain('hello world\r'); // text and Enter are never glued

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('does NOT blind-inject at the 4s fallback when the ❯ box has not rendered yet (slow MCP boot); injects once it does', async () => {
      // Regression: a heavy-MCP project (e.g. taskvee ~6s boot) renders the input box past the 4s
      // checkpoint. The old fallback blind-injected at CLI_MAX_BOOT_WAIT_MS into a box that did not
      // exist yet → the prompt was lost and the turn hung in "응답대기중" forever. The fix only
      // blind-injects once the ❯ marker has actually been seen.
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const promise = engine.sendMessageWithCallbacks('hi there', { onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());

      await wait(20);
      // Boot output WITHOUT the ❯ marker — claude is still connecting MCP servers.
      h.fakePty._onData?.('Connecting MCP servers…\nLoading plugins…');
      await wait(4300); // past the 4s first fallback checkpoint
      expect(h.fakePty.write).not.toHaveBeenCalledWith('hi there'); // box not ready → no blind inject

      // The box finally renders → settle → inject.
      h.fakePty._onData?.('❯ ');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('hi there'), { timeout: 2000 });

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('emits boot/inject phases launching → submitting → waiting, then null once generation starts (Story 36.2)', async () => {
      const phases: (string | null)[] = [];
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const promise = engine.sendMessageWithCallbacks(
        'hi',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID },
        undefined,
        vi.fn(),
        vi.fn(), // onGenerationProgress present so emitProgress runs and clears the phase
        (p) => phases.push(p), // onPhase
      );
      await wait(20);
      expect(phases[0]).toBe('launching'); // emitted right after spawn
      // boot render with the ❯ marker → injection (submitting), then a SEPARATE Enter (waiting)
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ Try "fix typecheck"');
      await vi.waitFor(() => expect(phases).toContain('submitting'), { timeout: 2000 });
      await vi.waitFor(() => expect(phases).toContain('waiting'), { timeout: 3000 });
      // a spinner counter frame → generation started → phase ends (null hand-off to progress)
      h.fakePty._onData?.('✻ Working… (1s · ↓ 42 tokens)');
      await vi.waitFor(() => expect(phases).toContain(null), { timeout: 2000 });
      expect(phases.indexOf('launching')).toBeLessThan(phases.indexOf('submitting'));
      expect(phases.indexOf('submitting')).toBeLessThan(phases.indexOf('waiting'));
      expect(phases.indexOf('waiting')).toBeLessThan(phases.indexOf(null));
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('ends the phase on the first assistant block even without a spinner counter (Story 36.2 AC1)', async () => {
      const phases: (string | null)[] = [];
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const promise = engine.sendMessageWithCallbacks(
        'hi',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID },
        undefined,
        vi.fn(),
        vi.fn(),
        (p) => phases.push(p),
      );
      await wait(20);
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ Try "fix typecheck"');
      await vi.waitFor(() => expect(phases).toContain('waiting'), { timeout: 3000 });
      // NO spinner counter frame — go straight to the first session block. handleAssistantLine
      // (not emitProgress) must clear the phase, covering the spinner-less response (AC1).
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
      expect(phases).toContain(null);
      expect(phases.indexOf('waiting')).toBeLessThan(phases.indexOf(null));
    });

    it('accumulates multiple text blocks into the final content', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onTextChunk = vi.fn();
      const promise = engine.sendMessageWithCallbacks('hi', { onTextChunk, onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());

      await wait(30);
      await writeSession(SID, [
        userLine('u1'),
        JSON.stringify({
          type: 'assistant',
          uuid: 'a1',
          parentUuid: 'u1',
          timestamp: '2026-06-04T00:00:01.000Z',
          message: {
            role: 'assistant',
            model: 'claude-opus-4-6',
            content: [
              { type: 'text', text: 'Part one. ' },
              { type: 'text', text: 'Part two.' },
            ],
            stop_reason: 'end_turn',
          },
        }),
      ]);

      const response = await promise;
      expect(onTextChunk).toHaveBeenCalledTimes(2);
      expect(response.content).toBe('Part one. Part two.');
    });
  });

  describe('image attachments (CLI mode)', () => {
    it('grants --add-dir for the attachment directory', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj', permissionMode: 'default' });
      const imgPath = path.join('/mock/projects/slug/images/sess', 'abc1234567890def.png');
      const promise = engine.sendMessageWithCallbacks(
        'describe this',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID, attachedImagePaths: [imgPath] },
        undefined,
        vi.fn(),
      );

      await wait(30);
      const spawnArg = h.cliSessionPool.spawnClaude.mock.calls[0][0];
      expect(spawnArg.args).toEqual(expect.arrayContaining(['--add-dir', path.dirname(imgPath)]));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'done' })]);
      await promise;
    });

    it('appends a Read-tool instruction referencing every attachment path, and de-dupes shared dirs', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const a = '/mock/projects/slug/images/sess/aaa1111111111111.png';
      const b = '/mock/projects/slug/images/sess/bbb2222222222222.png';
      const promise = engine.sendMessageWithCallbacks(
        'what is in these',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID, attachedImagePaths: [a, b] },
        undefined,
        vi.fn(),
      );

      await wait(20);
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ Try "fix typecheck"');

      await vi.waitFor(
        () => {
          const writes = h.fakePty.write.mock.calls.map((c) => c[0]);
          const injected = writes.find(
            (w): w is string => typeof w === 'string' && w.includes('what is in these'),
          );
          expect(injected).toBeTruthy();
          expect(injected).toContain(a);
          expect(injected).toContain(b);
          expect(injected).toMatch(/Read tool/i);
        },
        { timeout: 3000 },
      );

      // a and b share one directory → exactly one --add-dir grant (de-duped)
      const spawnArg = h.cliSessionPool.spawnClaude.mock.calls[0][0];
      const addDirCount = (spawnArg.args as string[]).filter((x) => x === '--add-dir').length;
      expect(addDirCount).toBe(1);

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('injects the raw prompt and adds no --add-dir when there are no attachments', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const promise = engine.sendMessageWithCallbacks(
        'plain message',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID },
        undefined,
        vi.fn(),
      );

      await wait(20);
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('plain message'), { timeout: 3000 });

      const spawnArg = h.cliSessionPool.spawnClaude.mock.calls[0][0];
      expect(spawnArg.args).not.toContain('--add-dir');

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });
  });

  describe('§6.3 filter', () => {
    it('ignores bookkeeping, meta, and non-assistant lines', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onTextChunk = vi.fn();
      const onComplete = vi.fn();
      const promise = engine.sendMessageWithCallbacks('hi', { onTextChunk, onComplete, onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());

      await wait(30);
      await writeSession(SID, [
        JSON.stringify({ type: 'summary', uuid: 's0', summary: 'x', timestamp: '2026-06-04T00:00:00.000Z' }),
        userLine('u1'),
        JSON.stringify({ type: 'system', uuid: 'sys1', subtype: 'permission-mode', timestamp: '2026-06-04T00:00:00.500Z' }),
        assistantLine('meta1', { text: 'SHOULD NOT APPEAR', isMeta: true, stopReason: 'tool_use' }),
        assistantLine('a1', { text: 'real answer' }),
      ]);

      const response = await promise;
      const emittedContents = onTextChunk.mock.calls.map((c) => (c[0] as { content: string }).content);
      expect(emittedContents).toEqual(['real answer']);
      expect(emittedContents).not.toContain('SHOULD NOT APPEAR');
      expect(response.content).toBe('real answer');
    });

    it('does not complete until an end_turn block arrives (tool_use stop_reason keeps watching)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onComplete = vi.fn();
      const onTextChunk = vi.fn();
      const promise = engine.sendMessageWithCallbacks('hi', { onTextChunk, onComplete, onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());

      await wait(30);
      // First assistant block ends with tool_use (not end_turn) — must not complete.
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'working…', stopReason: 'tool_use' })]);
      await wait(60);
      expect(onComplete).not.toHaveBeenCalled();
      expect(onTextChunk).toHaveBeenCalledWith(expect.objectContaining({ content: 'working…' }));

      // Append the final end_turn block.
      await fs.appendFile(
        path.join(h.state.sessionsDir, `${SID}.jsonl`),
        assistantLine('a2', { parentUuid: 'a1', text: 'all done' }) + '\n',
        'utf8',
      );
      const response = await promise;
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(response.content).toBe('working…all done');
    });
  });

  describe('S-1 inactivity-timeout heartbeat', () => {
    it('forwards PTY data frames as onRawMessage during JSONL silence', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onRawMessage = vi.fn();
      const promise = engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, onRawMessage);

      await wait(30);
      // No JSONL written yet (the silent-generation gap). Simulate spinner / token frames.
      expect(typeof h.fakePty._onData).toBe('function');
      h.fakePty._onData?.('⠋ Forging…');
      h.fakePty._onData?.('↓ 42 tokens');
      expect(onRawMessage).toHaveBeenCalledTimes(2);
      expect(onRawMessage).toHaveBeenLastCalledWith('cli-pty-activity');

      // Settle the turn so the watcher/timers tear down.
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });
  });

  describe('abort + lifecycle', () => {
    it('on abort: interrupts the PTY, disposes, and rejects without onError', async () => {
      const ac = new AbortController();
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onError = vi.fn();
      const promise = engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError }, { abortController: ac }, undefined, vi.fn());

      await wait(30);
      ac.abort('timeout');

      await expect(promise).rejects.toThrow(/aborted/i);
      expect(h.cliSessionPool.interrupt).toHaveBeenCalledWith('h1');
      expect(h.cliSessionPool.dispose).toHaveBeenCalledWith('h1');
      expect(onError).not.toHaveBeenCalled();
    });

    it('fails (onError + reject) if the PTY exits before end_turn', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onError = vi.fn();
      const promise = engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError }, { sessionId: SID }, undefined, vi.fn());

      await wait(30);
      expect(typeof h.fakePty._onExit).toBe('function');
      h.fakePty._onExit?.({ exitCode: 1 });

      await expect(promise).rejects.toThrow(/exited/i);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(h.cliSessionPool.dispose).toHaveBeenCalledWith('h1');
    });

    it('rejects immediately if the abort signal is already aborted', async () => {
      const ac = new AbortController();
      ac.abort();
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      await expect(
        engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError: vi.fn() }, { abortController: ac }, undefined, vi.fn()),
      ).rejects.toThrow(/aborted/i);
    });
  });

  describe('compact completion (CLI /compact hang fix)', () => {
    it('completes the turn on a compact_boundary line (no end_turn) instead of hanging forever', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onComplete = vi.fn();
      const onError = vi.fn();
      const promise = engine.sendMessageWithCallbacks('/compact', { onComplete, onError }, { sessionId: SID }, undefined, vi.fn());

      await wait(30);
      // /compact writes a synthetic stop_sequence assistant + a compact_boundary system line,
      // but NEVER an end_turn — the boundary must complete the turn (else it hangs forever).
      await writeSession(SID, [userLine('u1'), compactBoundaryLine('cb1')]);

      const response = await promise; // resolves — no hang
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(response.done).toBe(true);
    });

    it('ignores a PRIOR compact_boundary already in the transcript when resuming (no instant finish)', async () => {
      // Pre-existing transcript: a PAST compaction + a past assistant turn.
      await writeSession(SID, [userLine('u0'), compactBoundaryLine('cb-old'), assistantLine('a-old', { text: 'old' })]);

      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onComplete = vi.fn();
      const promise = engine.sendMessageWithCallbacks('again', { onComplete, onError: vi.fn() }, { resume: SID }, undefined, vi.fn());

      await wait(30);
      // Resume seeded the old boundary + old assistant → neither ends this turn.
      expect(onComplete).not.toHaveBeenCalled();

      // A fresh end_turn assistant arrives → now it completes (the old boundary stayed ignored).
      await writeSession(SID, [
        userLine('u0'),
        compactBoundaryLine('cb-old'),
        assistantLine('a-old', { text: 'old' }),
        assistantLine('a-new', { text: 'fresh' }),
      ]);

      const response = await promise;
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(response.content).toBe('fresh');
    });
  });

  describe('resume', () => {
    it('uses --resume (not --session-id), seeds existing uuids, and emits only the new turn', async () => {
      // Pre-existing history with one old assistant turn.
      await writeSession(SID, [userLine('u1'), assistantLine('old1', { text: 'OLD ANSWER' })]);

      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onTextChunk = vi.fn();
      const onComplete = vi.fn();
      const promise = engine.sendMessageWithCallbacks('again', { onTextChunk, onComplete, onError: vi.fn() }, { resume: SID }, undefined, vi.fn());

      await wait(30);
      const spawnArg = h.cliSessionPool.spawnClaude.mock.calls[0][0];
      expect(spawnArg.args).toContain('--resume');
      expect(spawnArg.args).toContain(SID);
      expect(spawnArg.args).not.toContain('--session-id');

      // Append the NEW turn.
      await fs.appendFile(
        path.join(h.state.sessionsDir, `${SID}.jsonl`),
        [userLine('u2'), assistantLine('new1', { parentUuid: 'u2', text: 'NEW ANSWER' })].join('\n') + '\n',
        'utf8',
      );

      const response = await promise;
      const emitted = onTextChunk.mock.calls.map((c) => (c[0] as { content: string }).content);
      expect(emitted).toEqual(['NEW ANSWER']);
      expect(emitted).not.toContain('OLD ANSWER');
      expect(response).toMatchObject({ sessionId: SID, content: 'NEW ANSWER' });
    });
  });

  describe('permission round-trip (Story 32.6 — constrained, canUseTool reuse)', () => {
    // The permission modal the engine sees AFTER its ANSI strip. Strong markers:
    // a "Do you want to <verb>…?" sentence + the fully-rendered footer.
    const PERM_DIALOG = [
      ' ● Write(probe.txt)',
      ' Create file',
      ' probe.txt',
      ' Do you want to create probe.txt?',
      ' ❯ 1. Yes',
      '   2. Yes, allow all edits during this session (shift+tab)',
      '   3. No',
      ' Esc to cancel · Tab to amend',
    ].join('\n');

    // Drive the engine to the post-injection state (where dialog detection is live):
    // feed a boot frame with the ❯ marker, then wait until the prompt was injected.
    // Returns the turn promise WRAPPED in an object — an async fn auto-flattens a
    // returned promise, which would make the caller `await` the whole turn (deadlock,
    // since the turn only completes once the test writes the session afterwards).
    async function injectThenReady(engine: CliChatEngine, canUseTool: unknown): Promise<{ turn: Promise<unknown> }> {
      const turn = engine.sendMessageWithCallbacks(
        'do the thing',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID },
        canUseTool as never,
        vi.fn(),
      );
      // sendMessageWithCallbacks is async — wait until it has registered pty.onData
      // before feeding the boot frame, else the frame is lost (the engine is still in
      // its async prelude). Matches the existing tests' `await wait(30)` pattern.
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });
      return { turn };
    }

    it('detects the dialog, calls the passed canUseTool, and injects Enter on allow', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn().mockResolvedValue({ behavior: 'allow', updatedInput: {} });
      const { turn } = await injectThenReady(engine, canUseTool);

      h.fakePty._onData?.(PERM_DIALOG);

      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1));
      const [toolName, input, opts] = canUseTool.mock.calls[0] as [string, Record<string, unknown>, { toolUseID: string; signal: AbortSignal }];
      expect(toolName).toBe('Write'); // scraped from "Do you want to create"
      expect(input).toEqual({ prompt: expect.stringContaining('Do you want to create probe.txt') });
      expect(opts.toolUseID).toMatch(/^cli-perm-/); // synthesized — no real id in JSONL pre-approval
      expect(opts.signal).toBeInstanceOf(AbortSignal);

      // allow → Enter ('\r'). The 1s submit-Enter timer has not fired yet, so this
      // '\r' is the approval key. The deny key ('\x1b') must be absent.
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('\r'));
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b');

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'done' })]);
      await turn;
    });

    it('injects Esc on deny', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn().mockResolvedValue({ behavior: 'deny', message: 'nope' });
      const { turn } = await injectThenReady(engine, canUseTool);

      h.fakePty._onData?.(PERM_DIALOG);

      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('\x1b')); // deny → Esc (unambiguous)

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('does NOT trigger on non-dialog output (echoed prompt / spinner / half-rendered dialog)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn().mockResolvedValue({ behavior: 'allow' });
      const { turn } = await injectThenReady(engine, canUseTool);

      // (a) echoed prompt + generation footer: has "esc to interrupt" but no perm phrase.
      h.fakePty._onData?.('❯ run the bash command\n· Actioning…  esc to interrupt');
      // (b) half-rendered dialog: perm phrase present, but the footer (full render) absent.
      h.fakePty._onData?.(' Do you want to create probe.txt?\n ❯ 1. Yes');
      await wait(60);

      expect(canUseTool).not.toHaveBeenCalled();
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b');

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('ignores permission dialogs when no canUseTool is provided (launch-flag posture fallback)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const promise = engine.sendMessageWithCallbacks(
        'do the thing',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID },
        undefined,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });

      h.fakePty._onData?.(PERM_DIALOG);
      await wait(60);

      // No callback → the engine cannot decide; it neither approves nor denies.
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b');

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('on abort while awaiting the decision, injects no key (abort race — AC3 ②)', async () => {
      const ac = new AbortController();
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      let resolvePerm: ((v: unknown) => void) | undefined;
      const canUseTool = vi.fn(() => new Promise((r) => { resolvePerm = r; }));
      const promise = engine.sendMessageWithCallbacks(
        'do the thing',
        { onComplete: vi.fn(), onError: vi.fn() },
        { abortController: ac },
        canUseTool as never,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });

      h.fakePty._onData?.(PERM_DIALOG);
      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1));

      ac.abort('timeout');
      await expect(promise).rejects.toThrow(/aborted/i);
      expect(h.cliSessionPool.interrupt).toHaveBeenCalledWith('h1');

      const writeCountAtAbort = h.fakePty.write.mock.calls.length;
      resolvePerm?.({ behavior: 'allow' }); // late verdict after teardown
      await wait(20);
      expect(h.fakePty.write.mock.calls.length).toBe(writeCountAtAbort); // nothing injected post-abort
    });

  });

  describe('live tool cards (Story 32.9 — onToolUse/onToolResult parity + permission-gated suppression)', () => {
    // A real CLI tool_use assistant line (verified shape from real CLI sessions:
    // {type:'tool_use', id:'toolu_…', name, input}; one message may carry several = parallel).
    function toolUseLine(
      uuid: string,
      tools: Array<{ id: string; name: string; input?: Record<string, unknown> }>,
      opts: { parentUuid?: string; stopReason?: string } = {},
    ): string {
      return JSON.stringify({
        type: 'assistant', uuid, parentUuid: opts.parentUuid ?? 'u1', timestamp: '2026-06-04T00:00:01.000Z', entrypoint: 'cli',
        message: {
          role: 'assistant', model: 'claude-opus-4-6',
          content: tools.map((t) => ({ type: 'tool_use', id: t.id, name: t.name, input: t.input ?? {} })),
          stop_reason: opts.stopReason ?? 'tool_use',
        },
      });
    }
    // A user tool_result line (verified shape: {type:'tool_result', tool_use_id, content, is_error}).
    function toolResultLine(
      uuid: string,
      results: Array<{ tool_use_id: string; content: string; is_error?: boolean }>,
      parentUuid = 'a1',
    ): string {
      return JSON.stringify({
        type: 'user', uuid, parentUuid, timestamp: '2026-06-04T00:00:02.000Z',
        message: {
          role: 'user',
          content: results.map((r) => ({
            type: 'tool_result', tool_use_id: r.tool_use_id, content: r.content,
            ...(r.is_error !== undefined ? { is_error: r.is_error } : {}),
          })),
        },
      });
    }

    const PERM_DIALOG = (verb = 'create', file = 'probe.txt') =>
      [` Do you want to ${verb} ${file}?`, ' ❯ 1. Yes', '   2. Yes, allow all edits during this session', ' Esc to cancel · Tab to amend'].join('\n');

    it('emits onToolUse (SDK TrackedToolCall mapping) + onToolResult for an auto-approved tool, then completes', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const onToolResult = vi.fn();
      const onComplete = vi.fn();
      // No canUseTool → no permission flow → tools are auto-approved/safe (live-emit path).
      const promise = engine.sendMessageWithCallbacks(
        'hi', { onToolUse, onToolResult, onComplete, onTextChunk: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn(),
      );

      await wait(30);
      await writeSession(SID, [
        userLine('u1'),
        toolUseLine('a1', [{ id: 'toolu_1', name: 'Write', input: { file_path: 'x.txt', content: 'hi' } }]),
        toolResultLine('tr1', [{ tool_use_id: 'toolu_1', content: 'File written', is_error: false }]),
        assistantLine('a2', { parentUuid: 'a1', text: 'finished' }),
      ]);

      const response = await promise;
      // onToolUse: real toolu_ id, status pending, input passes through (so "which file" shows live).
      expect(onToolUse).toHaveBeenCalledTimes(1);
      expect(onToolUse).toHaveBeenCalledWith({ id: 'toolu_1', name: 'Write', input: { file_path: 'x.txt', content: 'hi' }, status: 'pending' });
      // onToolResult: matched by the same id, success = !is_error.
      expect(onToolResult).toHaveBeenCalledTimes(1);
      expect(onToolResult).toHaveBeenCalledWith('toolu_1', { success: true, output: 'File written', error: undefined });
      // Tool blocks contribute no text; final content is the end_turn text only.
      expect(response.content).toBe('finished');
      // Ordering: onToolUse → onToolResult → complete.
      expect(onToolUse.mock.invocationCallOrder[0]).toBeLessThan(onToolResult.mock.invocationCallOrder[0]);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('maps an error tool_result to {success:false, error} (output undefined) and strips XML wrappers', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolResult = vi.fn();
      const promise = engine.sendMessageWithCallbacks(
        'hi', { onToolUse: vi.fn(), onToolResult, onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn(),
      );
      await wait(30);
      await writeSession(SID, [
        userLine('u1'),
        toolUseLine('a1', [{ id: 'toolu_e', name: 'Bash', input: { command: 'false' } }]),
        toolResultLine('tr1', [{ tool_use_id: 'toolu_e', content: '<tool_use_error>boom</tool_use_error>', is_error: true }]),
        assistantLine('a2', { parentUuid: 'a1', text: 'done' }),
      ]);
      await promise;
      expect(onToolResult).toHaveBeenCalledWith('toolu_e', { success: false, output: undefined, error: 'boom' });
    });

    it('emits each parallel tool_use block in order (one assistant message, multiple tools)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const promise = engine.sendMessageWithCallbacks(
        'hi', { onToolUse, onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn(),
      );
      await wait(30);
      await writeSession(SID, [
        userLine('u1'),
        toolUseLine('a1', [
          { id: 'toolu_a', name: 'Glob', input: { pattern: '*.ts' } },
          { id: 'toolu_b', name: 'Glob', input: { pattern: '*.md' } },
          { id: 'toolu_c', name: 'Grep', input: { pattern: 'foo' } },
        ]),
        assistantLine('a2', { parentUuid: 'a1', text: 'searched' }),
      ]);
      await promise;
      expect(onToolUse).toHaveBeenCalledTimes(3);
      expect(onToolUse.mock.calls.map((c) => (c[0] as { id: string }).id)).toEqual(['toolu_a', 'toolu_b', 'toolu_c']);
      expect(onToolUse.mock.calls.map((c) => (c[0] as { name: string }).name)).toEqual(['Glob', 'Glob', 'Grep']);
    });

    it('does not double-emit a tool across re-parses (drain re-reads the whole file as it grows)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const onToolResult = vi.fn();
      const promise = engine.sendMessageWithCallbacks(
        'hi', { onToolUse, onToolResult, onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn(),
      );
      await wait(30);
      // First drain: tool_use + its result (no end_turn yet).
      await writeSession(SID, [
        userLine('u1'),
        toolUseLine('a1', [{ id: 'toolu_1', name: 'Read', input: { file_path: 'a' } }]),
        toolResultLine('tr1', [{ tool_use_id: 'toolu_1', content: 'contents', is_error: false }]),
      ]);
      await vi.waitFor(() => expect(onToolResult).toHaveBeenCalledTimes(1));
      // Append the end_turn — triggers another full re-parse of the same growing file.
      await fs.appendFile(path.join(h.state.sessionsDir, `${SID}.jsonl`), assistantLine('a2', { parentUuid: 'a1', text: 'done' }) + '\n', 'utf8');
      await promise;
      expect(onToolUse).toHaveBeenCalledTimes(1); // toolu_1 emitted exactly once
      expect(onToolResult).toHaveBeenCalledTimes(1);
    });

    it('SUPPRESSES the live tool card for a permission-gated tool (standalone card + reload cover it)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const onToolResult = vi.fn();
      const canUseTool = vi.fn().mockResolvedValue({ behavior: 'allow', updatedInput: {} });
      const turn = engine.sendMessageWithCallbacks(
        'do the thing', { onToolUse, onToolResult, onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, canUseTool as never, vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });
      // Permission dialog detected → standalone card emitted (32.6) + suppression credit (32.9).
      h.fakePty._onData?.(PERM_DIALOG('create', 'probe.txt'));
      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });
      // The approved tool's tool_use block now lands in JSONL — it must NOT be live-emitted.
      await writeSession(SID, [
        userLine('u1'),
        toolUseLine('a1', [{ id: 'toolu_perm', name: 'Write', input: { file_path: 'probe.txt' } }]),
        toolResultLine('tr1', [{ tool_use_id: 'toolu_perm', content: 'written', is_error: false }]),
        assistantLine('a2', { parentUuid: 'a1', text: 'created it' }),
      ]);
      const response = await turn;
      expect(onToolUse).not.toHaveBeenCalled(); // suppressed — the standalone permission card stands in
      expect(onToolResult).not.toHaveBeenCalled(); // result also left to reload (no orphan tool:result)
      expect(response.content).toBe('created it');
    });

    it('mixes a SUPPRESSED permission-gated tool and a LIVE auto-approved tool in one turn (FIFO)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const onToolResult = vi.fn();
      const canUseTool = vi.fn().mockResolvedValue({ behavior: 'allow', updatedInput: {} });
      // Spawn with the spy callbacks directly (the shared injectThenReady hardcodes its own).
      const turn = engine.sendMessageWithCallbacks(
        'do things', { onToolUse, onToolResult, onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, canUseTool as never, vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do things'), { timeout: 2000 });
      // ONE permission dialog → exactly one suppression credit.
      h.fakePty._onData?.(PERM_DIALOG('create', 'gated.txt'));
      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });
      // The gated Write block (suppressed) then an auto-approved Read block (live), in one turn.
      await writeSession(SID, [
        userLine('u1'),
        toolUseLine('a1', [{ id: 'toolu_gated', name: 'Write', input: { file_path: 'gated.txt' } }]),
        toolResultLine('tr1', [{ tool_use_id: 'toolu_gated', content: 'ok', is_error: false }], 'a1'),
        toolUseLine('a2', [{ id: 'toolu_free', name: 'Read', input: { file_path: 'free.txt' } }], { parentUuid: 'a1' }),
        toolResultLine('tr2', [{ tool_use_id: 'toolu_free', content: 'data', is_error: false }], 'a2'),
        assistantLine('a3', { parentUuid: 'a2', text: 'done' }),
      ]);
      await turn;
      // Only the auto-approved tool is live; the gated one is suppressed.
      expect(onToolUse).toHaveBeenCalledTimes(1);
      expect(onToolUse).toHaveBeenCalledWith({ id: 'toolu_free', name: 'Read', input: { file_path: 'free.txt' }, status: 'pending' });
      expect(onToolResult).toHaveBeenCalledTimes(1);
      expect(onToolResult).toHaveBeenCalledWith('toolu_free', { success: true, output: 'data', error: undefined });
    });
  });

  describe('AskUserQuestion round-trip (Story 32.8 — constrained, canUseTool reuse)', () => {
    // The selection modal the engine sees AFTER its ANSI strip — verified shape (Task 1):
    // a header tab, the question, numbered options, the auto-appended "Type something" /
    // "Chat about this" rows, and the nav footer ("Enter to select · ↑/↓ to navigate")
    // which (with "Chat about this") is distinct from a permission dialog.
    const Q_MODAL_SINGLE = [
      ' ☐ Color',
      ' Which color do you want?',
      ' ❯ 1. Red',
      '      The color red.',
      '   2. Green',
      '      The color green.',
      '   3. Blue',
      '      The color blue.',
      '   4. Type something.',
      '   5. Chat about this',
      ' Enter to select · ↑/↓ to navigate · Esc to cancel',
    ].join('\n');

    // multiSelect: checkboxes "[ ]" + a header "✔ Submit" tab reached with → (Task 1).
    const Q_MODAL_MULTI = [
      ' ←  ☐ Pets  ✔ Submit  →',
      ' Which pets do you want? Choose any.',
      ' ❯ 1. [ ] Cat',
      '   A cat.',
      '   2. [ ] Dog',
      '   A dog.',
      '   3. [ ] Fish',
      '   A fish.',
      '   4. [ ] Type something',
      '      Submit',
      '   5. Chat about this',
      ' Enter to select · ↑/↓ to navigate · Esc to cancel',
    ].join('\n');

    // A 2-question (tabbed) modal: >1 ballot-box tab in the header → NOT a single
    // round-trip, so the constrained bridge guards it (Esc) rather than half-answering.
    const Q_MODAL_MULTIQ = [
      ' ←  ☐ Color  ☐ Size  ✔ Submit  →',
      ' Which color do you want?',
      ' ❯ 1. Red',
      '   2. Green',
      '   4. Type something.',
      '   5. Chat about this',
      ' Enter to select · ↑/↓ to navigate · Esc to cancel',
    ].join('\n');

    // A modal wrapped in the TUI's box-drawing chrome (┌─┐ │ └─┘) — the bug report's
    // "일) ──────" stretched row and "│"-laden labels. The scrape must strip every box glyph so
    // labels are clean and a chrome-only fragment never becomes its own option.
    const Q_MODAL_BOXED = [
      ' ☐ Spinner',
      ' Which spinner motion?',
      ' ┌────────────────────────────────┐',
      ' │ ❯ 1. Rotating dot ───────────── │',
      ' │      A rotating dot.            │',
      ' │   2. Bounce dot │ one glyph     │',
      ' │   3. Type something.            │',
      ' │   4. Chat about this            │',
      ' └────────────────────────────────┘',
      ' Enter to select · ↑/↓ to navigate · Esc to cancel',
    ].join('\n');

    async function injectThenReady(engine: CliChatEngine, canUseTool: unknown): Promise<{ turn: Promise<unknown> }> {
      const turn = engine.sendMessageWithCallbacks(
        'ask me something',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID },
        canUseTool as never,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('ask me something'), { timeout: 2000 });
      return { turn };
    }

    const countWrites = (key: string): number => h.fakePty.write.mock.calls.filter((c) => c[0] === key).length;

    it('detects the modal, scrapes questions/options, calls canUseTool, and drives ↓+Enter for the choice', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn().mockResolvedValue({
        behavior: 'allow',
        updatedInput: { questions: [], answers: { 'Which color do you want?': 'Green' } },
      });
      const { turn } = await injectThenReady(engine, canUseTool);

      h.fakePty._onData?.(Q_MODAL_SINGLE);

      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });
      const [toolName, input, opts] = canUseTool.mock.calls[0] as [string, Record<string, unknown>, { toolUseID: string; signal: AbortSignal }];
      expect(toolName).toBe('AskUserQuestion');
      // Scraped single question — options in modal-row order (self-consistent with the ↓-count).
      expect(input).toEqual({
        questions: [
          { question: 'Which color do you want?', header: 'Color', multiSelect: false, options: [{ label: 'Red' }, { label: 'Green' }, { label: 'Blue' }] },
        ],
      });
      expect(opts.toolUseID).toMatch(/^cli-q-/); // synthesized — no real id in JSONL pre-answer
      expect(opts.signal).toBeInstanceOf(AbortSignal);

      // Green = index 1 → exactly one ↓, then Enter. The ↓/→/Space keys are unambiguous
      // (only the question drive writes them); Enter is shared with the prompt-submit so
      // we assert an Enter FOLLOWS the down rather than counting it.
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('\x1b[B'), { timeout: 2000 });
      await vi.waitFor(() => {
        const writes = h.fakePty.write.mock.calls.map((c) => c[0]);
        const di = writes.indexOf('\x1b[B');
        expect(writes.slice(di + 1)).toContain('\r');
      });
      expect(countWrites('\x1b[B')).toBe(1); // single ↓ (index 1)
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b[C'); // single-select: no → Submit
      expect(h.fakePty.write).not.toHaveBeenCalledWith(' '); // single-select: no Space toggle
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b'); // not cancelled

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'Picked Green' })]);
      await turn;
    });

    it('emits the prose rendered ABOVE the modal BEFORE the question card, and dedups the late JSONL copy (ordering fix)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onTextChunk = vi.fn();
      let chunksBeforeCard = -1;
      const canUseTool = vi.fn().mockImplementation(async () => {
        chunksBeforeCard = onTextChunk.mock.calls.length; // chunks emitted before the card is raised
        return { behavior: 'allow', updatedInput: { answers: { 'Which color do you want?': 'Red' } } }; // index 0
      });
      const turn = engine.sendMessageWithCallbacks(
        'ask me something',
        { onComplete: vi.fn(), onError: vi.fn(), onTextChunk },
        { sessionId: SID },
        canUseTool as never,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('ask me something'), { timeout: 2000 });

      // The lead-in explanation the model rendered ABOVE the modal — flushed to the JSONL only
      // post-answer, so it must be scraped from the screen and emitted first.
      const prose = '현재 구조를 다 파악했습니다. 정리하면 두 가지 방식이 있습니다.';
      h.fakePty._onData?.([
        prose,
        ' ☐ Color',
        ' Which color do you want?',
        ' ❯ 1. Red',
        '   2. Green',
        '   4. Type something.',
        '   5. Chat about this',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ].join('\n'));

      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });
      // The prose was emitted, and it preceded the card (≥1 chunk already out when canUseTool fired).
      expect(onTextChunk).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('정리하면') }));
      expect(chunksBeforeCard).toBeGreaterThanOrEqual(1);

      // The same prose arrives in the JSONL after the answer — its live re-emit is deduped, so the
      // explanation is shown exactly once live (the turn-end reload is authoritative regardless).
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: prose })]);
      await turn;
      const proseEmits = onTextChunk.mock.calls.filter((c) => String((c[0] as { content: string }).content).includes('정리하면'));
      expect(proseEmits).toHaveLength(1);
    });

    it('strips box-drawing chrome (─ │) from scraped option labels (bug: stretched / │-laden rows)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn().mockResolvedValue({
        behavior: 'allow',
        updatedInput: { answers: { 'Which spinner motion?': 'Rotating dot' } }, // index 0
      });
      const { turn } = await injectThenReady(engine, canUseTool);

      h.fakePty._onData?.(Q_MODAL_BOXED);

      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });
      const [, input] = canUseTool.mock.calls[0] as [string, Record<string, unknown>];
      // Every box glyph is stripped: labels are clean, the ──── stretch and │ separators are gone,
      // and a chrome-only fragment never becomes its own option (affordance rows still dropped).
      expect(input).toEqual({
        questions: [
          {
            question: 'Which spinner motion?',
            header: 'Spinner',
            multiSelect: false,
            options: [{ label: 'Rotating dot' }, { label: 'Bounce dot one glyph' }],
          },
        ],
      });
      const labels = (input.questions as Array<{ options: Array<{ label: string }> }>)[0].options.map((o) => o.label);
      labels.forEach((l) => expect(l).not.toMatch(/[─-▟]/));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'Picked' })]);
      await turn;
    });

    it('drives N ↓ presses for a later option (index 2 → two ↓)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn().mockResolvedValue({
        behavior: 'allow',
        updatedInput: { answers: { 'Which color do you want?': 'Blue' } }, // index 2
      });
      const { turn } = await injectThenReady(engine, canUseTool);
      h.fakePty._onData?.(Q_MODAL_SINGLE);

      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });
      // Two downs to reach Blue, then Enter. Wait until both downs are in, then until the
      // Enter (sent CLI_QUESTION_KEY_GAP_MS after the last down) follows it.
      await vi.waitFor(() => expect(countWrites('\x1b[B')).toBe(2), { timeout: 2000 });
      await vi.waitFor(() => {
        const writes = h.fakePty.write.mock.calls.map((c) => c[0]);
        expect(writes.slice(writes.lastIndexOf('\x1b[B') + 1)).toContain('\r');
      }, { timeout: 2000 });

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'Picked Blue' })]);
      await turn;
    });

    it('multiSelect: Space-toggles each pick, then → to Submit + Enter', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn().mockResolvedValue({
        behavior: 'allow',
        // Cat (idx 0) + Fish (idx 2) selected. This is the REAL single-question multiSelect form:
        // the web card returns a bare array which the reused canUseTool branch joins with ", " into
        // one string (websocket.ts:2674 / queueService.ts:845). Inject THAT joined string — not a
        // { question: [...] } object, which only the multi-question path (Esc-guarded by the CLI)
        // ever produces and is therefore unreachable in this pipeline (QA 32.8-TEST-FIDELITY).
        updatedInput: { answers: { 'Which pets do you want? Choose any.': 'Cat, Fish' } },
      });
      const { turn } = await injectThenReady(engine, canUseTool);
      h.fakePty._onData?.(Q_MODAL_MULTI);

      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });
      const [, input] = canUseTool.mock.calls[0] as [string, Record<string, unknown>];
      expect(input).toEqual({
        questions: [
          {
            question: 'Which pets do you want? Choose any.',
            header: 'Pets',
            multiSelect: true,
            options: [{ label: 'Cat' }, { label: 'Dog' }, { label: 'Fish' }],
          },
        ],
      });

      // Drive ends with → (right) then Enter — wait for the unambiguous right key.
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('\x1b[C'), { timeout: 3000 });
      // Cat at idx 0 (Space, no down) + Fish at idx 2 (two downs, Space) → then → Submit.
      expect(countWrites(' ')).toBe(2); // two checkbox toggles
      expect(countWrites('\x1b[B')).toBe(2); // two downs to reach Fish
      expect(countWrites('\x1b[C')).toBe(1); // one → to the Submit tab
      // Enter submits after → (sent CLI_QUESTION_KEY_GAP_MS later — poll for it).
      await vi.waitFor(() => {
        const writes = h.fakePty.write.mock.calls.map((c) => c[0]);
        expect(writes.slice(writes.indexOf('\x1b[C') + 1)).toContain('\r');
      }, { timeout: 2000 });

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'Picked Cat+Fish' })]);
      await turn;
    });

    it('guards a multi-question (tabbed) modal: Esc-cancels WITHOUT calling canUseTool', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn();
      const { turn } = await injectThenReady(engine, canUseTool);
      h.fakePty._onData?.(Q_MODAL_MULTIQ);

      // Detected (footer + affordance) but unparseable as ONE round-trip → Esc, no card.
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('\x1b'), { timeout: 2000 });
      expect(canUseTool).not.toHaveBeenCalled();
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b[B');
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b[C');

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'cancelled' })]);
      await turn;
    });

    it('guards an answer that maps to no listed option (custom/Other): canUseTool called, then Esc', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn().mockResolvedValue({
        behavior: 'allow',
        updatedInput: { answers: { 'Which color do you want?': 'Purple' } }, // not a listed option
      });
      const { turn } = await injectThenReady(engine, canUseTool);
      h.fakePty._onData?.(Q_MODAL_SINGLE);

      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('\x1b'), { timeout: 2000 }); // Esc — not drivable
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b[B'); // no wrong selection driven
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b[C');

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'cancelled' })]);
      await turn;
    });

    it('does NOT detect a selection menu lacking the "Chat about this" affordance (false-positive guard)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn();
      const { turn } = await injectThenReady(engine, canUseTool);

      // Footer present, but no "Chat about this" (e.g. a different list UI) → not a question.
      h.fakePty._onData?.([' ❯ 1. Option A', '   2. Option B', ' Enter to select · ↑/↓ to navigate · Esc to cancel'].join('\n'));
      await wait(80);

      expect(canUseTool).not.toHaveBeenCalled();
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b');
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b[B');

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('ignores question modals when no canUseTool is provided (launch-flag posture fallback)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const promise = engine.sendMessageWithCallbacks(
        'ask me something',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID },
        undefined,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('ask me something'), { timeout: 2000 });

      h.fakePty._onData?.(Q_MODAL_SINGLE);
      await wait(80);

      // No callback → no card, no key drive, no cancel.
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b[B');
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b[C');
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b');

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('on abort while awaiting the answer, injects no menu key (abort race)', async () => {
      const ac = new AbortController();
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      let resolveAns: ((v: unknown) => void) | undefined;
      const canUseTool = vi.fn(() => new Promise((r) => { resolveAns = r; }));
      const promise = engine.sendMessageWithCallbacks(
        'ask me something',
        { onComplete: vi.fn(), onError: vi.fn() },
        { abortController: ac },
        canUseTool as never,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('ask me something'), { timeout: 2000 });

      h.fakePty._onData?.(Q_MODAL_SINGLE);
      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });

      ac.abort('timeout');
      await expect(promise).rejects.toThrow(/aborted/i);
      const writeCountAtAbort = h.fakePty.write.mock.calls.length;
      resolveAns?.({ behavior: 'allow', updatedInput: { answers: { 'Which color do you want?': 'Green' } } }); // late answer
      await wait(60);
      expect(h.fakePty.write.mock.calls.length).toBe(writeCountAtAbort); // nothing injected post-abort
    });

    it('routes a PERMISSION dialog to handlePermission, not the question path (cross-detection isolation)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn().mockResolvedValue({ behavior: 'allow', updatedInput: {} });
      const { turn } = await injectThenReady(engine, canUseTool);

      h.fakePty._onData?.(
        [' Do you want to create probe.txt?', ' ❯ 1. Yes', '   2. Yes, allow all edits during this session', ' Esc to cancel · Tab to amend'].join('\n'),
      );

      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });
      // The permission path scrapes a tool name — NEVER 'AskUserQuestion'.
      expect(canUseTool.mock.calls[0][0]).toBe('Write');

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'done' })]);
      await turn;
    });
  });

  describe('usage-limit notice (stops the turn — the limit shows only on the PTY, never in JSONL)', () => {
    async function injectThenReady(engine: CliChatEngine, callbacks: Partial<StreamCallbacks>): Promise<{ turn: Promise<unknown> }> {
      const turn = engine.sendMessageWithCallbacks(
        'do the thing',
        { onComplete: vi.fn(), onError: vi.fn(), ...callbacks } as StreamCallbacks,
        { sessionId: SID },
        undefined,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });
      return { turn };
    }

    it('fails the turn with the exact scraped sentence when the weekly limit is hit', async () => {
      // Real usage data corroborates the scrape (some window at the cap) → fail fast.
      const corroborated = vi.spyOn(rateLimitProbeService, 'isLimitCorroborated').mockReturnValue(true);
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onError = vi.fn();
      const { turn } = await injectThenReady(engine, { onError });

      // The exhaustion notice — only ever on screen; the JSONL never gets an end_turn here, so
      // without detection the turn hangs forever.
      h.fakePty._onData?.("✻ You've hit your weekly limit · resets 1am (Asia/Seoul)");

      await expect(turn).rejects.toThrow(/weekly limit/i);
      expect(onError).toHaveBeenCalled();
      // The message is forwarded verbatim, including the reset time the user needs.
      expect(String((onError.mock.calls[0][0] as Error).message)).toMatch(/resets 1am/i);
      // PTY is torn down so the claude process does not linger at the limit screen.
      expect(h.cliSessionPool.dispose).toHaveBeenCalled();
      corroborated.mockRestore();
    });

    it('does NOT fail on the limit sentence painted BEFORE injection (resumed-transcript repaint)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onError = vi.fn();
      const onComplete = vi.fn();
      const turn = engine.sendMessageWithCallbacks(
        'do the thing',
        { onComplete, onError } as StreamCallbacks,
        { sessionId: SID },
        undefined,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      // `claude --resume` repaints prior chat that merely QUOTED the banner. It paints
      // pre-injection (before the ❯ readiness marker), so it must NOT fail the turn even though
      // the exact exhaustion sentence (verb + reset clause) is on screen — this is the root-cause
      // false positive: a session that once discussed the limit would otherwise die every turn.
      h.fakePty._onData?.("⏺ 메시지(You've hit your weekly limit · resets 1am (Asia/Seoul)) 처리 방식");
      await wait(40);
      expect(onError).not.toHaveBeenCalled();
      // The prompt box then renders → injection proceeds as usual.
      h.fakePty._onData?.('\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });
      // A normal end_turn completes the turn — the repaint never blocked it.
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
      expect(onComplete).toHaveBeenCalled();
    });

    it('does NOT fail post-injection when real usage data refutes the scraped limit (false positive)', async () => {
      // Authoritative usage shows headroom on every window → the on-screen sentence is content
      // (e.g. claude's own answer quoted it), not a live notice.
      const refuted = vi.spyOn(rateLimitProbeService, 'isLimitCorroborated').mockReturnValue(false);
      try {
        const engine = new CliChatEngine({ workingDirectory: '/proj' });
        const onError = vi.fn();
        const onComplete = vi.fn();
        const { turn } = await injectThenReady(engine, { onError, onComplete });

        h.fakePty._onData?.("✻ You've hit your weekly limit · resets 1am (Asia/Seoul)");
        await wait(40);
        expect(onError).not.toHaveBeenCalled();

        // The normal JSONL end_turn still completes the turn.
        await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
        await turn;
        expect(onComplete).toHaveBeenCalled();
      } finally {
        refuted.mockRestore();
      }
    });

    it('does NOT stop on the still-usable percentage warning (97%)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onError = vi.fn();
      const onComplete = vi.fn();
      const { turn } = await injectThenReady(engine, { onError, onComplete });

      // At 97% generation continues — this must NOT stop the turn (false-positive guard).
      h.fakePty._onData?.("✻ Working… You've used 97% of your weekly limit · resets 1am (Asia/Seoul)");
      await wait(40);
      expect(onError).not.toHaveBeenCalled();

      // A normal end_turn still completes the turn afterwards.
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
      expect(onComplete).toHaveBeenCalled();
    });
  });

  describe('generation progress (Story 32.7 — spinner "↓ N tokens" parsing)', () => {
    // Drive the engine to the post-injection state (where progress parsing is live):
    // feed a boot frame with the ❯ marker, then wait until the prompt was injected.
    // Returns the turn promise WRAPPED (an async fn would auto-flatten and deadlock —
    // same pattern as the permission block's helper).
    async function injectThenReady(
      engine: CliChatEngine,
      onProgress?: (p: { tokens: number; elapsedSeconds: number }) => void,
    ): Promise<{ turn: Promise<unknown> }> {
      const turn = engine.sendMessageWithCallbacks(
        'do the thing',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID },
        undefined, // canUseTool
        vi.fn(), // onRawMessage
        onProgress, // 6th arg (Story 32.7)
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });
      return { turn };
    }

    it('parses the real-PTY literal "↓ N tokens" + elapsed and emits on value change (throttle)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      // Task 1 literal: "<glyph> Verb… (Es · ↓ N tokens [· thinking with <effort> effort])".
      h.fakePty._onData?.('✢ Moseying… (6s · ↓ 246 tokens · thinking with high effort)');
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 246, elapsedSeconds: 6 }));

      // Same value re-render (spinner glyph cycles but counter unchanged) → no re-emit.
      const callsAfterFirst = onProgress.mock.calls.length;
      h.fakePty._onData?.('✶ Moseying… (6s · ↓ 246 tokens · thinking with high effort)');
      await wait(20);
      expect(onProgress.mock.calls.length).toBe(callsAfterFirst);

      // Counter climbs → emit. (Also covers the counter-only form, no thinking suffix.)
      h.fakePty._onData?.('✻ Moseying… (8s · ↓ 312 tokens)');
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 312, elapsedSeconds: 8 }));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('drops a fused / malformed counter from an in-place redraw (no token spike, recovers next frame)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      // Clean baseline.
      h.fakePty._onData?.('✢ Moseying… (5s · ↓ 365 tokens)');
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 365, elapsedSeconds: 5 }));
      const callsBefore = onProgress.mock.calls.length;

      // An in-place redraw the ANSI strip fused — "365" then "366" → "365366" (comma-less, 6
      // digits, a ~1000x jump) — must be dropped, not surfaced as an absurd count...
      h.fakePty._onData?.('✢ Moseying… (5s · ↓ 365366 tokens)');
      // ...and a malformed thousands grouping (two grouped values spliced) likewise.
      h.fakePty._onData?.('✢ Moseying… (5s · ↓ 1,2341,234 tokens)');
      await wait(30);
      expect(onProgress.mock.calls.length).toBe(callsBefore); // neither was emitted
      expect(onProgress).not.toHaveBeenCalledWith(expect.objectContaining({ tokens: 365366 }));

      // The next clean frame recovers normally.
      h.fakePty._onData?.('✢ Moseying… (5s · ↓ 366 tokens)');
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 366, elapsedSeconds: 5 }));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('drops a fused counter on the turn\'s FIRST frame too (magnitude cap, no prior value to diff)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      // The very FIRST counter we see is already fused ("365" + "366" → "365366"). The
      // implausible-jump guard needs a prior value, so only the magnitude cap can catch this —
      // it must, or the "여전히 큰 숫자" leaks on the first frame (the residual Story 32.7 hole).
      h.fakePty._onData?.('✢ Moseying… (5s · ↓ 365366 tokens)');
      await wait(30);
      expect(onProgress).not.toHaveBeenCalled();

      // The next clean frame emits normally (recovery).
      h.fakePty._onData?.('✢ Moseying… (5s · ↓ 366 tokens)');
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 366, elapsedSeconds: 5 }));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('forwards a segment-boundary reset (high→low) as a change so the indicator never freezes (Task 1)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      h.fakePty._onData?.('Moseying… (16s · ↓ 614 tokens)');
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 614, elapsedSeconds: 16 }));
      // A new generation segment (after a tool use) resets BOTH counter and clock to a
      // low base — change-detection forwards it (increase-only would have suppressed it).
      h.fakePty._onData?.('Moseying… (2s · ↓ 79 tokens)');
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 79, elapsedSeconds: 2 }));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('survives a frame split across two onData calls (rolling buffer)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      // The counter is split mid-number across frames; the rolling buffer rejoins it.
      h.fakePty._onData?.('Moseying… (9s · ↓ 36');
      await wait(15);
      expect(onProgress).not.toHaveBeenCalled(); // "↓ 36" alone is not yet "N tokens"
      h.fakePty._onData?.('5 tokens · thinking with high effort)');
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 365, elapsedSeconds: 9 }));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('ignores frames with no counter (false-0 guard) — never emits a phantom 0', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      // A spinner with no "↓ N tokens" (early thinking phase / interrupt footer only).
      h.fakePty._onData?.('✢ Deliberating…  esc to interrupt');
      await wait(30);
      expect(onProgress).not.toHaveBeenCalled();

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('is a no-op when no onGenerationProgress is provided (queue path)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      // 6th arg omitted — mirrors queueService (no live progress UI there).
      const turn = engine.sendMessageWithCallbacks(
        'do the thing',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID },
        undefined,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });

      // A spinner frame must not crash when there is no callback to call.
      expect(() => h.fakePty._onData?.('Moseying… (6s · ↓ 246 tokens)')).not.toThrow();
      await wait(20);

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('emits no progress after abort (settled guard)', async () => {
      const ac = new AbortController();
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const turn = engine.sendMessageWithCallbacks(
        'do the thing',
        { onComplete: vi.fn(), onError: vi.fn() },
        { abortController: ac },
        undefined,
        vi.fn(),
        onProgress,
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });

      ac.abort('timeout');
      await expect(turn).rejects.toThrow(/aborted/i);

      const callsAtAbort = onProgress.mock.calls.length;
      // A late spinner frame after teardown must not emit.
      h.fakePty._onData?.('Moseying… (9s · ↓ 400 tokens)');
      await wait(20);
      expect(onProgress.mock.calls.length).toBe(callsAtAbort);
    });
  });

  describe('guards', () => {
    it('throws when no workingDirectory is configured', async () => {
      const engine = new CliChatEngine({});
      await expect(
        engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError: vi.fn() }, {}, undefined, vi.fn()),
      ).rejects.toThrow(/workingDirectory/);
    });
  });
});
