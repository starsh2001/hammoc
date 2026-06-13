import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTrailingThrottle } from '../trailingThrottle.js';

describe('createTrailingThrottle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires immediately on the leading edge', () => {
    const fn = vi.fn();
    const t = createTrailingThrottle<string>(100, fn);
    t.schedule('a');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('a');
  });

  it('coalesces a burst to the latest value on the trailing edge', () => {
    const fn = vi.fn();
    const t = createTrailingThrottle<string>(100, fn);
    t.schedule('a'); // leading
    t.schedule('b');
    t.schedule('c'); // latest pending
    expect(fn).toHaveBeenCalledTimes(1); // only the leading send so far
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('c'); // trailing == latest
  });

  it('stays idle after the trailing flush when nothing new is scheduled', () => {
    const fn = vi.fn();
    const t = createTrailingThrottle<string>(100, fn);
    t.schedule('a');
    t.schedule('b');
    vi.advanceTimersByTime(100); // trailing 'b'
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000); // idle, no pending
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('treats a schedule after the window closes as a fresh leading edge', () => {
    const fn = vi.fn();
    const t = createTrailingThrottle<string>(100, fn);
    t.schedule('a'); // leading
    vi.advanceTimersByTime(100); // window closes (no pending)
    t.schedule('b'); // fresh leading
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('b');
  });

  it('cancel drops the pending value and the timer', () => {
    const fn = vi.fn();
    const t = createTrailingThrottle<string>(100, fn);
    t.schedule('a'); // leading
    t.schedule('b'); // pending
    t.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1); // only the leading 'a' ever fired
  });
});
