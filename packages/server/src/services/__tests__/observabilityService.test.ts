/**
 * Story 31.3 (Task A.7): observabilityService tests — append/query/filter/prune
 * + collection recorder (append-once, orphan flush, body-not-stored).
 *
 * Uses a real temp `~/.hammoc` (os.homedir spy) so the JSONL append/query/prune
 * cycle is exercised end-to-end.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fsSync from 'node:fs';
import path from 'node:path';
import {
  observabilityService,
  createMcpCallRecorder,
  parseServerName,
  argByteSize,
  resultByteSize,
  aggregate,
} from '../observabilityService.js';
import type { McpCallRecord } from '@hammoc/shared';

const DAY_MS = 24 * 60 * 60 * 1000;
let tmpHome: string;

function rec(over: Partial<McpCallRecord>): McpCallRecord {
  return {
    id: 'tu_1',
    projectSlug: 'proj',
    sessionId: 'sess',
    serverName: null,
    toolName: 'Read',
    startedAt: Date.now(),
    durationMs: 10,
    argBytes: 5,
    resultBytes: 5,
    success: true,
    ...over,
  };
}

beforeEach(() => {
  tmpHome = fsSync.mkdtempSync(path.join(os.tmpdir(), 'obs-'));
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);
});

afterEach(() => {
  vi.restoreAllMocks();
  fsSync.rmSync(tmpHome, { recursive: true, force: true });
});

describe('parseServerName (AC-A1.d)', () => {
  it('extracts <server> from mcp__<server>__<tool>', () => {
    expect(parseServerName('mcp__playwright__browser_navigate')).toBe('playwright');
  });
  it('handles multi-underscore server names', () => {
    expect(parseServerName('mcp__claude_ai_Gmail__authenticate')).toBe('claude_ai_Gmail');
  });
  it('returns null for built-in tools', () => {
    expect(parseServerName('Read')).toBeNull();
    expect(parseServerName('Bash')).toBeNull();
  });
});

describe('byte sizing (AC-A1.c, S-1)', () => {
  it('argByteSize uses UTF-8 bytes of JSON', () => {
    // "한" is 3 UTF-8 bytes; JSON.stringify wraps in quotes (+2).
    expect(argByteSize('한')).toBe(Buffer.byteLength('"한"', 'utf8'));
  });
  it('resultByteSize counts output bytes, falling back to error then empty', () => {
    expect(resultByteSize({ success: true, output: 'abc' })).toBe(3);
    expect(resultByteSize({ success: false, error: '한' })).toBe(3);
    expect(resultByteSize({ success: true })).toBe(0);
  });
});

describe('aggregate', () => {
  it('groups by server+tool, averages non-null durations, counts errors', () => {
    const records = [
      rec({ serverName: 'pw', toolName: 'mcp__pw__nav', durationMs: 100, success: true }),
      rec({ serverName: 'pw', toolName: 'mcp__pw__nav', durationMs: 200, success: false }),
      rec({ serverName: 'pw', toolName: 'mcp__pw__nav', durationMs: null, success: null }), // orphan
    ];
    const aggs = aggregate(records);
    expect(aggs).toHaveLength(1);
    expect(aggs[0]).toMatchObject({
      serverName: 'pw',
      toolName: 'mcp__pw__nav',
      count: 3,
      avgDurationMs: 150, // (100+200)/2 — orphan excluded
      errorCount: 1,
    });
  });
});

describe('recordCall + query (AC-A2)', () => {
  it('persists and returns aggregates + timeline', async () => {
    await observabilityService.recordCall(rec({ id: 'a', toolName: 'Read' }));
    await observabilityService.recordCall(rec({ id: 'b', toolName: 'Edit' }));
    const res = await observabilityService.query('proj', { sinceDays: 1 });
    expect(res.timeline).toHaveLength(2);
    expect(res.aggregates).toHaveLength(2);
  });

  it('filters by server, tool, and sessionId', async () => {
    await observabilityService.recordCall(rec({ id: 'a', serverName: 'pw', toolName: 'mcp__pw__nav', sessionId: 's1' }));
    await observabilityService.recordCall(rec({ id: 'b', serverName: 'gh', toolName: 'mcp__gh__list', sessionId: 's2' }));
    expect((await observabilityService.query('proj', { server: 'pw' })).timeline).toHaveLength(1);
    expect((await observabilityService.query('proj', { tool: 'mcp__gh__list' })).timeline).toHaveLength(1);
    expect((await observabilityService.query('proj', { sessionId: 's2' })).timeline).toHaveLength(1);
  });

  it('returns empty for a project with no log file', async () => {
    const res = await observabilityService.query('never-seen', { sinceDays: 1 });
    expect(res.timeline).toEqual([]);
    expect(res.aggregates).toEqual([]);
  });

  it('timeline is most-recent-first', async () => {
    await observabilityService.recordCall(rec({ id: 'old', startedAt: Date.now() - 1000 }));
    await observabilityService.recordCall(rec({ id: 'new', startedAt: Date.now() }));
    const res = await observabilityService.query('proj', { sinceDays: 1 });
    expect(res.timeline[0].id).toBe('new');
  });
});

describe('prune 30-day boundary (AC-A3.b)', () => {
  it('removes records older than retention and keeps recent ones', async () => {
    const now = Date.now();
    await observabilityService.recordCall(rec({ id: 'old', startedAt: now - 31 * DAY_MS }));
    await observabilityService.recordCall(rec({ id: 'edge', startedAt: now - 29 * DAY_MS }));
    await observabilityService.recordCall(rec({ id: 'fresh', startedAt: now }));

    const removed = await observabilityService.prune('proj', 30);
    expect(removed).toBe(1);

    const res = await observabilityService.query('proj', { sinceDays: 9999 });
    const ids = res.timeline.map((r) => r.id).sort();
    expect(ids).toEqual(['edge', 'fresh']);
  });

  it('query never surfaces records older than sinceDays even before compaction', async () => {
    const now = Date.now();
    await observabilityService.recordCall(rec({ id: 'old', startedAt: now - 40 * DAY_MS }));
    await observabilityService.recordCall(rec({ id: 'fresh', startedAt: now }));
    const res = await observabilityService.query('proj', { sinceDays: 30 });
    expect(res.timeline.map((r) => r.id)).toEqual(['fresh']);
  });
});

describe('createMcpCallRecorder (S-A / N-A)', () => {
  it('appends exactly ONE complete record per call; body is never stored', async () => {
    const recorder = createMcpCallRecorder(() => 'rp');
    recorder.onToolUse('id1', 'mcp__pw__nav', { url: 'https://secret.example/file' });
    recorder.onToolResult('id1', { success: true, output: 'SECRET BODY' }, 'sess1');

    await vi.waitFor(async () => {
      const res = await observabilityService.query('rp', { sinceDays: 1 });
      expect(res.timeline).toHaveLength(1);
    });

    const r = (await observabilityService.query('rp', { sinceDays: 1 })).timeline[0];
    expect(r.serverName).toBe('pw');
    expect(r.durationMs).not.toBeNull();
    expect(r.success).toBe(true);
    expect(r.argBytes).toBeGreaterThan(0);
    expect(r.resultBytes).toBe(Buffer.byteLength('SECRET BODY', 'utf8'));
    // body must NOT be persisted (only sizes)
    expect(r).not.toHaveProperty('input');
    expect(r).not.toHaveProperty('output');
    expect(JSON.stringify(r)).not.toContain('SECRET BODY');
  });

  it('flushes an orphan (no result) as a null-field record at turn end', async () => {
    const recorder = createMcpCallRecorder(() => 'orphan-proj');
    recorder.onToolUse('id1', 'mcp__pw__hang', { x: 1 });
    recorder.onTurnEnd('sess1'); // result never arrived

    await vi.waitFor(async () => {
      const res = await observabilityService.query('orphan-proj', { sinceDays: 1 });
      expect(res.timeline).toHaveLength(1);
    });

    const r = (await observabilityService.query('orphan-proj', { sinceDays: 1 })).timeline[0];
    expect(r.durationMs).toBeNull();
    expect(r.resultBytes).toBeNull();
    expect(r.success).toBeNull();
    expect(r.argBytes).toBeGreaterThan(0); // start info still captured
  });

  it('does NOT double-append when a completed call is followed by turn end', async () => {
    const recorder = createMcpCallRecorder(() => 'once-proj');
    recorder.onToolUse('id1', 'Read', { file: 'a' });
    recorder.onToolResult('id1', { success: true, output: 'x' }, 'sess1');
    recorder.onTurnEnd('sess1'); // entry already consumed — nothing to flush

    await vi.waitFor(async () => {
      const res = await observabilityService.query('once-proj', { sinceDays: 1 });
      expect(res.timeline.length).toBeGreaterThanOrEqual(1);
    });
    // settle any stray async append, then assert exactly one.
    await new Promise((r) => setTimeout(r, 20));
    const res = await observabilityService.query('once-proj', { sinceDays: 1 });
    expect(res.timeline).toHaveLength(1);
    expect(res.timeline[0].durationMs).not.toBeNull();
  });

  it('drops records when no project slug resolves (no project context)', async () => {
    const recorder = createMcpCallRecorder(() => undefined);
    recorder.onToolUse('id1', 'Read', { file: 'a' });
    recorder.onToolResult('id1', { success: true, output: 'x' }, 'sess1');
    await new Promise((r) => setTimeout(r, 20));
    // nothing written anywhere — the observability dir may not even exist.
    const dir = path.join(tmpHome, '.hammoc', 'observability');
    const files = fsSync.existsSync(dir) ? fsSync.readdirSync(dir) : [];
    expect(files).toEqual([]);
  });
});
