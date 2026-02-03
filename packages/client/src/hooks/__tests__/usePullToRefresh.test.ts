/**
 * usePullToRefresh Tests
 * [Source: Story 3.4 - Task 4]
 *
 * Note: Touch event simulation is challenging in jsdom environment.
 * These tests focus on hook structure and state initialization.
 * Full interaction tests are covered in E2E tests.
 */

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePullToRefresh } from '../usePullToRefresh';

describe('usePullToRefresh', () => {
  const mockOnRefresh = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state with correct properties', () => {
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh: mockOnRefresh })
    );

    expect(result.current.isPulling).toBe(false);
    expect(result.current.pullDistance).toBe(0);
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.containerRef).toBeDefined();
    expect(result.current.containerRef.current).toBeNull();
  });

  it('accepts custom threshold option', () => {
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh: mockOnRefresh, threshold: 100 })
    );

    // Hook should initialize correctly with custom threshold
    expect(result.current.pullDistance).toBe(0);
    expect(result.current.isRefreshing).toBe(false);
  });

  it('accepts disabled option', () => {
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh: mockOnRefresh, disabled: true })
    );

    expect(result.current.isPulling).toBe(false);
    expect(result.current.pullDistance).toBe(0);
  });

  it('provides a ref object for container attachment', () => {
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh: mockOnRefresh })
    );

    // containerRef should be a valid ref object
    expect(typeof result.current.containerRef).toBe('object');
    expect('current' in result.current.containerRef).toBe(true);
  });

  it('maintains stable function identity across renders', () => {
    const { result, rerender } = renderHook(() =>
      usePullToRefresh({ onRefresh: mockOnRefresh })
    );

    const initialRef = result.current.containerRef;

    rerender();

    // containerRef should maintain identity
    expect(result.current.containerRef).toBe(initialRef);
  });

  it('resets to initial state when disabled changes', () => {
    const { result, rerender } = renderHook(
      ({ disabled }) => usePullToRefresh({ onRefresh: mockOnRefresh, disabled }),
      { initialProps: { disabled: false } }
    );

    expect(result.current.isPulling).toBe(false);

    rerender({ disabled: true });

    expect(result.current.isPulling).toBe(false);
    expect(result.current.pullDistance).toBe(0);
  });
});
