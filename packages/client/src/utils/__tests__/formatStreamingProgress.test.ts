import { describe, it, expect } from 'vitest';
import { formatElapsed, formatTokensK } from '../formatStreamingProgress';

describe('formatElapsed (CLI spinner elapsed format)', () => {
  it('shows seconds only under a minute', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(45)).toBe('45s');
    expect(formatElapsed(59)).toBe('59s');
  });

  it('shows "Nm Ns" at a minute and above', () => {
    expect(formatElapsed(60)).toBe('1m 0s');
    expect(formatElapsed(64)).toBe('1m 4s');
    expect(formatElapsed(700)).toBe('11m 40s');
  });

  it('floors fractional seconds and clamps negatives', () => {
    expect(formatElapsed(45.9)).toBe('45s');
    expect(formatElapsed(-5)).toBe('0s');
  });
});

describe('formatTokensK (CLI spinner token format)', () => {
  it('shows the plain integer under 1000', () => {
    expect(formatTokensK(0)).toBe('0');
    expect(formatTokensK(920)).toBe('920');
    expect(formatTokensK(999)).toBe('999');
  });

  it('abbreviates thousands as "N.Nk" at 1000 and above', () => {
    expect(formatTokensK(1000)).toBe('1.0k');
    expect(formatTokensK(2345)).toBe('2.3k');
    expect(formatTokensK(12000)).toBe('12.0k');
    expect(formatTokensK(125900)).toBe('125.9k');
  });
});
