import { describe, it, expect } from 'vitest';
import { isBlockedBackgroundCall, BACKGROUND_BLOCK_REASON } from '../backgroundBlock.js';

describe('backgroundBlock (Story 36.1)', () => {
  it('blocks a background Bash call', () => {
    expect(isBlockedBackgroundCall('Bash', { command: 'echo hi', run_in_background: true })).toBe(true);
  });

  it('allows a foreground Bash call', () => {
    expect(isBlockedBackgroundCall('Bash', { command: 'echo hi', run_in_background: false })).toBe(false);
    expect(isBlockedBackgroundCall('Bash', { command: 'echo hi' })).toBe(false);
  });

  it('only targets Bash — other tools carrying the field are not blocked', () => {
    expect(isBlockedBackgroundCall('Read', { run_in_background: true })).toBe(false);
    expect(isBlockedBackgroundCall('Task', { run_in_background: true })).toBe(false);
  });

  it('is shape-safe (null / undefined / non-object / non-boolean)', () => {
    expect(isBlockedBackgroundCall('Bash', null)).toBe(false);
    expect(isBlockedBackgroundCall('Bash', undefined)).toBe(false);
    expect(isBlockedBackgroundCall('Bash', 'nope')).toBe(false);
    // strict === true, so a truthy non-boolean does NOT block (matches the .cjs hook)
    expect(isBlockedBackgroundCall('Bash', { run_in_background: 'true' })).toBe(false);
    expect(isBlockedBackgroundCall('Bash', { run_in_background: 1 })).toBe(false);
  });

  it('exposes a reason explaining the turn-per-process rationale', () => {
    const reason = BACKGROUND_BLOCK_REASON.toLowerCase();
    expect(reason).toContain('background');
    expect(reason).toContain('foreground');
  });
});
