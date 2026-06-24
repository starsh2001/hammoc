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
  joinProjectRoom: vi.fn(),
  leaveProjectRoom: vi.fn(),
  rejoinProjectRooms: vi.fn(),
  forceReconnect: vi.fn(),
  disconnectSocket: vi.fn(),
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
      generationProgress: null,
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

    it('drops a late tool:call after the stream completed (no orphan card under the last answer)', () => {
      const { startStreaming, addStreamingToolCall, completeStreaming } = useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      addStreamingToolCall({ id: 'tool-1', name: 'Read' });
      expect(useChatStore.getState().streamingSegments).toHaveLength(1);

      completeStreaming();
      expect(useChatStore.getState().streamingSegments).toHaveLength(0);
      expect(useChatStore.getState().isStreaming).toBe(false);

      // CLI mode polls the JSONL, so a turn's final tool block can be re-emitted a beat after
      // the completion signal. Such a late tool:call must be ignored — otherwise it lands in the
      // now-empty live-segment area, which renders BELOW the reloaded messages as an orphan card.
      addStreamingToolCall({ id: 'tool-2', name: 'Bash' });
      expect(useChatStore.getState().streamingSegments).toHaveLength(0);
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

  // Story 37.11 (AC4): the provisional flag (CLI grid screen-scrape) propagates onto text/thinking/
  // tool segments; authoritative emits leave it unset so the renderer dims only the live estimates.
  describe('provisional flag propagation (Story 37.11 AC4)', () => {
    it('marks a text segment provisional, then FINALIZES it in place when the canonical arrives (provisional=false)', () => {
      const { startStreaming, appendStreamingContent } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');
      appendStreamingContent('live estimate', true);
      expect(useChatStore.getState().streamingSegments[0]).toEqual({ type: 'text', content: 'live estimate', provisional: true });

      // Story 37.11 (progressive finalize): provisional === false REPLACES the oldest still-provisional text
      // segment in place with the canonical content and DROPS the badge (a replace, not an append).
      appendStreamingContent('canonical markdown', false);
      expect(useChatStore.getState().streamingSegments).toEqual([{ type: 'text', content: 'canonical markdown' }]);
    });

    it('appends an authoritative (undefined-provisional) chunk as a NEW unmarked segment (grid-behind backstop)', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');
      appendStreamingContent('live estimate', true);
      addStreamingToolCall({ id: 'tx', name: 'Read' });
      // `undefined` (NOT false) = a fresh authoritative block the grid never scraped → append as a new
      // segment, leaving the existing provisional untouched (only `false` finalizes).
      appendStreamingContent('authoritative');
      const segs = useChatStore.getState().streamingSegments;
      expect(segs[segs.length - 1]).toEqual({ type: 'text', content: 'authoritative' });
    });

    it('marks a thinking segment provisional', () => {
      const { startStreaming, addStreamingThinking } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');
      addStreamingThinking('Thought for 5s', true);
      expect(useChatStore.getState().streamingSegments[0]).toEqual({ type: 'thinking', content: 'Thought for 5s', provisional: true });
    });

    it('marks a tool segment provisional from the tool call, and keeps it live after a provisional result flip', () => {
      const { startStreaming, addStreamingToolCall, updateStreamingToolCall } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');
      addStreamingToolCall({ id: 'cli-prov-tool-0', name: 'Write', provisional: true });
      const seg = useChatStore.getState().streamingSegments[0];
      expect(seg).toMatchObject({ type: 'tool', status: 'pending', provisional: true });

      // A provisional grid result flip completes the tool but keeps it live-badged (not finalized).
      updateStreamingToolCall('cli-prov-tool-0', 'done', false, true);
      const flipped = useChatStore.getState().streamingSegments[0];
      expect(flipped).toMatchObject({ type: 'tool', status: 'completed', provisional: true });
    });

    it('leaves an SDK (non-provisional) tool segment unmarked', () => {
      const { startStreaming, addStreamingToolCall } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');
      addStreamingToolCall({ id: 'toolu_1', name: 'Read' });
      expect(useChatStore.getState().streamingSegments[0]).not.toHaveProperty('provisional');
    });

    it('FINALIZES the oldest provisional thinking segment in place when the canonical arrives (provisional=false)', () => {
      const { startStreaming, addStreamingThinking } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');
      addStreamingThinking('Thought for 5s', true);
      addStreamingThinking('raw reasoning', false); // canonical → replace the live scrape, drop the badge
      expect(useChatStore.getState().streamingSegments).toEqual([{ type: 'thinking', content: 'raw reasoning' }]);
    });

    // Story 37.11 (split repair): regression for the provisional-card-orphaned-below-its-finalized-copy bug.
    // The screen scraper delivers ONE logical text block in several chunks (same server messageId). If a tool
    // card lands between two chunks, the block must NOT split into two provisional segments — a split makes the
    // provisional-text count exceed the canonical count, so the FIFO finalize lands each canonical one slot
    // early and the trailing live card is left orphaned under its own finalized copy.
    it('does NOT split one provisional text block (same messageId) into two segments when a tool card interleaves', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Checking the console', true, 'cli-prov-text-14');
      addStreamingToolCall({ id: 'cli-prov-tool-30', name: 'Search', input: {}, provisional: true });
      // Same messageId arrives AGAIN after the tool — must append to the existing block, not start a new one.
      appendStreamingContent(' and the network', true, 'cli-prov-text-14');

      const segs = useChatStore.getState().streamingSegments;
      expect(segs).toHaveLength(2); // [text(block-14), tool] — NOT [text, tool, text]
      expect(segs[0]).toEqual({ type: 'text', content: 'Checking the console and the network', provisional: true, messageId: 'cli-prov-text-14' });
      expect(segs[1].type).toBe('tool');
    });

    it('finalizes a tool-interleaved provisional text block with NO orphaned live card left below', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Checking the console', true, 'cli-prov-text-14');
      addStreamingToolCall({ id: 'cli-prov-tool-30', name: 'Search', input: {}, provisional: true });
      appendStreamingContent(' and the network', true, 'cli-prov-text-14');
      // Canonical for block-14 (different fin-namespace id, provisional=false) replaces the whole block.
      appendStreamingContent('Checking the console and the network status.', false);

      const segs = useChatStore.getState().streamingSegments;
      // Exactly one text segment (finalized, badge dropped) + the tool. No second provisional text card.
      expect(segs.filter((s) => s.type === 'text')).toHaveLength(1);
      expect(segs.some((s) => s.type === 'text' && (s as { provisional?: boolean }).provisional === true)).toBe(false);
      expect(segs[0]).toEqual({ type: 'text', content: 'Checking the console and the network status.' });
    });

    // Defense-in-depth (Fix ①): even if a split slips through, one canonical must absorb ALL same-messageId
    // provisional siblings so none is orphaned. Drive the split directly to exercise the finalize-side guard.
    it('absorbs leftover same-messageId provisional text siblings on finalize (no orphan)', () => {
      const { startStreaming } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');
      // Force a split state directly (two provisional text segments, same messageId, a tool between them).
      useChatStore.setState({
        streamingSegments: [
          { type: 'text', content: 'part one', provisional: true, messageId: 'cli-prov-text-14' },
          { type: 'tool', toolCall: { id: 'cli-prov-tool-30', name: 'Search', input: {} }, status: 'pending', provisional: true },
          { type: 'text', content: ' part two', provisional: true, messageId: 'cli-prov-text-14' },
        ] as never,
      });
      useChatStore.getState().appendStreamingContent('canonical full text', false);

      const segs = useChatStore.getState().streamingSegments;
      expect(segs.filter((s) => s.type === 'text')).toHaveLength(1); // sibling absorbed, not orphaned
      expect(segs.some((s) => s.type === 'text' && (s as { provisional?: boolean }).provisional === true)).toBe(false);
      expect(segs.find((s) => s.type === 'text')).toEqual({ type: 'text', content: 'canonical full text' });
    });

    it('FINALIZES the oldest provisional tool card in place on a non-provisional call (id-independent — real name+input, badge dropped)', () => {
      const { startStreaming, addStreamingToolCall } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');
      // The friendly, name-only provisional card (the screen showed `Update` with no input).
      addStreamingToolCall({ id: 'cli-prov-tool-0', name: 'Update', input: {}, provisional: true });
      // The file-parsed canonical arrives under a DIFFERENT (real `toolu_…`) id + provisional=false — the
      // client binds it to the OLDEST provisional tool (by order, NOT by id), keeping that card's id.
      addStreamingToolCall({ id: 'toolu_real', name: 'Edit', input: { file_path: 'x.ts' }, provisional: false });
      const segs = useChatStore.getState().streamingSegments;
      expect(segs).toHaveLength(1); // finalized in place — NOT a second card
      const seg = segs[0];
      expect(seg.type).toBe('tool');
      if (seg.type === 'tool') {
        expect(seg.toolCall.name).toBe('Edit'); // canonical name replaced the friendly `Update`
        expect(seg.toolCall.input).toEqual({ file_path: 'x.ts' }); // real input filled in (was empty)
      }
      expect(seg).not.toHaveProperty('provisional'); // badge dropped
    });

    it('REPRO snapshot order: provisional → result-flip(complete) → canonical finalize stays completed (not stuck pending)', () => {
      const { startStreaming, addStreamingToolCall, updateStreamingToolCall } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');
      // 1. friendly provisional card (screen: "playwright - Page snapshot")
      addStreamingToolCall({ id: 'cli-prov-tool-54', name: 'playwright - Page snapshot', input: {}, provisional: true });
      // 2. screen flips green FIRST (snapshot completes on screen before the file canonical) — completes, keeps badge
      updateStreamingToolCall('cli-prov-tool-54', 'snapshot text', false, true);
      // 3. canonical finalize LAST (same synthId, real name)
      addStreamingToolCall({ id: 'cli-prov-tool-54', name: 'mcp__playwright__browser_snapshot', input: {}, provisional: false });
      const segs = useChatStore.getState().streamingSegments;
      expect(segs).toHaveLength(1);
      const seg = segs[0];
      expect(seg.type).toBe('tool');
      expect(seg).toMatchObject({ status: 'completed' });
      if (seg.type === 'tool') expect(seg.toolCall.name).toBe('mcp__playwright__browser_snapshot');
    });

    it('does NOT re-badge a finalized tool when the provisional screen-flip result lands AFTER the canonical (Story 37.20 order race)', () => {
      const { startStreaming, addStreamingToolCall, updateStreamingToolCall } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');
      // Provisional screen card for a Bash tool.
      addStreamingToolCall({ id: 'cli-prov-tool-0', name: 'Bash', input: {}, provisional: true });
      // The canonical finalize lands FIRST — the common server order is file-drain USE before the screen
      // green-flip RESULT (confirmed by the real-claude harness: USE toolu_… precedes RESULT cli-prov-…).
      // Badge dropped, synthId kept.
      addStreamingToolCall({ id: 'toolu_real', name: 'Bash', input: { command: 'ls -la' }, provisional: false });
      expect(useChatStore.getState().streamingSegments[0]).not.toHaveProperty('provisional');
      // THEN the screen green-flip result (provisional=true) lands on the kept synthId. It completes the
      // tool but must NOT resurrect the live badge — re-badging a finalized card was the "잠정 잔존" bug.
      updateStreamingToolCall('cli-prov-tool-0', 'done', false, true);
      const seg = useChatStore.getState().streamingSegments[0];
      expect(seg).toMatchObject({ type: 'tool', status: 'completed' });
      expect(seg).not.toHaveProperty('provisional');
    });

    it('chatStore ALONE finalizes the real Glob-turn order correctly (flip-53 before canonical batch, flip-54/55 after) — isolating the bug to the useStreaming queue bypass (L504), NOT chatStore', () => {
      const { startStreaming, addStreamingToolCall, updateStreamingToolCall } = useChatStore.getState();
      startStreaming('session-1', 'msg-1');
      // 3 provisional Search cards (screen scrape)
      addStreamingToolCall({ id: 'cli-prov-tool-53', name: 'Search', input: {}, provisional: true });
      addStreamingToolCall({ id: 'cli-prov-tool-54', name: 'Search', input: {}, provisional: true });
      addStreamingToolCall({ id: 'cli-prov-tool-55', name: 'Search', input: {}, provisional: true });
      // slot 53 flips green (completes) FIRST — before any canonical
      updateStreamingToolCall('cli-prov-tool-53', 'ok', false, true);
      // canonical Glob finalize batch (toolu_ ids, provisional=false) — binds OLDEST provisional by order
      addStreamingToolCall({ id: 'toolu_a', name: 'Glob', input: { pattern: 'a' }, provisional: false });
      addStreamingToolCall({ id: 'toolu_b', name: 'Glob', input: { pattern: 'b' }, provisional: false });
      addStreamingToolCall({ id: 'toolu_c', name: 'Glob', input: { pattern: 'c' }, provisional: false });
      // slot 54/55 flip green AFTER the canonical
      updateStreamingToolCall('cli-prov-tool-54', 'ok', false, true);
      updateStreamingToolCall('cli-prov-tool-55', 'ok', false, true);
      // EXPECT: 3 cards, all completed, none stuck on the live badge, names finalized to Glob
      const tools = useChatStore.getState().streamingSegments.filter((s) => s.type === 'tool');
      expect(tools).toHaveLength(3);
      tools.forEach((t) => {
        expect(t.status).toBe('completed');
        expect(t).not.toHaveProperty('provisional');
        if (t.type === 'tool') expect(t.toolCall.name).toBe('Glob');
      });
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
    it('clears segments immediately on completion (Story 27.1)', () => {
      const { startStreaming, appendStreamingContent, completeStreaming } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Hello');
      completeStreaming();

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingSegments).toHaveLength(0);
      expect(state.streamingSessionId).toBeNull();
      expect(state.streamingMessageId).toBeNull();
    });

    it('does not convert segments to messages (server delivers history via socket)', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall, updateStreamingToolCall, completeStreaming } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Hello text');
      addStreamingToolCall({ id: 'tool-1', name: 'Read', input: { file_path: '/test.ts' } });
      updateStreamingToolCall('tool-1', 'file content');
      appendStreamingContent('After tool');
      completeStreaming();

      const messages = useMessageStore.getState().messages;
      expect(messages).toHaveLength(0);
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

    it('emits chat:abort and clears chain items but does not reset streaming flags', () => {
      const { startStreaming, appendStreamingContent, abortResponse } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('Partial response text');
      abortResponse();

      // abortResponse only notifies the server and clears chain items;
      // streaming flags are cleared later when the server sends stream:complete-messages.
      expect(mockEmit).toHaveBeenCalledWith('chat:abort');
      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(true);
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
      // Streaming flags remain true until server confirms via stream:complete-messages
      expect(useChatStore.getState().isStreaming).toBe(true);
    });

    it('clears chain items on abort', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall, abortResponse } =
        useChatStore.getState();

      startStreaming('session-1', 'msg-1');
      appendStreamingContent('First part');
      addStreamingToolCall({ id: 'tool-1', name: 'Read' });
      appendStreamingContent('Second part');
      abortResponse();

      // Streaming flags remain true; chain items are cleared
      expect(useChatStore.getState().isStreaming).toBe(true);
      expect(mockEmit).toHaveBeenCalledWith('chat:abort');
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

  describe('sendMessage context-overflow pre-check (Story 37.14)', () => {
    // currentTokens (250K) exceeds the effective limit of a 200K window — the overflow condition.
    const overflowUsage = {
      inputTokens: 250000, outputTokens: 0, cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0, totalCostUSD: 0, contextWindow: 200000,
    };

    it('BLOCKS an overflowing resume turn when auto-compact is OFF (user must /compact manually)', () => {
      usePreferencesStore.setState((s) => ({ preferences: { ...s.preferences, autoCompactEnabled: false } }));
      useChatStore.getState().setContextUsage(overflowUsage);
      useChatStore.getState().sendMessage('next', { workingDirectory: '/p', sessionId: 'sid', resume: true });
      // Pre-check fires → nothing is sent to the server.
      expect(mockEmit).not.toHaveBeenCalledWith('chat:send', expect.anything());
    });

    it('does NOT block when auto-compact is ON — lets the message through so compaction can run', () => {
      usePreferencesStore.setState((s) => ({ preferences: { ...s.preferences, autoCompactEnabled: true } }));
      useChatStore.getState().setContextUsage(overflowUsage);
      useChatStore.getState().sendMessage('next', { workingDirectory: '/p', sessionId: 'sid', resume: true });
      // No pre-check block → the message reaches the server, where auto-compact (claude/SDK) handles it.
      expect(mockEmit).toHaveBeenCalledWith('chat:send', expect.objectContaining({ content: 'next', resume: true }));
    });
  });

  describe('N:M tool finalize — anchor-section reconcile (Story 37.21)', () => {
    it('FIX(late-canonical): a provisional tool whose canonical arrives AFTER the next anchor must NOT be pruned — else its canonical mis-binds to the next tool and its completion is lost (Read spinner)', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall, updateStreamingToolCall } = useChatStore.getState();
      startStreaming('s', 'm');
      // SCREEN: msg1 · Read(62) · msg2 · Update(63). The Read's canonical arrives AFTER msg2's anchor.
      appendStreamingContent('msg1', true);
      addStreamingToolCall({ id: 'cli-prov-tool-62', name: 'Read', input: {}, provisional: true });
      appendStreamingContent('msg2', true);
      addStreamingToolCall({ id: 'cli-prov-tool-63', name: 'Update', input: {}, provisional: true });
      // CANONICAL order: msg1 · msg2(anchor) · Read(62) · Update(63). If the anchor prunes the still-
      // provisional Read 62, the Read canonical falls back onto Update 63 (names it 'Read') and the
      // completion addressed to 62 is lost → spinner.
      appendStreamingContent('msg1', false);
      appendStreamingContent('msg2', false);
      addStreamingToolCall({ id: 'cli-prov-tool-62', name: 'Read', input: { file_path: 'x' }, provisional: false });
      addStreamingToolCall({ id: 'cli-prov-tool-63', name: 'Update', input: { file_path: 'y' }, provisional: false });
      updateStreamingToolCall('cli-prov-tool-62', 'ok', false);
      updateStreamingToolCall('cli-prov-tool-63', 'ok', false);
      const tools = useChatStore.getState().streamingSegments.filter((s) => s.type === 'tool');
      const read = tools.find((t) => (t as { toolCall: { name: string } }).toolCall.name === 'Read');
      // FIX: Read survives the anchor, binds its OWN canonical (id 62), and completes — no spinner.
      expect(read).toBeDefined();
      expect((read as { status?: string })?.status).toBe('completed');
    });

    it('FIX: a thinking boundary with 2 provisional tools but 1 canonical before it keeps Glob in the post-thinking section', () => {
      const { startStreaming, appendStreamingContent, addStreamingToolCall, addStreamingThinking } = useChatStore.getState();
      startStreaming('s', 'm');
      // SCREEN (provisional): msg1 · Search · Search · [thinking] · msg2 · Search · msg3
      //   the screen rendered TWO Search cards before the thinking for what the FILE records as ONE Grep
      //   (friendly-name many-to-one + a redraw split, etc.).
      appendStreamingContent('msg1', true);
      addStreamingToolCall({ id: 'cli-prov-tool-0', name: 'Search', input: {}, provisional: true });
      addStreamingToolCall({ id: 'cli-prov-tool-1', name: 'Search', input: {}, provisional: true });
      addStreamingThinking('reasoning', true);
      appendStreamingContent('msg2', true);
      addStreamingToolCall({ id: 'cli-prov-tool-2', name: 'Search', input: {}, provisional: true });
      appendStreamingContent('msg3', true);
      // FILE (canonical), in file order: msg1 · Grep · [thinking] · msg2 · Glob · msg3.
      //   The server (Story 37.21 Step 2) finalizes each canonical tool with the provisional card's OWN synthId
      //   (FIFO slot order): Grep→slot0=cli-prov-tool-0, Glob→slot1=cli-prov-tool-1.
      appendStreamingContent('msg1', false);
      addStreamingToolCall({ id: 'cli-prov-tool-0', name: 'Grep', input: { pattern: 'x' }, provisional: false });
      addStreamingThinking('reasoning', false);
      appendStreamingContent('msg2', false);
      addStreamingToolCall({ id: 'cli-prov-tool-1', name: 'Glob', input: { pattern: 'y' }, provisional: false });
      appendStreamingContent('msg3', false);

      const segs = useChatStore.getState().streamingSegments;
      const thinkingIdx = segs.findIndex((s) => s.type === 'thinking');
      const tools = segs.filter((s) => s.type === 'tool');

      // FIX 1: the orphan provisional tool (screen had 2 before thinking, file had 1) was PRUNED at the
      // thinking-anchor finalize → exactly 2 tool cards remain, none stuck on the live badge.
      expect(tools).toHaveLength(2);
      expect(tools.some((t) => (t as { provisional?: boolean }).provisional === true)).toBe(false);

      // FIX 2: each tool lands in its correct section — Grep BEFORE thinking, Glob AFTER thinking.
      const grepIdx = segs.indexOf(segs.find((s) => s.type === 'tool' && (s as { toolCall: { name: string } }).toolCall.name === 'Grep')!);
      const globIdx = segs.indexOf(segs.find((s) => s.type === 'tool' && (s as { toolCall: { name: string } }).toolCall.name === 'Glob')!);
      expect(grepIdx).toBeLessThan(thinkingIdx);
      expect(globIdx).toBeGreaterThan(thinkingIdx);
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

  // Story 25.8: rewindFiles tests
  describe('rewindFiles', () => {
    beforeEach(() => {
      mockEmit.mockClear();
      useChatStore.setState({ isRewinding: false, lastDryRunResult: null });
    });

    it('emits session:rewind-files event via WebSocket', () => {
      const { rewindFiles } = useChatStore.getState();
      rewindFiles('session-1', '/path', 'msg-uuid-1', true);

      expect(mockEmit).toHaveBeenCalledWith('session:rewind-files', {
        sessionId: 'session-1',
        workingDirectory: '/path',
        messageUuid: 'msg-uuid-1',
        dryRun: true,
      });
    });

    it('sets isRewinding to true when called', () => {
      const { rewindFiles } = useChatStore.getState();
      rewindFiles('session-1', '/path', 'msg-uuid-1');

      expect(useChatStore.getState().isRewinding).toBe(true);
    });

    it('prevents duplicate dryRun calls when isRewinding is true', () => {
      useChatStore.setState({ isRewinding: true });
      const { rewindFiles } = useChatStore.getState();
      // Guard only blocks new dryRun requests; actual rewind (dryRun=false/undefined) is allowed
      rewindFiles('session-1', '/path', 'msg-uuid-1', true);

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('setIsRewinding resets isRewinding state', () => {
      useChatStore.setState({ isRewinding: true });
      useChatStore.getState().setIsRewinding(false);

      expect(useChatStore.getState().isRewinding).toBe(false);
    });

    it('clearLastDryRunResult clears the dryRun result', () => {
      useChatStore.setState({
        lastDryRunResult: { filesChanged: ['a.ts'], insertions: 1, deletions: 0 },
      });
      useChatStore.getState().clearLastDryRunResult();

      expect(useChatStore.getState().lastDryRunResult).toBeNull();
    });
  });

  // Story 25.11: Fork session tests
  describe('forkSession', () => {
    it('includes forkSession in chat:send payload when option is true', () => {
      const { sendMessage } = useChatStore.getState();

      sendMessage('Continue from here', {
        workingDirectory: '/path/to/project',
        sessionId: 'session-123',
        resume: true,
        resumeSessionAt: 'assistant-uuid',
        forkSession: true,
      });

      expect(mockEmit).toHaveBeenCalledWith('chat:send', expect.objectContaining({
        content: 'Continue from here',
        forkSession: true,
        resumeSessionAt: 'assistant-uuid',
        resume: true,
        sessionId: 'session-123',
      }));
    });

    it('does not include forkSession when option is falsy', () => {
      const { sendMessage } = useChatStore.getState();

      sendMessage('Hello', {
        workingDirectory: '/path/to/project',
        sessionId: 'session-123',
        resume: true,
      });

      const payload = mockEmit.mock.calls[0][1];
      expect(payload.forkSession).toBeUndefined();
    });

    it('setForkedSessionId sets the forkedSessionId state', () => {
      useChatStore.getState().setForkedSessionId('new-session-id');
      expect(useChatStore.getState().forkedSessionId).toBe('new-session-id');
    });

    it('clearForkedSessionId resets forkedSessionId to null', () => {
      useChatStore.setState({ forkedSessionId: 'some-id' });
      useChatStore.getState().clearForkedSessionId();
      expect(useChatStore.getState().forkedSessionId).toBeNull();
    });
  });

  describe('generationProgress (Story 32.7 — transient CLI progress)', () => {
    it('initial state is null', () => {
      expect(useChatStore.getState().generationProgress).toBeNull();
    });

    it('setGenerationProgress stores the value and clears with null', () => {
      useChatStore.getState().setGenerationProgress({ tokens: 246, elapsedSeconds: 6 });
      expect(useChatStore.getState().generationProgress).toEqual({ tokens: 246, elapsedSeconds: 6 });
      useChatStore.getState().setGenerationProgress(null);
      expect(useChatStore.getState().generationProgress).toBeNull();
    });

    it('preserves the thinking-phase flag (Story 37.11 — drives the "Thinking…" progress label)', () => {
      // verbose-mode claude paints no live thinking content — the spinner phase flag is the only live
      // "thinking" signal; the store must carry it so MessageArea can label the live indicator streaming.thinking.
      useChatStore.getState().setGenerationProgress({ tokens: 143, elapsedSeconds: 18, thinking: true });
      expect(useChatStore.getState().generationProgress).toEqual({ tokens: 143, elapsedSeconds: 18, thinking: true });
    });

    it('startStreaming clears any stale progress', () => {
      useChatStore.getState().setGenerationProgress({ tokens: 100, elapsedSeconds: 3 });
      useChatStore.getState().startStreaming('session-1', 'msg-1');
      expect(useChatStore.getState().generationProgress).toBeNull();
    });

    it('completeStreaming clears progress (no leak)', () => {
      useChatStore.getState().startStreaming('session-1', 'msg-1');
      useChatStore.getState().setGenerationProgress({ tokens: 500, elapsedSeconds: 12 });
      useChatStore.getState().completeStreaming();
      expect(useChatStore.getState().generationProgress).toBeNull();
    });

    it('abortStreaming clears progress', () => {
      useChatStore.getState().startStreaming('session-1', 'msg-1');
      useChatStore.getState().setGenerationProgress({ tokens: 500, elapsedSeconds: 12 });
      useChatStore.getState().abortStreaming();
      expect(useChatStore.getState().generationProgress).toBeNull();
    });
  });
});
