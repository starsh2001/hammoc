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

  // A STABLE logger (returned for every createLogger call) so a test can assert the engine's
  // own `log.warn` (Story 37.5 fail-safe warns exactly once). All methods are no-op spies, so
  // identity-stability is the only behavior change vs. fresh-per-call.
  const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn() };

  return { fakePty, disposers, cliSessionPool, state, sessionService, rewindSessionFiles, logger };
});

vi.mock('../cliSessionPool.js', () => ({ cliSessionPool: h.cliSessionPool }));
vi.mock('../sessionService.js', () => ({ sessionService: h.sessionService, SessionService: class {} }));
vi.mock('../fileRewind.js', () => ({ rewindSessionFiles: h.rewindSessionFiles }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => h.logger,
}));

// Import after mocks. historyParser (real) is pulled in transitively for parseJSONLFile.
import { CliChatEngine, buildMultiQuestionKeys, buildQuestionKeys } from '../cliChatEngine.js';
// NOT mocked — the real singleton; spied per-test to drive the usage-limit corroboration guard.
import { rateLimitProbeService } from '../rateLimitProbeService.js';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Story 37.4: the permission / question / usage-limit detectors now read the headless screen
// GRID, not a linear ANSI-stripped buffer. claude paints each modal row at an ABSOLUTE cursor
// position; a plain "\n"-joined frame would staircase (each line starting where the last ended)
// and wrap past 120 cols, breaking the grid layout the detectors read. So modal frames are
// rendered the way claude renders them: clear the screen, then address + erase + write each row
// (the same in-place model the 37.2 `drawSpinner` helper uses). Clearing first means a frame's
// rows are the ONLY thing on the grid, so a prior boot banner can't leak into a row scrape.
const ESC = '\x1b';
const drawModal = (lines: string[], startRow = 4): string =>
  `${ESC}[2J${ESC}[H` + lines.map((line, i) => `${ESC}[${startRow + i};1H${ESC}[2K${line}`).join('');

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

// claude's standalone interrupt marker — a user-text line with NO end_turn (the turn-end safety net).
function interruptLine(uuid: string): string {
  return JSON.stringify({
    type: 'user',
    uuid,
    timestamp: '2026-06-04T00:00:03.000Z',
    cwd: '/proj',
    message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] },
  });
}

async function writeSession(sid: string, lines: string[]): Promise<void> {
  await fs.writeFile(path.join(h.state.sessionsDir, `${sid}.jsonl`), lines.join('\n') + '\n', 'utf8');
}

// ISSUE-99: the answer→keys translation for a MULTI-question modal is pure (questions + answers →
// one option-key array per tab), so it is exercised directly — no engine, no PTY, no timing. The
// engine's handleMultiQuestion then drives keys[i] on tab i and adds the inter-tab → / final Enter.
describe('buildMultiQuestionKeys (ISSUE-99 — multi-question answer → per-tab option keys, pure)', () => {
  const DOWN = '\x1b[B';
  const SPACE = ' ';
  const Q_COLOR = { question: 'Which color?', header: 'Color', multiSelect: false, options: [{ label: 'Red' }, { label: 'Green' }, { label: 'Blue' }] };
  const Q_SIZE = { question: 'Which sizes?', header: 'Size', multiSelect: true, options: [{ label: 'Small' }, { label: 'Large' }, { label: 'XL' }] };

  it('single-select per question: ↓×index, and NOTHING for index 0 (highlight = the recorded answer)', () => {
    const keys = buildMultiQuestionKeys(
      [Q_COLOR, { ...Q_COLOR, question: 'Second?' }],
      { 'Which color?': 'Green', 'Second?': 'Red' }, // index 1, index 0
    );
    expect(keys).toEqual([[DOWN], []]); // Green = one ↓; Red (index 0) = no move
  });

  it('multiSelect question: walks down toggling each pick with Space (array answer, NOT joined)', () => {
    // Small (idx 0) + XL (idx 2): Space at 0, then two downs to XL, Space — no leading down for idx 0.
    expect(buildMultiQuestionKeys([Q_SIZE], { 'Which sizes?': ['Small', 'XL'] })).toEqual([[SPACE, DOWN, DOWN, SPACE]]);
  });

  it('mixes single + multi questions in tab order', () => {
    const keys = buildMultiQuestionKeys([Q_COLOR, Q_SIZE], { 'Which color?': 'Blue', 'Which sizes?': ['Large'] }); // Blue idx2; Large idx1
    expect(keys).toEqual([[DOWN, DOWN], [DOWN, SPACE]]);
  });

  it('returns null when ANY answer maps to no listed option (custom/Other → cancel the WHOLE modal)', () => {
    expect(buildMultiQuestionKeys([Q_COLOR, Q_SIZE], { 'Which color?': 'Green', 'Which sizes?': ['Nope'] })).toBeNull();
    expect(buildMultiQuestionKeys([Q_COLOR], { 'Which color?': 'Purple' })).toBeNull();
  });

  it('falls back to the POSITIONAL answer when the question-text key is absent (insertion order = tab order)', () => {
    const keys = buildMultiQuestionKeys([Q_COLOR, { ...Q_COLOR, question: 'Second?' }], { a: 'Green', b: 'Blue' });
    expect(keys).toEqual([[DOWN], [DOWN, DOWN]]); // Green idx1, Blue idx2 — by position
  });

  it('returns null when answers is undefined', () => {
    expect(buildMultiQuestionKeys([Q_COLOR], undefined)).toBeNull();
  });
});

describe('buildQuestionKeys (single-question — Story 37.15 custom/Other free-text)', () => {
  const DOWN = '\x1b[B';
  const ENTER = '\r';
  const Q = { question: 'Color?', header: 'Color', multiSelect: false, options: [{ label: 'Red' }, { label: 'Blue' }] };

  it('drives a custom/free-text answer via the "Type something" item: ↓×optionCount → Enter → type → Enter', () => {
    // 실측 (probe-askq): from option-0 highlight, ↓×2 lands on "Type something" (the item after the 2 real
    // options), Enter opens text-input, the text is typed, Enter submits.
    expect(buildQuestionKeys(Q, 'Purple')).toEqual([DOWN, DOWN, ENTER, 'Purple', ENTER]);
  });

  it('still drives a LISTED option the normal way (↓×index, Enter)', () => {
    expect(buildQuestionKeys(Q, 'Blue')).toEqual([DOWN, ENTER]); // Blue = index 1
    expect(buildQuestionKeys(Q, 'Red')).toEqual([ENTER]);        // Red = index 0
  });

  it('returns null for a custom answer in a multiSelect question (still unsupported → caller cancels)', () => {
    expect(buildQuestionKeys({ ...Q, multiSelect: true }, 'Nope')).toBeNull();
  });

  it('returns null when there is no answer', () => {
    expect(buildQuestionKeys(Q, undefined)).toBeNull();
  });
});

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
      // Story 37.5 fix: the PTY is ALWAYS spawned in bypass (SDK parity — every mode reachable live);
      // the button mode (acceptEdits here) is applied via boot-time screen alignment, not the spawn flag.
      expect(spawnArg.args).toEqual(expect.arrayContaining(['--session-id', SID, '--permission-mode', 'bypassPermissions']));
      expect(spawnArg.args).not.toContain('--print');
      expect(spawnArg.args).not.toContain('-p');
      expect(spawnArg.args).not.toContain('--output-format');
      expect(spawnArg.args).not.toContain('--resume');
      expect(spawnArg.cwd).toBe('/proj');

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'done' })]);
      await promise;
    });

    it('injects --settings with thinking summaries + verbose by default', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const promise = engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());
      await wait(30);
      const spawnArg = h.cliSessionPool.spawnClaude.mock.calls[0][0];
      const i = (spawnArg.args as string[]).indexOf('--settings');
      expect(i).toBeGreaterThanOrEqual(0);
      const settings = JSON.parse((spawnArg.args as string[])[i + 1]);
      expect(settings.showThinkingSummaries).toBe(true);
      expect(settings.verbose).toBe(true);
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('omits showThinkingSummaries when cliShowThinkingSummaries is false', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj', cliShowThinkingSummaries: false });
      const promise = engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());
      await wait(30);
      const spawnArg = h.cliSessionPool.spawnClaude.mock.calls[0][0];
      const i = (spawnArg.args as string[]).indexOf('--settings');
      expect(i).toBeGreaterThanOrEqual(0);
      const settings = JSON.parse((spawnArg.args as string[])[i + 1]);
      expect(settings.showThinkingSummaries).toBeUndefined();
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('injects autoCompactEnabled:true into --settings by default (shared auto-compact switch)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const promise = engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());
      await wait(30);
      const spawnArg = h.cliSessionPool.spawnClaude.mock.calls[0][0];
      const i = (spawnArg.args as string[]).indexOf('--settings');
      const settings = JSON.parse((spawnArg.args as string[])[i + 1]);
      expect(settings.autoCompactEnabled).toBe(true);
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('injects autoCompactEnabled:false into --settings when the preference is off', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj', autoCompactEnabled: false });
      const promise = engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());
      await wait(30);
      const spawnArg = h.cliSessionPool.spawnClaude.mock.calls[0][0];
      const i = (spawnArg.args as string[]).indexOf('--settings');
      const settings = JSON.parse((spawnArg.args as string[])[i + 1]);
      expect(settings.autoCompactEnabled).toBe(false);
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('appends the Hammoc workspace context via --append-system-prompt (SDK-mode parity)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const promise = engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());
      await wait(30);
      const spawnArg = h.cliSessionPool.spawnClaude.mock.calls[0][0];
      const i = (spawnArg.args as string[]).indexOf('--append-system-prompt');
      expect(i).toBeGreaterThanOrEqual(0);
      const appended = (spawnArg.args as string[])[i + 1];
      // The default Hammoc context — identity + the clickable-link convention SDK mode injects.
      expect(appended).toContain('# Hammoc Context');
      expect(appended).toContain('You are running inside Hammoc');
      // {homeDir} is resolved at runtime (not left as a literal placeholder) — same substitution as SDK mode.
      expect(appended).not.toContain('{homeDir}');
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('honors customSystemPrompt over the default template in --append-system-prompt', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const promise = engine.sendMessageWithCallbacks(
        'hi',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID, customSystemPrompt: 'Custom override referencing {homeDir}.' },
        undefined,
        vi.fn(),
      );
      await wait(30);
      const spawnArg = h.cliSessionPool.spawnClaude.mock.calls[0][0];
      const i = (spawnArg.args as string[]).indexOf('--append-system-prompt');
      expect(i).toBeGreaterThanOrEqual(0);
      const appended = (spawnArg.args as string[])[i + 1];
      expect(appended).toContain('Custom override referencing');
      expect(appended).not.toContain('# Hammoc Context');
      // {variable} resolution still applies to the custom prompt (parity with SDK mode).
      expect(appended).not.toContain('{homeDir}');
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

    it('does NOT finish on an AUTO compact_boundary — the response after it completes the turn', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onComplete = vi.fn();
      const onCompact = vi.fn();
      const promise = engine.sendMessageWithCallbacks('big task', { onComplete, onError: vi.fn(), onCompact }, { sessionId: SID }, undefined, vi.fn());

      await wait(30);
      // Context-limit auto-compaction lands MID-turn: claude compacts first, then resumes the real
      // answer. The boundary must surface a marker but NOT end the turn (else the answer is stranded).
      await writeSession(SID, [userLine('u1'), compactBoundaryLine('cb-auto', { trigger: 'auto' })]);

      await wait(30);
      expect(onCompact).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'auto' }));
      expect(onComplete).not.toHaveBeenCalled(); // still waiting for the real response

      // The genuine end_turn assistant arrives after the compaction → now the turn completes.
      await writeSession(SID, [
        userLine('u1'),
        compactBoundaryLine('cb-auto', { trigger: 'auto' }),
        assistantLine('a-after', { text: 'answer after compaction' }),
      ]);

      const response = await promise;
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onCompact).toHaveBeenCalledTimes(1); // not re-fired when the boundary is re-read
      expect(response.content).toBe('answer after compaction');
    });
  });

  describe('interrupt completion (turn-end safety net — ISSUE-99 follow-up)', () => {
    it('completes the turn on a "[Request interrupted by user]" line (no end_turn) instead of hanging', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onComplete = vi.fn();
      const onError = vi.fn();
      const promise = engine.sendMessageWithCallbacks('do the thing', { onComplete, onError }, { sessionId: SID }, undefined, vi.fn());

      await wait(30);
      // An interrupt writes a standalone user-text marker and NO end_turn — without the safety net the
      // turn waits forever (실측 2026-06-14: a stray Esc left claude idle for 21 min).
      await writeSession(SID, [
        userLine('u1'),
        assistantLine('a1', { text: 'partial', stopReason: 'tool_use' }),
        interruptLine('int1'),
      ]);

      const response = await promise; // resolves — no hang
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(response.done).toBe(true);
    });

    it('ignores a PRIOR interrupt marker already in the transcript when resuming (no instant finish)', async () => {
      // Pre-existing transcript: a past interrupted turn.
      await writeSession(SID, [
        userLine('u0'),
        assistantLine('a-old', { text: 'old', stopReason: 'tool_use' }),
        interruptLine('int-old'),
      ]);

      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onComplete = vi.fn();
      const promise = engine.sendMessageWithCallbacks('again', { onComplete, onError: vi.fn() }, { resume: SID }, undefined, vi.fn());

      await wait(30);
      // Resume seeded the old interrupt marker → it does NOT end this turn (no premature finish).
      expect(onComplete).not.toHaveBeenCalled();

      // A fresh end_turn assistant arrives → now it completes (the old marker stayed ignored).
      await writeSession(SID, [
        userLine('u0'),
        assistantLine('a-old', { text: 'old', stopReason: 'tool_use' }),
        interruptLine('int-old'),
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

  describe('pre-injection screen classification (Story 37.6 — block/recover before injecting)', () => {
    // A resume-time SELECTION menu painted as claude renders it (absolute-addressed rows + a live
    // nav/cancel footer). The first option is the dangerous one (an Enter here would select it —
    // e.g. `/compact` — losing the prompt). All rows carry `❯`/numbers so the LINEAR bootBuffer
    // still trips the cheap marker, but the GRID classifier must read it as `selection`, not inject.
    const SELECTION_MENU = drawModal([
      ' Resume — pick an action',
      ' ❯ 1. /compact (summarize & continue)',
      '   2. Keep the full history',
      '   3. Cancel',
      ' ↑/↓ to navigate · Enter to select · Esc to cancel',
    ]);
    const INPUT_BOX = drawModal([' ❯ ', ' ? for shortcuts']);

    // A resume CONFIRM-style menu (claude's "summary vs full session" prompt shown when resuming a
    // long-idle session). Unlike SELECTION_MENU it carries an "Enter to confirm" footer, so
    // parseConfirmChoiceMenu drives it through the card instead of Esc-cancelling (Story 37.6 follow-up).
    const RESUME_CONFIRM_MENU = drawModal([
      ' This session is 7h 58m old and 165.1k tokens.',
      ' Resuming the full session will consume a substantial portion of your usage limits.',
      ' ❯ 1. Resume from summary (recommended)',
      '   2. Resume full session as-is',
      "   3. Don't ask me again",
      ' Enter to confirm · Esc to cancel',
    ]);

    it('routes a resume confirm menu to the card and injects the picked option keys (cliResumeChoice=ask)', async () => {
      const canUseTool = vi.fn().mockResolvedValue({
        behavior: 'allow',
        updatedInput: { answers: { q: 'Resume full session as-is' } }, // option 2 → index 1 → one ↓
      });
      const engine = new CliChatEngine({ workingDirectory: '/proj' }); // default cliResumeChoice = 'ask'
      const promise = engine.sendMessageWithCallbacks(
        'my real prompt',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID },
        canUseTool,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.(RESUME_CONFIRM_MENU);

      // The menu is shown as a CARD (canUseTool), never blind-Esc'd.
      await vi.waitFor(
        () => expect(canUseTool).toHaveBeenCalledWith('AskUserQuestion', expect.anything(), expect.anything()),
        { timeout: 2000 },
      );
      // The picked option (index 1) drives at least one ↓ into the menu.
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('\x1b[B'), { timeout: 2000 });

      // Menu answered → claude repaints the input box → the prompt injects normally.
      h.fakePty._onData?.(INPUT_BOX);
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('my real prompt'), { timeout: 2000 });
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('auto-picks the configured option WITHOUT a card (cliResumeChoice=full)', async () => {
      const canUseTool = vi.fn();
      const engine = new CliChatEngine({ workingDirectory: '/proj', cliResumeChoice: 'full' });
      const promise = engine.sendMessageWithCallbacks(
        'my real prompt',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID },
        canUseTool,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.(RESUME_CONFIRM_MENU);

      // No card — the setting auto-selects "full" (option 2 → index 1): at least one ↓ into the menu.
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('\x1b[B'), { timeout: 2000 });
      expect(canUseTool).not.toHaveBeenCalled();

      h.fakePty._onData?.(INPUT_BOX);
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('my real prompt'), { timeout: 2000 });
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    });

    it('does NOT touch a non-confirm selection menu (no Esc/Enter) and WAITS — recovers when the box appears (no hard abort)', async () => {
      // Esc-cancel rule REMOVED (오너 2026-06-12) AND hard-abort REMOVED (오너 2026-06-15). A selection
      // menu that is NOT a drivable confirm menu gets NO blind key — not Esc, not Enter — and the turn
      // is NOT aborted: the boot poll keeps waiting, so once the menu closes and the real input box
      // appears the prompt injects normally. (Before: it aborted at the ceiling, surfaced as "timeout".)
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onError = vi.fn();
      const turn = engine.sendMessageWithCallbacks(
        'my real prompt',
        { onComplete: vi.fn(), onError },
        { sessionId: SID },
        undefined,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.(SELECTION_MENU);

      // Past the settle window: NO blind key, and crucially NO abort/error (the turn waits).
      await wait(700);
      expect(onError).not.toHaveBeenCalled();
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b');
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\r');
      expect(h.fakePty.write).not.toHaveBeenCalledWith('my real prompt');

      // Menu closes → real input box → the prompt injects (recovery without a destructive abort).
      h.fakePty._onData?.(INPUT_BOX);
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('my real prompt'), { timeout: 2000 });
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    }, 8000);

    it('does NOT abort when a resume repaint QUOTES `❯`/footer markers in scrollback before the box paints — waits, then injects (boot-poison regression)', async () => {
      // The exact owner-reported failure (2026-06-15): resuming a LARGE transcript, claude repaints
      // prior content that QUOTES the input-box glyph `❯` and footer phrases ("esc to interrupt") up in
      // the scrollback while the real input box has NOT yet painted at the bottom. The raw-stream `❯`
      // used to flip `bootMarkerSeen` and promote the 4s checkpoint to a DECISIVE abort — surfaced to
      // the user as a misleading "응답 시간 초과". Now: the footer-scoped classifier reads the bottom as
      // not-an-input-box → 'unknown' → the boot poll WAITS (no abort); when the real box paints, inject.
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onError = vi.fn();
      // A tall repaint: a quoted `❯`/"esc to interrupt" line at the TOP (scrollback), then many diff
      // rows so the live-footer region (bottom 8) carries NO real input box.
      const POISONED_REPAINT = drawModal([
        ' ● Earlier I explained the `❯` input box and the "esc to interrupt" footer in detail:',
        ...Array.from({ length: 14 }, (_, i) => `   diff line ${i + 1} — gate YAML being repainted on resume …`),
      ]);
      const turn = engine.sendMessageWithCallbacks(
        'prompt that must not be lost',
        { onComplete: vi.fn(), onError },
        { sessionId: SID },
        undefined,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.(POISONED_REPAINT);

      // Past the settle window (where the OLD code aborted via the poisoned marker): NO abort, NO key.
      await wait(700);
      expect(onError).not.toHaveBeenCalled();
      expect(h.fakePty.write).not.toHaveBeenCalledWith('prompt that must not be lost');
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\r');
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b');

      // The repaint finishes → real footer input box → the prompt injects (recovery).
      h.fakePty._onData?.(INPUT_BOX);
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('prompt that must not be lost'), { timeout: 2000 });
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    }, 8000);

    it('still injects a normal input box (regression 0) and rescues a noisy box via the boot poll (AC5)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const promise = engine.sendMessageWithCallbacks(
        'hi there',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID },
        undefined,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      // Keep repainting the SAME normal input box faster than the settle window, so the settle timer
      // never fires and the steady boot poll (CLI_MAX_BOOT_WAIT_MS) must reclassify it as input-box and
      // inject (not hang). The poll re-runs indefinitely and never aborts — it only injects when ready.
      const noise = setInterval(() => h.fakePty._onData?.(INPUT_BOX), 150);
      try {
        await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('hi there'), { timeout: 6000 });
      } finally {
        clearInterval(noise);
      }
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await promise;
    }, 10000);
  });

  describe('permission round-trip (Story 32.6 — constrained, canUseTool reuse)', () => {
    // The permission modal as claude PAINTS it (Story 37.4 — absolute-addressed box rows the
    // grid reconstructs). Strong markers: a "Do you want to <verb>…?" sentence + the fully-
    // rendered footer (the AND-of-footer is what withholds detection on a half-drawn dialog).
    const PERM_DIALOG = drawModal([
      ' ● Write(probe.txt)',
      ' Create file',
      ' probe.txt',
      ' Do you want to create probe.txt?',
      ' ❯ 1. Yes',
      '   2. Yes, allow all edits during this session (shift+tab)',
      '   3. No',
      ' Esc to cancel · Tab to amend',
    ]);

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

    it('Story 37.9: emits the lead-in prose as a provisional chunk BEFORE the standalone permission card', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onTextChunk = vi.fn();
      let chunksBeforeCard = -1;
      const canUseTool = vi.fn().mockImplementation(async () => {
        chunksBeforeCard = onTextChunk.mock.calls.length;
        return { behavior: 'allow', updatedInput: {} };
      });
      const turn = engine.sendMessageWithCallbacks(
        'do the thing',
        { onComplete: vi.fn(), onError: vi.fn(), onTextChunk },
        { sessionId: SID },
        canUseTool as never,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });

      // Permission dialog with lead-in prose ABOVE the gated tool card (`● Write(…)`), none in the
      // JSONL yet. parsePrecedingPermissionText classifies the region with parseGridCards and takes
      // the TEXT card before the tool card, so the explanation lands before the standalone card.
      const prose = '디버그 출력을 캡처하려면 프로브 파일을 먼저 만들어야 합니다.';
      h.fakePty._onData?.(drawModal([
        '● ' + prose,
        '● Write(probe.txt)',
        ' Create file',
        ' Do you want to create probe.txt?',
        ' ❯ 1. Yes',
        '   2. Yes, allow all edits during this session (shift+tab)',
        '   3. No',
        ' Esc to cancel · Tab to amend',
      ]));

      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });
      expect(onTextChunk).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('프로브 파일') }));
      expect(chunksBeforeCard).toBeGreaterThanOrEqual(1);

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'created it' })]);
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
      h.fakePty._onData?.(drawModal(['❯ run the bash command', '· Actioning…  esc to interrupt']));
      // (b) half-rendered dialog: perm phrase present, but the footer (full render) absent —
      // on the grid the footer row simply has not been painted yet, so detection withholds.
      h.fakePty._onData?.(drawModal([' Do you want to create probe.txt?', ' ❯ 1. Yes']));
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

  describe('permission-mode live closed loop (Story 37.5 — CSI Z Shift+Tab)', () => {
    const CSI_Z = '\x1b[Z';
    const modeRow = (label: string) => ` ${label} (shift+tab to cycle) · ← for agents`;
    // An idle input box at a given mode (mode row present) or default (no mode row).
    const idleGrid = (modeLabel?: string) =>
      drawModal(modeLabel ? [' ❯ ', modeRow(modeLabel)] : [' ❯ Try "fix typecheck"', ' ? for shortcuts']);
    const PERM_DIALOG = drawModal([
      ' ● Write(probe.txt)',
      ' Do you want to create probe.txt?',
      ' ❯ 1. Yes',
      '   2. Yes, allow all edits during this session',
      '   3. No',
      ' Esc to cancel · Tab to amend',
    ]);
    const countKey = (key: string) => h.fakePty.write.mock.calls.filter((c) => c[0] === key).length;

    const CYCLE = ['default', 'acceptEdits', 'plan', 'auto'] as const;
    type CycleMode = typeof CYCLE[number];
    const MODE_LABEL: Record<CycleMode, string | undefined> = {
      default: undefined, // no mode row ⇒ readPermissionMode returns 'default'
      acceptEdits: '⏵⏵ accept edits on',
      plan: '⏸ plan mode on',
      auto: '⏵⏵ auto mode on',
    };
    // A mid-generation frame at a given mode: footer carries "esc to interrupt" / "↓ N tokens" so
    // isGeneratingGrid is true; the mode row sits at the very bottom. 'default' ⇒ no mode row.
    const genGrid = (mode: CycleMode) =>
      drawModal([
        ' ✻ Working… (3s · ↓ 42 tokens · esc to interrupt)',
        ' ❯ ',
        ...(MODE_LABEL[mode] ? [modeRow(MODE_LABEL[mode]!)] : []),
      ]);
    // Make the fake PTY behave like real claude: each injected CSI Z advances the on-screen mode by
    // one cycle step, so the driver's per-step re-read observes the mode each keypress landed on.
    // `generating` picks an idle-input frame vs a mid-generation frame (both carry the bottom mode
    // row). Seeds the initial frame at `start`.
    function autoAdvanceMode(start: CycleMode, generating = false): void {
      let idx = CYCLE.indexOf(start);
      const frame = (m: CycleMode) => (generating ? genGrid(m) : idleGrid(MODE_LABEL[m]));
      h.fakePty._onData?.(frame(CYCLE[idx]));
      h.fakePty.write.mockImplementation((data: string) => {
        if (data === CSI_Z) {
          idx = (idx + 1) % CYCLE.length;
          h.fakePty._onData?.(frame(CYCLE[idx]));
        }
      });
    }

    // Drive the engine to the post-injection state (where activeCliControl is live), as the
    // permission/progress blocks do. Returns the turn promise wrapped (an async fn would auto-flatten
    // and deadlock — the turn completes only after the test writes the session).
    async function injectThenReady(engine: CliChatEngine, canUseTool?: unknown): Promise<{ turn: Promise<unknown> }> {
      const turn = engine.sendMessageWithCallbacks(
        'do the thing',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID },
        canUseTool as never,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });
      return { turn };
    }

    async function endTurn(turn: Promise<unknown>): Promise<void> {
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'done' })]);
      await turn;
    }

    it('steps one key at a time until the target mode is on screen (default → plan = 2 keys)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const { turn } = await injectThenReady(engine);
      autoAdvanceMode('default'); // each CSI Z advances the on-screen mode by one step
      await wait(20);

      const before = countKey(CSI_Z);
      await engine.setPermissionMode('plan'); // default → acceptEdits → plan = 2 keys

      expect(countKey(CSI_Z) - before).toBe(2);
      expect(engine.getPermissionMode()).toBe('plan');
      await endTurn(turn);
    });

    it('injects NOTHING when already on the target mode (0 steps)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const { turn } = await injectThenReady(engine);
      h.fakePty._onData?.(idleGrid('⏸ plan mode on')); // already plan
      await wait(20);

      const before = countKey(CSI_Z);
      await engine.setPermissionMode('plan');
      expect(countKey(CSI_Z) - before).toBe(0);
      expect(engine.getPermissionMode()).toBe('plan');
      await endTurn(turn);
    });

    it('wraps the cycle forward (plan → default wraps through auto = 2 keys)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const { turn } = await injectThenReady(engine);
      autoAdvanceMode('plan'); // current: plan (idx 2)
      await wait(20);

      const before = countKey(CSI_Z);
      await engine.setPermissionMode('default'); // plan → auto → default = 2 keys (wrap)

      expect(countKey(CSI_Z) - before).toBe(2);
      expect(engine.getPermissionMode()).toBe('default');
      await endTurn(turn);
    });

    it('follows a mid-flight retarget — a second setPermissionMode redirects the running driver', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const { turn } = await injectThenReady(engine);
      autoAdvanceMode('default');
      await wait(20);

      const p1 = engine.setPermissionMode('plan'); // start heading toward plan
      await vi.waitFor(() => expect(countKey(CSI_Z)).toBeGreaterThan(0)); // first key fired
      await engine.setPermissionMode('auto'); // retarget mid-flight to another cycle mode (no 2nd driver)
      await p1;

      // The single running driver re-reads the target each step, so it lands on the LATEST target.
      expect(engine.getPermissionMode()).toBe('auto');
      await endTurn(turn);
    });

    it('stops at the step ceiling and warns when the target never lands on screen (misread guard)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const { turn } = await injectThenReady(engine);
      // Screen is STUCK on default — no auto-advance wired, so CSI Z never changes the mode row
      // (simulates a persistently misread / never-settling frame). The driver must not spin forever:
      // it stops at the ceiling and warns; the stored target is the next spawn's backstop.
      h.fakePty._onData?.(idleGrid()); // default, and it stays default
      h.fakePty.write.mockImplementation(() => {}); // CSI Z never advances the mode (stuck screen)
      await wait(20);

      const before = countKey(CSI_Z);
      const warnBefore = h.logger.warn.mock.calls.length;
      await engine.setPermissionMode('plan'); // never appears on screen ⇒ ceiling

      expect(countKey(CSI_Z) - before).toBe(CYCLE.length * 3); // the CLI_PERMISSION_MAX_STEPS ceiling
      expect(engine.getPermissionMode()).toBe('plan'); // stored target (next spawn's --permission-mode)
      expect(h.logger.warn.mock.calls.length - warnBefore).toBe(1); // warned exactly once
      await endTurn(turn);
    }, 8000); // 12 live-driver steps is intentionally slow; the always-bypass boot align adds one read — headroom

    it('stops injecting once the turn settles mid-loop — no stray CSI Z to a dead PTY (abort race)', async () => {
      const ac = new AbortController();
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const turn = engine.sendMessageWithCallbacks(
        'do the thing',
        { onComplete: vi.fn(), onError: vi.fn() },
        { sessionId: SID, abortController: ac },
        undefined,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });
      h.fakePty._onData?.(idleGrid()); // default → auto is 3 steps (a loop long enough to abort)
      await wait(20);

      const p = engine.setPermissionMode('auto');
      await vi.waitFor(() => expect(countKey(CSI_Z)).toBeGreaterThan(0)); // first Shift+Tab fired
      ac.abort('stop');
      await expect(turn).rejects.toThrow(/aborted/i);
      const keysAtAbort = countKey(CSI_Z);
      await p; // the closed loop resolves (it bails on the dead PTY)
      await wait(350 * 4); // well past the per-key gap (CLI_QUESTION_KEY_GAP_MS) × the remaining steps
      expect(countKey(CSI_Z)).toBe(keysAtAbort); // no stray keys after the turn settled
    });

    it('store-only fallback when no turn is live (no control handle) — next spawn applies it', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const before = countKey(CSI_Z);
      await engine.setPermissionMode('plan');
      expect(engine.getPermissionMode()).toBe('plan');
      expect(countKey(CSI_Z) - before).toBe(0);
    });

    it('drives mid-GENERATION too — one key at a time, mode row at the bottom (acceptEdits → auto)', async () => {
      // Owner-confirmed: the reconstructed grid carries the mode status row at the very bottom in
      // BOTH idle and generating states (spinner above, input box + mode row below), so the driver
      // steps the mode live mid-generation exactly like idle — this is the whole point of the
      // feature (flip Ask→Auto while a turn is mid-flight).
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const { turn } = await injectThenReady(engine);
      autoAdvanceMode('acceptEdits', true); // generating frames
      await wait(20);

      const before = countKey(CSI_Z);
      await engine.setPermissionMode('auto'); // acceptEdits → plan → auto = 2 keys

      expect(countKey(CSI_Z) - before).toBe(2);
      expect(engine.getPermissionMode()).toBe('auto'); // reached mid-generation
      await endTurn(turn);
    });

    it('store-only fallback on an UNKNOWN screen (neither idle nor generating) — no blind key', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const { turn } = await injectThenReady(engine);
      h.fakePty._onData?.(drawModal([' Connecting MCP servers…', ' Loading plugins…'])); // unknown screen
      await wait(20);

      const before = countKey(CSI_Z);
      await engine.setPermissionMode('plan');
      expect(countKey(CSI_Z) - before).toBe(0);
      expect(engine.getPermissionMode()).toBe('plan'); // stored for the next spawn
      await endTurn(turn);
    });

    it('store-only fallback while a permission modal is up — no stray CSI Z into the modal', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      let resolvePerm: ((v: unknown) => void) | undefined;
      const canUseTool = vi.fn(() => new Promise((r) => { resolvePerm = r; }));
      const { turn } = await injectThenReady(engine, canUseTool);
      h.fakePty._onData?.(PERM_DIALOG); // permissionPending = true; handlePermission awaits (pending)
      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1));

      const before = countKey(CSI_Z);
      await engine.setPermissionMode('plan'); // isModalPending() ⇒ store only, BEFORE any grid read
      expect(countKey(CSI_Z) - before).toBe(0);
      expect(engine.getPermissionMode()).toBe('plan');

      resolvePerm?.({ behavior: 'allow' });
      await endTurn(turn);
    });

    it('store-only fallback for the off-cycle dontAsk target (no reachable cycle index)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const { turn } = await injectThenReady(engine);
      h.fakePty._onData?.(idleGrid()); // idle + live, yet dontAsk is off the cycle
      await wait(20);

      const before = countKey(CSI_Z);
      await engine.setPermissionMode('dontAsk');
      expect(countKey(CSI_Z) - before).toBe(0);
      expect(engine.getPermissionMode()).toBe('dontAsk');
      await endTurn(turn);
    });

    it('drives to bypass LIVE in a bypass-STARTED session (claude carries bypass in its cycle)', async () => {
      // The user's bug: a turn spawned in bypass has bypassPermissions IN claude's Shift+Tab cycle
      // (default→acceptEdits→plan→bypass→auto, verified 2.1.177). So selecting Bypass while the
      // on-screen mode sits elsewhere must be driven LIVE to bypass — NOT stored for the next spawn.
      const BYPASS_CYCLE = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'auto'] as const;
      const bypassLabel = (m: string): string | undefined =>
        (({ acceptEdits: '⏵⏵ accept edits on', plan: '⏸ plan mode on', bypassPermissions: '⏵⏵ bypass permissions on', auto: '⏵⏵ auto mode on' }) as Record<string, string>)[m];
      const engine = new CliChatEngine({ workingDirectory: '/proj', permissionMode: 'bypassPermissions' });
      const { turn } = await injectThenReady(engine);
      // Seed the on-screen mode at 'plan' and advance through the BYPASS-inclusive cycle on each CSI Z.
      let idx = BYPASS_CYCLE.indexOf('plan');
      const frame = (m: string) => idleGrid(bypassLabel(m));
      h.fakePty._onData?.(frame(BYPASS_CYCLE[idx]));
      h.fakePty.write.mockImplementation((data: string) => {
        if (data === CSI_Z) {
          idx = (idx + 1) % BYPASS_CYCLE.length;
          h.fakePty._onData?.(frame(BYPASS_CYCLE[idx]));
        }
      });
      await wait(20);

      const before = countKey(CSI_Z);
      await engine.setPermissionMode('bypassPermissions'); // plan → bypass = 1 key, driven live (not stored)
      expect(countKey(CSI_Z) - before).toBe(1);
      expect(engine.getPermissionMode()).toBe('bypassPermissions');
      await endTurn(turn);
    });

    it('spawns in bypass, then steps the screen DOWN to a non-bypass button mode before injecting', async () => {
      // SDK parity: spawn is ALWAYS bypass, so the idle box opens at `bypass permissions on`. With a
      // non-bypass button (Plan), the engine must step the screen to plan BEFORE the prompt lands, so
      // the turn runs under Plan while bypass stays reachable live mid-turn.
      const BYPASS_CYCLE = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'auto'] as const;
      const labelOf = (m: string): string | undefined =>
        (({ acceptEdits: '⏵⏵ accept edits on', plan: '⏸ plan mode on', bypassPermissions: '⏵⏵ bypass permissions on', auto: '⏵⏵ auto mode on' }) as Record<string, string>)[m];
      let idx = BYPASS_CYCLE.indexOf('bypassPermissions'); // box opens at bypass (always-bypass spawn)
      const engine = new CliChatEngine({ workingDirectory: '/proj', permissionMode: 'plan' });
      const turn = engine.sendMessageWithCallbacks('do the thing', { onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID }, undefined, vi.fn());
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.(idleGrid(labelOf(BYPASS_CYCLE[idx])));
      h.fakePty.write.mockImplementation((data: string) => {
        if (data === CSI_Z) {
          idx = (idx + 1) % BYPASS_CYCLE.length;
          h.fakePty._onData?.(idleGrid(labelOf(BYPASS_CYCLE[idx])));
        }
      });
      // The prompt is injected only AFTER the screen reaches plan (bypass→auto→default→edits→plan).
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 5000 });
      expect(BYPASS_CYCLE[idx]).toBe('plan'); // on-screen mode at the moment of injection
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'done' })]);
      await turn;
    }, 8000);
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
      drawModal([` Do you want to ${verb} ${file}?`, ' ❯ 1. Yes', '   2. Yes, allow all edits during this session', ' Esc to cancel · Tab to amend']);

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
    const Q_MODAL_SINGLE = drawModal([
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
    ]);

    // multiSelect: checkboxes "[ ]" + a header "✔ Submit" tab reached with → (Task 1).
    const Q_MODAL_MULTI = drawModal([
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
    ]);

    // A 2-question (tabbed) modal: >1 ballot-box tab in the header → NOT a single
    // round-trip, so the constrained bridge guards it (Esc) rather than half-answering.
    const Q_MODAL_MULTIQ = drawModal([
      ' ←  ☐ Color  ☐ Size  ✔ Submit  →',
      ' Which color do you want?',
      ' ❯ 1. Red',
      '   2. Green',
      '   4. Type something.',
      '   5. Chat about this',
      ' Enter to select · ↑/↓ to navigate · Esc to cancel',
    ]);

    // A modal wrapped in the TUI's box-drawing chrome (┌─┐ │ └─┘) — the 32.8 bug report's
    // "──────" stretched row and "│"-laden labels. On the GRID each numbered option lands on its
    // OWN row, so the per-row stripBoxChrome removes the border cells and leaves the label body
    // intact — the structural resolution of the box-chrome fusion (Story 37.4 AC1).
    const Q_MODAL_BOXED = drawModal([
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
    ]);

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
      // Scraped single question — options in modal-row order (self-consistent with the ↓-count),
      // each carrying the per-option description claude paints on the indented row below its label.
      expect(input).toEqual({
        questions: [
          { question: 'Which color do you want?', header: 'Color', multiSelect: false, options: [
            { label: 'Red', description: 'The color red.' },
            { label: 'Green', description: 'The color green.' },
            { label: 'Blue', description: 'The color blue.' },
          ] },
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

    it('catches the JSONL drain up so the preceding text lands BEFORE the question card (ordering fix)', async () => {
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

      // Measured ordering: the lead-in explanation is written to the JSONL as its OWN assistant
      // line BEFORE the modal paints (stop_reason 'tool_use' — the turn continues into the
      // AskUserQuestion). The old code assumed this prose only reached the JSONL post-answer and
      // scraped it off the screen; it actually lands first, so catch-up emits it straight from the
      // file (which carries text AND tool cards, unlike the lossy scrape) right before the card.
      const prose = '현재 구조를 다 파악했습니다. 정리하면 두 가지 방식이 있습니다.';
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: prose, stopReason: 'tool_use' })]);

      // The modal paints → detection → settle → catch-up drains the JSONL (emitting the prose)
      // BEFORE raising the question card.
      h.fakePty._onData?.(drawModal([
        prose,
        ' ☐ Color',
        ' Which color do you want?',
        ' ❯ 1. Red',
        '   2. Green',
        '   4. Type something.',
        '   5. Chat about this',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ]));

      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });
      // The prose was emitted from the JSONL, and it preceded the card.
      expect(onTextChunk).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('정리하면') }));
      expect(chunksBeforeCard).toBeGreaterThanOrEqual(1);

      // Turn ends (file rewritten with a closing end_turn line). The prose is emitted exactly once —
      // a single JSONL path (the separate screen scrape that needed dedup is gone).
      await writeSession(SID, [
        userLine('u1'),
        assistantLine('a1', { text: prose, stopReason: 'tool_use' }),
        assistantLine('a2', { text: 'done', stopReason: 'end_turn' }),
      ]);
      await turn;
      const proseEmits = onTextChunk.mock.calls.filter((c) => String((c[0] as { content: string }).content).includes('정리하면'));
      expect(proseEmits).toHaveLength(1);
    });

    it('Story 37.9 + fix: emits the lead-in prose PROVISIONALLY before the card, then FINALIZES it via maybeFinalize (not suppressed — an input-waiting modal parks the turn, so the lead-in must not stay dimmed)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onTextChunk = vi.fn();
      let chunksBeforeCard = -1;
      const canUseTool = vi.fn().mockImplementation(async () => {
        chunksBeforeCard = onTextChunk.mock.calls.length; // chunks emitted before the card is raised
        return { behavior: 'allow', updatedInput: { answers: { 'Which color do you want?': 'Red' } } };
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

      // The story's scenario: the lead-in prose is on SCREEN above the modal (a `●` body card) but
      // NOT in the JSONL yet — the whole assistant message (prose + AskUserQuestion tool_use) lands
      // only AFTER the answer. The file is still empty here, so catchUpJSONL recovers nothing and the
      // screen scrape is the only pre-answer source.
      const prose = '두 가지 색상 옵션을 준비했습니다. 어떤 것을 원하시는지 골라주세요.';
      h.fakePty._onData?.(drawModal([
        '● ' + prose,
        ' ☐ Color',
        ' Which color do you want?',
        ' ❯ 1. Red',
        '   2. Green',
        '   5. Chat about this',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ]));

      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });
      // The provisional prose was emitted (● stripped) and it preceded the card.
      expect(onTextChunk).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('어떤 것을 원하시는지') }));
      expect(chunksBeforeCard).toBeGreaterThanOrEqual(1);

      // Turn ends: the whole assistant message finally lands — the SAME prose as a text block plus
      // the AskUserQuestion tool_use — then a closing block. The canonical text is now FINALIZED via
      // maybeFinalize (provisional:false) rather than suppressed — the client swaps the canonical onto the
      // provisional IN PLACE. Without this the lead-in sits dimmed the whole time the modal waits for input
      // (the turn-end reload that would otherwise replace it is deferred until after the answer).
      const canonicalModalLine = JSON.stringify({
        type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-06-04T00:00:01.000Z', entrypoint: 'cli',
        message: {
          role: 'assistant', model: 'claude-opus-4-6',
          content: [
            { type: 'text', text: prose },
            { type: 'tool_use', id: 'toolu_q', name: 'AskUserQuestion', input: { questions: [] } },
          ],
          stop_reason: 'tool_use',
        },
      });
      await writeSession(SID, [userLine('u1'), canonicalModalLine, assistantLine('a2', { parentUuid: 'a1', text: 'done' })]);
      await turn;

      // The prose is emitted TWICE: the provisional (screen) then the canonical (file) via maybeFinalize.
      // The client replaces the provisional in place — no double render — but the lead-in finalizes WITHOUT
      // waiting for the deferred reload.
      const proseEmits = onTextChunk.mock.calls.filter((c) => String((c[0] as { content: string }).content).includes('어떤 것을 원하시는지'));
      expect(proseEmits).toHaveLength(2);
      expect(proseEmits[0][0]).toMatchObject({ provisional: true });  // screen scrape (live badge)
      expect(proseEmits[1][0]).toMatchObject({ provisional: false }); // canonical finalize (badge dropped)
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
            // Box chrome stripped from the description row too (│ borders → spaces); the option with
            // no prose row below it ("Bounce dot one glyph") stays a bare label.
            options: [{ label: 'Rotating dot', description: 'A rotating dot.' }, { label: 'Bounce dot one glyph' }],
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
            options: [
              { label: 'Cat', description: 'A cat.' },
              { label: 'Dog', description: 'A dog.' },
              { label: 'Fish', description: 'A fish.' },
            ],
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

    it('multi-question (tabbed) modal: ISSUE-99 engages the driver, and a non-navigable frame is safely Esc-cancelled', async () => {
      // ISSUE-99: a >1-tab modal is now DRIVEN (handleMultiQuestion), not blind-guarded. The READ phase
      // scrapes tab 0, presses → to reach tab 1, then re-reads. Here the frame is STATIC (no reactive
      // next-tab paint), so the question does not change after → — the driver detects the stall and
      // Esc-cancels rather than half-answering, keeping the turn responsive. (The full happy-path drive,
      // which needs a reactive PTY that repaints each tab on →, is exercised separately.)
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn();
      const { turn } = await injectThenReady(engine, canUseTool);
      h.fakePty._onData?.(Q_MODAL_MULTIQ);

      // It attempts to navigate to tab 1 (→), sees the tab did not advance, and cancels (Esc) — it
      // never raised a card (READ failed before PRESENT).
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('\x1b'), { timeout: 3000 });
      expect(canUseTool).not.toHaveBeenCalled();
      expect(h.fakePty.write).toHaveBeenCalledWith('\x1b[C'); // the → read-navigation WAS attempted (driver engaged)

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'cancelled' })]);
      await turn;
    });

    it('Story 37.15: drives a custom/Other single-select answer via the "Type something" item (not Esc)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn().mockResolvedValue({
        behavior: 'allow',
        updatedInput: { answers: { 'Which color do you want?': 'Purple' } }, // a CUSTOM / free-text answer
      });
      const { turn } = await injectThenReady(engine, canUseTool);
      h.fakePty._onData?.(Q_MODAL_SINGLE);

      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1), { timeout: 2000 });
      // Pre-37.15 this Esc-cancelled (custom "not drivable"). Now it's DRIVEN: ↓ to the "Type something"
      // item → Enter (text-input) → type the text → Enter (submit).
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('Purple'), { timeout: 2000 });
      expect(h.fakePty.write).toHaveBeenCalledWith('\x1b[B'); // ↓ navigation toward "Type something"
      expect(h.fakePty.write).not.toHaveBeenCalledWith('\x1b'); // NOT Esc-cancelled anymore

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'done' })]);
      await turn;
    });

    it('does NOT detect a selection menu lacking the "Chat about this" affordance (false-positive guard)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const canUseTool = vi.fn();
      const { turn } = await injectThenReady(engine, canUseTool);

      // Footer present, but no "Chat about this" (e.g. a different list UI) → not a question.
      h.fakePty._onData?.(drawModal([' ❯ 1. Option A', '   2. Option B', ' Enter to select · ↑/↓ to navigate · Esc to cancel']));
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
        drawModal([' Do you want to create probe.txt?', ' ❯ 1. Yes', '   2. Yes, allow all edits during this session', ' Esc to cancel · Tab to amend']),
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
      // without detection the turn hangs forever. Painted into the grid (Story 37.4 reads it there).
      h.fakePty._onData?.(drawModal(["✻ You've hit your weekly limit · resets 1am (Asia/Seoul)"]));

      await expect(turn).rejects.toThrow(/weekly limit/i);
      expect(onError).toHaveBeenCalled();
      // The message is forwarded verbatim, including the reset time the user needs.
      expect(String((onError.mock.calls[0][0] as Error).message)).toMatch(/resets 1am/i);
      // PTY is torn down so the claude process does not linger at the limit screen.
      expect(h.cliSessionPool.dispose).toHaveBeenCalled();
      corroborated.mockRestore();
    });

    it('fails the turn on the transient rate-limit error (server throttle — no usage corroboration needed)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onError = vi.fn();
      const { turn } = await injectThenReady(engine, { onError });

      // The rate-limit error lives only on the PTY (never the JSONL) — like the usage limit the turn would
      // otherwise hang on the spinner. Unlike the usage limit it needs NO usage corroboration (it is an
      // explicit error string, not the ambiguous usage-cap prose).
      h.fakePty._onData?.(drawModal(['API Error: Server is temporarily limiting requests (not your usage limit) · Rate limited']));

      await expect(turn).rejects.toThrow(/temporarily limiting requests/i);
      expect(onError).toHaveBeenCalled();
      expect(h.cliSessionPool.dispose).toHaveBeenCalled();
    });

    it('does NOT fail when the rate-limit string is only in scrollback, pushed out of the live footer', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onError = vi.fn();
      const onComplete = vi.fn();
      const { turn } = await injectThenReady(engine, { onError, onComplete });

      // The error string sits in PRIOR-turn scrollback (a quoted mention); the current generation's
      // tail (the live footer = last few non-empty rows) holds other content. Detection is scoped to
      // the footer, so this stale occurrence must NOT stop the turn — only the string appearing as the
      // CURRENT turn's outcome should. (Without footer scoping, any past mention would kill every turn.)
      h.fakePty._onData?.(
        drawModal([
          'API Error: Server is temporarily limiting requests (not your usage limit) · Rate limited',
          'filler 1', 'filler 2', 'filler 3', 'filler 4',
          'filler 5', 'filler 6', 'filler 7', 'filler 8', '❯ ready',
        ]),
      );
      await wait(40);
      expect(onError).not.toHaveBeenCalled();

      // A normal end_turn still completes the turn afterwards.
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
      expect(onComplete).toHaveBeenCalled();
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

        h.fakePty._onData?.(drawModal(["✻ You've hit your weekly limit · resets 1am (Asia/Seoul)"]));
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
      h.fakePty._onData?.(drawModal(["✻ Working… You've used 97% of your weekly limit · resets 1am (Asia/Seoul)"]));
      await wait(40);
      expect(onError).not.toHaveBeenCalled();

      // A normal end_turn still completes the turn afterwards.
      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
      expect(onComplete).toHaveBeenCalled();
    });
  });

  describe('generation progress (Story 32.7 — spinner "↓ N tokens"; Story 37.2 — read from the screen grid)', () => {
    // Story 37.2: the token source is the headless screen GRID, not a linear buffer.
    // claude redraws the spinner counter IN PLACE (absolute cursor addressing + line
    // erase), so test frames must model that — address a fixed row, erase it, write the
    // line. A plain literal frame (no cursor control) would let consecutive counters run
    // together on one rendered row; an in-place redraw overwrites the cell, so the
    // settled grid carries only the final value (fusion is structurally impossible).
    const drawSpinner = (text: string, row = 20): string => `${ESC}[${row};1H${ESC}[2K${text}`;

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

    it('reads the real-PTY "↓ N tokens" + elapsed and emits on value change (throttle)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      // Task 1 literal: "<glyph> Verb… (Es · ↓ N tokens [· thinking with <effort> effort])".
      h.fakePty._onData?.(drawSpinner('✢ Moseying… (6s · ↓ 246 tokens · thinking with high effort)'));
      // Story 37.11: the thinking-phase segment is forwarded as `thinking: true` (drives the client "Thinking…" label).
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 246, elapsedSeconds: 6, thinking: true }));

      // Same value re-render (spinner glyph cycles but counter unchanged) → no re-emit.
      const callsAfterFirst = onProgress.mock.calls.length;
      h.fakePty._onData?.(drawSpinner('✶ Moseying… (6s · ↓ 246 tokens · thinking with high effort)'));
      await wait(20);
      expect(onProgress.mock.calls.length).toBe(callsAfterFirst);

      // Counter climbs → emit. (Also covers the counter-only form, no thinking suffix.)
      h.fakePty._onData?.(drawSpinner('✻ Moseying… (8s · ↓ 312 tokens)'));
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 312, elapsedSeconds: 8 }));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('emits when ONLY the elapsed clock advances (tokens flat) — the spinner clock must tick between token changes (Story 37.21)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      h.fakePty._onData?.(drawSpinner('✢ Moseying… (6s · ↓ 246 tokens)'));
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 246, elapsedSeconds: 6 }));

      // Tokens FLAT (still 246) but the clock advanced 6s → 7s. The old tokens-only gate froze the time
      // between token changes; the fix gates on EITHER tokens or elapsed changing, so this must emit.
      h.fakePty._onData?.(drawSpinner('✶ Moseying… (7s · ↓ 246 tokens)'));
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 246, elapsedSeconds: 7 }));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('reads an in-place 365→366 redraw as 366 — the linear-fusion "365366" is structurally absent (AC2)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      // The linear buffer fused a same-cell redraw ("365" then "366" → "365366"), and the
      // old code carried magnitude-cap / malformed-grouping / implausible-jump guards to
      // paper over it. The grid overwrites the cell in place, so the reader sees only the
      // FINAL value and those guards are gone (AC2) — there is nothing left to fuse.
      h.fakePty._onData?.(drawSpinner('✢ Moseying… (5s · ↓ 365 tokens)'));
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 365, elapsedSeconds: 5 }));
      h.fakePty._onData?.(drawSpinner('✢ Moseying… (5s · ↓ 366 tokens)'));
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 366, elapsedSeconds: 5 }));

      // The fused artifact can never be emitted — it does not exist in the grid.
      expect(onProgress).not.toHaveBeenCalledWith(expect.objectContaining({ tokens: 365366 }));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('forwards a minute-form clock "(1m 36s ·" summed to elapsedSeconds 96 (Story 37.3 — Xm Ys)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      // Past 1 minute claude renders "(1m 36s ·". The grid reader now sums minutes*60 +
      // seconds, so the wire contract's elapsedSeconds carries 96 end-to-end (reader →
      // engine → callback) instead of the pre-37.3 false 0.
      h.fakePty._onData?.(drawSpinner('Moseying… (1m 36s · ↓ 365 tokens)'));
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 365, elapsedSeconds: 96 }));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('reads the abbreviated "↓ 1.4k tokens" form the linear regex missed (→ 1400)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      // The linear CLI_PROGRESS_RE used `[\d,]+`, which broke at `.`/`k` and dropped the
      // whole frame. Reading the rendered grid captures the abbreviated form.
      h.fakePty._onData?.(drawSpinner('Flowing… (9s · ↓ 1.4k tokens · thinking with high effort)'));
      // Story 37.11: thinking-phase frame → thinking:true forwarded alongside the (abbreviated) counter.
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 1400, elapsedSeconds: 9, thinking: true }));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('forwards a segment-boundary reset (high→low) as a change so the indicator never freezes (Task 1)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      h.fakePty._onData?.(drawSpinner('Moseying… (16s · ↓ 614 tokens)'));
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 614, elapsedSeconds: 16 }));
      // A new generation segment (after a tool use) resets BOTH counter and clock to a
      // low base — change-detection forwards it (increase-only would have suppressed it).
      h.fakePty._onData?.(drawSpinner('Moseying… (2s · ↓ 79 tokens)'));
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 79, elapsedSeconds: 2 }));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('settles a counter split across two writes (partial-write concatenation, not fusion)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      // A single rendered line split across two PTY chunks (the position addressing +
      // erase arrives with the first chunk, the rest continues at the cursor). This is a
      // NORMAL chunk boundary, not an in-place fusion — the settled grid holds one value.
      h.fakePty._onData?.(`${ESC}[20;1H${ESC}[2KMoseying… (9s · ↓ 36`);
      await wait(20);
      expect(onProgress).not.toHaveBeenCalled(); // "↓ 36" with no "tokens" yet → no counter row
      h.fakePty._onData?.('5 tokens · thinking with high effort)');
      // Story 37.11: once the full row settles, the thinking-phase flag rides the assembled counter value.
      await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ tokens: 365, elapsedSeconds: 9, thinking: true }));

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('ignores frames with no counter (false-0 guard) — never emits a phantom 0', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onProgress = vi.fn();
      const { turn } = await injectThenReady(engine, onProgress);

      // A spinner with no "↓ N tokens" (early thinking phase / interrupt footer only).
      h.fakePty._onData?.(drawSpinner('✢ Deliberating…  esc to interrupt'));
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

      // A spinner frame must not crash when there is no callback to call (the grid-read
      // branch is gated on onGenerationProgress, so it is skipped entirely here).
      expect(() => h.fakePty._onData?.(drawSpinner('Moseying… (6s · ↓ 246 tokens)'))).not.toThrow();
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
      // A late spinner frame after teardown must not emit. The grid emit is async (it
      // runs after flush() resolves), so the `settled` guard is re-checked AT EMIT TIME —
      // the disposed-screen write/flush is a safe no-op and emitProgressFromGrid bails.
      h.fakePty._onData?.(drawSpinner('Moseying… (9s · ↓ 400 tokens)'));
      await wait(20);
      expect(onProgress.mock.calls.length).toBe(callsAtAbort);
    });
  });

  describe('live grid cards — thinking + tool (Story 37.10 — provisional emit + arrival-order reconciliation)', () => {
    // A generating frame: claude redraws the whole screen (clear + absolute-addressed rows). The
    // scrollback CARDS sit above a live spinner footer carrying "esc to interrupt" — the positive
    // generation signal `isGeneratingGrid` reads (and `scrollbackBodyRows` cuts at). Cards below that
    // footer don't exist; the footer is the anchor.
    const genFrame = (cardRows: string[]): string =>
      drawModal([...cardRows, '✶ Flowing… (5s · ↓ 1.2k tokens · esc to interrupt)']);

    // Story 37.10: claude paints the card bullet in a TRUECOLOR encoding tool status (verified
    // against cli-real-pty-dump): green (78,186,101) = done, gray (153,153,153) = running. The
    // status now comes from the bullet COLOR, not from `⎿` presence, so test frames must color
    // the bullet. A plain `●` (no SGR) classifies as 'other' = treated as running (safe default).
    const greenTool = (body: string): string => `\x1b[38;2;78;186;101m●\x1b[m ${body}`; // done
    const grayTool = (body: string): string => `\x1b[38;2;153;153;153m●\x1b[m ${body}`; // running
    const whiteText = (body: string): string => `\x1b[38;2;255;255;255m●\x1b[m ${body}`; // assistant text body (white)

    // An assistant line carrying a thinking block (possibly EMPTY = signature only) + an optional
    // tool_use block — the canonical shape claude writes to the JSONL once the block completes.
    function thinkingToolLine(
      uuid: string,
      opts: { thinking?: string; tool?: { id: string; name: string; input?: Record<string, unknown> }; parentUuid?: string; stopReason?: string },
    ): string {
      const content: Array<Record<string, unknown>> = [{ type: 'thinking', thinking: opts.thinking ?? '', signature: 'sig' }];
      if (opts.tool) content.push({ type: 'tool_use', id: opts.tool.id, name: opts.tool.name, input: opts.tool.input ?? {} });
      return JSON.stringify({
        type: 'assistant', uuid, parentUuid: opts.parentUuid ?? 'u1', timestamp: '2026-06-04T00:00:01.000Z', entrypoint: 'cli',
        message: { role: 'assistant', model: 'claude-opus-4-6', content, stop_reason: opts.stopReason ?? 'tool_use' },
      });
    }
    function toolResultLine(uuid: string, results: Array<{ tool_use_id: string; content: string; is_error?: boolean }>, parentUuid = 'a1'): string {
      return JSON.stringify({
        type: 'user', uuid, parentUuid, timestamp: '2026-06-04T00:00:02.000Z',
        message: { role: 'user', content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.tool_use_id, content: r.content, ...(r.is_error !== undefined ? { is_error: r.is_error } : {}) })) },
      });
    }

    // Drive to post-injection ready with caller-supplied callbacks (the grid card consumers run only
    // AFTER injection). No canUseTool — these are general-streaming / auto-approved frames. The turn is
    // returned WRAPPED in an object: an async fn auto-flattens a returned promise, so returning `turn`
    // bare would make the caller `await` the whole turn (deadlock — it only completes post-writeSession).
    async function injectThenReady(engine: CliChatEngine, callbacks: StreamCallbacks): Promise<{ turn: Promise<unknown> }> {
      const turn = engine.sendMessageWithCallbacks('do the thing', callbacks, { sessionId: SID }, undefined, vi.fn());
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });
      return { turn };
    }

    it('FINALIZES the live provisional thinking with the populated canonical (progressive replace, not double)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onThinking = vi.fn();
      const { turn } = await injectThenReady(engine, { onThinking, onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      // The TUI paints the thinking summary on screen the moment thinking completes — before the JSONL.
      h.fakePty._onData?.(genFrame(['  Thought for 5s']));
      // Story 37.11 (AC4): the grid scrape is PROVISIONAL — onThinking carries the provisional flag.
      await vi.waitFor(() => expect(onThinking).toHaveBeenCalledWith('Thought for 5s', true));
      expect(onThinking).toHaveBeenCalledTimes(1); // grid provisional only

      // Story 37.11 (progressive finalize): the canonical (populated) thinking lands later — the drain now
      // FINALIZES the live provisional with it (re-emit with provisional=false). The client REPLACES the
      // oldest provisional thinking segment in place (the canonical text, badge dropped) — a replace, not a
      // double-render. (The kind-sequence cursor matched: held[0] is the thinking it scraped.)
      await writeSession(SID, [userLine('u1'), thinkingToolLine('a1', { thinking: 'raw reasoning text', stopReason: 'end_turn' })]);
      await turn;
      expect(onThinking).toHaveBeenCalledTimes(2); // provisional (true) + canonical finalize (false)
      expect(onThinking).toHaveBeenLastCalledWith('raw reasoning text', false);
    });

    it('emits the verbose-mode `∴` reasoning block as a PROVISIONAL thinking card (Story 37.11 — invisible until the late JSONL before)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onThinking = vi.fn();
      const { turn } = await injectThenReady(engine, { onThinking, onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      // 실측 2026-06-16 (real production-settings PTY capture): in verbose mode the expanded reasoning
      // paints as a multi-line `∴ <reasoning>` BODY block ~7s BEFORE the JSONL canonical. The parser
      // folds it into ONE thinking card and the engine emits it PROVISIONALLY, so the user sees the
      // actual reasoning during that window instead of waiting for the file. (Before: parser ignored
      // `∴` → 0 cards → thinking arrived only via the late drain.)
      h.fakePty._onData?.(genFrame(['∴ I need to compute 11! first,', '  then sum the alternating series to get D₁₁.']));
      await vi.waitFor(() =>
        expect(onThinking).toHaveBeenCalledWith('I need to compute 11! first, then sum the alternating series to get D₁₁.', true),
      );
      expect(onThinking).toHaveBeenCalledTimes(1); // grid provisional only

      // The canonical thinking lands — the drain FINALIZES the live provisional with it (replace in place).
      await writeSession(SID, [userLine('u1'), thinkingToolLine('a1', { thinking: 'raw reasoning', stopReason: 'end_turn' })]);
      await turn;
      expect(onThinking).toHaveBeenCalledTimes(2); // provisional + canonical finalize
      expect(onThinking).toHaveBeenLastCalledWith('raw reasoning', false);
    });

    it('streams a GROWING `∴` block as DELTAS (not a full re-emit every frame — the live re-emit-storm fix)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onThinking = vi.fn();
      const { turn } = await injectThenReady(engine, { onThinking, onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      // 실측 2026-06-16: the verbose `∴` reasoning block GROWS frame by frame as claude streams. The
      // earlier code re-classified the whole growing card as brand-new each frame → it re-emitted the
      // FULL text ~48× (the "infinite cards" the owner saw live). The fix aligns the growing card to its
      // held copy and emits only the appended DELTA — exactly like a real stream chunk.
      // Frame 1: the opening fragment.
      h.fakePty._onData?.(genFrame(['∴ I need to compute 11! first,']));
      await vi.waitFor(() => expect(onThinking).toHaveBeenCalledWith('I need to compute 11! first,', true));
      expect(onThinking).toHaveBeenCalledTimes(1);

      // Frame 2: the SAME card, grown by a wrapped continuation row → only the new tail must be emitted.
      h.fakePty._onData?.(genFrame(['∴ I need to compute 11! first,', '  then sum the alternating series to get D₁₁.']));
      await vi.waitFor(() => expect(onThinking).toHaveBeenCalledTimes(2));
      expect(onThinking.mock.calls[1]).toEqual([' then sum the alternating series to get D₁₁.', true]); // DELTA, not the full text

      // Frame 3: the SAME grown frame repainted (claude redraws every tick) must NOT churn — held now
      // matches exactly, so no further emit. This is the guard that kills the re-emit storm.
      h.fakePty._onData?.(genFrame(['∴ I need to compute 11! first,', '  then sum the alternating series to get D₁₁.']));
      await wait(50);
      expect(onThinking).toHaveBeenCalledTimes(2);

      // The provisional chunks concatenate (client `addStreamingThinking` APPENDS) to the full reasoning.
      const reconstructed = onThinking.mock.calls.map((c) => c[0]).join('');
      expect(reconstructed).toBe('I need to compute 11! first, then sum the alternating series to get D₁₁.');

      await writeSession(SID, [userLine('u1'), thinkingToolLine('a1', { thinking: 'raw', stopReason: 'end_turn' })]);
      await turn;
      // Story 37.11 (progressive finalize): the canonical 'raw' lands → one finalize call (provisional=false)
      // that REPLACES the live-reconstructed thinking. So 2 growth deltas + 1 finalize = 3 (not a re-emit storm).
      expect(onThinking).toHaveBeenCalledTimes(3);
      expect(onThinking).toHaveBeenLastCalledWith('raw', false);
    });

    it('Story 37.12: a tool header caught with its bullet flickered off is NOT fused into the prose (cross-frame stickiness)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onTextChunk = vi.fn();
      const onToolUse = vi.fn();
      const { turn } = await injectThenReady(engine, { onTextChunk, onToolUse, onThinking: vi.fn(), onComplete: vi.fn(), onError: vi.fn() });

      // Frame 1: a prose card + a RUNNING tool header (bullet PRESENT) → both emitted; the header is
      // remembered WITH its `●` glyph for the next frame's flicker recovery.
      h.fakePty._onData?.(genFrame([whiteText('이전 답변.'), '', grayTool('Search(completeStreaming)')]));
      await vi.waitFor(() => expect(onToolUse).toHaveBeenCalledTimes(1));
      expect(onTextChunk).toHaveBeenCalledTimes(1); // the prose card only
      const textCalls = onTextChunk.mock.calls.length;

      // Frame 2: the tool's bullet FLICKERED off (the 60ms poll caught claude mid-repaint), now painted
      // directly under the prose. WITHOUT stickiness the bullet-less `Search(…)` folds into the prose card
      // and re-emits as a text DELTA (the fusion the user reported); WITH it, the `●` is restored so the
      // tool stays its own card — no fused delta, and the tool is neither re-emitted nor lost.
      h.fakePty._onData?.(genFrame([whiteText('이전 답변.'), 'Search(completeStreaming)']));
      await wait(80);
      expect(onTextChunk).toHaveBeenCalledTimes(textCalls); // prose untouched — the tool text did not fuse in
      expect(onToolUse).toHaveBeenCalledTimes(1); // tool not re-emitted, not lost

      await writeSession(SID, [userLine('u1'), thinkingToolLine('a1', { thinking: 'raw', stopReason: 'end_turn' })]);
      await turn;
    });

    it('Story 37.13: a same-content tool run again after the 1st scrolled off is its OWN card and completes (color-transition split)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const onToolResult = vi.fn();
      const { turn } = await injectThenReady(engine, { onToolUse, onToolResult, onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      // Tool #1 — Read(config.ts) runs (gray), then completes (green + `⎿` result).
      h.fakePty._onData?.(genFrame([grayTool('Read(config.ts)')]));
      await vi.waitFor(() => expect(onToolUse).toHaveBeenCalledTimes(1));
      h.fakePty._onData?.(genFrame([greenTool('Read(config.ts)'), '  ⎿  Read 10 lines']));
      await vi.waitFor(() => expect(onToolResult).toHaveBeenCalledTimes(1));

      // Tool #2 — the SAME content (Read(config.ts) again), with #1 scrolled off (only #2 on screen, and
      // not within scroll-up range — `drawModal` clears so nothing is in scrollback). The screen scrape
      // can't tell #2 from #1 by content and the order tiebreak is gone (no #1 in view) — WITHOUT the fix
      // #2 would fuse into the still-held, already-completed #1. The fix splits them by the color transition
      // (a completed/green held tool can't be a now-running/non-green card of the same content).
      h.fakePty._onData?.(genFrame([grayTool('Read(config.ts)')]));
      await wait(80);
      h.fakePty._onData?.(genFrame([greenTool('Read(config.ts)'), '  ⎿  Read 20 lines']));
      await wait(80);

      // #2 is its OWN running→completed tool (the completed #1 is retired once #2 opens, so it can't reclaim
      // #2's later green frame) → onToolUse twice, onToolResult twice.
      expect(onToolUse).toHaveBeenCalledTimes(2);
      expect(onToolResult).toHaveBeenCalledTimes(2);

      await writeSession(SID, [userLine('u1'), thinkingToolLine('a1', { thinking: '', stopReason: 'end_turn' })]);
      await turn;
    });

    it('Story 37.13: a GREEN tool completes even with NO `⎿` result row (color = done, not the ⎿ row)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const onToolResult = vi.fn();
      const { turn } = await injectThenReady(engine, { onToolUse, onToolResult, onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      // Frame 1 — tool running (gray) → pending, not complete.
      h.fakePty._onData?.(genFrame([grayTool('Read(big.ts)')]));
      await vi.waitFor(() => expect(onToolUse).toHaveBeenCalledTimes(1));
      expect(onToolResult).not.toHaveBeenCalled();

      // Frame 2 — the tool went GREEN but its `⎿` result row is NOT on screen (scrolled off in a long turn).
      // Pre-fix this stayed a spinner forever (completion waited for the `⎿` row); now the green color ALONE
      // completes it. Output empty — the turn-end reload supplies the canonical output.
      h.fakePty._onData?.(genFrame([greenTool('Read(big.ts)')]));
      await vi.waitFor(() => expect(onToolResult).toHaveBeenCalledTimes(1));
      expect(onToolResult).toHaveBeenCalledWith(expect.stringMatching(/^cli-prov-tool-/), { success: true, output: '' }, true);

      await writeSession(SID, [userLine('u1'), thinkingToolLine('a1', { thinking: '', stopReason: 'end_turn' })]);
      await turn;
    });

    it('Story 37.16: a provisional tool that scrolls off while gray (never seen green) completes from its JSONL tool_result (scroll-off backstop)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const onToolResult = vi.fn();
      const { turn } = await injectThenReady(engine, { onToolUse, onToolResult, onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      // The grid scrapes a RUNNING (gray) tool → provisional pending card (cli-prov-tool-0). A long answer
      // then pushes it ABOVE the viewport while it is still gray, so the grid NEVER sees its green completion
      // frame (the scroll-up read stops at the first known block below it) — flipDoneIfGreen can't fire.
      h.fakePty._onData?.(genFrame([grayTool('Grep(pattern)')]));
      await vi.waitFor(() => expect(onToolUse).toHaveBeenCalledTimes(1));
      expect(onToolResult).not.toHaveBeenCalled();

      // The tool really finished — JSONL records its tool_use + tool_result. That file record is the ONLY
      // remaining completion signal, so it must complete the live card (the backstop). Pre-fix the result
      // mirror is gated to `liveEmittedToolIds`, which the provisional (maybeFinalize) path leaves OUT →
      // onToolResult never fires → the spinner runs until the turn-end reload (the user's bug).
      await writeSession(SID, [
        userLine('u1'),
        thinkingToolLine('a1', { thinking: '', tool: { id: 'toolu_grep', name: 'Grep', input: { pattern: 'x' } } }),
        toolResultLine('tr1', [{ tool_use_id: 'toolu_grep', content: 'matches', is_error: false }]),
        thinkingToolLine('a2', { thinking: '', parentUuid: 'a1', stopReason: 'end_turn' }),
      ]);
      await turn;

      // Completed via the SYNTHETIC id (the client card kept it) with the provisional/flip flag — the same
      // shape flipDoneIfGreen uses — because the file tool_result is the backstop for the off-screen green.
      expect(onToolResult).toHaveBeenCalledWith('cli-prov-tool-0', { success: true, output: 'matches', error: undefined }, true);
    });

    it('Story 37.16: a provisional tool seen GREEN on-screen is NOT double-completed by its JSONL tool_result (backstop dedup)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const onToolResult = vi.fn();
      const { turn } = await injectThenReady(engine, { onToolUse, onToolResult, onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      // The tool runs (gray) then completes ON-SCREEN (green) → the grid flips it (onToolResult once).
      h.fakePty._onData?.(genFrame([grayTool('Read(x.ts)')]));
      await vi.waitFor(() => expect(onToolUse).toHaveBeenCalledTimes(1));
      h.fakePty._onData?.(genFrame([greenTool('Read(x.ts)'), '  ⎿  Read 5 lines']));
      await vi.waitFor(() => expect(onToolResult).toHaveBeenCalledTimes(1));

      // JSONL then records the same tool's tool_use + tool_result. The backstop NOW fires regardless of the
      // green flip: the green-flip onToolResult can be LOST when the canonical tool:call races ahead of the
      // provisional (the client builds a fresh card off the canonical and the earlier flip never lands —
      // confirmed via turn-end-stuck). So the file result re-completes the same synthId with the authoritative
      // output; the client treats a duplicate completion on an already-completed card as a no-op.
      await writeSession(SID, [
        userLine('u1'),
        thinkingToolLine('a1', { thinking: '', tool: { id: 'toolu_read', name: 'Read', input: { file_path: 'x.ts' } } }),
        toolResultLine('tr1', [{ tool_use_id: 'toolu_read', content: 'data', is_error: false }]),
        thinkingToolLine('a2', { thinking: '', parentUuid: 'a1', stopReason: 'end_turn' }),
      ]);
      await turn;

      // Green flip (1) + file backstop (2), both on the same synthId; the file copy is authoritative.
      expect(onToolResult).toHaveBeenCalledTimes(2);
      expect(onToolResult).toHaveBeenLastCalledWith('cli-prov-tool-0', { success: true, output: 'data', error: undefined }, true);
    });

    it('Story 37.18: the SAME gray tool repainted on two scrollback rows in one frame is ONE card, not two', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const { turn } = await injectThenReady(engine, { onToolUse, onToolResult: vi.fn(), onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      // claude repaints a still-running tool, leaving the SAME gray `● Bash(git diff)` on TWO rows of the one
      // settled frame (실측 ba310cea dump: rows 231 & 242 both gray, identical content). It is ONE invocation
      // (a repaint echo), so it must yield ONE provisional card — not two (the user's duplicate-cards report).
      h.fakePty._onData?.(genFrame([grayTool('Bash(git diff)'), grayTool('Bash(git diff)')]));
      await wait(80);
      expect(onToolUse).toHaveBeenCalledTimes(1);

      await writeSession(SID, [userLine('u1'), thinkingToolLine('a1', { thinking: '', stopReason: 'end_turn' })]);
      await turn;
    });

    it('Story 37.16: a tool that goes green WHILE scrolling off (a new tool appears below it, both were on screen) still completes via the file backstop', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const onToolResult = vi.fn();
      const { turn } = await injectThenReady(engine, { onToolUse, onToolResult, onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      // A runs (gray) at the bottom → cli-prov-tool-0.
      h.fakePty._onData?.(genFrame([grayTool('Read(a.ts)')]));
      await vi.waitFor(() => expect(onToolUse).toHaveBeenCalledTimes(1));
      // A new tool B starts; both gray and on screen → cli-prov-tool-1.
      h.fakePty._onData?.(genFrame([grayTool('Read(a.ts)'), grayTool('Bash(b)')]));
      await vi.waitFor(() => expect(onToolUse).toHaveBeenCalledTimes(2));
      // A completes (green) but scrolls off the TOP as B keeps running — only B (gray) is on screen now,
      // so the grid NEVER captures A's green frame.
      h.fakePty._onData?.(genFrame([grayTool('Bash(b)')]));
      await wait(80);
      expect(onToolResult).not.toHaveBeenCalled(); // A's green was never seen

      // The file records both tools + both results. A must still complete — via the scroll-off backstop.
      await writeSession(SID, [
        userLine('u1'),
        thinkingToolLine('a1', { thinking: '', tool: { id: 'toolu_A', name: 'Read', input: { file_path: 'a.ts' } } }),
        thinkingToolLine('a2', { thinking: '', parentUuid: 'a1', tool: { id: 'toolu_B', name: 'Bash', input: { command: 'b' } } }),
        toolResultLine('tr', [
          { tool_use_id: 'toolu_A', content: 'A done' },
          { tool_use_id: 'toolu_B', content: 'B done' },
        ]),
        thinkingToolLine('a3', { thinking: '', parentUuid: 'a2', stopReason: 'end_turn' }),
      ]);
      await turn;

      // Does A (cli-prov-tool-0) complete with ITS OWN result via the backstop?
      expect(onToolResult).toHaveBeenCalledWith('cli-prov-tool-0', { success: true, output: 'A done', error: undefined }, true);
    });

    it('preserves the provisional thinking when the canonical block arrives EMPTY (signature-only — AC1)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onThinking = vi.fn();
      const { turn } = await injectThenReady(engine, { onThinking, onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      h.fakePty._onData?.(genFrame(['  Thought for 7s']));
      await vi.waitFor(() => expect(onThinking).toHaveBeenCalledWith('Thought for 7s', true));

      // Opus 4.7+ often emit the thinking block EMPTY (signature only). The empty canonical must NOT
      // re-emit and must NOT erase — the grid provisional stands as the sole live copy.
      await writeSession(SID, [userLine('u1'), thinkingToolLine('a1', { thinking: '', stopReason: 'end_turn' })]);
      await turn;
      expect(onThinking).toHaveBeenCalledTimes(1);
      expect(onThinking).toHaveBeenCalledWith('Thought for 7s', true);
    });

    it('emits a tool card live (synthetic id, pending) and flips it complete on the `⎿` result frame (AC3 transition)', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const onToolResult = vi.fn();
      const { turn } = await injectThenReady(engine, { onToolUse, onToolResult, onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      // Frame 1 — tool card with a GRAY bullet = RUNNING. Emit pending; do NOT flip yet.
      h.fakePty._onData?.(genFrame([grayTool('Write(probe.txt)')]));
      await vi.waitFor(() => expect(onToolUse).toHaveBeenCalledTimes(1));
      const toolCall = onToolUse.mock.calls[0][0] as { id: string; name: string; status: string };
      expect(toolCall.name).toBe('Write');
      expect(toolCall.status).toBe('pending');
      expect(toolCall.id).toMatch(/^cli-prov-tool-/); // synthetic — the screen has no toolu_ id
      expect(onToolResult).not.toHaveBeenCalled(); // still running

      // Frame 2 — the bullet turns GREEN (=done) and the `⎿` carries the real result. Flip the SAME
      // card via onToolResult on its id. (Status comes from the bullet color, not `⎿` presence.)
      h.fakePty._onData?.(genFrame([greenTool('Write(probe.txt)'), '  ⎿  Wrote 5 lines to probe.txt']));
      await vi.waitFor(() => expect(onToolResult).toHaveBeenCalledTimes(1));
      // Story 37.11 (AC4): grid result flip is PROVISIONAL (the 3rd arg) — the card stays live-badged.
      expect(onToolResult).toHaveBeenCalledWith(toolCall.id, { success: true, output: expect.stringContaining('Wrote 5 lines') }, true);
      expect(onToolUse).toHaveBeenCalledTimes(1); // not re-emitted across frames (slot dedup)

      // Canonical tool_use + result land in the JSONL. Story 37.11 (progressive finalize): the canonical
      // tool_use now FINALIZES the synthetic-id card — re-sends its SAME `cli-prov-tool-*` id with the real
      // name + full input and provisional=false (the client fills the input + drops the badge IN PLACE, no
      // second card). The result stays owned by the synthetic-id grid flip (canonical result not re-emitted).
      await writeSession(SID, [
        userLine('u1'),
        thinkingToolLine('a1', { thinking: '', tool: { id: 'toolu_1', name: 'Write', input: { file_path: 'probe.txt', content: 'x' } } }),
        toolResultLine('tr1', [{ tool_use_id: 'toolu_1', content: 'Wrote 5 lines to probe.txt', is_error: false }]),
        assistantLine('a2', { parentUuid: 'a1', text: 'done' }),
      ]);
      await turn;
      expect(onToolUse).toHaveBeenCalledTimes(2); // provisional (empty input) + canonical finalize (full input)
      const finalizeCall = onToolUse.mock.calls[1][0] as { id: string; name: string; input: Record<string, unknown>; provisional?: boolean };
      // Per-kind finalize: the canonical carries the real name + full input + provisional=false. The CLIENT
      // binds it to the OLDEST provisional tool (keeping that card's id) — the server-emitted id is the
      // canonical `toolu_…`, not the synthetic one (id-independent binding; see the chatStore unit test).
      expect(finalizeCall.name).toBe('Write');
      expect(finalizeCall.input).toEqual({ file_path: 'probe.txt', content: 'x' }); // real input filled in
      expect(finalizeCall.provisional).toBe(false); // badge dropped
      // Green flip (1, provisional screen output) + file backstop (2, authoritative output). The backstop now
      // fires regardless of the flip (the flip's result can be lost to a canonical race); the client dedupes.
      expect(onToolResult).toHaveBeenCalledTimes(2);
      expect(onToolResult).toHaveBeenLastCalledWith(toolCall.id, { success: true, output: 'Wrote 5 lines to probe.txt', error: undefined }, true);
    });

    it('does NOT flip on ⎿ Waiting…/Running… while the bullet is GRAY (running) — flips only when GREEN (TOOL-RUNNING-PLACEHOLDER-FLIP)', async () => {
      // Regression for the QA-found bug: real claude paints a slow tool as ● Tool(gray) → ⎿ Waiting…
      // → ⎿ Running… → ● Tool(green) + ⎿ <real result>. The old code flipped on the FIRST non-empty
      // `⎿`, so the tool showed "complete: Waiting…" the whole run. Status now comes from the bullet
      // COLOR: gray stays pending, only green flips (with the real result).
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const onToolResult = vi.fn();
      const { turn } = await injectThenReady(engine, { onToolUse, onToolResult, onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      h.fakePty._onData?.(genFrame([grayTool('PowerShell("sleep 5; ls")'), '  ⎿  Waiting…']));
      await vi.waitFor(() => expect(onToolUse).toHaveBeenCalledTimes(1));
      const id = (onToolUse.mock.calls[0][0] as { id: string }).id;
      await wait(40);
      h.fakePty._onData?.(genFrame([grayTool('PowerShell("sleep 5; ls")'), '  ⎿  Running…']));
      await wait(40);
      expect(onToolResult).not.toHaveBeenCalled(); // gray → no premature "complete: Waiting…/Running…"

      // Bullet turns GREEN + the real result appears → flip once with the REAL output (not "Waiting…").
      h.fakePty._onData?.(genFrame([greenTool('PowerShell("sleep 5; ls")'), '  ⎿  Process : [1]', '     file.txt']));
      await vi.waitFor(() => expect(onToolResult).toHaveBeenCalledTimes(1));
      expect(onToolResult).toHaveBeenCalledWith(id, { success: true, output: expect.stringContaining('Process : [1]') }, true);
      expect((onToolResult.mock.calls[0][1] as { output: string }).output).not.toContain('Waiting');

      await writeSession(SID, [
        userLine('u1'),
        thinkingToolLine('a1', { thinking: '', tool: { id: 'toolu_1', name: 'PowerShell', input: { command: 'sleep 5; ls' } } }),
        toolResultLine('tr1', [{ tool_use_id: 'toolu_1', content: 'file.txt' }]),
        assistantLine('a2', { parentUuid: 'a1', text: 'done' }),
      ]);
      await turn;
      // Green flip (1) + file backstop (2). The backstop fires regardless of the flip; the client dedupes.
      expect(onToolResult).toHaveBeenCalledTimes(2);
      expect(onToolResult).toHaveBeenLastCalledWith(id, { success: true, output: 'file.txt', error: undefined }, true);
    });

    it('does NOT scrape cards from a non-generating (paused / modal) frame', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onThinking = vi.fn();
      const onToolUse = vi.fn();
      const { turn } = await injectThenReady(engine, { onThinking, onToolUse, onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      // A frame with cards but NO generation footer (spinner gone — claude paused). isGeneratingGrid is
      // false, so the scraper stays off: a paused frame is where modals live, and a permission-gated tool
      // card must be left to its own path, never double-emitted here.
      h.fakePty._onData?.(drawModal(['  Thought for 9s', '● Write(probe.txt)', ' Do you want to create probe.txt?', ' Esc to cancel · Tab to amend']));
      await wait(60);
      expect(onThinking).not.toHaveBeenCalled();
      expect(onToolUse).not.toHaveBeenCalled();

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'ok' })]);
      await turn;
    });

    it('does NOT re-provision a permission-gated tool card when generation resumes post-approval (TOOL-PERM-RESCRAPE)', async () => {
      // Regression for the QA-flagged grid/drain slot ASYMMETRY: the permission path advances the
      // drain-side suppression counter (permissionGatedToolsPending) but historically NOT the grid-side
      // slot (liveToolSlots). After the user approves, generation resumes (isGeneratingGrid true) and
      // claude can keep the gated `● Tool(…)` card in the scrollback while the spinner runs AGAIN — the
      // scraper would then see the slot as free and re-emit it as a synthetic cli-prov-tool card, double-
      // rendering against the 32.6 standalone permission card (and leaking a provisionalToolEmitsPending
      // that wrongly suppresses a LATER tool's live emit). The fix reserves the slot at permission time.
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const onToolResult = vi.fn();
      const canUseTool = vi.fn().mockResolvedValue({ behavior: 'allow', updatedInput: {} });
      const turn = engine.sendMessageWithCallbacks(
        'do the thing',
        { onToolUse, onToolResult, onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() },
        { sessionId: SID },
        canUseTool as never,
        vi.fn(),
      );
      await vi.waitFor(() => expect(typeof h.fakePty._onData).toBe('function'));
      h.fakePty._onData?.('Claude Code v2.1.162\n❯ ready');
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('do the thing'), { timeout: 2000 });

      // (1) Permission dialog — generation PAUSED (no footer), the gated `● Write` card on screen. The
      // card scraper stays OFF here (isGeneratingGrid false); the permission path fires + reserves the slot.
      h.fakePty._onData?.(drawModal([
        ' ● Write(probe.txt)',
        ' Do you want to create probe.txt?',
        ' ❯ 1. Yes',
        '   2. Yes, allow all edits during this session (shift+tab)',
        '   3. No',
        ' Esc to cancel · Tab to amend',
      ]));
      await vi.waitFor(() => expect(canUseTool).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(h.fakePty.write).toHaveBeenCalledWith('\r')); // approved

      // (2) Generation RESUMES (footer back) with the SAME gated card still in the scrollback. With the
      // slot reserved, the scraper must NOT re-provision it as a cli-prov-tool card.
      h.fakePty._onData?.(genFrame(['● Write(probe.txt)']));
      await wait(60);
      expect(onToolUse).not.toHaveBeenCalled(); // no synthetic re-provision of the gated tool

      // (3) The canonical gated tool_use + its result land in the JSONL. The drain SUPPRESSES the live
      // re-emit (permissionGatedToolsPending) — the tool renders via the permission card + reload, never a
      // duplicate live card; no leaked counter to wrongly suppress a following tool.
      await writeSession(SID, [
        userLine('u1'),
        thinkingToolLine('a1', { thinking: '', tool: { id: 'toolu_1', name: 'Write', input: { file_path: 'probe.txt', content: 'x' } } }),
        toolResultLine('tr1', [{ tool_use_id: 'toolu_1', content: 'Wrote 5 lines to probe.txt' }]),
        assistantLine('a2', { parentUuid: 'a1', text: 'done' }),
      ]);
      await turn;
      expect(onToolUse).not.toHaveBeenCalled();
      expect(onToolResult).not.toHaveBeenCalled();
    });

    // ===== Story 37.11 (Tier 1) =====

    it('catches a NEW tool card live AFTER an old one scrolled off the viewport top (AC2 — accumulation dedup)', async () => {
      // Regression for the 37.10 viewport-index dedup: it compared the ON-SCREEN tool index against
      // the logical high-water, so once Bash(a) scrolled off the indices diverged and the genuinely
      // new Bash(c) (logical slot 2, on-screen index 1) was wrongly seen as already-spoken-for and
      // missed live. The accumulation (held-transcript) dedup derives the LOGICAL index from the
      // scroll-stable transcript, so Bash(c) is caught.
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onToolUse = vi.fn();
      const { turn } = await injectThenReady(engine, { onToolUse, onToolResult: vi.fn(), onComplete: vi.fn(), onError: vi.fn(), onTextChunk: vi.fn() });

      h.fakePty._onData?.(genFrame([greenTool('Bash(a)')]));
      await vi.waitFor(() => expect(onToolUse).toHaveBeenCalledTimes(1));
      h.fakePty._onData?.(genFrame([greenTool('Bash(a)'), greenTool('Bash(b)')]));
      await vi.waitFor(() => expect(onToolUse).toHaveBeenCalledTimes(2));
      // Bash(a) scrolls OFF the top; only the last two cards are in the viewport now.
      h.fakePty._onData?.(genFrame([greenTool('Bash(b)'), greenTool('Bash(c)')]));
      await vi.waitFor(() => expect(onToolUse).toHaveBeenCalledTimes(3));
      const third = onToolUse.mock.calls[2][0] as { id: string; name: string };
      expect(third.name).toBe('Bash');
      expect(third.id).toBe('cli-prov-tool-2'); // logical slot 2 — NOT lost to the scroll-off

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'done' })]);
      await turn;
    });

    it('emits a general prose card as PROVISIONAL text off the screen, then FINALIZES it with the canonical (AC1)', async () => {
      // The 4th card kind 37.10 skipped: streaming prose is now ALSO a live grid card, so ALL live
      // content comes from one source (no grid↔file race). Story 37.11 (progressive finalize): when the
      // canonical text lands the drain re-emits it with provisional=false — the client swaps the live
      // screen literal for the canonical markdown in place (replace, not a grid↔file double).
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onTextChunk = vi.fn();
      const { turn } = await injectThenReady(engine, { onTextChunk, onComplete: vi.fn(), onError: vi.fn() });

      h.fakePty._onData?.(genFrame(['● Here is the explanation you asked for.']));
      await vi.waitFor(() => expect(onTextChunk).toHaveBeenCalledTimes(1));
      const chunk = onTextChunk.mock.calls[0][0] as { content: string; provisional?: boolean };
      expect(chunk.content).toContain('Here is the explanation');
      expect(chunk.provisional).toBe(true); // AC4: screen estimate, dimmed + live-badged until finalize

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'Here is the explanation you asked for.' })]);
      await turn;
      expect(onTextChunk).toHaveBeenCalledTimes(2); // provisional (true) + canonical finalize (false)
      const finalizeChunk = onTextChunk.mock.calls[1][0] as { content: string; provisional?: boolean };
      expect(finalizeChunk.content).toBe('Here is the explanation you asked for.');
      expect(finalizeChunk.provisional).toBe(false); // canonical replaces the live literal, badge dropped
    });

    it('FINALIZES a tool SANDWICHED between thinking and text when the screen↔file kind-sequence matches (block-queue)', async () => {
      // The user's case: bind by kind-POSITION, not name/content. The screen shows [∴ thinking, ● Update(…),
      // ● prose]; the file's canonical is [thinking, tool(Edit), text] — kinds line up at every position, so
      // ALL THREE finalize in order, INCLUDING the tool between them (friendly `Update` → canonical `Edit`).
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onThinking = vi.fn();
      const onTextChunk = vi.fn();
      const onToolUse = vi.fn();
      const { turn } = await injectThenReady(engine, { onThinking, onTextChunk, onToolUse, onComplete: vi.fn(), onError: vi.fn() });

      h.fakePty._onData?.(genFrame(['∴ live reasoning', greenTool('Update(x.ts)'), '● live answer prose']));
      await vi.waitFor(() => {
        expect(onThinking).toHaveBeenCalledWith('live reasoning', true);
        expect(onToolUse).toHaveBeenCalledTimes(1);
        expect(onTextChunk).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('live answer prose'), provisional: true }));
      });
      const provTool = onToolUse.mock.calls[0][0] as { id: string; name: string };
      expect(provTool.name).toBe('Update'); // the screen's friendly name
      expect(provTool.id).toMatch(/^cli-prov-tool-/);

      // The canonical message carries [thinking, tool_use(Edit), text] IN THAT ORDER.
      const canonicalLine = JSON.stringify({
        type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-06-04T00:00:01.000Z', entrypoint: 'cli',
        message: { role: 'assistant', model: 'claude-opus-4-6', stop_reason: 'end_turn', content: [
          { type: 'thinking', thinking: 'canonical reasoning', signature: 'sig' },
          { type: 'tool_use', id: 'toolu_1', name: 'Edit', input: { file_path: 'x.ts' } },
          { type: 'text', text: 'canonical answer prose' },
        ] },
      });
      await writeSession(SID, [userLine('u1'), canonicalLine]);
      await turn;

      // All three finalized (provisional=false) — per-kind binding (Nth thinking↔Nth thinking, etc.).
      expect(onThinking).toHaveBeenLastCalledWith('canonical reasoning', false);
      expect(onTextChunk).toHaveBeenLastCalledWith(expect.objectContaining({ content: 'canonical answer prose', provisional: false }));
      expect(onToolUse).toHaveBeenCalledTimes(2);
      const finTool = onToolUse.mock.calls[1][0] as { id: string; name: string; input: Record<string, unknown>; provisional?: boolean };
      expect(finTool.name).toBe('Edit'); // canonical name overwrites the friendly `Update` (bound by order, not name)
      expect(finTool.input).toEqual({ file_path: 'x.ts' });
      expect(finTool.provisional).toBe(false); // the client binds this to the oldest provisional tool, badge dropped
    });

    it('emits canonical text AUTHORITATIVELY (not provisional) when no grid frame scraped it — file backstop (AC1)', async () => {
      // When no generating frame carried the prose (scrolled past / never polled) the drain is the
      // completeness backstop: it emits the file copy LIVE and NOT provisional (no live badge).
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onTextChunk = vi.fn();
      const { turn } = await injectThenReady(engine, { onTextChunk, onComplete: vi.fn(), onError: vi.fn() });

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'Answer from the file only.' })]);
      await turn;
      expect(onTextChunk).toHaveBeenCalledTimes(1);
      const chunk = onTextChunk.mock.calls[0][0] as { content: string; provisional?: boolean };
      expect(chunk.content).toContain('Answer from the file only.');
      expect(chunk.provisional).toBeFalsy(); // authoritative
    });

    it('does NOT fold the live footer (spinner / "esc to interrupt") into a provisional text card (AC6 — footer/body split)', async () => {
      // The new text branch runs inside `scrollbackBodyRows` (cut at the footer anchor), so the
      // spinner / "esc to interrupt" / token-counter footer must never be scraped as a text card.
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onTextChunk = vi.fn();
      const { turn } = await injectThenReady(engine, { onTextChunk, onComplete: vi.fn(), onError: vi.fn() });

      h.fakePty._onData?.(genFrame(['● The real answer body.']));
      await vi.waitFor(() => expect(onTextChunk).toHaveBeenCalledTimes(1));
      const c = onTextChunk.mock.calls[0][0] as { content: string };
      expect(c.content).toContain('The real answer body');
      expect(c.content).not.toContain('esc to interrupt'); // footer not folded into the body card
      expect(c.content).not.toContain('Flowing');

      await writeSession(SID, [userLine('u1'), assistantLine('a1', { text: 'The real answer body.' })]);
      await turn;
    });

    it('the AUTHORITATIVE file text — not the truncated provisional scrape — is the completion content (AC5 Tier 1 backstop)', async () => {
      // A single block bigger than the viewport can leave the provisional scrape PARTIAL, but the
      // file copy is complete: the drain accrues the canonical text so finishTurn carries the full
      // version even though only a truncated provisional was shown live.
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      const onTextChunk = vi.fn();
      const onComplete = vi.fn();
      const { turn } = await injectThenReady(engine, { onTextChunk, onComplete, onError: vi.fn() });

      h.fakePty._onData?.(genFrame(['● The answer is partially shown']));
      await vi.waitFor(() => expect(onTextChunk).toHaveBeenCalledTimes(1));
      expect((onTextChunk.mock.calls[0][0] as { provisional?: boolean }).provisional).toBe(true);

      await writeSession(SID, [
        userLine('u1'),
        assistantLine('a1', { text: 'The answer is partially shown on screen but complete in the file.' }),
      ]);
      await turn;
      const completion = onComplete.mock.calls[0][0] as { content: string };
      expect(completion.content).toContain('complete in the file'); // file is the completeness backstop
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
