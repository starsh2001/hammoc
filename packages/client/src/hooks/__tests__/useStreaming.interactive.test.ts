/**
 * useStreaming Interactive Events Tests
 * [Source: Story 7.1 - Task 7]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreaming } from '../useStreaming';
import { useChatStore } from '../../stores/chatStore';

// Socket event handlers storage
type SocketHandler = (...args: unknown[]) => void;
const socketHandlers = new Map<string, SocketHandler[]>();

const mockSocket = {
  connected: true,
  on: vi.fn((event: string, handler: SocketHandler) => {
    if (!socketHandlers.has(event)) socketHandlers.set(event, []);
    socketHandlers.get(event)!.push(handler);
  }),
  off: vi.fn(),
  emit: vi.fn(),
  io: {
    on: vi.fn(),
    off: vi.fn(),
  },
};

vi.mock('../../services/socket', () => ({
  getSocket: () => mockSocket,
}));

// Mock messageStore to prevent fetch calls
vi.mock('../../stores/messageStore', () => ({
  useMessageStore: {
    getState: () => ({
      currentProjectSlug: null,
      currentSessionId: null,
      fetchMessages: vi.fn(),
      addMessages: vi.fn(),
    }),
  },
}));

function emitSocketEvent(event: string, ...args: unknown[]) {
  const handlers = socketHandlers.get(event) || [];
  handlers.forEach((h) => h(...args));
}

describe('useStreaming interactive events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketHandlers.clear();
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers permission:request listener', () => {
    renderHook(() => useStreaming());
    expect(mockSocket.on).toHaveBeenCalledWith('permission:request', expect.any(Function));
  });

  it('creates interactive segment on permission:request event', () => {
    renderHook(() => useStreaming());

    act(() => {
      emitSocketEvent('permission:request', {
        id: 'perm-1',
        sessionId: 'test-session',
        toolCall: { id: 'perm-1', name: 'Bash', input: { command: 'rm -rf /' } },
        requiresApproval: true,
      });
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

  it('creates interactive segment for AskUserQuestion tool_use', () => {
    renderHook(() => useStreaming());

    act(() => {
      emitSocketEvent('tool:call', {
        id: 'tool-ask-1',
        name: 'AskUserQuestion',
        input: {
          questions: [{
            question: 'Which option?',
            header: 'Choice',
            options: [
              { label: 'A', description: 'First' },
              { label: 'B' },
            ],
            multiSelect: false,
          }],
        },
      });
    });

    const segments = useChatStore.getState().streamingSegments;
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      type: 'interactive',
      id: 'tool-ask-1',
      interactionType: 'question',
    });
    // Should NOT create a tool segment
    expect(segments[0].type).not.toBe('tool');
  });

  it('ignores duplicate permission:request with same ID', () => {
    renderHook(() => useStreaming());

    const data = {
      id: 'perm-1',
      sessionId: 'test-session',
      toolCall: { id: 'perm-1', name: 'Bash', input: {} },
      requiresApproval: true,
    };

    act(() => {
      emitSocketEvent('permission:request', data);
      emitSocketEvent('permission:request', data);
    });

    expect(useChatStore.getState().streamingSegments).toHaveLength(1);
  });

  it('adds multiple permission requests as separate segments', () => {
    renderHook(() => useStreaming());

    act(() => {
      emitSocketEvent('permission:request', {
        id: 'perm-1',
        sessionId: 'test-session',
        toolCall: { id: 'perm-1', name: 'Bash', input: {} },
        requiresApproval: true,
      });
      emitSocketEvent('permission:request', {
        id: 'perm-2',
        sessionId: 'test-session',
        toolCall: { id: 'perm-2', name: 'Write', input: {} },
        requiresApproval: true,
      });
    });

    expect(useChatStore.getState().streamingSegments).toHaveLength(2);
  });

  it('creates regular tool segment for non-AskUserQuestion tools', () => {
    renderHook(() => useStreaming());

    act(() => {
      emitSocketEvent('tool:call', {
        id: 'tool-read-1',
        name: 'Read',
        input: { file_path: '/test.ts' },
      });
    });

    const segments = useChatStore.getState().streamingSegments;
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      type: 'tool',
    });
  });

  it('cleans up permission:request listener on unmount', () => {
    const { unmount } = renderHook(() => useStreaming());
    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith('permission:request', expect.any(Function));
  });
});
