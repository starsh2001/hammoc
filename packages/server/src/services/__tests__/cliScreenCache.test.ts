/**
 * CLI screen cache tests (Story 37.7, reworked 37.8) — pure set/get/delete of the session-
 * lifetime serialized screen frame used to restore late-joining / refreshed / collapse-
 * expanded browsers. The engine's throttled refresh + teardown succession and the
 * session:join / cli:request-screen-frame push are covered separately (engine / websocket
 * handler tests); here we pin the cache contract (now a single frame string, not a grid).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { setCliScreen, getCliScreen, deleteCliScreen } from '../cliScreenCache.js';

describe('cliScreenCache (Story 37.8)', () => {
  afterEach(() => {
    // Keep tests independent — drop any keys this file set.
    deleteCliScreen('sess-a');
    deleteCliScreen('sess-b');
  });

  it('returns undefined on a cache miss', () => {
    expect(getCliScreen('sess-a')).toBeUndefined();
  });

  it('stores a frame and returns the same frame on get', () => {
    const frame = '\x1b[31mclaude\x1b[0m > prompt';
    setCliScreen('sess-a', frame);
    expect(getCliScreen('sess-a')).toBe(frame);
  });

  it('replaces the frame on a later set (newest screen wins)', () => {
    setCliScreen('sess-a', 'old screen');
    setCliScreen('sess-a', 'new screen');
    expect(getCliScreen('sess-a')).toBe('new screen');
  });

  it('keys are independent per session', () => {
    setCliScreen('sess-a', 'a');
    setCliScreen('sess-b', 'b');
    expect(getCliScreen('sess-a')).toBe('a');
    expect(getCliScreen('sess-b')).toBe('b');
  });

  it('delete removes the entry (back to a miss)', () => {
    setCliScreen('sess-a', 'x');
    deleteCliScreen('sess-a');
    expect(getCliScreen('sess-a')).toBeUndefined();
  });
});
