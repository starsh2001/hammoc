/**
 * useStreaming Hook — chain:update listener tests
 * [Source: Story 24.2 - Task 9.2, 9.9]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStreaming } from '../useStreaming';
import { useChatStore } from '../../stores/chatStore';
import { useMessageStore } from '../../stores/messageStore';
import { useChainStore } from '../../stores/chainStore';
import { createMockSocket } from '../../test-utils/mockSocket';
import * as socketModule from '../../services/socket';
import type { PromptChainItem } from '@hammoc/shared';

vi.mock('../../services/socket', () => ({
  getSocket: vi.fn(),
}));

const mockChainItems: PromptChainItem[] = [
  { id: 'chain-1', content: '/dev', status: 'pending', createdAt: 1000 },
  { id: 'chain-2', content: '/test', status: 'sending', createdAt: 2000 },
];

describe('useStreaming — chain:update', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;

  beforeEach(() => {
    mockSocket = createMockSocket();
    vi.mocked(socketModule.getSocket).mockReturnValue(mockSocket as unknown as ReturnType<typeof socketModule.getSocket>);

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queueMicrotask(() => cb(0));
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    useChatStore.setState({
      isStreaming: false,
      streamingSessionId: null,
      streamingMessageId: null,
      streamingSegments: [],
      streamingStartedAt: null,
      isCompacting: false,
      isSessionLocked: false,
    });
    useMessageStore.setState({
      messages: [],
      currentProjectSlug: 'test-project',
      currentSessionId: 'session-1',
      isLoading: false,
      isLoadingMore: false,
      error: null,
      pagination: null,
    });
    useChainStore.setState({ chainItems: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates chain store on chain:update event with matching sessionId', () => {
    renderHook(() => useStreaming());

    mockSocket.trigger('chain:update', {
      sessionId: 'session-1',
      items: mockChainItems,
    });

    expect(useChainStore.getState().chainItems).toEqual(mockChainItems);
  });

  it('ignores chain:update event with non-matching sessionId', () => {
    renderHook(() => useStreaming());

    mockSocket.trigger('chain:update', {
      sessionId: 'different-session',
      items: mockChainItems,
    });

    expect(useChainStore.getState().chainItems).toEqual([]);
  });

  it('ignores chain:update event when currentSessionId is not yet set', () => {
    useMessageStore.setState({ currentSessionId: null as unknown as string });
    renderHook(() => useStreaming());

    mockSocket.trigger('chain:update', {
      sessionId: 'session-1',
      items: mockChainItems,
    });

    expect(useChainStore.getState().chainItems).toEqual([]);
  });

  it('clears chain store when server sends empty items', () => {
    useChainStore.setState({ chainItems: mockChainItems });
    renderHook(() => useStreaming());

    mockSocket.trigger('chain:update', {
      sessionId: 'session-1',
      items: [],
    });

    expect(useChainStore.getState().chainItems).toEqual([]);
  });

  it('cleans up chain:update listener on unmount', () => {
    const { unmount } = renderHook(() => useStreaming());
    unmount();

    // After unmount, triggering should not update the store
    useChainStore.setState({ chainItems: [] });
    mockSocket.trigger('chain:update', {
      sessionId: 'session-1',
      items: mockChainItems,
    });

    expect(useChainStore.getState().chainItems).toEqual([]);
  });
});
