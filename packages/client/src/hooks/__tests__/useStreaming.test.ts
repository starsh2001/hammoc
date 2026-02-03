/**
 * useStreaming Hook Tests
 * [Source: Story 4.5 - Task 11]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStreaming } from '../useStreaming';
import { useChatStore } from '../../stores/chatStore';
import { useMessageStore } from '../../stores/messageStore';
import { createMockSocket } from '../../test-utils/mockSocket';
import * as socketModule from '../../services/socket';

// Mock the socket module
vi.mock('../../services/socket', () => ({
  getSocket: vi.fn(),
}));

describe('useStreaming', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;

  beforeEach(() => {
    // Create a fresh mock socket for each test
    mockSocket = createMockSocket();
    vi.mocked(socketModule.getSocket).mockReturnValue(mockSocket as unknown as ReturnType<typeof socketModule.getSocket>);

    // Reset store states
    useChatStore.setState({
      isStreaming: false,
      streamingMessage: null,
    });
    useMessageStore.setState({
      messages: [],
      currentProjectSlug: 'test-project',
      currentSessionId: 'test-session',
      isLoading: false,
      isLoadingMore: false,
      error: null,
      pagination: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('message:chunk event', () => {
    it('starts streaming on first chunk', () => {
      renderHook(() => useStreaming());

      // Simulate first chunk
      mockSocket.trigger('message:chunk', {
        sessionId: 'session-1',
        messageId: 'msg-1',
        content: 'Hello',
        done: false,
      });

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamingMessage?.content).toBe('Hello');
    });

    it('appends content on subsequent chunks', () => {
      renderHook(() => useStreaming());

      // Simulate multiple chunks
      mockSocket.trigger('message:chunk', {
        sessionId: 'session-1',
        messageId: 'msg-1',
        content: 'Hello ',
        done: false,
      });
      mockSocket.trigger('message:chunk', {
        sessionId: 'session-1',
        messageId: 'msg-1',
        content: 'World!',
        done: false,
      });

      expect(useChatStore.getState().streamingMessage?.content).toBe('Hello World!');
    });
  });

  describe('message:complete event', () => {
    it('completes streaming on complete event', () => {
      renderHook(() => useStreaming());

      // Start streaming
      mockSocket.trigger('message:chunk', {
        sessionId: 'session-1',
        messageId: 'msg-1',
        content: 'Hello',
        done: false,
      });

      expect(useChatStore.getState().isStreaming).toBe(true);

      // Complete streaming
      mockSocket.trigger('message:complete', {
        id: 'msg-1',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'Hello World!',
        timestamp: new Date(),
      });

      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamingMessage).toBeNull();
    });
  });

  describe('connection events', () => {
    it('logs warning on disconnect during streaming', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      renderHook(() => useStreaming());

      // Start streaming
      useChatStore.setState({
        isStreaming: true,
        streamingMessage: {
          sessionId: 'session-1',
          messageId: 'msg-1',
          content: 'partial',
          startedAt: new Date(),
        },
      });

      // Simulate disconnect
      mockSocket.simulateDisconnect();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[useStreaming] Connection lost during streaming, waiting for reconnect...'
      );
      consoleSpy.mockRestore();
    });

    it('aborts streaming on reconnect failure', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      renderHook(() => useStreaming());

      // Start streaming
      useChatStore.setState({
        isStreaming: true,
        streamingMessage: {
          sessionId: 'session-1',
          messageId: 'msg-1',
          content: 'partial',
          startedAt: new Date(),
        },
      });

      // Simulate reconnect failure
      mockSocket.simulateReconnectFailed();

      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamingMessage).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('keyboard shortcuts', () => {
    it('aborts streaming when Escape is pressed during streaming', () => {
      renderHook(() => useStreaming());

      // Start streaming
      useChatStore.setState({
        isStreaming: true,
        streamingMessage: {
          sessionId: 'session-1',
          messageId: 'msg-1',
          content: 'Hello',
          startedAt: new Date(),
        },
      });

      // Simulate Escape key press
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);

      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamingMessage).toBeNull();
    });

    it('does not abort when Escape is pressed while not streaming', () => {
      renderHook(() => useStreaming());

      // Ensure not streaming
      expect(useChatStore.getState().isStreaming).toBe(false);

      // Simulate Escape key press
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);

      // State should remain unchanged
      expect(useChatStore.getState().isStreaming).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('removes event listeners on unmount', () => {
      const { unmount } = renderHook(() => useStreaming());

      // Verify listeners were registered
      expect(mockSocket.on).toHaveBeenCalledWith('message:chunk', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('message:complete', expect.any(Function));

      unmount();

      // Verify listeners were removed
      expect(mockSocket.off).toHaveBeenCalledWith('message:chunk', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('message:complete', expect.any(Function));
    });
  });
});
