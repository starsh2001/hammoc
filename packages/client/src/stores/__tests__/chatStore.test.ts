/**
 * Chat Store Tests
 * [Source: Story 4.2 - Task 8.2, Story 4.5 - Task 10, Story 4.6]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../chatStore';

// Mock socket
const mockEmit = vi.fn();
vi.mock('../../services/socket', () => ({
  getSocket: () => ({
    emit: mockEmit,
  }),
}));

describe('useChatStore', () => {
  beforeEach(() => {
    // Reset store state
    useChatStore.setState({
      isStreaming: false,
      streamingMessage: null,
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has isStreaming set to false', () => {
      const { isStreaming } = useChatStore.getState();
      expect(isStreaming).toBe(false);
    });

    it('has streamingMessage set to null', () => {
      const { streamingMessage } = useChatStore.getState();
      expect(streamingMessage).toBeNull();
    });
  });

  describe('setStreaming', () => {
    it('sets streaming to true', () => {
      const { setStreaming } = useChatStore.getState();

      setStreaming(true);

      expect(useChatStore.getState().isStreaming).toBe(true);
    });

    it('sets streaming to false', () => {
      useChatStore.setState({ isStreaming: true });
      const { setStreaming } = useChatStore.getState();

      setStreaming(false);

      expect(useChatStore.getState().isStreaming).toBe(false);
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      mockEmit.mockClear();
    });

    it('emits chat:send event via WebSocket', () => {
      const { sendMessage } = useChatStore.getState();

      sendMessage('Hello Claude', {
        workingDirectory: '/path/to/project',
      });

      expect(mockEmit).toHaveBeenCalledWith('chat:send', {
        content: 'Hello Claude',
        workingDirectory: '/path/to/project',
        sessionId: undefined,
        resume: undefined,
      });
    });

    it('includes sessionId and resume when provided', () => {
      const { sendMessage } = useChatStore.getState();

      sendMessage('Hello', {
        workingDirectory: '/path/to/project',
        sessionId: 'session-123',
        resume: true,
      });

      expect(mockEmit).toHaveBeenCalledWith('chat:send', {
        content: 'Hello',
        workingDirectory: '/path/to/project',
        sessionId: 'session-123',
        resume: true,
      });
    });
  });

  describe('startStreaming', () => {
    it('initializes streaming state with sessionId and messageId', () => {
      const { startStreaming } = useChatStore.getState();

      startStreaming('session-123', 'msg-456');

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamingMessage).toEqual({
        sessionId: 'session-123',
        messageId: 'msg-456',
        content: '',
        startedAt: expect.any(Date),
      });
    });

    it('replaces existing streaming state when called again', () => {
      const { startStreaming } = useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      startStreaming('session-2', 'msg-2');

      const state = useChatStore.getState();
      expect(state.streamingMessage?.sessionId).toBe('session-2');
      expect(state.streamingMessage?.messageId).toBe('msg-2');
    });
  });

  describe('appendStreamingContent', () => {
    it('appends content to streaming message', () => {
      const { startStreaming, appendStreamingContent } = useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Hello ');
      appendStreamingContent('World!');

      expect(useChatStore.getState().streamingMessage?.content).toBe('Hello World!');
    });

    it('does nothing when not streaming', () => {
      const { appendStreamingContent } = useChatStore.getState();

      appendStreamingContent('Hello');

      expect(useChatStore.getState().streamingMessage).toBeNull();
    });

    it('warns when content exceeds max length', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { startStreaming, appendStreamingContent } = useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      // Append content just under the limit
      appendStreamingContent('a'.repeat(99999));
      expect(consoleSpy).not.toHaveBeenCalled();

      // Append content that exceeds the limit
      appendStreamingContent('bb');
      expect(consoleSpy).toHaveBeenCalledWith(
        '[chatStore] Large streaming response detected:',
        100001
      );

      consoleSpy.mockRestore();
    });
  });

  describe('completeStreaming', () => {
    it('clears streaming state', () => {
      const { startStreaming, appendStreamingContent, completeStreaming } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Hello');
      completeStreaming();

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingMessage).toBeNull();
    });

    it('does nothing when not streaming', () => {
      const { completeStreaming } = useChatStore.getState();

      completeStreaming();

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingMessage).toBeNull();
    });
  });

  describe('abortStreaming', () => {
    it('clears streaming state on abort', () => {
      const { startStreaming, appendStreamingContent, abortStreaming } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('partial content');
      abortStreaming();

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingMessage).toBeNull();
    });

    it('works even when not streaming', () => {
      const { abortStreaming } = useChatStore.getState();

      abortStreaming();

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingMessage).toBeNull();
    });
  });
});
