/**
 * useStreaming Hook Tests
 * [Source: Story 4.5 - Task 11, Story 4.8 - Task 4]
 */

// @vitest-environment jsdom
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
  joinProjectRoom: vi.fn(),
  leaveProjectRoom: vi.fn(),
  rejoinProjectRooms: vi.fn(),
  forceReconnect: vi.fn(),
  disconnectSocket: vi.fn(),
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
      generationProgress: null,

      isCompacting: false,
      isSessionLocked: false,
    });
    useMessageStore.setState({
      messages: [],
      currentProjectSlug: 'test-project',
      currentSessionId: 'session-1',
      isLoading: false,
      error: null,
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
    it('updates metadata on complete but waits for stream:complete-messages to finalize', async () => {
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

      // message:complete no longer calls completeStreaming —
      // stream:complete-messages handles finalization after JSONL flush
      mockSocket.trigger('message:complete', {
        id: 'msg-1',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'Hello World!',
        timestamp: new Date(),
      });
      await act(async () => {});

      // isStreaming remains true — waiting for stream:complete-messages
      expect(useChatStore.getState().isStreaming).toBe(true);
      // streamingMessageId is updated from the completion data
      expect(useChatStore.getState().streamingMessageId).toBe('msg-1');

      // Now stream:complete-messages arrives and finalizes
      mockSocket.trigger('stream:complete-messages', {
        sessionId: 'session-1',
        messages: [
          { id: 'msg-1', type: 'assistant', content: 'Hello World!', timestamp: new Date().toISOString() },
        ],
      });

      expect(useChatStore.getState().isStreaming).toBe(false);
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
    it('emits chat:abort when Escape is pressed during streaming', () => {
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

      // abortResponse emits chat:abort to server; actual completion happens
      // via server-sent stream:detached + stream:complete-messages
      expect(mockSocket.emit).toHaveBeenCalledWith('chat:abort');
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

    it('emits chat:abort via Ctrl+C when no text is selected', () => {
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

      // abortResponse emits chat:abort to server
      expect(mockSocket.emit).toHaveBeenCalledWith('chat:abort');

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

  describe('generation:progress event (Story 32.7 — transient CLI progress)', () => {
    it('stores the progress payload on a live generation:progress event', () => {
      renderHook(() => useStreaming());

      mockSocket.trigger('generation:progress', { tokens: 246, elapsedSeconds: 6 });

      expect(useChatStore.getState().generationProgress).toEqual({ tokens: 246, elapsedSeconds: 6 });
    });

    it('registers and cleans up the generation:progress listener', () => {
      const { unmount } = renderHook(() => useStreaming());

      expect(mockSocket.on).toHaveBeenCalledWith('generation:progress', expect.any(Function));

      unmount();

      expect(mockSocket.off).toHaveBeenCalledWith('generation:progress', expect.any(Function));
    });

    it('does not restore generation:progress when replaying an INACTIVE stream (completed/aborted)', () => {
      renderHook(() => useStreaming());

      // No active stream (isStreaming stays false): a completed/aborted buffer replay must not
      // resurrect a transient counter.
      mockSocket.trigger('stream:buffer-replay', {
        sessionId: 'session-1',
        events: [{ event: 'generation:progress', data: { tokens: 999, elapsedSeconds: 9 } }],
      });

      expect(useChatStore.getState().generationProgress).toBeNull();
    });

    it('restores the LAST generation:progress when re-entering an active stream mid-turn', () => {
      renderHook(() => useStreaming());

      // Simulate stream:status active → restoreStreaming (server confirmed a running turn),
      // which is what leaving and returning to the chat triggers.
      useChatStore.getState().restoreStreaming('session-1');

      mockSocket.trigger('stream:buffer-replay', {
        sessionId: 'session-1',
        events: [
          { event: 'generation:progress', data: { tokens: 100, elapsedSeconds: 2 }, ts: 1000 },
          { event: 'generation:progress', data: { tokens: 365, elapsedSeconds: 9 }, ts: 2000 },
        ],
      });

      // The freshest counter is restored so the indicator continues instead of resetting.
      expect(useChatStore.getState().generationProgress).toEqual({ tokens: 365, elapsedSeconds: 9 });
    });

    it('realigns the elapsed-clock start to the running turn on active replay', () => {
      renderHook(() => useStreaming());
      useChatStore.getState().restoreStreaming('session-1');

      mockSocket.trigger('stream:buffer-replay', {
        sessionId: 'session-1',
        events: [{ event: 'generation:progress', data: { tokens: 100, elapsedSeconds: 2 }, ts: 1234 }],
      });

      // streamingStartedAt is realigned to the first buffered event of the running turn (not
      // "now"), so the elapsed seconds continue from the real start instead of restarting at 0.
      expect(useChatStore.getState().streamingStartedAt?.getTime()).toBe(1234);
    });

    it('does not restore progress from a turn that already completed in the buffer', () => {
      renderHook(() => useStreaming());
      useChatStore.getState().restoreStreaming('session-1');

      mockSocket.trigger('stream:buffer-replay', {
        sessionId: 'session-1',
        events: [
          { event: 'generation:progress', data: { tokens: 365, elapsedSeconds: 9 }, ts: 1000 },
          {
            event: 'message:complete',
            data: { id: 'm1', sessionId: 'session-1', type: 'assistant', content: '', timestamp: '2025-01-01T00:00:00.000Z' },
            ts: 2000,
          },
        ],
      });

      // message:complete is a turn boundary — the finished turn's counter is cleared.
      expect(useChatStore.getState().generationProgress).toBeNull();
    });
  });

  describe('stream:buffer-replay tool finalize (reconnect mid-turn)', () => {
    it('snapshot order (provisional → result → canonical) finalizes to ONE completed card (not a stuck duplicate)', () => {
      renderHook(() => useStreaming());
      useChatStore.getState().restoreStreaming('session-1');

      mockSocket.trigger('stream:buffer-replay', {
        sessionId: 'session-1',
        events: [
          { event: 'tool:call', data: { id: 'cli-prov-tool-54', name: 'playwright - Page snapshot', input: {}, provisional: true }, ts: 1000 },
          { event: 'tool:result', data: { toolCallId: 'cli-prov-tool-54', result: { success: true, output: 'snap' }, provisional: true }, ts: 1100 },
          { event: 'tool:call', data: { id: 'cli-prov-tool-54', name: 'mcp__playwright__browser_snapshot', input: {}, provisional: false }, ts: 1200 },
        ],
      });

      const tools = useChatStore.getState().streamingSegments.filter((s) => s.type === 'tool');
      expect(tools).toHaveLength(1); // finalized in place — NOT two cards
      const t = tools[0];
      expect(t).toMatchObject({ status: 'completed' });
      if (t.type === 'tool') expect(t.toolCall.name).toBe('mcp__playwright__browser_snapshot');
      expect(t).not.toHaveProperty('provisional');
    });

    it('evaluate order (provisional → canonical → result) finalizes to ONE completed card', () => {
      renderHook(() => useStreaming());
      useChatStore.getState().restoreStreaming('session-1');

      mockSocket.trigger('stream:buffer-replay', {
        sessionId: 'session-1',
        events: [
          { event: 'tool:call', data: { id: 'cli-prov-tool-60', name: 'playwright - Evaluate JavaScript', input: {}, provisional: true }, ts: 1000 },
          { event: 'tool:call', data: { id: 'cli-prov-tool-60', name: 'mcp__playwright__browser_evaluate', input: {}, provisional: false }, ts: 1100 },
          { event: 'tool:result', data: { toolCallId: 'cli-prov-tool-60', result: { success: true, output: 'res' }, provisional: true }, ts: 1200 },
        ],
      });

      const tools = useChatStore.getState().streamingSegments.filter((s) => s.type === 'tool');
      expect(tools).toHaveLength(1);
      const t = tools[0];
      expect(t).toMatchObject({ status: 'completed' });
      if (t.type === 'tool') expect(t.toolCall.name).toBe('mcp__playwright__browser_evaluate');
      expect(t).not.toHaveProperty('provisional');
    });
  });

  describe('stream:buffer-replay text/thinking finalize (reconnect mid-turn)', () => {
    it('text: canonical chunk replaces the provisional preview → ONE text segment (no duplicate)', () => {
      renderHook(() => useStreaming());
      useChatStore.getState().restoreStreaming('session-1');
      mockSocket.trigger('stream:buffer-replay', {
        sessionId: 'session-1',
        events: [
          { event: 'message:chunk', data: { sessionId: 'session-1', messageId: 'cli-prov-text-1', content: 'Hello world', provisional: true }, ts: 1000 },
          { event: 'message:chunk', data: { sessionId: 'session-1', messageId: 'cli-fin-text-1', content: 'Hello world', provisional: false }, ts: 1100 },
          { event: 'tool:call', data: { id: 'cli-prov-tool-0', name: 'Read', input: {}, provisional: true }, ts: 1200 },
        ],
      });
      const texts = useChatStore.getState().streamingSegments.filter((s) => s.type === 'text');
      expect(texts).toHaveLength(1);
      if (texts[0].type === 'text') expect(texts[0].content).toBe('Hello world');
      expect(texts[0]).not.toHaveProperty('provisional');
    });

    it('thinking: canonical chunk replaces the provisional ∴ preview → ONE thinking segment', () => {
      renderHook(() => useStreaming());
      useChatStore.getState().restoreStreaming('session-1');
      mockSocket.trigger('stream:buffer-replay', {
        sessionId: 'session-1',
        events: [
          { event: 'thinking:chunk', data: { content: 'pondering the plan', provisional: true }, ts: 1000 },
          { event: 'thinking:chunk', data: { content: 'pondering the plan', provisional: false }, ts: 1100 },
        ],
      });
      const thinks = useChatStore.getState().streamingSegments.filter((s) => s.type === 'thinking');
      expect(thinks).toHaveLength(1);
      if (thinks[0].type === 'thinking') expect(thinks[0].content).toBe('pondering the plan');
      expect(thinks[0]).not.toHaveProperty('provisional');
    });
  });

  // Real harness capture (_harness_cli.ts, opus-4-8): 6 interleaved Read/Search tools in ONE live
  // turn. The buffer mixes BOTH completion orders the server actually emits — pattern A
  // (prov USE → prov RESULT → CANON USE) for tools 0/2/3/4/5 and pattern B
  // (prov USE → CANON USE → prov RESULT) for tool 1 — plus the N:M friendly-name case
  // (screen 'Search' → file 'Glob', same synthId). A reconnect mid-turn replays this whole buffer;
  // every tool must finalize to a SINGLE completed card. A stuck 'pending' here = the "Read 초록인데
  // 카드 spinner" reconnect symptom.
  describe('stream:buffer-replay multi-tool live reconnect (real harness sequence)', () => {
    it('6 interleaved Read/Search tools (mixed completion orders) all finalize to ONE completed card each', () => {
      renderHook(() => useStreaming());
      useChatStore.getState().restoreStreaming('session-1');

      mockSocket.trigger('stream:buffer-replay', {
        sessionId: 'session-1',
        events: [
          // tool-0: pattern A (prov USE → prov RESULT → CANON USE)
          { event: 'tool:call', data: { id: 'cli-prov-tool-0', name: 'Read', input: {}, provisional: true }, ts: 1000 },
          { event: 'tool:result', data: { toolCallId: 'cli-prov-tool-0', result: { success: true, output: '' }, provisional: true }, ts: 1010 },
          { event: 'tool:call', data: { id: 'cli-prov-tool-0', name: 'Read', input: { file_path: 'package.json' }, provisional: false }, ts: 1020 },
          // tool-1: pattern B (prov USE → CANON USE → prov RESULT)
          { event: 'tool:call', data: { id: 'cli-prov-tool-1', name: 'Read', input: {}, provisional: true }, ts: 1030 },
          { event: 'tool:call', data: { id: 'cli-prov-tool-1', name: 'Read', input: { file_path: 'tsconfig.json' }, provisional: false }, ts: 1040 },
          { event: 'tool:result', data: { toolCallId: 'cli-prov-tool-1', result: { success: true, output: '' }, provisional: true }, ts: 1050 },
          // tool-2: pattern A + N:M friendly name (screen 'Search' → file 'Glob')
          { event: 'tool:call', data: { id: 'cli-prov-tool-2', name: 'Search', input: {}, provisional: true }, ts: 1060 },
          { event: 'tool:result', data: { toolCallId: 'cli-prov-tool-2', result: { success: true, output: '' }, provisional: true }, ts: 1070 },
          { event: 'tool:call', data: { id: 'cli-prov-tool-2', name: 'Glob', input: { pattern: '**/*' }, provisional: false }, ts: 1080 },
          // tool-3/4/5: pattern A
          { event: 'tool:call', data: { id: 'cli-prov-tool-3', name: 'Read', input: {}, provisional: true }, ts: 1090 },
          { event: 'tool:result', data: { toolCallId: 'cli-prov-tool-3', result: { success: true, output: '' }, provisional: true }, ts: 1100 },
          { event: 'tool:call', data: { id: 'cli-prov-tool-3', name: 'Read', input: { file_path: 'packages/client/package.json' }, provisional: false }, ts: 1110 },
          { event: 'tool:call', data: { id: 'cli-prov-tool-4', name: 'Read', input: {}, provisional: true }, ts: 1120 },
          { event: 'tool:result', data: { toolCallId: 'cli-prov-tool-4', result: { success: true, output: '' }, provisional: true }, ts: 1130 },
          { event: 'tool:call', data: { id: 'cli-prov-tool-4', name: 'Read', input: { file_path: 'packages/server/package.json' }, provisional: false }, ts: 1140 },
          { event: 'tool:call', data: { id: 'cli-prov-tool-5', name: 'Read', input: {}, provisional: true }, ts: 1150 },
          { event: 'tool:result', data: { toolCallId: 'cli-prov-tool-5', result: { success: true, output: '' }, provisional: true }, ts: 1160 },
          { event: 'tool:call', data: { id: 'cli-prov-tool-5', name: 'Read', input: { file_path: 'README.md' }, provisional: false }, ts: 1170 },
        ],
      });

      const tools = useChatStore.getState().streamingSegments.filter((s) => s.type === 'tool');
      expect(tools).toHaveLength(6); // one card per tool — no stuck duplicates
      for (const t of tools) {
        expect(t).toMatchObject({ status: 'completed' }); // none stuck on the pending spinner
        expect(t).not.toHaveProperty('provisional'); // badge dropped
      }
      // The friendly screen name was overwritten by the canonical file name.
      const names = tools.map((t) => (t.type === 'tool' ? t.toolCall.name : '')).sort();
      expect(names).toEqual(['Glob', 'Read', 'Read', 'Read', 'Read', 'Read']);
    });
  });

  // The LIVE path (real-time tool:call / tool:result events, NOT buffer-replay). This is what a user
  // sees during a normal turn with no menu-switch / sleep. Same real harness sequence: pattern A
  // (prov USE → prov RESULT → CANON USE), pattern B (prov USE → CANON USE → prov RESULT), and the
  // N:M friendly name (Search → Glob). Every tool must end 'completed' — a stuck 'pending' here is the
  // live "Read 초록인데 카드 spinner" the user reports.
  describe('LIVE tool reconcile — real-time events (not buffer-replay)', () => {
    it('6 tools (mixed completion orders + Search→Glob) all reach completed via live tool:call/tool:result', () => {
      renderHook(() => useStreaming());
      useChatStore.getState().restoreStreaming('session-1'); // isStreaming = true (live turn)

      const live = (event: string, data: unknown) => mockSocket.trigger(event, data);

      // tool-0: pattern A
      live('tool:call', { id: 'cli-prov-tool-0', name: 'Read', input: {}, provisional: true });
      live('tool:result', { toolCallId: 'cli-prov-tool-0', result: { success: true, output: '' }, provisional: true });
      live('tool:call', { id: 'cli-prov-tool-0', name: 'Read', input: { file_path: 'package.json' }, provisional: false });
      // tool-1: pattern B
      live('tool:call', { id: 'cli-prov-tool-1', name: 'Read', input: {}, provisional: true });
      live('tool:call', { id: 'cli-prov-tool-1', name: 'Read', input: { file_path: 'tsconfig.json' }, provisional: false });
      live('tool:result', { toolCallId: 'cli-prov-tool-1', result: { success: true, output: '' }, provisional: true });
      // tool-2: pattern A + N:M (Search → Glob)
      live('tool:call', { id: 'cli-prov-tool-2', name: 'Search', input: {}, provisional: true });
      live('tool:result', { toolCallId: 'cli-prov-tool-2', result: { success: true, output: '' }, provisional: true });
      live('tool:call', { id: 'cli-prov-tool-2', name: 'Glob', input: { pattern: '**/*' }, provisional: false });
      // tool-3/4/5: pattern A
      for (const [slot, file] of [['3', 'a.ts'], ['4', 'b.ts'], ['5', 'c.ts']] as const) {
        live('tool:call', { id: `cli-prov-tool-${slot}`, name: 'Read', input: {}, provisional: true });
        live('tool:result', { toolCallId: `cli-prov-tool-${slot}`, result: { success: true, output: '' }, provisional: true });
        live('tool:call', { id: `cli-prov-tool-${slot}`, name: 'Read', input: { file_path: file }, provisional: false });
      }

      const tools = useChatStore.getState().streamingSegments.filter((s) => s.type === 'tool');
      expect(tools).toHaveLength(6);
      for (const t of tools) {
        expect(t).toMatchObject({ status: 'completed' });
        expect(t).not.toHaveProperty('provisional');
      }
    });
  });

  describe('cli:phase event (Story 36.2 — transient CLI boot/inject phase)', () => {
    it('stores the phase on a live cli:phase event', () => {
      renderHook(() => useStreaming());

      mockSocket.trigger('cli:phase', { phase: 'launching' });

      expect(useChatStore.getState().cliPhase).toBe('launching');
    });

    it('clears the phase on a null cli:phase event (hand-off to generation:progress)', () => {
      renderHook(() => useStreaming());

      mockSocket.trigger('cli:phase', { phase: 'waiting' });
      expect(useChatStore.getState().cliPhase).toBe('waiting');

      mockSocket.trigger('cli:phase', { phase: null });
      expect(useChatStore.getState().cliPhase).toBeNull();
    });

    it('registers and cleans up the cli:phase listener', () => {
      const { unmount } = renderHook(() => useStreaming());

      expect(mockSocket.on).toHaveBeenCalledWith('cli:phase', expect.any(Function));

      unmount();

      expect(mockSocket.off).toHaveBeenCalledWith('cli:phase', expect.any(Function));
    });

    it('does not restore cli:phase when replaying an INACTIVE stream', () => {
      renderHook(() => useStreaming());

      mockSocket.trigger('stream:buffer-replay', {
        sessionId: 'session-1',
        events: [{ event: 'cli:phase', data: { phase: 'launching' } }],
      });

      expect(useChatStore.getState().cliPhase).toBeNull();
    });

    it('restores the LAST cli:phase when re-entering an active stream mid-turn', () => {
      renderHook(() => useStreaming());
      useChatStore.getState().restoreStreaming('session-1');

      mockSocket.trigger('stream:buffer-replay', {
        sessionId: 'session-1',
        events: [
          { event: 'cli:phase', data: { phase: 'launching' }, ts: 1000 },
          { event: 'cli:phase', data: { phase: 'waiting' }, ts: 2000 },
        ],
      });

      expect(useChatStore.getState().cliPhase).toBe('waiting');
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
    it('TC-R1: adds user message from buffer replay via addUserMessage', () => {
      useMessageStore.setState({
        messages: [
          { id: 'msg-1', type: 'user', content: 'hello world', timestamp: new Date().toISOString() },
        ] as ReturnType<typeof useMessageStore.getState>['messages'],
        currentProjectSlug: 'test-project',
        currentSessionId: 'test-session',
      });

      renderHook(() => useStreaming());

      // Buffer replay sends content — addUserMessage always adds (server-authoritative)
      mockSocket.trigger('user:message', { content: 'hello world  ', sessionId: 'test-session' });

      // Message is added (trimmed) since addUserMessage doesn't deduplicate
      expect(useMessageStore.getState().messages).toHaveLength(2);
      expect(useMessageStore.getState().messages[1].content).toBe('hello world');
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
      expect(useChatStore.getState().isStreaming).toBe(false);
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

      // Verify session:join was emitted (with projectSlug as second arg)
      expect(mockSocket.emit).toHaveBeenCalledWith('session:join', 'session-1', 'test-project');

      // Before timeout: still streaming
      expect(useChatStore.getState().isStreaming).toBe(true);

      // Advance time by 10 seconds
      vi.advanceTimersByTime(10000);

      // After timeout: streaming should be completed
      expect(useChatStore.getState().isStreaming).toBe(false);

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

    it('salvages a live, not-yet-persisted turn into the message store when the 10s reconnect timeout fires (mobile sleep/wake disappearance guard)', () => {
      // The assistant's in-flight answer lives ONLY in streamingSegments (the live preview).
      // It has NOT been persisted to the message store — no stream:complete-messages and no
      // stream:history have landed yet. This is the state across a mobile sleep: the socket
      // dropped before the turn was confirmed.
      useChatStore.setState({
        isStreaming: true,
        streamingSessionId: 'session-1',
        streamingMessageId: 'msg-1',
        streamingSegments: [{ type: 'text', content: 'SURVIVE-ME' }],
        streamingStartedAt: new Date(),
      });
      useMessageStore.setState({
        messages: [],
        currentProjectSlug: 'test-project',
        currentSessionId: 'session-1',
      });

      renderHook(() => useStreaming());

      // Wake → socket reconnects → session:join emitted and the 10s give-up timeout is armed.
      mockSocket.trigger('connect');
      expect(mockSocket.emit).toHaveBeenCalledWith('session:join', 'session-1', 'test-project');

      // The server's stream:history / stream:status never arrives in time (slow response,
      // reconnect flap, or empty history). The give-up timeout fires its synthesized active:false.
      vi.advanceTimersByTime(10000);

      // Teardown ran: streaming ended and the live preview was wiped.
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamingSegments).toEqual([]);

      // The give-up path salvages the live segments into the message store BEFORE teardown, so the
      // turn survives instead of vanishing. (Before the fix this was empty — the turn was lost.)
      const persisted = useMessageStore.getState().messages.map((m) => m.content).join('\n');
      expect(persisted).toContain('SURVIVE-ME');
    });
  });

  // Story 25.11: session:forked event handler
  describe('session:forked event', () => {
    it('sets forkedSessionId in chatStore when session:forked is received', () => {
      // Set currentSessionId to match originalSessionId so the handler accepts the event
      useMessageStore.setState({ currentSessionId: 'session-1' });

      renderHook(() => useStreaming());

      act(() => {
        mockSocket.trigger('session:forked', {
          sessionId: 'new-forked-session-id',
          originalSessionId: 'session-1',
          model: 'claude-4',
        });
      });

      expect(useChatStore.getState().forkedSessionId).toBe('new-forked-session-id');
    });
  });
});
