/**
 * ChatStore Interactive Segment Tests
 * [Source: Story 7.1 - Task 7]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../chatStore';

// Mock socket
const mockSocket = {
  connected: true,
  emit: vi.fn(),
};
vi.mock('../../services/socket', () => ({
  getSocket: () => mockSocket,
}));

describe('chatStore interactive segments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.connected = true;
    useChatStore.setState({
      isStreaming: true,
      streamingSessionId: 'test-session',
      streamingMessageId: 'test-msg',
      streamingSegments: [],
      streamingStartedAt: new Date(),
      permissionMode: 'default',
      contextUsage: null,
    });
  });

  describe('addInteractiveSegment', () => {
    it('adds an interactive segment to streaming segments', () => {
      useChatStore.getState().addInteractiveSegment({
        id: 'perm-1',
        interactionType: 'permission',
        toolCall: { id: 'tool-1', name: 'Bash', input: { command: 'ls' } },
        choices: [
          { label: '승인', value: 'approve' },
          { label: '거절', value: 'reject' },
        ],
      });

      const segments = useChatStore.getState().streamingSegments;
      expect(segments).toHaveLength(1);
      expect(segments[0]).toMatchObject({
        type: 'interactive',
        id: 'perm-1',
        interactionType: 'permission',
        status: 'waiting',
      });
    });

    it('does not add duplicate segments with same ID', () => {
      const segment = {
        id: 'perm-1',
        interactionType: 'permission' as const,
        choices: [{ label: '승인', value: 'approve' }],
      };

      useChatStore.getState().addInteractiveSegment(segment);
      useChatStore.getState().addInteractiveSegment(segment);

      expect(useChatStore.getState().streamingSegments).toHaveLength(1);
    });

    it('adds question-type interactive segment', () => {
      useChatStore.getState().addInteractiveSegment({
        id: 'ask-1',
        interactionType: 'question',
        toolCall: { id: 'tool-ask', name: 'AskUserQuestion' },
        choices: [
          { label: 'Option A', value: 'Option A' },
          { label: 'Option B', value: 'Option B' },
        ],
        multiSelect: true,
      });

      const segments = useChatStore.getState().streamingSegments;
      expect(segments[0]).toMatchObject({
        type: 'interactive',
        interactionType: 'question',
        multiSelect: true,
        status: 'waiting',
      });
    });
  });

  describe('respondToInteractive', () => {
    beforeEach(() => {
      useChatStore.getState().addInteractiveSegment({
        id: 'perm-1',
        interactionType: 'permission',
        choices: [
          { label: '승인', value: 'approve' },
          { label: '거절', value: 'reject' },
        ],
      });
    });

    it('transitions from waiting to responded on success', () => {
      useChatStore.getState().respondToInteractive('perm-1', { approved: true });

      const seg = useChatStore.getState().streamingSegments[0];
      expect(seg).toMatchObject({
        type: 'interactive',
        status: 'responded',
      });
    });

    it('emits permission:respond via WebSocket', () => {
      useChatStore.getState().respondToInteractive('perm-1', { approved: true });

      expect(mockSocket.emit).toHaveBeenCalledWith('permission:respond', {
        requestId: 'perm-1',
        approved: true,
        interactionType: 'permission',
        response: undefined,
      });
    });

    it('transitions to error state when disconnected', () => {
      mockSocket.connected = false;
      useChatStore.getState().respondToInteractive('perm-1', { approved: true });

      const seg = useChatStore.getState().streamingSegments[0];
      expect(seg).toMatchObject({
        type: 'interactive',
        status: 'error',
        errorMessage: '연결이 끊어졌습니다. 재연결 후 다시 시도하세요',
      });
    });

    it('handles question response with value', () => {
      useChatStore.setState({
        streamingSegments: [{
          type: 'interactive',
          id: 'ask-1',
          interactionType: 'question',
          choices: [{ label: 'A', value: 'A' }],
          status: 'waiting',
        }],
      });

      useChatStore.getState().respondToInteractive('ask-1', {
        approved: true,
        value: 'Option A',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('permission:respond', {
        requestId: 'ask-1',
        approved: true,
        interactionType: 'question',
        response: 'Option A',
      });
    });

    it('manages multiple interactive segments independently', () => {
      useChatStore.getState().addInteractiveSegment({
        id: 'perm-2',
        interactionType: 'permission',
        choices: [{ label: '승인', value: 'approve' }],
      });

      useChatStore.getState().respondToInteractive('perm-1', { approved: true });

      const segments = useChatStore.getState().streamingSegments;
      expect(segments[0]).toMatchObject({ id: 'perm-1', status: 'responded' });
      expect(segments[1]).toMatchObject({ id: 'perm-2', status: 'waiting' });
    });

    it('can retry after error state', () => {
      mockSocket.connected = false;
      useChatStore.getState().respondToInteractive('perm-1', { approved: true });

      // Reconnect
      mockSocket.connected = true;
      useChatStore.getState().respondToInteractive('perm-1', { approved: true });

      const seg = useChatStore.getState().streamingSegments[0];
      expect(seg).toMatchObject({ status: 'responded' });
      expect(mockSocket.emit).toHaveBeenCalled();
    });
  });
});
