/**
 * sessionSnapshotCache tests — the browser-local pre-paint cache (last-seen transcript + CLI
 * screen frame) that removes the blank gap on refresh / reconnect / mobile sleep-wake.
 *
 * Date.now is stubbed to a monotonic counter so LRU ordering is deterministic (real Date.now can
 * return the same ms for back-to-back writes, making eviction order ambiguous).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HistoryMessage } from '@hammoc/shared';
import {
  saveMessagesSnapshot,
  saveFrameSnapshot,
  loadSnapshot,
  flushSnapshotsNow,
  __resetSnapshotCacheForTests,
} from '../sessionSnapshotCache';

const msgs = (n: number): HistoryMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m-${i}`,
    type: 'assistant' as const,
    content: `msg ${i}`,
    timestamp: '2026-01-15T10:00:00Z',
  }));

describe('sessionSnapshotCache', () => {
  beforeEach(() => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now++);
    __resetSnapshotCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips a transcript after flush', () => {
    saveMessagesSnapshot('s1', msgs(3));
    flushSnapshotsNow();
    const snap = loadSnapshot('s1');
    expect(snap?.messages).toHaveLength(3);
    expect(snap?.messages[0].id).toBe('m-0');
  });

  it('round-trips a CLI screen frame', () => {
    saveFrameSnapshot('s1', 'FRAME');
    flushSnapshotsNow();
    expect(loadSnapshot('s1')?.frame).toBe('FRAME');
  });

  it('returns null for an unknown session', () => {
    expect(loadSnapshot('nope')).toBeNull();
  });

  it('keeps messages and frame independently for one session', () => {
    saveMessagesSnapshot('s1', msgs(1));
    saveFrameSnapshot('s1', 'F');
    flushSnapshotsNow();
    const snap = loadSnapshot('s1');
    expect(snap?.messages).toHaveLength(1);
    expect(snap?.frame).toBe('F');
  });

  it('skips empty-message saves so a prior snapshot survives', () => {
    saveMessagesSnapshot('s1', msgs(2));
    flushSnapshotsNow();
    saveMessagesSnapshot('s1', []);
    flushSnapshotsNow();
    expect(loadSnapshot('s1')?.messages).toHaveLength(2);
  });

  it('makes a pending (un-flushed) write visible immediately on load', () => {
    saveFrameSnapshot('s1', 'PENDING');
    // intentionally NOT flushed — a remount right after a save must still see the latest
    expect(loadSnapshot('s1')?.frame).toBe('PENDING');
  });

  it('caps the transcript to the most-recent messages (tail kept)', () => {
    saveMessagesSnapshot('s1', msgs(500));
    flushSnapshotsNow();
    const snap = loadSnapshot('s1');
    expect(snap!.messages.length).toBeLessThanOrEqual(120);
    // The bottom of the conversation is what the user sees first, so the tail is preserved.
    expect(snap!.messages[snap!.messages.length - 1].id).toBe('m-499');
  });

  it('evicts the least-recently-written session beyond the cap (LRU)', () => {
    for (let i = 0; i < 6; i++) {
      saveMessagesSnapshot(`s${i}`, msgs(1));
      flushSnapshotsNow();
    }
    expect(loadSnapshot('s0')).toBeNull(); // oldest evicted (cap is 5)
    expect(loadSnapshot('s5')).not.toBeNull(); // newest kept
  });

  it('recovers from a corrupt persisted value', () => {
    localStorage.setItem('hammoc-session-snapshot', '{not json');
    expect(loadSnapshot('s1')).toBeNull();
    // and a subsequent save still works
    saveFrameSnapshot('s1', 'OK');
    flushSnapshotsNow();
    expect(loadSnapshot('s1')?.frame).toBe('OK');
  });
});
