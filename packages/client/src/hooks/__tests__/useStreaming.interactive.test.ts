/**
 * useStreaming Interactive Events Tests
 * [Source: Story 7.1 - Task 7]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreaming } from '../useStreaming';
import { useChatStore } from '../../stores/chatStore';
import { usePreferencesStore } from '../../stores/preferencesStore';

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
  joinProjectRoom: vi.fn(),
  leaveProjectRoom: vi.fn(),
  rejoinProjectRooms: vi.fn(),
  forceReconnect: vi.fn(),
  disconnectSocket: vi.fn(),
}));

// Mock messageStore
vi.mock('../../stores/messageStore', () => ({
  useMessageStore: {
    getState: () => ({
      currentProjectSlug: null,
      currentSessionId: null,
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

  it('creates tool permission on permission:request event (attaches to existing tool segment)', () => {
    renderHook(() => useStreaming());

    // First, create the tool segment that the permission will attach to
    act(() => {
      emitSocketEvent('tool:call', {
        id: 'perm-1',
        name: 'Bash',
        input: { command: 'rm -rf /' },
      });
    });

    // Then issue the permission request — it attaches to the existing tool segment
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
      type: 'tool',
      permissionId: 'perm-1',
    });
  });

  it('creates interactive segment for AskUserQuestion via permission:request', () => {
    renderHook(() => useStreaming());

    // AskUserQuestion is now handled via permission:request, NOT tool:call
    // tool:call with AskUserQuestion name is skipped (input is incomplete)
    act(() => {
      emitSocketEvent('permission:request', {
        id: 'perm-ask-1',
        sessionId: 'test-session',
        toolCall: {
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
        },
        requiresApproval: true,
      });
    });

    const segments = useChatStore.getState().streamingSegments;
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      type: 'interactive',
      id: 'perm-ask-1',
      interactionType: 'question',
    });
    // Should NOT create a tool segment
    expect(segments[0].type).not.toBe('tool');
  });

  it('ignores duplicate permission:request with same ID', () => {
    renderHook(() => useStreaming());

    // First, create the tool segment
    act(() => {
      emitSocketEvent('tool:call', {
        id: 'perm-1',
        name: 'Bash',
        input: {},
      });
    });

    const data = {
      id: 'perm-1',
      sessionId: 'test-session',
      toolCall: { id: 'perm-1', name: 'Bash', input: {} },
      requiresApproval: true,
    };

    act(() => {
      emitSocketEvent('permission:request', data);
      emitSocketEvent('permission:request', data); // duplicate — should be ignored
    });

    // Only one tool segment with permission attached
    expect(useChatStore.getState().streamingSegments).toHaveLength(1);
  });

  it('buffers permission:request that arrives before tool:call and attaches when tool segment is created', () => {
    renderHook(() => useStreaming());

    // Permission arrives BEFORE tool:call (race condition)
    act(() => {
      emitSocketEvent('permission:request', {
        id: 'perm-race-1',
        sessionId: 'test-session',
        toolCall: { id: 'tool-race-1', name: 'Bash', input: { command: 'ls' } },
        requiresApproval: true,
      });
    });

    // No segments yet — permission is buffered
    expect(useChatStore.getState().streamingSegments).toHaveLength(0);

    // tool:call arrives later — should pick up the buffered permission
    act(() => {
      emitSocketEvent('tool:call', {
        id: 'tool-race-1',
        name: 'Bash',
        input: { command: 'ls' },
      });
    });

    const segments = useChatStore.getState().streamingSegments;
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      type: 'tool',
      permissionId: 'perm-race-1',
      permissionStatus: 'waiting',
    });
  });

  it('adds multiple permission requests to separate tool segments', () => {
    renderHook(() => useStreaming());

    // Create tool segments first
    act(() => {
      emitSocketEvent('tool:call', { id: 'perm-1', name: 'Bash', input: {} });
      emitSocketEvent('tool:call', { id: 'perm-2', name: 'Write', input: {} });
    });

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

    const segments = useChatStore.getState().streamingSegments;
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ type: 'tool', permissionId: 'perm-1' });
    expect(segments[1]).toMatchObject({ type: 'tool', permissionId: 'perm-2' });
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

/**
 * CLI engine standalone permission card (fix for the "CLI + Ask hangs on file write" bug).
 *
 * The CLI engine emits no tool:call (cliChatEngine skips onToolUse), so a normal-tool
 * permission:request arrives with NO preceding tool segment and a synthetic id ('cli-perm-N').
 * The server marks such requests `standalone:true`, and the client renders them as an
 * INDEPENDENT permission card (the same path AskUserQuestion uses) instead of attaching to a
 * nonexistent tool segment. SDK-mode permissions (standalone falsy) still attach to their tool
 * card. These tests pin both behaviors.
 */
describe('useStreaming — CLI engine standalone permission card', () => {
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

  it('CLI Write permission (standalone) creates an independent permission card', () => {
    renderHook(() => useStreaming());

    // CLI engine sends permission:request with standalone:true (no tool:call precedes it).
    act(() => {
      emitSocketEvent('permission:request', {
        id: 'cli-perm-1',
        sessionId: 'test-session',
        toolCall: { id: 'cli-perm-1', name: 'Write', input: { prompt: 'Do you want to create poem.txt?' } },
        requiresApproval: true,
        standalone: true,
      });
    });

    // An independent permission card is rendered with no preceding tool segment.
    const segments = useChatStore.getState().streamingSegments;
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ type: 'interactive', interactionType: 'permission' });
  });

  it('standalone:false (SDK mode) still attaches to a preceding tool segment', () => {
    renderHook(() => useStreaming());

    // SDK mode: tool:call creates the tool card first, then the permission attaches to it.
    act(() => {
      emitSocketEvent('tool:call', { id: 'sdk-1', name: 'Write', input: { file_path: '/a.txt' } });
      emitSocketEvent('permission:request', {
        id: 'sdk-1',
        sessionId: 'test-session',
        toolCall: { id: 'sdk-1', name: 'Write', input: { file_path: '/a.txt' } },
        requiresApproval: true,
      });
    });

    const segments = useChatStore.getState().streamingSegments;
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ type: 'tool', permissionId: 'sdk-1' });
  });

  it('CLI AskUserQuestion (no preceding tool:call) DOES create a card — the asymmetry', () => {
    renderHook(() => useStreaming());

    act(() => {
      emitSocketEvent('permission:request', {
        id: 'cli-q-1',
        sessionId: 'test-session',
        toolCall: {
          id: 'cli-q-1',
          name: 'AskUserQuestion',
          input: {
            questions: [{
              question: 'Pick one',
              header: 'Q',
              options: [{ label: 'A' }, { label: 'B' }],
              multiSelect: false,
            }],
          },
        },
        requiresApproval: true,
      });
    });

    const segments = useChatStore.getState().streamingSegments;
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ type: 'interactive', interactionType: 'question' });
  });
});
