import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useToast } from '../useToast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should start with empty toasts array', () => {
    const { result } = renderHook(() => useToast());

    expect(result.current.toasts).toEqual([]);
  });

  it('should add toast when showToast is called', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast({ message: 'Test message' });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Test message');
    expect(result.current.toasts[0].type).toBe('info');
  });

  it('should add toast with specified type', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast({ message: 'Success', type: 'success' });
    });

    expect(result.current.toasts[0].type).toBe('success');

    act(() => {
      result.current.showToast({ message: 'Error', type: 'error' });
    });

    expect(result.current.toasts[1].type).toBe('error');
  });

  it('should remove toast when removeToast is called', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast({ message: 'Test' });
    });

    const toastId = result.current.toasts[0].id;

    act(() => {
      result.current.removeToast(toastId);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should auto-remove toast after duration', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast({ message: 'Test', duration: 3000 });
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should use default duration of 3000ms', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast({ message: 'Test' });
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2999);
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should generate unique ids for each toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast({ message: 'Toast 1' });
      result.current.showToast({ message: 'Toast 2' });
      result.current.showToast({ message: 'Toast 3' });
    });

    const ids = result.current.toasts.map((t) => t.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });
});
