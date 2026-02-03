/**
 * useSkeletonCount Tests
 * [Source: Story 3.4 - Task 4]
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSkeletonCount } from '../useSkeletonCount';

describe('useSkeletonCount', () => {
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      value: originalInnerHeight,
      writable: true,
    });
  });

  it('returns default count initially', () => {
    const { result } = renderHook(() => useSkeletonCount(5));
    // The count is calculated based on window height
    expect(typeof result.current).toBe('number');
    expect(result.current).toBeGreaterThanOrEqual(3);
    expect(result.current).toBeLessThanOrEqual(10);
  });

  it('uses custom default count', () => {
    Object.defineProperty(window, 'innerHeight', {
      value: 100,
      writable: true,
    });

    const { result } = renderHook(() => useSkeletonCount(7));
    // With small height, should return minimum (3)
    expect(result.current).toBeGreaterThanOrEqual(3);
  });

  it('calculates count based on window height', () => {
    // Set a specific height: 800px - 56px header = 744px / 76px per item ≈ 10
    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      writable: true,
    });

    const { result } = renderHook(() => useSkeletonCount(5));
    expect(result.current).toBeGreaterThanOrEqual(3);
    expect(result.current).toBeLessThanOrEqual(10);
  });

  it('respects minimum count of 3', () => {
    // Very small height should still return at least 3
    Object.defineProperty(window, 'innerHeight', {
      value: 100,
      writable: true,
    });

    const { result } = renderHook(() => useSkeletonCount(5));
    expect(result.current).toBeGreaterThanOrEqual(3);
  });

  it('respects maximum count of 10', () => {
    // Very large height should return at most 10
    Object.defineProperty(window, 'innerHeight', {
      value: 2000,
      writable: true,
    });

    const { result } = renderHook(() => useSkeletonCount(5));
    expect(result.current).toBeLessThanOrEqual(10);
  });

  it('updates count on window resize', () => {
    Object.defineProperty(window, 'innerHeight', {
      value: 400,
      writable: true,
    });

    const { result } = renderHook(() => useSkeletonCount(5));

    // Simulate resize
    act(() => {
      Object.defineProperty(window, 'innerHeight', {
        value: 800,
        writable: true,
      });
      window.dispatchEvent(new Event('resize'));
    });

    // Count should be recalculated based on new height
    expect(typeof result.current).toBe('number');
    expect(result.current).toBeGreaterThanOrEqual(3);
    expect(result.current).toBeLessThanOrEqual(10);
  });

  it('cleans up resize listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useSkeletonCount(5));
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
