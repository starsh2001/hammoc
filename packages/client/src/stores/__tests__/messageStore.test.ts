/**
 * Message Store Tests
 * [Source: Story 3.5 - Task 5]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMessageStore } from '../messageStore';
import { ApiError } from '../../services/api/client';

// Mock the sessions API
vi.mock('../../services/api/sessions', () => ({
  sessionsApi: {
    getMessages: vi.fn(),
  },
}));

import { sessionsApi } from '../../services/api/sessions';

describe('useMessageStore', () => {
  beforeEach(() => {
    // Reset store state
    useMessageStore.setState({
      messages: [],
      currentProjectSlug: null,
      currentSessionId: null,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      pagination: null,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const mockMessages = [
    {
      id: 'msg-1',
      type: 'user' as const,
      content: 'Hello',
      timestamp: '2026-01-15T10:00:00Z',
    },
    {
      id: 'msg-2',
      type: 'assistant' as const,
      content: 'Hi! How can I help?',
      timestamp: '2026-01-15T10:00:05Z',
    },
  ];

  const mockPagination = {
    total: 2,
    limit: 50,
    offset: 0,
    hasMore: false,
  };

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useMessageStore.getState();
      expect(state.messages).toEqual([]);
      expect(state.currentProjectSlug).toBeNull();
      expect(state.currentSessionId).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.isLoadingMore).toBe(false);
      expect(state.error).toBeNull();
      expect(state.pagination).toBeNull();
    });
  });

  describe('fetchMessages', () => {
    it('should fetch messages successfully', async () => {
      vi.mocked(sessionsApi.getMessages).mockResolvedValue({
        messages: mockMessages,
        pagination: mockPagination,
      });

      await useMessageStore.getState().fetchMessages('my-project', 'session-123');

      expect(useMessageStore.getState().messages).toEqual(mockMessages);
      expect(useMessageStore.getState().currentProjectSlug).toBe('my-project');
      expect(useMessageStore.getState().currentSessionId).toBe('session-123');
      expect(useMessageStore.getState().isLoading).toBe(false);
      expect(useMessageStore.getState().error).toBeNull();
      expect(useMessageStore.getState().pagination).toEqual(mockPagination);
    });

    it('should handle empty messages list', async () => {
      vi.mocked(sessionsApi.getMessages).mockResolvedValue({
        messages: [],
        pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
      });

      await useMessageStore.getState().fetchMessages('my-project', 'empty-session');

      expect(useMessageStore.getState().messages).toEqual([]);
      expect(useMessageStore.getState().isLoading).toBe(false);
      expect(useMessageStore.getState().error).toBeNull();
    });

    it('should set isLoading during fetch', async () => {
      let resolvePromise: (value: { messages: []; pagination: typeof mockPagination }) => void;
      vi.mocked(sessionsApi.getMessages).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve;
          })
      );

      // Start fetch
      const fetchPromise = useMessageStore.getState().fetchMessages('my-project', 'session-123');

      // Check loading state
      expect(useMessageStore.getState().isLoading).toBe(true);
      expect(useMessageStore.getState().error).toBeNull();

      // Resolve promise
      resolvePromise!({ messages: [], pagination: mockPagination });
      await fetchPromise;

      // Check state after completion
      expect(useMessageStore.getState().isLoading).toBe(false);
    });

    it('should clear messages when switching to a different session', async () => {
      // Set initial state with messages from old session
      useMessageStore.setState({
        messages: mockMessages,
        currentProjectSlug: 'my-project',
        currentSessionId: 'old-session',
        pagination: mockPagination,
      });

      vi.mocked(sessionsApi.getMessages).mockResolvedValue({
        messages: [],
        pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
      });

      await useMessageStore.getState().fetchMessages('my-project', 'new-session');

      expect(useMessageStore.getState().currentSessionId).toBe('new-session');
      expect(sessionsApi.getMessages).toHaveBeenCalled();
    });

    it('should handle ApiError correctly', async () => {
      vi.mocked(sessionsApi.getMessages).mockRejectedValue(
        new ApiError(404, 'SESSION_NOT_FOUND', '세션을 찾을 수 없습니다.')
      );

      await useMessageStore.getState().fetchMessages('my-project', 'nonexistent');

      expect(useMessageStore.getState().error).toBe('세션을 찾을 수 없습니다.');
      expect(useMessageStore.getState().isLoading).toBe(false);
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(sessionsApi.getMessages).mockRejectedValue(new Error('Unexpected error'));

      await useMessageStore.getState().fetchMessages('my-project', 'session-123');

      expect(useMessageStore.getState().error).toBe(
        '메시지를 불러오는 중 오류가 발생했습니다.'
      );
      expect(useMessageStore.getState().isLoading).toBe(false);
    });

    it('should clear previous error on new fetch', async () => {
      useMessageStore.setState({ error: 'Previous error' });

      vi.mocked(sessionsApi.getMessages).mockResolvedValue({
        messages: [],
        pagination: mockPagination,
      });

      await useMessageStore.getState().fetchMessages('my-project', 'session-123');

      expect(useMessageStore.getState().error).toBeNull();
    });
  });

  describe('fetchMoreMessages', () => {
    it('should fetch older messages and prepend to existing', async () => {
      const olderMessages = [
        {
          id: 'msg-0',
          type: 'user' as const,
          content: 'Older message',
          timestamp: '2026-01-15T09:59:00Z',
        },
      ];

      useMessageStore.setState({
        messages: mockMessages,
        currentProjectSlug: 'my-project',
        currentSessionId: 'session-123',
        pagination: { total: 10, limit: 2, offset: 0, hasMore: true },
      });

      vi.mocked(sessionsApi.getMessages).mockResolvedValue({
        messages: olderMessages,
        pagination: { total: 10, limit: 2, offset: 2, hasMore: true },
      });

      await useMessageStore.getState().fetchMoreMessages();

      expect(useMessageStore.getState().messages).toHaveLength(3);
      // Older messages are prepended (at the beginning)
      expect(useMessageStore.getState().messages[0]).toEqual(olderMessages[0]);
      expect(sessionsApi.getMessages).toHaveBeenCalledWith('my-project', 'session-123', {
        limit: 2,
        offset: 2,
      });
    });

    it('should not fetch if hasMore is false', async () => {
      useMessageStore.setState({
        messages: mockMessages,
        currentProjectSlug: 'my-project',
        currentSessionId: 'session-123',
        pagination: { total: 2, limit: 50, offset: 0, hasMore: false },
      });

      await useMessageStore.getState().fetchMoreMessages();

      expect(sessionsApi.getMessages).not.toHaveBeenCalled();
    });

    it('should not fetch if already loading more', async () => {
      useMessageStore.setState({
        messages: mockMessages,
        currentProjectSlug: 'my-project',
        currentSessionId: 'session-123',
        isLoadingMore: true,
        pagination: { total: 10, limit: 2, offset: 0, hasMore: true },
      });

      await useMessageStore.getState().fetchMoreMessages();

      expect(sessionsApi.getMessages).not.toHaveBeenCalled();
    });

    it('should not fetch if no current session', async () => {
      useMessageStore.setState({
        messages: mockMessages,
        currentProjectSlug: null,
        currentSessionId: null,
        pagination: { total: 10, limit: 2, offset: 0, hasMore: true },
      });

      await useMessageStore.getState().fetchMoreMessages();

      expect(sessionsApi.getMessages).not.toHaveBeenCalled();
    });

    it('should set isLoadingMore during fetch', async () => {
      let resolvePromise: (value: { messages: []; pagination: typeof mockPagination }) => void;
      vi.mocked(sessionsApi.getMessages).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve;
          })
      );

      useMessageStore.setState({
        messages: mockMessages,
        currentProjectSlug: 'my-project',
        currentSessionId: 'session-123',
        pagination: { total: 10, limit: 2, offset: 0, hasMore: true },
      });

      const fetchPromise = useMessageStore.getState().fetchMoreMessages();

      expect(useMessageStore.getState().isLoadingMore).toBe(true);

      resolvePromise!({ messages: [], pagination: { ...mockPagination, hasMore: false } });
      await fetchPromise;

      expect(useMessageStore.getState().isLoadingMore).toBe(false);
    });

    it('should reset isLoadingMore on error', async () => {
      useMessageStore.setState({
        messages: mockMessages,
        currentProjectSlug: 'my-project',
        currentSessionId: 'session-123',
        pagination: { total: 10, limit: 2, offset: 0, hasMore: true },
      });

      vi.mocked(sessionsApi.getMessages).mockRejectedValue(new Error('Error'));

      await useMessageStore.getState().fetchMoreMessages();

      expect(useMessageStore.getState().isLoadingMore).toBe(false);
    });
  });

  describe('clearMessages', () => {
    it('should clear messages and reset state', () => {
      useMessageStore.setState({
        messages: mockMessages,
        currentProjectSlug: 'my-project',
        currentSessionId: 'session-123',
        error: 'Some error',
        pagination: mockPagination,
      });

      useMessageStore.getState().clearMessages();

      expect(useMessageStore.getState().messages).toEqual([]);
      expect(useMessageStore.getState().currentProjectSlug).toBeNull();
      expect(useMessageStore.getState().currentSessionId).toBeNull();
      expect(useMessageStore.getState().error).toBeNull();
      expect(useMessageStore.getState().pagination).toBeNull();
    });
  });
});
