/**
 * CliChatEngine session isolation (Epic 32 — new-session JSONL file matching).
 *
 * Regression guard for the new-session file-matching race: a CLI-mode "new session"
 * turn must pin its OWN session file by its (client-pre-allocated) id and never adopt
 * "the newest new *.jsonl". Otherwise two new sessions in one project — or a new
 * session racing another session's first write — could read each other's files.
 * Before the fix, scenario 1/2 below FAILED (a turn adopted the wrong file); the
 * unpinned fallback (no id supplied → claude self-assigns) still diff-detects.
 *
 * Same mock harness as cliChatEngine.test.ts: PTY pool + sessionService mocked, REAL
 * temp-dir JSONL parsed by the real historyParser. Each spawn gets its OWN fake PTY so
 * two engines run independently.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import type { StreamCallbacks } from '@hammoc/shared';

const h = vi.hoisted(() => {
  type DataCb = (data: string) => void;
  type ExitCb = (e: { exitCode: number }) => void;
  const make = () => {
    const p: {
      write: ReturnType<typeof vi.fn>;
      kill: ReturnType<typeof vi.fn>;
      onData: ReturnType<typeof vi.fn>;
      onExit: ReturnType<typeof vi.fn>;
      _onData: DataCb | null;
      _onExit: ExitCb | null;
    } = { write: vi.fn(), kill: vi.fn(), onData: vi.fn(), onExit: vi.fn(), _onData: null, _onExit: null };
    p.onData.mockImplementation((cb: DataCb) => { p._onData = cb; });
    p.onExit.mockImplementation((cb: ExitCb) => { p._onExit = cb; });
    return p;
  };
  const disposers = new Map<string, () => void>();
  let n = 0;
  const ptys: Array<{ handle: string; pty: ReturnType<typeof make> }> = [];
  const cliSessionPool = {
    spawnClaude: vi.fn((_opts: { cwd?: string; args: string[] }) => {
      const pty = make();
      const handle = `h${++n}`;
      ptys.push({ handle, pty });
      return { handle, pty };
    }),
    registerDisposer: vi.fn((handle: string, fn: () => void) => { disposers.set(handle, fn); }),
    interrupt: vi.fn(),
    dispose: vi.fn((handle: string) => { disposers.get(handle)?.(); disposers.delete(handle); }),
    destroyAll: vi.fn(),
  };
  const state = { sessionsDir: '' };
  const sessionService = {
    encodeProjectPath: () => 'slug',
    getSessionsDir: () => state.sessionsDir,
    getProjectDir: () => state.sessionsDir,
    getSessionFilePath: (_s: string, id: string) => path.join(state.sessionsDir, `${id}.jsonl`),
  };
  return { disposers, ptys, cliSessionPool, state, sessionService };
});

vi.mock('../cliSessionPool.js', () => ({ cliSessionPool: h.cliSessionPool }));
vi.mock('../sessionService.js', () => ({ sessionService: h.sessionService, SessionService: class {} }));
vi.mock('../fileRewind.js', () => ({ rewindSessionFiles: vi.fn() }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn() }),
}));

import { CliChatEngine } from '../cliChatEngine.js';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const SID_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const SID_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const SELF_ID = 'cccccccc-3333-4333-8333-333333333333';

function userLine(uuid: string): string {
  return JSON.stringify({ type: 'user', uuid, timestamp: '2026-06-04T00:00:00.000Z', cwd: '/proj', message: { role: 'user', content: 'hi' } });
}
function assistantLine(uuid: string, text: string): string {
  return JSON.stringify({
    type: 'assistant', uuid, parentUuid: 'u1', timestamp: '2026-06-04T00:00:01.000Z', entrypoint: 'cli',
    message: { role: 'assistant', model: 'claude-opus-4-6', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
  });
}
async function writeSession(sid: string, lines: string[]): Promise<void> {
  await fs.writeFile(path.join(h.state.sessionsDir, `${sid}.jsonl`), lines.join('\n') + '\n', 'utf8');
}

describe('CliChatEngine session isolation (new-session file-matching race)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    h.disposers.clear();
    h.ptys.length = 0;
    h.state.sessionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-iso-'));
  });
  afterEach(async () => {
    await fs.rm(h.state.sessionsDir, { recursive: true, force: true }).catch(() => {});
  });

  it('reads ONLY its own pinned file, ignoring another session\'s file that appears first in the same project', async () => {
    const engineA = new CliChatEngine({ workingDirectory: '/proj' });
    const aText = vi.fn();
    const callbacks: StreamCallbacks = { onTextChunk: aText, onComplete: vi.fn(), onError: vi.fn() };
    const pA = engineA.sendMessageWithCallbacks('A question', callbacks, { sessionId: SID_A }, undefined, vi.fn());
    let settled = false;
    void pA.then(() => { settled = true; });

    await wait(40); // baseline (skipped — pinned), spawn, first ticks (own file absent)

    // Sanity: launched pinned to its OWN id.
    const args = h.cliSessionPool.spawnClaude.mock.calls[0][0].args as string[];
    expect(args).toEqual(expect.arrayContaining(['--session-id', SID_A]));

    // A DIFFERENT session writes its file first, in the SAME project dir.
    await writeSession(SID_B, [userLine('uB'), assistantLine('aB', 'ANSWER B')]);
    await wait(150);

    // The bug: A would have completed off B's file. The fix: A keeps waiting for SID_A.
    expect(settled).toBe(false);

    // A's own file finally appears → A completes off it.
    await writeSession(SID_A, [userLine('uA'), assistantLine('aA', 'ANSWER A')]);
    const rA = await pA;

    expect(rA.sessionId).toBe(SID_A);
    expect(rA.content).toBe('ANSWER A');
    expect(aText).toHaveBeenCalledWith(expect.objectContaining({ content: 'ANSWER A' }));
    expect(aText).not.toHaveBeenCalledWith(expect.objectContaining({ content: 'ANSWER B' }));
  });

  it('two new sessions started together in one project each read their own file (no cross-contamination)', async () => {
    const engineA = new CliChatEngine({ workingDirectory: '/proj' });
    const engineB = new CliChatEngine({ workingDirectory: '/proj' });
    const aText = vi.fn();
    const bText = vi.fn();
    const pA = engineA.sendMessageWithCallbacks('A asks', { onTextChunk: aText, onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID_A }, undefined, vi.fn());
    const pB = engineB.sendMessageWithCallbacks('B asks', { onTextChunk: bText, onComplete: vi.fn(), onError: vi.fn() }, { sessionId: SID_B }, undefined, vi.fn());

    await wait(40);

    await writeSession(SID_A, [userLine('uA'), assistantLine('aA', 'ANSWER A')]);
    await writeSession(SID_B, [userLine('uB'), assistantLine('aB', 'ANSWER B')]);

    const [rA, rB] = await Promise.all([pA, pB]);

    expect(rA.sessionId).toBe(SID_A);
    expect(rA.content).toBe('ANSWER A');
    expect(rB.sessionId).toBe(SID_B);
    expect(rB.content).toBe('ANSWER B');
    expect(aText).not.toHaveBeenCalledWith(expect.objectContaining({ content: 'ANSWER B' }));
    expect(bText).not.toHaveBeenCalledWith(expect.objectContaining({ content: 'ANSWER A' }));
  });

  it('falls back to new-file detection when NO session id is supplied (claude self-assigns the id)', async () => {
    const engine = new CliChatEngine({ workingDirectory: '/proj' });
    const onComplete = vi.fn();
    // No sessionId, no resume → unpinned: --session-id must NOT be passed, and the engine
    // adopts whatever new *.jsonl appears (the only case where the file name is unknowable).
    const promise = engine.sendMessageWithCallbacks('hi', { onTextChunk: vi.fn(), onComplete, onError: vi.fn() }, {}, undefined, vi.fn());

    await wait(40);
    const args = h.cliSessionPool.spawnClaude.mock.calls[0][0].args as string[];
    expect(args).not.toContain('--session-id');

    await writeSession(SELF_ID, [userLine('u1'), assistantLine('a1', 'self-assigned answer')]);
    const r = await promise;

    expect(r.sessionId).toBe(SELF_ID);
    expect(r.content).toBe('self-assigned answer');
  });
});
