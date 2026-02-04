/**
 * Chat Store Tests
 * [Source: Story 4.2 - Task 8.2, Story 4.5 - Task 10, Story 4.6, Story 4.8 - Task 4]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../chatStore';
import { useMessageStore } from '../messageStore';

// Mock socket
const mockEmit = vi.fn();
vi.mock('../../services/socket', () => ({
  getSocket: () => ({
    emit: mockEmit,
  }),
}));

// Mock sessions API for messageStore
vi.mock('../../services/api/sessions', () => ({
  sessionsApi: {
    getMessages: vi.fn(),
  },
}));

describe('useChatStore', () => {
  beforeEach(() => {
    // Reset store state
    useChatStore.setState({
      isStreaming: false,
      streamingSessionId: null,
      streamingMessageId: null,
      streamingSegments: [],
      streamingStartedAt: null,
    });
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

  describe('initial state', () => {
    it('has isStreaming set to false', () => {
      const { isStreaming } = useChatStore.getState();
      expect(isStreaming).toBe(false);
    });

    it('has streamingSegments set to empty array', () => {
      const { streamingSegments } = useChatStore.getState();
      expect(streamingSegments).toEqual([]);
    });

    it('has streamingSessionId set to null', () => {
      const { streamingSessionId } = useChatStore.getState();
      expect(streamingSessionId).toBeNull();
    });

    it('has streamingMessageId set to null', () => {
      const { streamingMessageId } = useChatStore.getState();
      expect(streamingMessageId).toBeNull();
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
        permissionMode: 'default',
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
        permissionMode: 'default',
      });
    });
  });

  describe('startStreaming', () => {
    it('initializes streaming state with sessionId and messageId', () => {
      const { startStreaming } = useChatStore.getState();

      startStreaming('session-123', 'msg-456');

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamingSessionId).toBe('session-123');
      expect(state.streamingMessageId).toBe('msg-456');
      expect(state.streamingSegments).toEqual([]);
      expect(state.streamingStartedAt).toBeInstanceOf(Date);
    });

    it('replaces existing streaming state when called again', () => {
      const { startStreaming } = useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      startStreaming('session-2', 'msg-2');

      const state = useChatStore.getState();
      expect(state.streamingSessionId).toBe('session-2');
      expect(state.streamingMessageId).toBe('msg-2');
    });
  });

  describe('appendStreamingContent', () => {
    it('creates a new text segment when no segments exist', () => {
      const { startStreaming, appendStreamingContent } = useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Hello ');

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({ type: 'text', content: 'Hello ' });
    });

    it('appends to existing text segment', () => {
      const { startStreaming, appendStreamingContent } = useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Hello ');
      appendStreamingContent('World!');

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({ type: 'text', content: 'Hello World!' });
    });

    it('creates new text segment after tool segment', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Before tool');
      addStreamingToolCall({ id: 'tool-1', name: 'Read' });
      appendStreamingContent('After tool');

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ type: 'text', content: 'Before tool' });
      expect(segments[1]).toEqual({
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Read' },
        status: 'pending',
      });
      expect(segments[2]).toEqual({ type: 'text', content: 'After tool' });
    });

    it('ignores empty string content', () => {
      const { startStreaming, appendStreamingContent } = useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('');

      expect(useChatStore.getState().streamingSegments).toHaveLength(0);
    });

    it('ignores empty string after existing text segment', () => {
      const { startStreaming, appendStreamingContent } = useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Hello');
      appendStreamingContent('');

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({ type: 'text', content: 'Hello' });
    });
  });

  describe('addStreamingToolCall', () => {
    it('adds tool segment with pending status', () => {
      const { startStreaming, addStreamingToolCall } = useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      addStreamingToolCall({ id: 'tool-1', name: 'Edit' });

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Edit' },
        status: 'pending',
      });
    });

    it('avoids duplicate tool segments', () => {
      const { startStreaming, addStreamingToolCall } = useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      addStreamingToolCall({ id: 'tool-1', name: 'Edit' });
      addStreamingToolCall({ id: 'tool-1', name: 'Edit' });

      expect(useChatStore.getState().streamingSegments).toHaveLength(1);
    });
  });

  describe('updateStreamingToolCall', () => {
    it('updates tool segment with result and completed status', () => {
      const { startStreaming, addStreamingToolCall, updateStreamingToolCall } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      addStreamingToolCall({ id: 'tool-1', name: 'Read' });
      updateStreamingToolCall('tool-1', 'file content here');

      const seg = useChatStore.getState().streamingSegments[0];
      expect(seg.type).toBe('tool');
      if (seg.type === 'tool') {
        expect(seg.status).toBe('completed');
        expect(seg.toolCall.output).toBe('file content here');
      }
    });

    it('updates tool segment with error status', () => {
      const { startStreaming, addStreamingToolCall, updateStreamingToolCall } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      addStreamingToolCall({ id: 'tool-1', name: 'Bash' });
      updateStreamingToolCall('tool-1', 'command failed', true);

      const seg = useChatStore.getState().streamingSegments[0];
      expect(seg.type).toBe('tool');
      if (seg.type === 'tool') {
        expect(seg.status).toBe('error');
        expect(seg.toolCall.output).toBe('command failed');
      }
    });

    it('ignores non-existent toolCallId', () => {
      const { startStreaming, addStreamingToolCall, updateStreamingToolCall } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      addStreamingToolCall({ id: 'tool-1', name: 'Read' });
      updateStreamingToolCall('nonexistent', 'result');

      const seg = useChatStore.getState().streamingSegments[0];
      if (seg.type === 'tool') {
        expect(seg.status).toBe('pending');
        expect(seg.toolCall.output).toBeUndefined();
      }
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
      expect(state.streamingSegments).toEqual([]);
      expect(state.streamingSessionId).toBeNull();
      expect(state.streamingMessageId).toBeNull();
    });

    it('does not add messages to messageStore (handled by fetchMessages)', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall, updateStreamingToolCall, completeStreaming } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Hello text');
      addStreamingToolCall({ id: 'tool-1', name: 'Read', input: { file_path: '/test.ts' } });
      updateStreamingToolCall('tool-1', 'file content');
      appendStreamingContent('After tool');
      completeStreaming();

      // completeStreaming only clears streaming state;
      // message persistence is handled by fetchMessages() in useStreaming
      expect(useMessageStore.getState().messages).toEqual([]);
    });

    it('does nothing when not streaming', () => {
      const { completeStreaming } = useChatStore.getState();

      completeStreaming();

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingSegments).toEqual([]);
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
      expect(state.streamingSegments).toEqual([]);
      expect(state.streamingSessionId).toBeNull();
    });

    it('works even when not streaming', () => {
      const { abortStreaming } = useChatStore.getState();

      abortStreaming();

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingSegments).toEqual([]);
    });
  });

  describe('permissionMode', () => {
    it('has initial permissionMode set to default', () => {
      const { permissionMode } = useChatStore.getState();
      expect(permissionMode).toBe('default');
    });

    it('updates permissionMode via setPermissionMode', () => {
      const { setPermissionMode } = useChatStore.getState();

      setPermissionMode('plan');
      expect(useChatStore.getState().permissionMode).toBe('plan');

      setPermissionMode('acceptEdits');
      expect(useChatStore.getState().permissionMode).toBe('acceptEdits');

      setPermissionMode('default');
      expect(useChatStore.getState().permissionMode).toBe('default');
    });

    it('includes permissionMode in sendMessage emit', () => {
      const { sendMessage } = useChatStore.getState();

      sendMessage('Hello', { workingDirectory: '/path' });

      expect(mockEmit).toHaveBeenCalledWith('chat:send', expect.objectContaining({
        permissionMode: 'default',
      }));
    });

    it('includes changed permissionMode in sendMessage emit', () => {
      const { setPermissionMode, sendMessage } = useChatStore.getState();

      setPermissionMode('plan');
      sendMessage('Hello', { workingDirectory: '/path' });

      expect(mockEmit).toHaveBeenCalledWith('chat:send', expect.objectContaining({
        permissionMode: 'plan',
      }));
    });
  });

  describe('segment combinations', () => {
    it('handles simple text streaming', () => {
      const { startStreaming, appendStreamingContent } = useChatStore.getState();

      startStreaming('s1', 'm1');
      appendStreamingContent('Hello ');
      appendStreamingContent('World');

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toEqual([{ type: 'text', content: 'Hello World' }]);
    });

    it('handles text → tool → text pattern', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall, updateStreamingToolCall } =
        useChatStore.getState();

      startStreaming('s1', 'm1');
      appendStreamingContent('Before');
      addStreamingToolCall({ id: 't1', name: 'Edit' });
      updateStreamingToolCall('t1', 'done');
      appendStreamingContent('After');

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ type: 'text', content: 'Before' });
      expect(segments[1].type).toBe('tool');
      expect(segments[2]).toEqual({ type: 'text', content: 'After' });
    });

    it('handles consecutive tool calls', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall } =
        useChatStore.getState();

      startStreaming('s1', 'm1');
      appendStreamingContent('Text');
      addStreamingToolCall({ id: 't1', name: 'Read' });
      addStreamingToolCall({ id: 't2', name: 'Write' });
      appendStreamingContent('End');

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toHaveLength(4);
      expect(segments[0].type).toBe('text');
      expect(segments[1].type).toBe('tool');
      expect(segments[2].type).toBe('tool');
      expect(segments[3].type).toBe('text');
    });

    it('handles tool-only response (no text before first tool)', () => {
      const { startStreaming, addStreamingToolCall } = useChatStore.getState();

      startStreaming('s1', 'm1');
      addStreamingToolCall({ id: 't1', name: 'Bash' });

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toHaveLength(1);
      expect(segments[0].type).toBe('tool');
    });

    it('handles abort during segmented streaming', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall, abortStreaming } =
        useChatStore.getState();

      startStreaming('s1', 'm1');
      appendStreamingContent('Text');
      addStreamingToolCall({ id: 't1', name: 'Read' });
      abortStreaming();

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingSegments).toEqual([]);
    });
  });
});
