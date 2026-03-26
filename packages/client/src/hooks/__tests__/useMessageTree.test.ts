import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HistoryMessage } from '@hammoc/shared';
import { useMessageTree } from '../useMessageTree';
import { useMessageStore } from '../../stores/messageStore';
import { useChatStore } from '../../stores/chatStore';

function makeMsg(overrides: Partial<HistoryMessage> & { id: string }): HistoryMessage {
  return {
    type: 'user',
    content: `msg-${overrides.id}`,
    timestamp: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const UUID_A = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const UUID_B = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const UUID_C = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

describe('useMessageTree', () => {
  beforeEach(() => {
    // Reset stores to default state
    useMessageStore.setState({
      serverBranchPoints: null,
      currentBranchSelections: null,
      currentProjectSlug: 'test-project',
      currentSessionId: 'test-session',
    });
    useChatStore.setState({
      isStreaming: false,
      isCompacting: false,
    });
  });

  it('returns messages directly as displayMessages', () => {
    const messages = [
      makeMsg({ id: 'msg-1' }),
      makeMsg({ id: 'msg-2', parentId: 'msg-1' }),
      makeMsg({ id: 'msg-3', parentId: 'msg-2' }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    expect(result.current.displayMessages).toBe(messages);
    expect(result.current.displayMessages).toHaveLength(3);
  });

  it('returns empty branchPoints when serverBranchPoints is null', () => {
    const messages = [makeMsg({ id: 'msg-1' })];

    const { result } = renderHook(() => useMessageTree(messages));

    expect(result.current.branchPoints.size).toBe(0);
  });

  it('matches serverBranchPoints to displayMessages by base UUID', () => {
    useMessageStore.setState({
      serverBranchPoints: {
        [UUID_A]: { total: 3, current: 1, selectionKey: 'parent-key' },
      },
    });

    const messages = [
      makeMsg({ id: 'root' }),
      makeMsg({ id: `${UUID_A}-text-0`, parentId: 'root' }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    expect(result.current.branchPoints.size).toBe(1);
    expect(result.current.branchPoints.get(`${UUID_A}-text-0`)).toEqual({
      total: 3,
      current: 1,
      selectionKey: 'parent-key',
    });
  });

  it('matches only the first split message per base UUID (dedup)', () => {
    useMessageStore.setState({
      serverBranchPoints: {
        [UUID_A]: { total: 2, current: 0 },
      },
    });

    const messages = [
      makeMsg({ id: 'root' }),
      makeMsg({ id: `${UUID_A}-text-0`, parentId: 'root' }),
      makeMsg({ id: `${UUID_A}-text-1`, parentId: 'root' }),
      makeMsg({ id: `${UUID_A}-tool-abc`, parentId: 'root' }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    // Only first split message should have branchPoint
    expect(result.current.branchPoints.size).toBe(1);
    expect(result.current.branchPoints.has(`${UUID_A}-text-0`)).toBe(true);
    expect(result.current.branchPoints.has(`${UUID_A}-text-1`)).toBe(false);
    expect(result.current.branchPoints.has(`${UUID_A}-tool-abc`)).toBe(false);
  });

  it('navigateBranch calls fetchMessages with correct branchSelections', () => {
    const fetchMessages = vi.fn();
    useMessageStore.setState({
      serverBranchPoints: {
        [UUID_A]: { total: 3, current: 2, selectionKey: 'parent-1' },
      },
      currentBranchSelections: null,
      currentProjectSlug: 'proj',
      currentSessionId: 'sess',
      fetchMessages,
    });

    const messages = [
      makeMsg({ id: 'root' }),
      makeMsg({ id: `${UUID_A}-text-0`, parentId: 'root' }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    act(() => {
      result.current.navigateBranch(`${UUID_A}-text-0`, 'prev');
    });

    expect(fetchMessages).toHaveBeenCalledWith('proj', 'sess', {
      silent: true,
      branchSelections: { 'parent-1': 1 },
      isBranchSwitch: true,
    });
  });

  it('navigateBranch accumulates branchSelections across multiple branches (AC 7)', () => {
    const fetchMessages = vi.fn();
    useMessageStore.setState({
      serverBranchPoints: {
        [UUID_A]: { total: 3, current: 2, selectionKey: 'parent-1' },
        [UUID_B]: { total: 2, current: 1, selectionKey: 'parent-2' },
      },
      currentBranchSelections: { 'parent-1': 1 },
      currentProjectSlug: 'proj',
      currentSessionId: 'sess',
      fetchMessages,
    });

    const messages = [
      makeMsg({ id: 'root' }),
      makeMsg({ id: UUID_A, parentId: 'root' }),
      makeMsg({ id: UUID_B, parentId: UUID_A }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    act(() => {
      result.current.navigateBranch(UUID_B, 'prev');
    });

    // Should preserve parent-1 selection and add parent-2
    expect(fetchMessages).toHaveBeenCalledWith('proj', 'sess', {
      silent: true,
      branchSelections: { 'parent-1': 1, 'parent-2': 0 },
      isBranchSwitch: true,
    });
  });

  it('navigateBranch preserves sibling branch selectionKey on independent switch (AC 8)', () => {
    const fetchMessages = vi.fn();
    useMessageStore.setState({
      serverBranchPoints: {
        [UUID_A]: { total: 3, current: 0, selectionKey: 'upper-branch' },
        [UUID_C]: { total: 2, current: 1, selectionKey: 'lower-branch' },
      },
      currentBranchSelections: { 'upper-branch': 0, 'lower-branch': 1 },
      currentProjectSlug: 'proj',
      currentSessionId: 'sess',
      fetchMessages,
    });

    const messages = [
      makeMsg({ id: UUID_A }),
      makeMsg({ id: UUID_C, parentId: UUID_A }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    // Switch upper branch only
    act(() => {
      result.current.navigateBranch(UUID_A, 'next');
    });

    // lower-branch selection should be preserved
    expect(fetchMessages).toHaveBeenCalledWith('proj', 'sess', {
      silent: true,
      branchSelections: { 'upper-branch': 1, 'lower-branch': 1 },
      isBranchSwitch: true,
    });
  });

  it('navigateBranch is no-op during streaming', () => {
    const fetchMessages = vi.fn();
    useChatStore.setState({ isStreaming: true });
    useMessageStore.setState({
      serverBranchPoints: {
        [UUID_A]: { total: 2, current: 1, selectionKey: 'key' },
      },
      fetchMessages,
    });

    const messages = [makeMsg({ id: UUID_A })];
    const { result } = renderHook(() => useMessageTree(messages));

    act(() => {
      result.current.navigateBranch(UUID_A, 'prev');
    });

    expect(fetchMessages).not.toHaveBeenCalled();
  });

  it('navigateBranch is no-op during compacting', () => {
    const fetchMessages = vi.fn();
    useChatStore.setState({ isCompacting: true });
    useMessageStore.setState({
      serverBranchPoints: {
        [UUID_A]: { total: 2, current: 1, selectionKey: 'key' },
      },
      fetchMessages,
    });

    const messages = [makeMsg({ id: UUID_A })];
    const { result } = renderHook(() => useMessageTree(messages));

    act(() => {
      result.current.navigateBranch(UUID_A, 'prev');
    });

    expect(fetchMessages).not.toHaveBeenCalled();
  });

  it('isBranchNavigationDisabled is true when streaming', () => {
    useChatStore.setState({ isStreaming: true });
    const { result } = renderHook(() => useMessageTree([]));
    expect(result.current.isBranchNavigationDisabled).toBe(true);
  });

  it('isBranchNavigationDisabled is true when compacting', () => {
    useChatStore.setState({ isCompacting: true });
    const { result } = renderHook(() => useMessageTree([]));
    expect(result.current.isBranchNavigationDisabled).toBe(true);
  });

  it('isBranchNavigationDisabled is false when idle', () => {
    const { result } = renderHook(() => useMessageTree([]));
    expect(result.current.isBranchNavigationDisabled).toBe(false);
  });

  it('navigateBranch does not call fetchMessages when at boundary', () => {
    const fetchMessages = vi.fn();
    useMessageStore.setState({
      serverBranchPoints: {
        [UUID_A]: { total: 3, current: 2, selectionKey: 'key' },
      },
      currentBranchSelections: null,
      currentProjectSlug: 'proj',
      currentSessionId: 'sess',
      fetchMessages,
    });

    const messages = [makeMsg({ id: UUID_A })];
    const { result } = renderHook(() => useMessageTree(messages));

    // Already at last (current=2, total=3), navigate next → no-op
    act(() => {
      result.current.navigateBranch(UUID_A, 'next');
    });

    expect(fetchMessages).not.toHaveBeenCalled();
  });

  it('navigateBranch does not call fetchMessages when at first boundary', () => {
    const fetchMessages = vi.fn();
    useMessageStore.setState({
      serverBranchPoints: {
        [UUID_A]: { total: 3, current: 0, selectionKey: 'key' },
      },
      currentBranchSelections: { 'key': 0 },
      currentProjectSlug: 'proj',
      currentSessionId: 'sess',
      fetchMessages,
    });

    const messages = [makeMsg({ id: UUID_A })];
    const { result } = renderHook(() => useMessageTree(messages));

    // Already at first (current=0), navigate prev → no-op
    act(() => {
      result.current.navigateBranch(UUID_A, 'prev');
    });

    expect(fetchMessages).not.toHaveBeenCalled();
  });
});
