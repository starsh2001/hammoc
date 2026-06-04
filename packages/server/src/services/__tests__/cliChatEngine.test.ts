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
 *   - rewindFiles deferral throw + permission-mode store/return
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

  return { fakePty, disposers, cliSessionPool, state, sessionService };
});

vi.mock('../cliSessionPool.js', () => ({ cliSessionPool: h.cliSessionPool }));
vi.mock('../sessionService.js', () => ({ sessionService: h.sessionService, SessionService: class {} }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn() }),
}));

// Import after mocks. historyParser (real) is pulled in transitively for parseJSONLFile.
import { CliChatEngine } from '../cliChatEngine.js';

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

  describe('rewindFiles', () => {
    it('throws a clear "deferred to 32.5" error', async () => {
      const engine = new CliChatEngine({ workingDirectory: '/proj' });
      await expect(engine.rewindFiles({ sessionId: 's', messageUuid: 'm' })).rejects.toThrow(/32\.5/);
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

  describe('guards', () => {
    it('throws when no workingDirectory is configured', async () => {
      const engine = new CliChatEngine({});
      await expect(
        engine.sendMessageWithCallbacks('hi', { onComplete: vi.fn(), onError: vi.fn() }, {}, undefined, vi.fn()),
      ).rejects.toThrow(/workingDirectory/);
    });
  });
});
