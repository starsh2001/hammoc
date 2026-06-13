import { describe, it, expect } from 'vitest';
import { isBlockedBackgroundCall, BACKGROUND_BLOCK_REASON } from '../backgroundBlock.js';

describe('backgroundBlock (Story 36.1)', () => {
  it('blocks any background call — keyed off the input flag, not the tool name', () => {
    expect(isBlockedBackgroundCall({ command: 'echo hi', run_in_background: true })).toBe(true);
    // No tool name at all — the flag is what matters, so new/other tools are covered too.
    expect(isBlockedBackgroundCall({ run_in_background: true })).toBe(true);
  });

  it('allows foreground calls (incl. several launched in parallel within a turn and awaited)', () => {
    expect(isBlockedBackgroundCall({ command: 'echo hi', run_in_background: false })).toBe(false);
    expect(isBlockedBackgroundCall({ command: 'echo hi' })).toBe(false);
    expect(isBlockedBackgroundCall({})).toBe(false);
  });

  it('is shape-safe (null / undefined / non-object / non-boolean flag)', () => {
    expect(isBlockedBackgroundCall(null)).toBe(false);
    expect(isBlockedBackgroundCall(undefined)).toBe(false);
    expect(isBlockedBackgroundCall('nope')).toBe(false);
    // strict === true, so a truthy non-boolean does NOT block (matches the .cjs hook)
    expect(isBlockedBackgroundCall({ run_in_background: 'true' })).toBe(false);
    expect(isBlockedBackgroundCall({ run_in_background: 1 })).toBe(false);
  });

  it('exposes a reason explaining the turn-per-process rationale', () => {
    const reason = BACKGROUND_BLOCK_REASON.toLowerCase();
    expect(reason).toContain('background');
    expect(reason).toContain('foreground');
  });
});
