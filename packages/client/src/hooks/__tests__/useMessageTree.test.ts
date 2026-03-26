import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { HistoryMessage } from '@hammoc/shared';
import { useMessageTree } from '../useMessageTree';

function makeMsg(overrides: Partial<HistoryMessage> & { id: string }): HistoryMessage {
  return {
    type: 'user',
    content: `msg-${overrides.id}`,
    timestamp: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useMessageTree', () => {
  it('returns all messages for linear conversation', () => {
    const messages = [
      makeMsg({ id: 'msg-1' }),
      makeMsg({ id: 'msg-2', parentId: 'msg-1' }),
      makeMsg({ id: 'msg-3', parentId: 'msg-2' }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    expect(result.current.displayMessages).toHaveLength(3);
    expect(result.current.branchPoints.size).toBe(0);
  });

  it('defaults to newest branch', () => {
    const messages = [
      makeMsg({ id: 'root' }),
      makeMsg({ id: 'old', parentId: 'root', timestamp: '2026-01-01T00:00:00Z' }),
      makeMsg({ id: 'new', parentId: 'root', timestamp: '2026-01-01T02:00:00Z' }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    // Should show newest branch by default
    expect(result.current.displayMessages.map((m) => m.id)).toEqual(['root', 'new']);
    expect(result.current.branchPoints.get('root')).toEqual({ total: 2, current: 1 });
  });

  it('navigates to previous branch', () => {
    const messages = [
      makeMsg({ id: 'root' }),
      makeMsg({ id: 'a', parentId: 'root', timestamp: '2026-01-01T00:00:00Z' }),
      makeMsg({ id: 'b', parentId: 'root', timestamp: '2026-01-01T01:00:00Z' }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    // Default is branch 'b' (index 1)
    expect(result.current.displayMessages.map((m) => m.id)).toEqual(['root', 'b']);

    // Navigate to previous
    act(() => {
      result.current.navigateBranch('root', 'prev');
    });

    expect(result.current.displayMessages.map((m) => m.id)).toEqual(['root', 'a']);
    expect(result.current.branchPoints.get('root')?.current).toBe(0);
  });

  it('navigates to next branch', () => {
    const messages = [
      makeMsg({ id: 'root' }),
      makeMsg({ id: 'a', parentId: 'root', timestamp: '2026-01-01T00:00:00Z' }),
      makeMsg({ id: 'b', parentId: 'root', timestamp: '2026-01-01T01:00:00Z' }),
      makeMsg({ id: 'c', parentId: 'root', timestamp: '2026-01-01T02:00:00Z' }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    // Navigate to first
    act(() => {
      result.current.navigateBranch('root', 'prev');
    });
    act(() => {
      result.current.navigateBranch('root', 'prev');
    });

    expect(result.current.branchPoints.get('root')?.current).toBe(0);

    // Navigate next
    act(() => {
      result.current.navigateBranch('root', 'next');
    });

    expect(result.current.branchPoints.get('root')?.current).toBe(1);
  });

  it('preserves branch selections when messages update', () => {
    const messages1 = [
      makeMsg({ id: 'root' }),
      makeMsg({ id: 'a', parentId: 'root', timestamp: '2026-01-01T00:00:00Z' }),
      makeMsg({ id: 'b', parentId: 'root', timestamp: '2026-01-01T01:00:00Z' }),
    ];

    const { result, rerender } = renderHook(
      ({ msgs }) => useMessageTree(msgs),
      { initialProps: { msgs: messages1 } },
    );

    // Select branch 'a'
    act(() => {
      result.current.navigateBranch('root', 'prev');
    });
    expect(result.current.displayMessages.map((m) => m.id)).toEqual(['root', 'a']);

    // Add a new message to branch 'a'
    const messages2 = [
      ...messages1,
      makeMsg({ id: 'a-child', parentId: 'a', timestamp: '2026-01-01T00:01:00Z' }),
    ];

    rerender({ msgs: messages2 });

    // Selection should be preserved (still on branch 'a')
    expect(result.current.displayMessages.map((m) => m.id)).toEqual(['root', 'a', 'a-child']);
  });

  it('does not navigate past boundaries', () => {
    const messages = [
      makeMsg({ id: 'root' }),
      makeMsg({ id: 'a', parentId: 'root' }),
      makeMsg({ id: 'b', parentId: 'root' }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    // Try to navigate past last
    act(() => {
      result.current.navigateBranch('root', 'next');
    });

    // Should stay at last
    expect(result.current.branchPoints.get('root')?.current).toBe(1);

    // Go to first
    act(() => {
      result.current.navigateBranch('root', 'prev');
    });

    // Try to navigate past first
    act(() => {
      result.current.navigateBranch('root', 'prev');
    });

    expect(result.current.branchPoints.get('root')?.current).toBe(0);
  });
});
