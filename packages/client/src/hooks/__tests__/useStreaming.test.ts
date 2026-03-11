/**
 * useStreaming Hook Tests
 * [Source: Story 4.5 - Task 11, Story 4.8 - Task 4]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

    // Mock requestAnimationFrame for frame-based chunk coalescing.
    // Use queueMicrotask to schedule the callback asynchronously but before
    // the next macrotask, avoiding the return-value race with frameRequestId.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queueMicrotask(() => cb(0));
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    // Reset store states
    useChatStore.setState({
      isStreaming: false,
      streamingSessionId: null,
      streamingMessageId: null,
      streamingSegments: [],
      streamingStartedAt: null,
      segmentsPendingClear: false,
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('message:chunk event', () => {
    it('starts streaming on first chunk', async () => {
      renderHook(() => useStreaming());

      // Simulate first chunk
      mockSocket.trigger('message:chunk', {
        sessionId: 'session-1',
        messageId: 'msg-1',
        content: 'Hello',
        done: false,
      });
      // Drain microtask queue to flush frame buffer
      await act(async () => {});

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamingSegments).toHaveLength(1);
      expect(state.streamingSegments[0]).toEqual({ type: 'text', content: 'Hello' });
    });

    it('appends content on subsequent chunks', async () => {
      renderHook(() => useStreaming());

      // Simulate multiple chunks
      mockSocket.trigger('message:chunk', {
        sessionId: 'session-1',
        messageId: 'msg-1',
        content: 'Hello ',
        done: false,
      });
      // Drain microtask queue to flush frame buffer
      await act(async () => {});

      mockSocket.trigger('message:chunk', {
        sessionId: 'session-1',
        messageId: 'msg-1',
        content: 'World!',
        done: false,
      });
      await act(async () => {});

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
      await act(async () => {});

      expect(useChatStore.getState().isStreaming).toBe(true);

      // Complete streaming
      mockSocket.trigger('message:complete', {
        id: 'msg-1',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'Hello World!',
        timestamp: new Date(),
      });

      // Wait for async handleComplete (completeStreaming sets isStreaming=false)
      await vi.waitFor(() => {
        expect(useChatStore.getState().isStreaming).toBe(false);
      });
      // Segments are converted to messages and cleared immediately
      expect(useChatStore.getState().segmentsPendingClear).toBe(false);
    });
  });

  describe('tool:call event', () => {
    it('adds tool segment on tool:call', async () => {
      renderHook(() => useStreaming());

      // Start streaming with some text
      mockSocket.trigger('message:chunk', {
        sessionId: 'session-1',
        messageId: 'msg-1',
        content: 'Let me check that file.',
        done: false,
      });
      await act(async () => {});

      // Tool call event
      mockSocket.trigger('tool:call', {
        id: 'tool-1',
        name: 'Read',
        input: { file_path: '/test.ts' },
      });

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({ type: 'text', content: 'Let me check that file.' });
      expect(segments[1]).toMatchObject({
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Read', input: { file_path: '/test.ts' } },
        status: 'pending',
      });
    });
  });

  describe('tool:result event', () => {
    it('updates tool segment status on tool:result', async () => {
      renderHook(() => useStreaming());

      // Start streaming
      mockSocket.trigger('message:chunk', {
        sessionId: 'session-1',
        messageId: 'msg-1',
        content: 'Text',
        done: false,
      });
      await act(async () => {});

      // Tool call
      mockSocket.trigger('tool:call', {
        id: 'tool-1',
        name: 'Read',
      });

      // Tool result (server sends { toolCallId, result: { success, output, error } })
      mockSocket.trigger('tool:result', {
        toolCallId: 'tool-1',
        result: { success: true, output: 'file content' },
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

      // abortResponse: streaming stopped, segments converted to messages and cleared
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamingSegments).toHaveLength(0);

      // Partial content converted to message by abortResponse
      expect(useMessageStore.getState().messages).toHaveLength(1);
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

      // abortResponse: streaming stopped, segments converted to messages and cleared
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamingSegments).toHaveLength(0);
      // Partial content converted to message by abortResponse
      expect(useMessageStore.getState().messages).toHaveLength(1);

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

  describe('handleUserMessage — reconnection buffer replay (Story 18.3)', () => {
    it('TC-R1: prevents duplicate when buffer replay has trailing whitespace', () => {
      useMessageStore.setState({
        messages: [
          { id: 'msg-1', type: 'user', content: 'hello world', timestamp: new Date().toISOString() },
        ] as ReturnType<typeof useMessageStore.getState>['messages'],
        currentProjectSlug: 'test-project',
        currentSessionId: 'test-session',
      });

      renderHook(() => useStreaming());

      // Buffer replay sends content with trailing whitespace
      mockSocket.trigger('user:message', { content: 'hello world  ', sessionId: 'test-session' });

      // Should NOT add duplicate — trimmed comparison matches
      expect(useMessageStore.getState().messages).toHaveLength(1);
    });

    it('TC-R2: adds optimistic message when content does not match last user message', () => {
      useMessageStore.setState({
        messages: [
          { id: 'msg-1', type: 'user', content: 'first message', timestamp: new Date().toISOString() },
        ] as ReturnType<typeof useMessageStore.getState>['messages'],
        currentProjectSlug: 'test-project',
        currentSessionId: 'test-session',
      });

      renderHook(() => useStreaming());

      mockSocket.trigger('user:message', { content: 'different message', sessionId: 'test-session' });

      // Should add new message
      expect(useMessageStore.getState().messages).toHaveLength(2);
    });

    it('TC-R10: multiple buffer replay calls preserve message order', () => {
      useMessageStore.setState({
        messages: [
          { id: 'msg-1', type: 'user', content: 'first', timestamp: new Date().toISOString() },
          { id: 'msg-2', type: 'assistant', content: 'response 1', timestamp: new Date().toISOString() },
        ] as ReturnType<typeof useMessageStore.getState>['messages'],
        currentProjectSlug: 'test-project',
        currentSessionId: 'test-session',
      });

      renderHook(() => useStreaming());

      // Buffer replays a new user message (not matching last user msg)
      mockSocket.trigger('user:message', { content: 'second', sessionId: 'test-session' });

      const msgs = useMessageStore.getState().messages;
      expect(msgs).toHaveLength(3);
      // Original messages remain in order, new message appended at end
      expect(msgs[0].content).toBe('first');
      expect(msgs[1].content).toBe('response 1');
      expect(msgs[2].content).toBe('second');
    });
  });

  describe('handleStreamStatus — inactive handling (Story 18.3)', () => {
    it('TC-R3: calls completeStreaming when stream:status active=false and isStreaming=true', () => {
      useChatStore.setState({
        isStreaming: true,
        streamingSessionId: 'session-1',
        streamingMessageId: 'msg-1',
        streamingSegments: [{ type: 'text', content: 'partial' }],
        streamingStartedAt: new Date(),
      });
      useMessageStore.setState({
        messages: [],
        currentProjectSlug: 'test-project',
        currentSessionId: 'session-1',
      });

      renderHook(() => useStreaming());

      mockSocket.trigger('stream:status', { active: false, sessionId: 'session-1' });

      // completeStreaming: converts segments to messages, sets isStreaming: false
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().segmentsPendingClear).toBe(false);
    });

    it('TC-R4: calls fetchMessages in silent mode when stream:status active=false and no segments', async () => {
      const fetchMessagesSpy = vi.fn().mockResolvedValue(undefined);
      useChatStore.setState({
        isStreaming: true,
        streamingSessionId: 'session-1',
        streamingMessageId: 'msg-1',
        // No segments (stream completed entirely during disconnect)
        streamingSegments: [],
        streamingStartedAt: new Date(),
      });
      useMessageStore.setState({
        messages: [],
        currentProjectSlug: 'test-project',
        currentSessionId: 'session-1',
        fetchMessages: fetchMessagesSpy,
      } as unknown as ReturnType<typeof useMessageStore.getState>);

      renderHook(() => useStreaming());

      mockSocket.trigger('stream:status', { active: false, sessionId: 'session-1' });

      // fetchMessages should be called with silent: true when hadSegments=false
      await vi.waitFor(() => {
        expect(fetchMessagesSpy).toHaveBeenCalledWith('test-project', 'session-1', { silent: true, minMessageCount: 0 });
      });
    });

    it('TC-R5: does nothing when stream:status active=false and isStreaming=false', () => {
      useChatStore.setState({
        isStreaming: false,
        streamingSessionId: null,
        streamingSegments: [],
      });

      renderHook(() => useStreaming());

      mockSocket.trigger('stream:status', { active: false, sessionId: 'session-1' });

      // No state change
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().segmentsPendingClear).toBeFalsy();
    });
  });

  describe('reconnection timeout (Story 18.3)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('TC-R6: triggers completeStreaming after 10s timeout when no stream:status received', () => {
      useChatStore.setState({
        isStreaming: true,
        streamingSessionId: 'session-1',
        streamingMessageId: 'msg-1',
        streamingSegments: [{ type: 'text', content: 'partial' }],
        streamingStartedAt: new Date(),
      });
      useMessageStore.setState({
        messages: [],
        currentProjectSlug: 'test-project',
        currentSessionId: 'session-1',
      });

      renderHook(() => useStreaming());

      // Simulate reconnection
      mockSocket.trigger('connect');

      // Verify session:join was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith('session:join', 'session-1');

      // Before timeout: still streaming
      expect(useChatStore.getState().isStreaming).toBe(true);

      // Advance time by 10 seconds
      vi.advanceTimersByTime(10000);

      // After timeout: streaming should be completed
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().segmentsPendingClear).toBe(false);
    });

    it('TC-R7: cancels timeout when stream:status is received', () => {
      useChatStore.setState({
        isStreaming: true,
        streamingSessionId: 'session-1',
        streamingMessageId: 'msg-1',
        streamingSegments: [{ type: 'text', content: 'partial' }],
        streamingStartedAt: new Date(),
      });
      useMessageStore.setState({
        messages: [
          { id: 'msg-1', type: 'user', content: 'hello', timestamp: new Date().toISOString() },
        ] as ReturnType<typeof useMessageStore.getState>['messages'],
        currentProjectSlug: 'test-project',
        currentSessionId: 'session-1',
      });

      renderHook(() => useStreaming());

      // Simulate reconnection
      mockSocket.trigger('connect');

      // Receive stream:status before timeout
      mockSocket.trigger('stream:status', { active: true, sessionId: 'session-1' });

      // Advance time past the timeout threshold
      vi.advanceTimersByTime(10000);

      // Should still be streaming (restored by active: true, not timed out)
      expect(useChatStore.getState().isStreaming).toBe(true);
    });
  });
});
