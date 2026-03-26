/**
 * Chat Store Tests
 * [Source: Story 4.2 - Task 8.2, Story 4.5 - Task 10, Story 4.6, Story 4.8 - Task 4]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../chatStore';
import { useMessageStore } from '../messageStore';
import { usePreferencesStore } from '../preferencesStore';

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

    it('includes images field when attachments are provided', () => {
      const { sendMessage } = useChatStore.getState();

      const attachments = [
        {
          id: 'att-1',
          type: 'image' as const,
          name: 'screenshot.png',
          size: 1024,
          mimeType: 'image/png',
          data: 'iVBORw0KGgo=',
        },
        {
          id: 'att-2',
          type: 'image' as const,
          name: 'photo.jpg',
          size: 2048,
          mimeType: 'image/jpeg',
          data: '/9j/4AAQSkZJRg==',
        },
      ];

      sendMessage('Check these images', {
        workingDirectory: '/path/to/project',
        attachments,
      });

      expect(mockEmit).toHaveBeenCalledWith('chat:send', {
        content: 'Check these images',
        workingDirectory: '/path/to/project',
        sessionId: undefined,
        resume: undefined,
        permissionMode: 'default',
        images: [
          { mimeType: 'image/png', data: 'iVBORw0KGgo=', name: 'screenshot.png' },
          { mimeType: 'image/jpeg', data: '/9j/4AAQSkZJRg==', name: 'photo.jpg' },
        ],
      });
    });

    it('omits images field when no attachments are provided', () => {
      const { sendMessage } = useChatStore.getState();

      sendMessage('Hello', {
        workingDirectory: '/path/to/project',
      });

      const emittedPayload = mockEmit.mock.calls[0][1];
      expect(emittedPayload.images).toBeUndefined();
    });

    it('includes resumeSessionAt and rewindToMessageUuid when provided', () => {
      const { sendMessage } = useChatStore.getState();

      sendMessage('Edited message', {
        workingDirectory: '/path/to/project',
        sessionId: 'session-123',
        resume: true,
        resumeSessionAt: 'assistant-uuid-abc',
        rewindToMessageUuid: 'user-uuid-def',
      });

      expect(mockEmit).toHaveBeenCalledWith('chat:send', expect.objectContaining({
        content: 'Edited message',
        resumeSessionAt: 'assistant-uuid-abc',
        rewindToMessageUuid: 'user-uuid-def',
        resume: true,
      }));
    });

    it('omits resumeSessionAt and rewindToMessageUuid when not provided', () => {
      const { sendMessage } = useChatStore.getState();

      sendMessage('Normal message', {
        workingDirectory: '/path/to/project',
      });

      const emittedPayload = mockEmit.mock.calls[0][1];
      expect(emittedPayload.resumeSessionAt).toBeUndefined();
      expect(emittedPayload.rewindToMessageUuid).toBeUndefined();
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
      expect(segments[1]).toMatchObject({
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
    it('adds tool segment with pending status and startedAt', () => {
      const { startStreaming, addStreamingToolCall } = useChatStore.getState();

      const before = Date.now();
      startStreaming('session-1', 'msg-1');
      addStreamingToolCall({ id: 'tool-1', name: 'Edit' });
      const after = Date.now();

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toHaveLength(1);
      expect(segments[0].type).toBe('tool');
      if (segments[0].type === 'tool') {
        expect(segments[0].toolCall.id).toBe('tool-1');
        expect(segments[0].toolCall.name).toBe('Edit');
        expect(segments[0].toolCall.startedAt).toBeGreaterThanOrEqual(before);
        expect(segments[0].toolCall.startedAt).toBeLessThanOrEqual(after);
        expect(segments[0].status).toBe('pending');
      }
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
    it('updates tool segment with result, completed status, and duration', () => {
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
        // duration should be calculated (startedAt was set by addStreamingToolCall)
        expect(seg.toolCall.duration).toBeDefined();
        expect(seg.toolCall.duration).toBeGreaterThanOrEqual(0);
      }
    });

    it('updates tool segment with error status and duration', () => {
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
        expect(seg.toolCall.duration).toBeDefined();
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
        expect(seg.toolCall.duration).toBeUndefined();
      }
    });

    it('does not set duration when startedAt is missing', () => {
      const { startStreaming } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');

      // Manually add a tool segment without startedAt
      useChatStore.setState({
        streamingSegments: [
          { type: 'tool', toolCall: { id: 'tool-no-start', name: 'Read' }, status: 'pending' },
        ],
      });

      useChatStore.getState().updateStreamingToolCall('tool-no-start', 'result');

      const seg = useChatStore.getState().streamingSegments[0];
      if (seg.type === 'tool') {
        expect(seg.status).toBe('completed');
        expect(seg.toolCall.duration).toBeUndefined();
      }
    });
  });

  describe('completeStreaming', () => {
    it('freezes segments with segmentsPendingClear on completion', () => {
      const { startStreaming, appendStreamingContent, completeStreaming } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Hello');
      completeStreaming();

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      // Segments are kept for display while server fetch loads history
      expect(state.streamingSegments).toHaveLength(1);
      expect(state.segmentsPendingClear).toBe(true);
      expect(state.streamingSessionId).toBeNull();
      expect(state.streamingMessageId).toBeNull();
    });

    it('does not convert segments to messages (server fetch handles that)', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall, updateStreamingToolCall, completeStreaming } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Hello text');
      addStreamingToolCall({ id: 'tool-1', name: 'Read', input: { file_path: '/test.ts' } });
      updateStreamingToolCall('tool-1', 'file content');
      appendStreamingContent('After tool');
      completeStreaming();

      // No client-side conversion — server API provides history
      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(0);
      expect(useChatStore.getState().segmentsPendingClear).toBe(true);
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

  describe('abortResponse', () => {
    it('emits chat:abort via socket', () => {
      const { startStreaming, appendStreamingContent, abortResponse } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Hello');
      abortResponse();

      expect(mockEmit).toHaveBeenCalledWith('chat:abort');
    });

    it('aborts streaming and clears flags', () => {
      const { startStreaming, appendStreamingContent, abortResponse } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Partial response text');
      abortResponse();

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingSessionId).toBeNull();
      expect(state.streamingMessageId).toBeNull();
      expect(state.streamingStartedAt).toBeNull();
    });

    it('is no-op when not streaming', () => {
      const { abortResponse } = useChatStore.getState();

      abortResponse();

      expect(mockEmit).not.toHaveBeenCalled();
      expect(useMessageStore.getState().messages).toEqual([]);
    });

    it('emits chat:abort on abort', () => {
      const { startStreaming, addStreamingToolCall, abortResponse } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      addStreamingToolCall({ id: 'tool-1', name: 'Read' });
      abortResponse();

      expect(mockEmit).toHaveBeenCalledWith('chat:abort');
      expect(useChatStore.getState().isStreaming).toBe(false);
    });

    it('clears chain items on abort', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall, abortResponse } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('First part');
      addStreamingToolCall({ id: 'tool-1', name: 'Read' });
      appendStreamingContent('Second part');
      abortResponse();

      expect(useChatStore.getState().isStreaming).toBe(false);
    });
  });

  describe('contextUsage', () => {
    it('has initial contextUsage set to null', () => {
      const { contextUsage } = useChatStore.getState();
      expect(contextUsage).toBeNull();
    });

    it('updates contextUsage via setContextUsage', () => {
      const { setContextUsage } = useChatStore.getState();
      const mockUsage = {
        inputTokens: 150000,
        outputTokens: 500,
        cacheReadInputTokens: 80000,
        cacheCreationInputTokens: 5000,
        totalCostUSD: 0.05,
        contextWindow: 200000,
      };

      setContextUsage(mockUsage);

      expect(useChatStore.getState().contextUsage).toEqual(mockUsage);
    });

    it('resets contextUsage to null via resetContextUsage', () => {
      const { setContextUsage, resetContextUsage } = useChatStore.getState();
      setContextUsage({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 30,
        cacheCreationInputTokens: 20,
        totalCostUSD: 0.001,
        contextWindow: 200000,
      });

      resetContextUsage();

      expect(useChatStore.getState().contextUsage).toBeNull();
    });
  });

  describe('segmentsPendingClear lifecycle (Story 18.2)', () => {
    it('TC-L1: completeStreaming freezes segments with segmentsPendingClear=true', () => {
      const { startStreaming, appendStreamingContent, completeStreaming } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Hello');
      completeStreaming();

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      // Segments are frozen for display while server fetch loads history
      expect(state.streamingSegments).toHaveLength(1);
      expect(state.segmentsPendingClear).toBe(true);
    });

    it('TC-L2: clearStreamingSegments clears segments and sets segmentsPendingClear=false', () => {
      useChatStore.setState({
        streamingSegments: [{ type: 'text', content: 'hello' }],
        segmentsPendingClear: true,
      });

      useChatStore.getState().clearStreamingSegments();

      const state = useChatStore.getState();
      expect(state.streamingSegments).toEqual([]);
      expect(state.segmentsPendingClear).toBe(false);
    });

    it('TC-L3: abortStreaming clears segments and sets segmentsPendingClear=false', () => {
      const { startStreaming, appendStreamingContent, abortStreaming } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('partial');
      abortStreaming();

      const state = useChatStore.getState();
      expect(state.streamingSegments).toEqual([]);
      expect(state.segmentsPendingClear).toBe(false);
    });

    it('TC-L4: startStreaming sets segmentsPendingClear=false', () => {
      // Simulate a state where segments are pending clear from previous completion
      useChatStore.setState({
        segmentsPendingClear: true,
        streamingSegments: [{ type: 'text', content: 'old' }],
      });

      useChatStore.getState().startStreaming('session-2', 'msg-2');

      const state = useChatStore.getState();
      expect(state.segmentsPendingClear).toBe(false);
      expect(state.streamingSegments).toEqual([]);
      expect(state.isStreaming).toBe(true);
    });

    it('TC-L5: sendMessage clears existing stale segments', () => {
      // Simulate stale segments from previous response
      useChatStore.setState({
        streamingSegments: [{ type: 'text', content: 'stale' }],
        segmentsPendingClear: true,
      });

      useChatStore.getState().sendMessage('New message', {
        workingDirectory: '/path',
      });

      const state = useChatStore.getState();
      expect(state.streamingSegments).toEqual([]);
      // sendMessage does not explicitly reset segmentsPendingClear;
      // it will be reset by startStreaming when the server responds
      expect(state.isStreaming).toBe(true);
    });

    it('TC-L6: abortResponse clears streaming and triggers fetch internally', () => {
      const { startStreaming, appendStreamingContent, abortResponse } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('content');
      abortResponse();

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
    });

    it('TC-L8: restoreStreaming resets segmentsPendingClear=false', () => {
      useChatStore.setState({
        segmentsPendingClear: true,
        streamingSegments: [{ type: 'text', content: 'old' }],
      });

      useChatStore.getState().restoreStreaming('session-2');

      const state = useChatStore.getState();
      expect(state.segmentsPendingClear).toBe(false);
      expect(state.isStreaming).toBe(true);
      expect(state.streamingSegments).toEqual([]);
    });
  });

  describe('selectedEffort (Story 26.2)', () => {
    it('has initial selectedEffort set to undefined', () => {
      const { selectedEffort } = useChatStore.getState();
      expect(selectedEffort).toBeUndefined();
    });

    it('updates selectedEffort via setSelectedEffort', () => {
      const { setSelectedEffort } = useChatStore.getState();

      setSelectedEffort('high');
      expect(useChatStore.getState().selectedEffort).toBe('high');

      setSelectedEffort('low');
      expect(useChatStore.getState().selectedEffort).toBe('low');

      setSelectedEffort(undefined);
      expect(useChatStore.getState().selectedEffort).toBeUndefined();
    });

    it('resetSelectedEffort reads from preferences.defaultEffort', () => {
      // Set a default effort in preferences
      usePreferencesStore.setState({
        preferences: { ...usePreferencesStore.getState().preferences, defaultEffort: 'medium' },
      });

      useChatStore.getState().setSelectedEffort('high');
      useChatStore.getState().resetSelectedEffort();

      expect(useChatStore.getState().selectedEffort).toBe('medium');
    });

    it('resetSelectedEffort sets undefined when no defaultEffort in preferences', () => {
      usePreferencesStore.setState({
        preferences: { ...usePreferencesStore.getState().preferences, defaultEffort: undefined },
      });

      useChatStore.getState().setSelectedEffort('high');
      useChatStore.getState().resetSelectedEffort();

      expect(useChatStore.getState().selectedEffort).toBeUndefined();
    });

    it('includes effort in sendMessage emit when selectedEffort is set', () => {
      useChatStore.getState().setSelectedEffort('high');
      useChatStore.getState().sendMessage('Hello', { workingDirectory: '/path' });

      expect(mockEmit).toHaveBeenCalledWith('chat:send', expect.objectContaining({
        effort: 'high',
      }));
    });

    it('omits effort from sendMessage emit when selectedEffort is undefined', () => {
      useChatStore.getState().setSelectedEffort(undefined);
      useChatStore.getState().sendMessage('Hello', { workingDirectory: '/path' });

      const payload = mockEmit.mock.calls[0][1];
      expect(payload.effort).toBeUndefined();
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
