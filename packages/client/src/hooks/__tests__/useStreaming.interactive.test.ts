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

describe('useStreaming synthetic typing (CLI mode)', () => {
  let rafCbs: Array<(() => void) | null>;
  let prefsSnapshot: ReturnType<typeof usePreferencesStore.getState>['preferences'];

  const runFrame = () => {
    const cbs = rafCbs;
    rafCbs = [];
    cbs.forEach((cb) => cb && cb());
  };
  const lastText = (): string => {
    const segs = useChatStore.getState().streamingSegments;
    const last = segs[segs.length - 1];
    return last && last.type === 'text' ? last.content : '';
  };
  const setEngine = (engineMode: 'cli' | 'sdk', cliSyntheticTyping: boolean) => {
    usePreferencesStore.setState({
      preferences: { ...usePreferencesStore.getState().preferences, engineMode, cliSyntheticTyping },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    socketHandlers.clear();
    rafCbs = [];
    prefsSnapshot = usePreferencesStore.getState().preferences;
    // Manual rAF so each "frame" is advanced explicitly (deterministic typing).
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { rafCbs.push(cb); return rafCbs.length; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { rafCbs[id - 1] = null; });
    useChatStore.setState({
      isStreaming: true,
      streamingSessionId: 'test-session',
      streamingMessageId: 'm',
      streamingSegments: [],
      streamingStartedAt: new Date(),
      permissionMode: 'default',
      contextUsage: null,
      projectSettings: null,
    });
  });

  afterEach(() => {
    usePreferencesStore.setState({ preferences: prefsSnapshot });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // Reset the document visibility override so it can't leak into other tests.
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('CLI + toggle ON: a completed block is typed out across frames, not in one shot', async () => {
    setEngine('cli', true);
    renderHook(() => useStreaming());

    // preso routes text through a microtask chain before the typer enqueues it.
    await act(async () => {
      emitSocketEvent('message:chunk', { sessionId: 'test-session', messageId: 'm1', content: 'Hello world' });
      await Promise.resolve();
    });

    // Enqueued into the typer but not painted until a frame runs (typewriter, not one-shot).
    expect(lastText()).toBe('');

    act(() => runFrame());
    const afterOne = lastText();
    expect(afterOne.length).toBeGreaterThan(0);
    expect(afterOne.length).toBeLessThan('Hello world'.length); // partial reveal

    // Remaining frames complete the text.
    act(() => { for (let i = 0; i < 30; i++) runFrame(); });
    expect(lastText()).toBe('Hello world');
  });

  it('SDK mode: a chunk is painted in a single frame even with the toggle on (CLI-only effect)', () => {
    setEngine('sdk', true);
    renderHook(() => useStreaming());

    act(() => {
      emitSocketEvent('message:chunk', { sessionId: 'test-session', messageId: 'm1', content: 'Hello world' });
    });

    act(() => runFrame());
    expect(lastText()).toBe('Hello world'); // whole block in one frame
  });

  it('CLI + toggle OFF: a chunk is painted in a single frame (opt-in respected)', () => {
    setEngine('cli', false);
    renderHook(() => useStreaming());

    act(() => {
      emitSocketEvent('message:chunk', { sessionId: 'test-session', messageId: 'm1', content: 'Hello world' });
    });

    act(() => runFrame());
    expect(lastText()).toBe('Hello world');
  });

  it('CLI + toggle ON: tab hidden mid-typing flushes the queued text at once (mobile sleep/wake)', async () => {
    // Symptom 3 of CLI card ordering: on mobile, locking the screen freezes rAF (typewriter)
    // and setTimeout (card stagger). A turn completing during that freeze would block on
    // `await preso.drain()`, leaving half-revealed live segments that reorder on wake. The
    // visibilitychange handler flushes the animation the moment we go hidden so drain() can't
    // hang. We observe the flush directly: the queued block commits WITHOUT any runFrame().
    setEngine('cli', true);
    renderHook(() => useStreaming());

    // A completed block is queued into the typer; nothing painted yet (no frame has run).
    await act(async () => {
      emitSocketEvent('message:chunk', { sessionId: 'test-session', messageId: 'm1', content: 'Hello world' });
      await Promise.resolve();
    });
    expect(lastText()).toBe('');

    // Tab goes hidden (mobile screen lock) → handler collapses the animation immediately.
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Committed to completion with zero animation frames — the frozen-timer path was bypassed.
    expect(lastText()).toBe('Hello world');
  });
});
