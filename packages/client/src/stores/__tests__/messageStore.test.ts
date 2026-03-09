/**
 * Message Store Tests
 * [Source: Story 3.5 - Task 5]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HistoryMessage } from '@hammoc/shared';
import { useMessageStore } from '../messageStore';
import { ApiError } from '../../services/api/client';

/** Test helper type matching the client-local optimistic extension */
type OptimisticHistoryMessage = HistoryMessage & { _optimistic?: boolean };

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

  describe('addMessages', () => {
    it('should append new messages to existing messages', () => {
      useMessageStore.setState({ messages: mockMessages });

      const newMessages = [
        {
          id: 'msg-3',
          type: 'assistant' as const,
          content: 'New response',
          timestamp: '2026-01-15T10:01:00Z',
        },
      ];

      useMessageStore.getState().addMessages(newMessages);

      const state = useMessageStore.getState();
      expect(state.messages).toHaveLength(3);
      expect(state.messages[2]).toEqual(newMessages[0]);
    });

    it('should not modify state when empty array is passed', () => {
      useMessageStore.setState({ messages: mockMessages });

      useMessageStore.getState().addMessages([]);

      expect(useMessageStore.getState().messages).toEqual(mockMessages);
    });

    it('should work with empty initial messages', () => {
      const newMessages = [
        {
          id: 'msg-1',
          type: 'assistant' as const,
          content: 'Hello',
          timestamp: '2026-01-15T10:00:00Z',
        },
      ];

      useMessageStore.getState().addMessages(newMessages);

      expect(useMessageStore.getState().messages).toEqual(newMessages);
    });

    // TC-D1: Duplicate ID messages are not added
    it('should not add messages with duplicate IDs', () => {
      useMessageStore.setState({ messages: mockMessages });

      const duplicateMessages = [
        {
          id: 'msg-1', // same ID as existing
          type: 'user' as const,
          content: 'Different content',
          timestamp: '2026-01-15T10:02:00Z',
        },
      ];

      useMessageStore.getState().addMessages(duplicateMessages);

      const state = useMessageStore.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0].content).toBe('Hello'); // original preserved
    });

    // TC-D2: Messages with different IDs are added normally
    it('should add messages with different IDs', () => {
      useMessageStore.setState({ messages: mockMessages });

      const newMessages = [
        {
          id: 'msg-new',
          type: 'assistant' as const,
          content: 'Brand new message',
          timestamp: '2026-01-15T10:02:00Z',
        },
      ];

      useMessageStore.getState().addMessages(newMessages);

      expect(useMessageStore.getState().messages).toHaveLength(3);
    });

    // TC-D3: Optimistic ID and server ID are different — both added (ID-based only)
    it('should add server message even if content matches optimistic (different IDs)', () => {
      useMessageStore.setState({
        messages: [
          {
            id: 'optimistic-abc',
            type: 'user' as const,
            content: 'Hello',
            timestamp: '2026-01-15T10:00:00Z',
          },
        ],
      });

      const serverMessages = [
        {
          id: 'server-uuid-123',
          type: 'user' as const,
          content: 'Hello',
          timestamp: '2026-01-15T10:00:00Z',
        },
      ];

      useMessageStore.getState().addMessages(serverMessages);

      // Both exist because IDs are different (no content-based dedup)
      expect(useMessageStore.getState().messages).toHaveLength(2);
    });
  });

  describe('reconcileOptimisticMessages (via fetchMessages)', () => {
    // TC-R1: Optimistic message is correctly replaced by server message
    it('should replace optimistic message with server message on fetchMessages', async () => {
      // Set up optimistic message in store
      useMessageStore.setState({
        messages: [
          {
            id: 'optimistic-abc123',
            type: 'user' as const,
            content: 'Hello world',
            timestamp: '2026-01-15T10:00:00Z',
            _optimistic: true,
          } as OptimisticHistoryMessage,
        ],
        currentSessionId: 'session-123',
        currentProjectSlug: 'my-project',
      });

      // Server returns the same content with a server-generated ID
      vi.mocked(sessionsApi.getMessages).mockResolvedValue({
        messages: [
          {
            id: 'server-uuid-456',
            type: 'user' as const,
            content: 'Hello world',
            timestamp: '2026-01-15T10:00:00.500Z',
          },
          {
            id: 'server-uuid-789',
            type: 'assistant' as const,
            content: 'Hello! How can I help?',
            timestamp: '2026-01-15T10:00:01Z',
          },
        ],
        pagination: mockPagination,
      });

      await useMessageStore.getState().fetchMessages('my-project', 'session-123', { silent: true });

      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('server-uuid-456');
      expect(messages[0].content).toBe('Hello world');
      expect(messages[1].id).toBe('server-uuid-789');
    });

    // TC-R2: Images are preserved during replacement
    it('should preserve images from optimistic message during reconciliation', async () => {
      const testImages = [{ mimeType: 'image/png', data: 'base64data', name: 'test.png' }];

      useMessageStore.setState({
        messages: [
          {
            id: 'optimistic-def456',
            type: 'user' as const,
            content: 'Check this image',
            timestamp: '2026-01-15T10:00:00Z',
            _optimistic: true,
            images: testImages,
          } as OptimisticHistoryMessage,
        ],
        currentSessionId: 'session-123',
        currentProjectSlug: 'my-project',
      });

      vi.mocked(sessionsApi.getMessages).mockResolvedValue({
        messages: [
          {
            id: 'server-uuid-img',
            type: 'user' as const,
            content: 'Check this image',
            timestamp: '2026-01-15T10:00:00.500Z',
            // Server doesn't have images
          },
        ],
        pagination: mockPagination,
      });

      await useMessageStore.getState().fetchMessages('my-project', 'session-123', { silent: true });

      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('server-uuid-img');
      expect(messages[0].images).toEqual(testImages);
    });

    // TC-R3: Unmatched optimistic messages are preserved (not yet on server)
    it('should keep unmatched optimistic messages at the end', async () => {
      useMessageStore.setState({
        messages: [
          {
            id: 'optimistic-first',
            type: 'user' as const,
            content: 'First message',
            timestamp: '2026-01-15T10:00:00Z',
            _optimistic: true,
          } as OptimisticHistoryMessage,
          {
            id: 'optimistic-second',
            type: 'user' as const,
            content: 'Second message',
            timestamp: '2026-01-15T10:00:01Z',
            _optimistic: true,
          } as OptimisticHistoryMessage,
        ],
        currentSessionId: 'session-123',
        currentProjectSlug: 'my-project',
      });

      // Server only has the first message so far
      vi.mocked(sessionsApi.getMessages).mockResolvedValue({
        messages: [
          {
            id: 'server-first',
            type: 'user' as const,
            content: 'First message',
            timestamp: '2026-01-15T10:00:00.500Z',
          },
        ],
        pagination: mockPagination,
      });

      await useMessageStore.getState().fetchMessages('my-project', 'session-123', { silent: true });

      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('server-first');
      expect(messages[1].id).toBe('optimistic-second'); // still pending
      expect((messages[1] as OptimisticHistoryMessage)._optimistic).toBe(true);
    });

    // TC-R4: Message order follows server-authoritative order
    it('should maintain server-authoritative message order', async () => {
      useMessageStore.setState({
        messages: [
          {
            id: 'optimistic-msg',
            type: 'user' as const,
            content: 'User question',
            timestamp: '2026-01-15T10:00:00Z',
            _optimistic: true,
          } as OptimisticHistoryMessage,
        ],
        currentSessionId: 'session-123',
        currentProjectSlug: 'my-project',
      });

      vi.mocked(sessionsApi.getMessages).mockResolvedValue({
        messages: [
          {
            id: 'server-user',
            type: 'user' as const,
            content: 'User question',
            timestamp: '2026-01-15T10:00:00.500Z',
          },
          {
            id: 'server-assistant',
            type: 'assistant' as const,
            content: 'Answer',
            timestamp: '2026-01-15T10:00:01Z',
          },
          {
            id: 'server-tool',
            type: 'tool_use' as const,
            content: '',
            timestamp: '2026-01-15T10:00:02Z',
            toolName: 'Read',
          },
        ],
        pagination: mockPagination,
      });

      await useMessageStore.getState().fetchMessages('my-project', 'session-123', { silent: true });

      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(3);
      expect(messages[0].id).toBe('server-user');
      expect(messages[1].id).toBe('server-assistant');
      expect(messages[2].id).toBe('server-tool');
    });

    // TC-R6: Duplicate content messages are matched 1:1 in order via shift()
    it('should match duplicate content optimistic messages to server messages 1:1 in order', async () => {
      useMessageStore.setState({
        messages: [
          {
            id: 'optimistic-hello-1',
            type: 'user' as const,
            content: 'Hello',
            timestamp: '2026-01-15T10:00:00Z',
            _optimistic: true,
          } as OptimisticHistoryMessage,
          {
            id: 'optimistic-hello-2',
            type: 'user' as const,
            content: 'Hello',
            timestamp: '2026-01-15T10:00:02Z',
            _optimistic: true,
          } as OptimisticHistoryMessage,
        ],
        currentSessionId: 'session-123',
        currentProjectSlug: 'my-project',
      });

      vi.mocked(sessionsApi.getMessages).mockResolvedValue({
        messages: [
          {
            id: 'server-hello-1',
            type: 'user' as const,
            content: 'Hello',
            timestamp: '2026-01-15T10:00:00.500Z',
          },
          {
            id: 'server-assistant-1',
            type: 'assistant' as const,
            content: 'Hi!',
            timestamp: '2026-01-15T10:00:01Z',
          },
          {
            id: 'server-hello-2',
            type: 'user' as const,
            content: 'Hello',
            timestamp: '2026-01-15T10:00:02.500Z',
          },
          {
            id: 'server-assistant-2',
            type: 'assistant' as const,
            content: 'Hi again!',
            timestamp: '2026-01-15T10:00:03Z',
          },
        ],
        pagination: mockPagination,
      });

      await useMessageStore.getState().fetchMessages('my-project', 'session-123', { silent: true });

      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(4);
      // First "Hello" matched to first server "Hello"
      expect(messages[0].id).toBe('server-hello-1');
      expect(messages[1].id).toBe('server-assistant-1');
      // Second "Hello" matched to second server "Hello"
      expect(messages[2].id).toBe('server-hello-2');
      expect(messages[3].id).toBe('server-assistant-2');
      // No optimistic messages remain
      expect(messages.every((m) => !(m as OptimisticHistoryMessage)._optimistic)).toBe(true);
    });

    // TC-R5: _optimistic flag is removed after replacement
    it('should not have _optimistic flag on reconciled messages', async () => {
      useMessageStore.setState({
        messages: [
          {
            id: 'optimistic-xyz',
            type: 'user' as const,
            content: 'Test message',
            timestamp: '2026-01-15T10:00:00Z',
            _optimistic: true,
          } as OptimisticHistoryMessage,
        ],
        currentSessionId: 'session-123',
        currentProjectSlug: 'my-project',
      });

      vi.mocked(sessionsApi.getMessages).mockResolvedValue({
        messages: [
          {
            id: 'server-xyz',
            type: 'user' as const,
            content: 'Test message',
            timestamp: '2026-01-15T10:00:00.500Z',
          },
        ],
        pagination: mockPagination,
      });

      await useMessageStore.getState().fetchMessages('my-project', 'session-123', { silent: true });

      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect((messages[0] as OptimisticHistoryMessage)._optimistic).toBeUndefined();
    });
  });

  describe('addOptimisticMessage - rapid fire prevention', () => {
    // TC-F1: Same content within 1 second is not added
    it('should prevent duplicate optimistic message within 1 second', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('uuid-1' as `${string}-${string}-${string}-${string}-${string}`).mockReturnValueOnce('uuid-2' as `${string}-${string}-${string}-${string}-${string}`);

      useMessageStore.getState().addOptimisticMessage('Hello');

      // Try to add same content immediately (within 1 second)
      vi.spyOn(Date, 'now').mockReturnValue(now + 500); // 500ms later
      useMessageStore.getState().addOptimisticMessage('Hello');

      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('optimistic-uuid-1');
    });

    // TC-F2: Same content after 1 second is added normally
    it('should allow same content after 1 second', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('uuid-1' as `${string}-${string}-${string}-${string}-${string}`).mockReturnValueOnce('uuid-2' as `${string}-${string}-${string}-${string}-${string}`);

      useMessageStore.getState().addOptimisticMessage('Hello');

      // Add same content after 1 second
      vi.spyOn(Date, 'now').mockReturnValue(now + 1001); // 1001ms later
      useMessageStore.getState().addOptimisticMessage('Hello');

      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(2);
    });

    // TC-F3: Different content can be sent in rapid succession
    it('should allow different content in rapid succession', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('uuid-1' as `${string}-${string}-${string}-${string}-${string}`).mockReturnValueOnce('uuid-2' as `${string}-${string}-${string}-${string}-${string}`);

      useMessageStore.getState().addOptimisticMessage('Hello');
      useMessageStore.getState().addOptimisticMessage('World');

      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].content).toBe('World');
    });
  });

  describe('addOptimisticMessage - basic', () => {
    it('should add optimistic message with _optimistic flag and UUID-based ID', () => {
      vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid' as `${string}-${string}-${string}-${string}-${string}`);

      useMessageStore.getState().addOptimisticMessage('Test message');

      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('optimistic-test-uuid');
      expect(messages[0].type).toBe('user');
      expect(messages[0].content).toBe('Test message');
      expect((messages[0] as OptimisticHistoryMessage)._optimistic).toBe(true);
    });

    it('should trim content in optimistic message', () => {
      vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid' as `${string}-${string}-${string}-${string}-${string}`);

      useMessageStore.getState().addOptimisticMessage('  Hello world  ');

      const messages = useMessageStore.getState().messages;
      expect(messages[0].content).toBe('Hello world');
    });

    it('should include images when provided', () => {
      vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid' as `${string}-${string}-${string}-${string}-${string}`);
      const images = [{ mimeType: 'image/png', data: 'base64', name: 'img.png' }];

      useMessageStore.getState().addOptimisticMessage('With image', images);

      const messages = useMessageStore.getState().messages;
      expect(messages[0].images).toEqual(images);
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
