/**
 * CLI screen cache tests (Story 37.7) — pure set/get/delete of the session-lifetime
 * screen grid used to sync late-joining browsers. The engine's teardown succession
 * (read final grid BEFORE dispose) and the session:join push are covered separately
 * (cliChatEngine teardown / websocket handler tests); here we pin the cache contract.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { setCliScreen, getCliScreen, deleteCliScreen } from '../cliScreenCache.js';

describe('cliScreenCache (Story 37.7)', () => {
  afterEach(() => {
    // Keep tests independent — drop any keys this file set.
    deleteCliScreen('sess-a');
    deleteCliScreen('sess-b');
  });

  it('returns undefined on a cache miss', () => {
    expect(getCliScreen('sess-a')).toBeUndefined();
  });

  it('stores a grid and returns the same grid on get', () => {
    const grid = ['line one', 'line two', ''];
    setCliScreen('sess-a', grid);
    expect(getCliScreen('sess-a')).toEqual(grid);
  });

  it('replaces the grid on a later set (newest screen wins)', () => {
    setCliScreen('sess-a', ['old']);
    setCliScreen('sess-a', ['new', 'screen']);
    expect(getCliScreen('sess-a')).toEqual(['new', 'screen']);
  });

  it('keys are independent per session', () => {
    setCliScreen('sess-a', ['a']);
    setCliScreen('sess-b', ['b']);
    expect(getCliScreen('sess-a')).toEqual(['a']);
    expect(getCliScreen('sess-b')).toEqual(['b']);
  });

  it('delete removes the entry (back to a miss)', () => {
    setCliScreen('sess-a', ['x']);
    deleteCliScreen('sess-a');
    expect(getCliScreen('sess-a')).toBeUndefined();
  });
});
