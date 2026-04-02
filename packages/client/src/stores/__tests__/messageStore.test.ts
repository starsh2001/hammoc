/**
 * Message Store Tests
 * [Source: Story 3.5 - Task 5]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HistoryMessage } from '@hammoc/shared';
import { useMessageStore } from '../messageStore';

/** Test helper type matching the client-local optimistic extension */
type OptimisticHistoryMessage = HistoryMessage & { _optimistic?: boolean };

describe('useMessageStore', () => {
  beforeEach(() => {
    // Reset store state
    useMessageStore.setState({
      messages: [],
      currentProjectSlug: null,
      currentSessionId: null,
      isLoading: false,
      error: null,
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

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useMessageStore.getState();
      expect(state.messages).toEqual([]);
      expect(state.currentProjectSlug).toBeNull();
      expect(state.currentSessionId).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
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
      });

      useMessageStore.getState().clearMessages();

      expect(useMessageStore.getState().messages).toEqual([]);
      expect(useMessageStore.getState().currentProjectSlug).toBeNull();
      expect(useMessageStore.getState().currentSessionId).toBeNull();
      expect(useMessageStore.getState().error).toBeNull();
    });
  });
});
