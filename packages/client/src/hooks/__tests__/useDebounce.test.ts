/**
 * useDebounce Hook Tests
 * [Source: Story 4.5 - Task 12]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 500));
    expect(result.current).toBe('hello');
  });

  it('debounces value changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 500 } }
    );

    expect(result.current).toBe('hello');

    // Update value
    rerender({ value: 'world', delay: 500 });

    // Value should not change immediately
    expect(result.current).toBe('hello');

    // Advance time by 499ms - still not changed
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe('hello');

    // Advance time by 1ms more - now changed
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('world');
  });

  it('returns value immediately when delay is 0', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 0),
      { initialProps: { value: 'hello' } }
    );

    expect(result.current).toBe('hello');

    rerender({ value: 'world' });

    // Value should change immediately (no timer needed)
    expect(result.current).toBe('world');
  });

  it('only returns last value after multiple rapid updates', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } }
    );

    expect(result.current).toBe('a');

    // Rapid updates
    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'c' });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'd' });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Still showing 'a' because timer keeps resetting
    expect(result.current).toBe('a');

    // Wait for full delay
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Now shows 'd' (the last value)
    expect(result.current).toBe('d');
  });

  it('handles different types', () => {
    // Test with number
    const { result: numberResult } = renderHook(() => useDebounce(42, 100));
    expect(numberResult.current).toBe(42);

    // Test with object
    const obj = { key: 'value' };
    const { result: objectResult } = renderHook(() => useDebounce(obj, 100));
    expect(objectResult.current).toBe(obj);

    // Test with array
    const arr = [1, 2, 3];
    const { result: arrayResult } = renderHook(() => useDebounce(arr, 100));
    expect(arrayResult.current).toBe(arr);
  });

  it('cleans up timer on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const { rerender, unmount } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'hello' } }
    );

    // Trigger a timer by updating value
    rerender({ value: 'world' });

    // Unmount before timer fires
    unmount();

    // clearTimeout should have been called
    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
  });

  it('handles delay changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 500 } }
    );

    // Update value with long delay
    rerender({ value: 'world', delay: 500 });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('hello');

    // Change delay to shorter
    rerender({ value: 'world', delay: 100 });

    // With new shorter delay, value should update sooner
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('world');
  });
});
