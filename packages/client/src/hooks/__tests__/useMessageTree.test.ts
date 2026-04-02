import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
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

});
