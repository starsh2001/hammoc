/**
 * useStreaming Hook Tests
 * [Source: Story 4.5 - Task 11, Story 4.8 - Task 4]
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
      streamingSessionId: null,
      streamingMessageId: null,
      streamingSegments: [],
      streamingStartedAt: null,
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
      expect(state.streamingSegments).toHaveLength(1);
      expect(state.streamingSegments[0]).toEqual({ type: 'text', content: 'Hello' });
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

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({ type: 'text', content: 'Hello World!' });
    });
  });

  describe('message:complete event', () => {
    it('completes streaming on complete event', async () => {
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

      // Wait for async handleComplete (fetchMessages + completeStreaming)
      await vi.waitFor(() => {
        expect(useChatStore.getState().isStreaming).toBe(false);
      });
      expect(useChatStore.getState().streamingSegments).toEqual([]);
    });
  });

  describe('tool:call event', () => {
    it('adds tool segment on tool:call', () => {
      renderHook(() => useStreaming());

      // Start streaming with some text
      mockSocket.trigger('message:chunk', {
        sessionId: 'session-1',
        messageId: 'msg-1',
        content: 'Let me check that file.',
        done: false,
      });

      // Tool call event
      mockSocket.trigger('tool:call', {
        id: 'tool-1',
        name: 'Read',
        input: { file_path: '/test.ts' },
      });

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({ type: 'text', content: 'Let me check that file.' });
      expect(segments[1]).toEqual({
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Read', input: { file_path: '/test.ts' } },
        status: 'pending',
      });
    });
  });

  describe('tool:result event', () => {
    it('updates tool segment status on tool:result', () => {
      renderHook(() => useStreaming());

      // Start streaming
      mockSocket.trigger('message:chunk', {
        sessionId: 'session-1',
        messageId: 'msg-1',
        content: 'Text',
        done: false,
      });

      // Tool call
      mockSocket.trigger('tool:call', {
        id: 'tool-1',
        name: 'Read',
      });

      // Tool result
      mockSocket.trigger('tool:result', {
        toolCallId: 'tool-1',
        output: 'file content',
      });

      const segments = useChatStore.getState().streamingSegments;
      const toolSeg = segments[1];
      expect(toolSeg.type).toBe('tool');
      if (toolSeg.type === 'tool') {
        expect(toolSeg.status).toBe('completed');
        expect(toolSeg.toolCall.output).toBe('file content');
      }
    });
  });

  describe('connection events', () => {
    it('aborts streaming on reconnect failure', () => {
      renderHook(() => useStreaming());

      // Start streaming
      useChatStore.setState({
        isStreaming: true,
        streamingSessionId: 'session-1',
        streamingMessageId: 'msg-1',
        streamingSegments: [{ type: 'text', content: 'partial' }],
        streamingStartedAt: new Date(),
      });

      // Simulate reconnect failure
      mockSocket.simulateReconnectFailed();

      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamingSegments).toEqual([]);
    });
  });

  describe('keyboard shortcuts', () => {
    it('aborts streaming via abortResponse when Escape is pressed during streaming', () => {
      renderHook(() => useStreaming());

      // Start streaming with text content
      useChatStore.setState({
        isStreaming: true,
        streamingSessionId: 'session-1',
        streamingMessageId: 'msg-1',
        streamingSegments: [{ type: 'text', content: 'Hello' }],
        streamingStartedAt: new Date(),
      });

      // Simulate Escape key press
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);

      // abortResponse: streaming stopped, segments cleared
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamingSegments).toEqual([]);

      // abortResponse preserves text with abort marker in messageStore
      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toContain('Hello');
      expect(messages[0].content).toContain('[중단됨]');
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

    it('aborts streaming via Ctrl+C when no text is selected', () => {
      renderHook(() => useStreaming());

      // Start streaming
      useChatStore.setState({
        isStreaming: true,
        streamingSessionId: 'session-1',
        streamingMessageId: 'msg-1',
        streamingSegments: [{ type: 'text', content: 'Partial response' }],
        streamingStartedAt: new Date(),
      });

      // Mock window.getSelection to return collapsed (no text selected)
      const mockSelection = { isCollapsed: true } as Selection;
      vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection);

      // Simulate Ctrl+C
      const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true });
      document.dispatchEvent(event);

      // abortResponse should be called
      expect(useChatStore.getState().isStreaming).toBe(false);
      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toContain('Partial response');
      expect(messages[0].content).toContain('[중단됨]');

      vi.restoreAllMocks();
    });

    it('does not abort on Ctrl+C when text is selected (allows copy)', () => {
      renderHook(() => useStreaming());

      // Start streaming
      useChatStore.setState({
        isStreaming: true,
        streamingSessionId: 'session-1',
        streamingMessageId: 'msg-1',
        streamingSegments: [{ type: 'text', content: 'Some content' }],
        streamingStartedAt: new Date(),
      });

      // Mock window.getSelection to return non-collapsed (text is selected)
      const mockSelection = { isCollapsed: false } as Selection;
      vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection);

      // Simulate Ctrl+C
      const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true });
      document.dispatchEvent(event);

      // Streaming should NOT be aborted — copy behavior preserved
      expect(useChatStore.getState().isStreaming).toBe(true);
      expect(useMessageStore.getState().messages).toHaveLength(0);

      vi.restoreAllMocks();
    });

    it('does not abort on Ctrl+C when not streaming', () => {
      renderHook(() => useStreaming());

      // Not streaming
      expect(useChatStore.getState().isStreaming).toBe(false);

      // Mock no selection
      vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: true } as Selection);

      // Simulate Ctrl+C
      const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true });
      document.dispatchEvent(event);

      // Should remain not streaming
      expect(useChatStore.getState().isStreaming).toBe(false);

      vi.restoreAllMocks();
    });
  });

  describe('context:usage event', () => {
    it('updates chatStore contextUsage on context:usage event', () => {
      renderHook(() => useStreaming());

      const mockUsage = {
        inputTokens: 150000,
        outputTokens: 500,
        cacheReadInputTokens: 80000,
        cacheCreationInputTokens: 5000,
        totalCostUSD: 0.05,
        contextWindow: 200000,
      };

      mockSocket.trigger('context:usage', mockUsage);

      expect(useChatStore.getState().contextUsage).toEqual(mockUsage);
    });

    it('registers and cleans up context:usage listener', () => {
      const { unmount } = renderHook(() => useStreaming());

      expect(mockSocket.on).toHaveBeenCalledWith('context:usage', expect.any(Function));

      unmount();

      expect(mockSocket.off).toHaveBeenCalledWith('context:usage', expect.any(Function));
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
