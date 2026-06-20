/**
 * useStreaming Hook - Manages real-time streaming state via WebSocket
 * [Source: Story 4.5 - Task 2, Story 4.8 - Task 2]
 *
 * Features:
 * - WebSocket event listeners for message:chunk and message:complete
 * - Segment-based streaming (text/tool interleaved)
 * - Reconnection handling with streaming state recovery
 * - Escape key to abort streaming (Story 5.4: uses abortResponse)
 * - Ctrl+C / Cmd+C to abort streaming when no text selected (Story 5.4)
 * - Automatic cleanup on unmount
 */

import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import i18n from '../i18n';
import { getSocket } from '../services/socket';
import { useChatStore } from '../stores/chatStore';
import { useMessageStore } from '../stores/messageStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { debugLog, setCLILogSocket } from '../utils/debugLogger';

// Module-scoped cache: SDK returns filesChanged=0 for actual rewind,
// so we remember the count from the preceding dryRun for the success toast.
// Must live outside useEffect to survive re-renders that re-run the effect.
let __dryRunFileCount = 0;
import { useChainStore } from '../stores/chainStore';
import type { StreamChunk, Message, ChatUsage, PermissionRequest, ToolResult, CompactMetadata, TaskNotificationData, SubscriptionRateLimit, ApiHealthStatus, PromptChainItem, PermissionMode, HistoryMessage, ImageRef } from '@hammoc/shared';
import type { InteractiveStatus, StreamingSegment, StreamingToolCall, ResultErrorData } from '../stores/chatStore';

/**
 * Convert in-flight streaming segments into history messages so a give-up teardown does not
 * discard an un-persisted turn. Used by the reconnect give-up timeout: when the socket dropped
 * before the turn was confirmed (mobile sleep/wake) no stream:complete-messages / stream:history
 * ever landed, so the answer lives ONLY as live segments — completeStreaming would otherwise wipe
 * it and the whole turn vanishes. Mirrors the buffer-replay conversion's id/shape conventions; a
 * later authoritative reload replaces these via setMessages, so any minor divergence self-corrects.
 * Transient UI cards (system / tool_summary / task_notification / result_error) are not part of the
 * persisted transcript and are intentionally skipped.
 */
function salvageSegmentsToMessages(
  segments: StreamingSegment[],
  messageId: string | null,
  baseTs: number,
): HistoryMessage[] {
  const out: HistoryMessage[] = [];
  const mid = messageId ?? `salvage-${baseTs}`;
  let pendingThinking: string | undefined;
  for (const seg of segments) {
    const ts = new Date(baseTs + out.length).toISOString();
    if (seg.type === 'thinking') {
      pendingThinking = seg.content;
    } else if (seg.type === 'text') {
      out.push({ id: `${mid}-text-${out.length}`, type: 'assistant', content: seg.content, timestamp: ts, thinking: pendingThinking });
      pendingThinking = undefined;
    } else if (seg.type === 'tool') {
      out.push({
        id: `${mid}-tool-${seg.toolCall.id}`,
        type: 'tool_use',
        content: `Calling ${seg.toolCall.name}`,
        timestamp: ts,
        toolName: seg.toolCall.name,
        toolInput: seg.toolCall.input,
        thinking: pendingThinking,
        ...(seg.status !== 'pending' && seg.toolCall.output !== undefined && {
          toolResult: {
            success: seg.status === 'completed',
            output: seg.status === 'completed' ? seg.toolCall.output : undefined,
            error: seg.status === 'error' ? seg.toolCall.output : undefined,
          },
        }),
      });
      pendingThinking = undefined;
    } else if (seg.type === 'interactive') {
      const tcId = seg.toolCall?.id || seg.id;
      out.push({
        id: `${mid}-tool-${tcId}`,
        type: 'tool_use',
        content: `Calling ${seg.toolCall?.name || 'AskUserQuestion'}`,
        timestamp: ts,
        toolName: seg.toolCall?.name || 'AskUserQuestion',
        toolInput: seg.toolCall?.input,
        thinking: pendingThinking,
      });
      pendingThinking = undefined;
    }
  }
  if (pendingThinking) {
    out.push({ id: `${mid}-thinking`, type: 'assistant', content: '', timestamp: new Date(baseTs + out.length).toISOString(), thinking: pendingThinking });
  }
  return out;
}

export function useStreaming() {
  const {
    startStreaming,
    appendStreamingContent,
    addStreamingThinking,
    addStreamingToolCall,
    updateStreamingToolCallInput,
    updateStreamingToolCall,
    completeStreaming,
    abortStreaming,
    abortResponse,
    setContextUsage,
    updateStreamingSessionId,
    addInteractiveSegment,
    setToolPermission,
    addSystemSegment,
    updateToolProgress,
    addTaskNotification,
    addToolSummary,
    addResultError,
    restoreStreaming,
  } = useChatStore();

  // Track seen permission request IDs to avoid duplicates on reconnect
  const seenPermissionIds = useRef(new Set<string>());


  // Handle keyboard shortcuts to abort streaming (Story 5.4)
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!useChatStore.getState().isStreaming) return;

    // Escape key → abort (abortResponse handles fetch+clear internally)
    if (event.key === 'Escape') {
      event.preventDefault();
      abortResponse();
      return;
    }

    // Ctrl+C (Windows/Linux) or Cmd+C (macOS) → abort (only if no text selected)
    if (event.key === 'c' && (event.ctrlKey || event.metaKey)) {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        event.preventDefault();
        abortResponse();
      }
      // If text is selected, let default copy behavior proceed
    }
  }, [abortResponse]);

  useEffect(() => {
    const socket = getSocket();
    setCLILogSocket(socket);
    let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const RECONNECT_TIMEOUT = 10000; // 10 seconds

    // --- Frame-based chunk coalescing ---
    // Incoming text chunks are accumulated into a buffer and flushed once per
    // animation frame. This prevents multiple React state updates per frame
    // (reducing stutter) while keeping content appearance near-instant (no
    // artificial typing delay). Before tool/thinking/system segments are
    // inserted, the buffer is flushed so text stays in its correct segment.
    let frameBuffer = '';
    let frameRequestId: number | null = null;
    // Story 37.11 (AC4): the provisional state of the coalesced frame buffer. CLI streaming text is
    // provisional (grid screen-scrape) until the authoritative file-drain / reload; SDK text never
    // is. A frame's chunks share one source, so the latest chunk's flag is the segment's flag.
    let frameBufferProvisional: boolean | undefined;
    let frameBufferMessageId: string | undefined;

    // --- Frame coalescing (all CLI/SDK streaming text) ---
    // CLI mode delivers assistant text one COMPLETED block at a time; SDK mode streams real
    // tokens. Either way, chunks are coalesced into one state update per animation frame so
    // rapid arrivals don't thrash React. (The old opt-in synthetic-typing/stagger layer was
    // removed — the provisional-card algorithm already conveys live progress, and queueing the
    // tool-completion behind a typing queue could leave a tool card spinning indefinitely.)
    const flushFrameBuffer = () => {
      frameRequestId = null;
      if (frameBuffer.length > 0) {
        const text = frameBuffer;
        const prov = frameBufferProvisional;
        const mid = frameBufferMessageId;
        frameBuffer = '';
        frameBufferProvisional = undefined;
        frameBufferMessageId = undefined;
        appendStreamingContent(text, prov, mid);
      }
    };

    /** Enqueue text content for coalesced rendering (one state update per frame) */
    const enqueueChunk = (content: string, provisional?: boolean, messageId?: string) => {
      if (frameBuffer.length > 0 && frameBufferMessageId !== messageId) {
        flushChunkQueue();
      }
      frameBuffer += content;
      // Story 37.11: a frame's chunks share one source; the latest flag wins for the coalesced segment.
      frameBufferProvisional = provisional;
      frameBufferMessageId = messageId;
      if (frameRequestId === null) {
        frameRequestId = requestAnimationFrame(flushFrameBuffer);
      }
    };

    /** Flush all buffered text immediately (before segment insertion / completion) */
    const flushChunkQueue = () => {
      if (frameRequestId !== null) {
        cancelAnimationFrame(frameRequestId);
        frameRequestId = null;
      }
      if (frameBuffer.length > 0) {
        const text = frameBuffer;
        const prov = frameBufferProvisional;
        const mid = frameBufferMessageId;
        frameBuffer = '';
        frameBufferProvisional = undefined;
        frameBufferMessageId = undefined;
        appendStreamingContent(text, prov, mid);
      }
    };

    /** Discard all pending text (for abort/error) */
    const clearChunkQueue = () => {
      frameBuffer = '';
      frameBufferProvisional = undefined;
      frameBufferMessageId = undefined;
      if (frameRequestId !== null) {
        cancelAnimationFrame(frameRequestId);
        frameRequestId = null;
      }
    };

    /**
     * Segment helpers. A NEW card (reveal) flushes any buffered text first so the card is ordered
     * AFTER the text being typed; an UPDATE applies in place. Both run immediately — there is no
     * typewriter/stagger to wait on.
     */
    const revealSegment = (mutate: () => void) => {
      flushChunkQueue();
      mutate();
    };
    const updateSegment = (mutate: () => void) => {
      mutate();
    };

    // Handle user:message — server broadcasts to ALL sockets (including sender).
    // No dedup needed — this is the single source of truth for user messages.
    const handleUserMessage = (data: { content: string; sessionId: string; timestamp?: string; images?: ImageRef[] }) => {
      if (!data.content) return;
      debugLog.stream('user:message received', {
        sessionId: data.sessionId,
        contentPreview: data.content.slice(0, 50),
        msgCount: useMessageStore.getState().messages.length,
      });
      // Auto-exit branch viewer when another browser sends a message (AC: 8)
      if (useChatStore.getState().isBranchViewerMode) {
        useChatStore.getState().exitBranchViewer(true);
      }
      useMessageStore.getState().addUserMessage(data.content, data.images, data.timestamp);
      // Detect /compact command and restore compacting indicator
      if (data.content.trim() === '/compact') {
        useChatStore.setState({ isCompacting: true });
      }

      // Passive viewer: start optimistic streaming delay (same as sendMessage).
      // If this browser sent the message, isStreaming is already true from sendMessage.
      const chatState = useChatStore.getState();
      if (!chatState.isStreaming) {
        useChatStore.getState().startStreamingDelay(data.sessionId);
      }
    };

    // Handle incoming thinking chunks
    const handleThinkingChunk = (data: { content: string; provisional?: boolean }) => {
      const state = useChatStore.getState();
      // Start streaming if not yet active — covers both first chunk (sessionId null)
      // and passive viewer (another browser set streamingSessionId via session:resumed
      // but isStreaming is still false because sendMessage was never called locally)
      if (!state.isStreaming || state.streamingSessionId === null) {
        startStreaming('pending', 'pending');
      }
      // Compaction phase is over once real content arrives
      if (state.isCompacting) {
        useChatStore.setState({ isCompacting: false });
      }
      // Reveal the thinking card: flush any buffered text first, then insert. Story 37.11: provisional flag.
      debugLog.cliLog('recv-thinking', { len: data.content.length, provisional: data.provisional, segCount: useChatStore.getState().streamingSegments.length });
      revealSegment(() => addStreamingThinking(data.content, data.provisional));
    };

    // Handle incoming stream chunks
    const handleChunk = (data: StreamChunk) => {
      const state = useChatStore.getState();
      debugLog.stream('message:chunk', {
        sessionId: data.sessionId,
        messageId: data.messageId,
        contentLen: data.content.length,
        isStreaming: state.isStreaming,
        streamingSessionId: state.streamingSessionId,
        segmentCount: state.streamingSegments.length,
      });

      // Safety net: drop chunks from a session we're not viewing or streaming.
      // Covers the race window between client-side cleanup and server-side detach.
      if (data.sessionId) {
        if (state.streamingSessionId && state.streamingSessionId !== 'pending'
            && state.streamingSessionId !== data.sessionId) {
          debugLog.stream('chunk dropped: streamingSessionId mismatch', {
            streaming: state.streamingSessionId, chunk: data.sessionId,
          });
          return;
        }
        if (!state.isStreaming) {
          const viewingSessionId = useMessageStore.getState().currentSessionId;
          if (viewingSessionId && viewingSessionId !== data.sessionId) {
            debugLog.stream('chunk dropped: viewingSessionId mismatch', {
              viewing: viewingSessionId, chunk: data.sessionId,
            });
            return;
          }
        }
      }

      if (!state.isStreaming || state.streamingSessionId === null) {
        // First chunk or passive viewer — initialize streaming state.
        // Passive viewers (other browsers) receive session:resumed which sets
        // streamingSessionId but not isStreaming, so we must also check isStreaming.
        startStreaming(data.sessionId, data.messageId);
      } else if (state.streamingSessionId === 'pending') {
        // Update sessionId without resetting segments (preserves thinking content)
        updateStreamingSessionId(data.sessionId);
      }
      // Compaction phase is over once real content arrives
      if (useChatStore.getState().isCompacting) {
        useChatStore.setState({ isCompacting: false });
      }
      // Auto-resolve any stale 'waiting' interactive segments — if the SDK is
      // still generating text, all prior questions/permissions were already handled.
      // This is a safety net for reconnect replay scenarios.
      autoResolveStaleInteractiveSegments();

      // Story 37.11: a canonical (provisional === false) block FINALIZES the provisional text segment in
      // place. It runs through revealSegment (which flushes buffered text first) so it lands right after
      // the provisional segment exists → in-place replace, never a duplicate.
      debugLog.cliLog('recv-text', { len: data.content.length, provisional: data.provisional, messageId: data.messageId, preview: data.content.slice(0, 60) });
      if (data.provisional === false) {
        revealSegment(() => appendStreamingContent(data.content, false, data.messageId));
      } else {
        enqueueChunk(data.content, data.provisional, data.messageId);
      }
    };

    /**
     * Auto-resolve interactive segments still in 'waiting' status.
     * During reconnect buffer replay, permission:request events recreate cards
     * as 'waiting', but subsequent events prove the SDK already continued.
     * Called when new content (chunks/tool calls) arrives after those segments.
     */
    const autoResolveStaleInteractiveSegments = () => {
      const segments = useChatStore.getState().streamingSegments;
      const hasStale = segments.some(
        (s) => s.type === 'interactive' && s.status === 'waiting'
      );
      if (!hasStale) return;

      const updated = segments.map((seg) => {
        if (seg.type === 'interactive' && seg.status === 'waiting') {
          return {
            ...seg,
            status: 'responded' as InteractiveStatus,
            response: i18n.t('notification:streaming.respondedBeforeReconnect'),
          };
        }
        return seg;
      });
      useChatStore.setState({ streamingSegments: updated });
    };

    // Handle stream completion
    const handleComplete = async (data: Message) => {
      // Flush any buffered chunks before completing.
      flushChunkQueue();

      // Update streamingSessionId with the actual sessionId from result
      // (SDK doesn't send 'init' message, so sessionId only comes in 'result')
      const chatState = useChatStore.getState();
      debugLog.stream('message:complete', {
        sessionId: data.sessionId,
        isStreaming: chatState.isStreaming,
        streamingSessionId: chatState.streamingSessionId,
        segmentCount: chatState.streamingSegments.length,
        msgCount: useMessageStore.getState().messages.length,
        hasUsage: !!data.usage,
      });

      // Safety net: drop completion from a different session (same logic as handleChunk)
      if (data.sessionId) {
        if (chatState.streamingSessionId && chatState.streamingSessionId !== 'pending'
            && chatState.streamingSessionId !== data.sessionId) {
          debugLog.stream('complete dropped: streamingSessionId mismatch', {
            streaming: chatState.streamingSessionId, complete: data.sessionId,
          });
          return;
        }
        if (!chatState.isStreaming) {
          const viewingSessionId = useMessageStore.getState().currentSessionId;
          if (viewingSessionId && viewingSessionId !== data.sessionId) {
            debugLog.stream('complete dropped: viewingSessionId mismatch', {
              viewing: viewingSessionId, complete: data.sessionId,
            });
            return;
          }
        }
      }
      // Update sessionId if not yet set, pending, or empty string (from no-init resume mode)
      // Use updateStreamingSessionId to avoid resetting segments
      if (data.sessionId && (!chatState.streamingSessionId || chatState.streamingSessionId === 'pending')) {
        updateStreamingSessionId(data.sessionId);
      }

      // Update streamingMessageId with the actual message ID from completion
      if (data.id) {
        useChatStore.setState({ streamingMessageId: data.id });
        debugLog.stream('message:complete → set streamingMessageId', { messageId: data.id });
      }

      // Extract metadata from result usage (contextWindow, model, totalCostUSD).
      // Token counts are NOT used here — result usage is cumulative billing data.
      // Accurate per-turn context usage comes from assistant:usage events instead.
      if (data.usage) {
        debugLog.stream('usage from message:complete (metadata only)', {
          contextWindow: data.usage.contextWindow,
          model: data.usage.model,
          totalCostUSD: data.usage.totalCostUSD,
        });
        const existing = useChatStore.getState().contextUsage;
        if (existing) {
          // Merge metadata into existing assistant:usage data
          setContextUsage({
            ...existing,
            contextWindow: data.usage.contextWindow,
            totalCostUSD: data.usage.totalCostUSD,
            model: data.usage.model ?? existing.model,
          });
        } else {
          // No assistant:usage received yet — use result data as fallback
          setContextUsage(data.usage);
        }
        if (data.usage.model) {
          useChatStore.getState().setActiveModel(data.usage.model);
        }
      }

      // Don't call completeStreaming() — stream:complete-messages handles it
      // after server confirms JSONL flush.
    };

    // Handle tool call start - add tool segment (skip AskUserQuestion — handled via permission:request)
    const handleToolCall = (data: { id: string; name: string; input?: Record<string, unknown>; startedAt?: number; provisional?: boolean }) => {
      if (data.name === 'AskUserQuestion') {
        debugLog.cliLog('recv-tool-skip', { name: data.name, id: data.id, reason: 'AskUserQuestion' });
        return;
      }
      debugLog.cliLog('recv-tool', { name: data.name, id: data.id, provisional: data.provisional });

      // Reveal the tool card. Synthetic mode: queue it so it bubbles in AFTER the assistant
      // text finishes typing (staggered). Otherwise: flush buffered text first to prevent the
      // response from splitting, then insert immediately (original behavior).
      // Story 37.11/37.20: a CLI grid tool card is provisional (name-only, empty input until the file
      // confirms it). The canonical re-sends with `provisional: false` to FINALIZE it in place (real
      // name+input, badge dropped) — both go through revealSegment so the finalize lands on the same
      // ordered chain as the provisional card (flush buffered text first, then apply).
      const applyTool = () => addStreamingToolCall({
        id: data.id,
        name: data.name,
        input: data.input,
        startedAt: data.startedAt,
        ...(data.provisional !== undefined ? { provisional: data.provisional } : {}),
      });
      revealSegment(applyTool);
    };

    // Handle permission:request event — add interactive segment for permission or question (Story 7.1)
    const handlePermissionRequest = (data: PermissionRequest) => {
      // Flush pending text before interactive/permission segment
      flushChunkQueue();
      const isQuestion = data.toolCall.name === 'AskUserQuestion';
      debugLog.cliLog('recv-permission', {
        permissionId: data.id,
        toolName: data.toolCall.name,
        isQuestion,
        standalone: !!(data as { standalone?: boolean }).standalone,
        hasQuestions: isQuestion && !!(data.toolCall.input?.questions),
        alreadySeen: seenPermissionIds.current.has(data.id),
        segCount: useChatStore.getState().streamingSegments.length,
      });
      // Ignore duplicate requests (reconnect guard)
      if (seenPermissionIds.current.has(data.id)) return;
      seenPermissionIds.current.add(data.id);

      // AskUserQuestion: show question card with choices from full input
      if (data.toolCall.name === 'AskUserQuestion' && data.toolCall.input?.questions) {
        const rawQuestions = data.toolCall.input.questions as Array<{
          question: string;
          header: string;
          options: Array<{ label: string; description?: string }>;
          multiSelect?: boolean;
        }>;
        if (rawQuestions.length > 0) {
          // Map all questions with their choices
          const mappedQuestions = rawQuestions.map((q) => ({
            question: q.question,
            header: q.header,
            choices: q.options.map((opt) => ({
              label: opt.label,
              description: opt.description,
              value: opt.label,
            })),
            multiSelect: q.multiSelect,
          }));
          // First question's choices as top-level for backward compat
          const firstQuestion = mappedQuestions[0];
          // Ride the presentation queue (delay 0 = no stagger) so the card lands AFTER any
          // Ride revealSegment so the question card lands AFTER any preceding text (flushed first),
          // not ahead of its own answer.
          revealSegment(() => addInteractiveSegment({
            id: data.id,
            interactionType: 'question',
            toolCall: { id: data.toolCall.id, name: data.toolCall.name, input: data.toolCall.input },
            choices: firstQuestion.choices,
            questions: mappedQuestions,
            multiSelect: firstQuestion.multiSelect,
          }));
          return;
        }
      }

      // CLI engine path: no tool:call was emitted, so there is no tool segment to attach
      // to. Render the permission as an INDEPENDENT card — the same mechanism
      // AskUserQuestion already uses. SDK mode leaves `standalone` falsy and keeps the
      // tool-attached behavior below.
      if (data.standalone) {
        // Ride revealSegment so the standalone permission card lands after any preceding text/cards.
        revealSegment(() => addInteractiveSegment({
          id: data.id,
          interactionType: 'permission',
          toolCall: { id: data.toolCall.id, name: data.toolCall.name, input: data.toolCall.input },
          choices: [],
        }));
        return;
      }

      // Update tool input with enriched data from permission request
      // (e.g. ExitPlanMode's normalizeToolInput injects 'plan' field)
      if (data.toolCall.input) {
        updateStreamingToolCallInput(data.toolCall.id, data.toolCall.input, true);
      }
      // Default: attach permission to existing tool segment
      setToolPermission(data.toolCall.id, data.id);
    };

    // Handle permission:resolved — proactive broadcast from server when another
    // viewer resolves a permission. Includes the actual approve/deny result so
    // this client can update its tool/interactive card to the correct state.
    const handlePermissionResolved = (data: { requestId: string; approved: boolean; interactionType: 'permission' | 'question'; response?: string | string[] | Record<string, string | string[]> }) => {
      const segments = useChatStore.getState().streamingSegments;
      let changed = false;
      const updated = segments.map((seg) => {
        if (data.interactionType === 'question') {
          // AskUserQuestion — mark as responded with actual answer
          if (seg.type === 'interactive' && seg.id === data.requestId) {
            changed = true;
            // Format response for display
            let displayResponse: string;
            if (typeof data.response === 'string') {
              displayResponse = data.response;
            } else if (Array.isArray(data.response)) {
              displayResponse = data.response.join(', ');
            } else if (data.response && typeof data.response === 'object') {
              displayResponse = Object.values(data.response).flat().join(', ');
            } else {
              displayResponse = i18n.t('notification:streaming.respondedInOtherBrowser');
            }
            return { ...seg, status: 'responded' as InteractiveStatus, response: displayResponse };
          }
        } else {
          // Tool permission — update to actual approve/deny result
          if (seg.type === 'tool' && seg.permissionId === data.requestId) {
            changed = true;
            return { ...seg, permissionStatus: data.approved ? 'approved' as const : 'denied' as const };
          }
        }
        return seg;
      });
      if (changed) {
        useChatStore.setState({ streamingSegments: updated });
      }
    };

    // Handle permission:already-resolved — fallback for race condition where
    // this client clicks approve/deny at nearly the same time as another viewer.
    // By the time this arrives, the local segment is already in a terminal state
    // (respondToInteractive / respondToolPermission set state immediately).
    // The toast informs the user their response was ignored.
    const handlePermissionAlreadyResolved = (_data: { requestId: string }) => {
      toast.info(i18n.t('notification:streaming.alreadyResponded'));
    };

    // Handle tool input update (for real-time file path display)
    const handleToolInputUpdate = (data: { toolCallId: string; input: Record<string, unknown> }) => {
      updateSegment(() => updateStreamingToolCallInput(data.toolCallId, data.input));
    };

    // Handle tool result - update tool segment status
    const handleToolResult = (data: { toolCallId: string; result: ToolResult; provisional?: boolean }) => {
      updateSegment(() => {
        const { success, output, error } = data.result;
        // Story 37.11 (AC4): a provisional grid flip keeps the card live-badged (not finalized early).
        updateStreamingToolCall(data.toolCallId, output ?? error ?? '', !success, data.provisional);

        // Auto-resolve interactive segments (e.g., AskUserQuestion) associated
        // with this tool call. During reconnect replay, tool:result arrives for
        // questions that were already answered — mark them as responded.
        const segments = useChatStore.getState().streamingSegments;
        const staleIdx = segments.findIndex(
          (s) => s.type === 'interactive' && s.status === 'waiting' &&
                 s.toolCall?.id === data.toolCallId
        );
        if (staleIdx !== -1) {
          const updated = [...segments];
          const seg = updated[staleIdx];
          if (seg.type === 'interactive') {
            updated[staleIdx] = {
              ...seg,
              status: 'responded' as InteractiveStatus,
              response: i18n.t('notification:streaming.respondedBeforeReconnect'),
            };
            useChatStore.setState({ streamingSegments: updated });
          }
        }
      });
    };

    // Handle context compaction notification
    const handleCompact = (data: CompactMetadata) => {
      // Story 27.1: cooldown guard removed — messages arrive via WebSocket only
      // Update context usage with actual pre-compact token count from SDK
      // This is the real context size when compact was triggered (more accurate than stale assistant:usage)
      if (data.preTokens > 0) {
        const existing = useChatStore.getState().contextUsage;
        const contextWindow = existing?.contextWindow ?? 0;
        setContextUsage({
          inputTokens: data.preTokens,
          outputTokens: existing?.outputTokens ?? 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          totalCostUSD: existing?.totalCostUSD ?? 0,
          contextWindow,
          model: existing?.model,
        });
      }
      useChatStore.setState({ isCompacting: true });
      revealSegment(() => addSystemSegment(`Context compaction (${data.trigger})...`, 'compact'));
    };

    // Handle tool:progress — update elapsed time on existing tool segment
    const handleToolProgress = (data: { toolUseId: string; elapsedTimeSeconds: number; toolName: string }) => {
      updateSegment(() => updateToolProgress(data.toolUseId, data.elapsedTimeSeconds));
    };

    // Story 32.7: handle generation:progress — store the transient CLI "↓ N tokens · Ns"
    // signal. Live-only (not buffered/replayed); cleared by start/complete/abort.
    // getState() avoids adding to the effect's dependency array (matches handleSessionForked).
    const handleGenerationProgress = (data: { tokens: number; elapsedSeconds: number; thinking?: boolean }) => {
      useChatStore.getState().setGenerationProgress(data);
    };

    // Story 36.2: handle cli:phase — store the transient CLI boot/inject phase
    // (launching/submitting/waiting/null). Live-only, same lifecycle as generation:progress.
    const handleCliPhase = (data: { phase: 'launching' | 'submitting' | 'waiting' | null }) => {
      useChatStore.getState().setCliPhase(data.phase);
    };

    // Soft CLI screen-stall signal — the server's screen-frame watchdog says the reconstructed CLI
    // screen has shown no change for the configured window (looks frozen). Advisory: the UI surfaces
    // a "looks stuck — Stop?" affordance; no auto-abort. Cleared when the screen moves / turn ends,
    // and reset locally on completeStreaming/abortStreaming alongside cliPhase.
    const handleScreenStall = (data: { sessionId: string; stalled: boolean }) => {
      useChatStore.getState().setCliScreenStalled(data.stalled);
    };

    const handleBackgroundWaiting = (data: { sessionId: string; waiting: boolean; pendingCount: number }) => {
      const viewingSessionId = useMessageStore.getState().currentSessionId;
      if (viewingSessionId && data.sessionId !== viewingSessionId) return;
      useChatStore.getState().setBackgroundWaiting(data.waiting, data.pendingCount);
    };

    // Handle system:task-notification — add task notification segment
    const handleTaskNotification = (data: TaskNotificationData) => {
      revealSegment(() => addTaskNotification(data));
    };

    // Handle tool:summary — add tool summary segment
    const handleToolSummary = (data: { summary: string; precedingToolUseIds: string[] }) => {
      revealSegment(() => addToolSummary(data.summary, data.precedingToolUseIds));
    };

    // Handle result:error — add result error segment before completion
    const handleResultError = (data: { subtype: string; errors?: string[]; totalCostUSD?: number; numTurns?: number; result: string }) => {
      revealSegment(() => addResultError(data));
    };

    // Handle session:created / session:resumed — earliest streaming signal from server.
    // For the active sender (browser A), sendMessage already set isStreaming=true, so we
    // just update the sessionId. For passive viewers (browser B), this is the first
    // reliable signal that a stream exists — start streaming here so all subsequent
    // events (tool:call, permission:request, message:chunk) render correctly.
    const handleSessionInit = (data: { sessionId: string; model?: string }) => {
      const state = useChatStore.getState();
      debugLog.stream('session:init', {
        sessionId: data.sessionId,
        model: data.model,
        currentStreamingSessionId: state.streamingSessionId,
        isStreaming: state.isStreaming,
      });
      if (!state.streamingSessionId) {
        // First session signal — start visual streaming state with actual sessionId.
        // For sender (A): isStreaming is already true (from sendMessage) but no visual
        // indicator yet. For passive viewer (B): nothing set yet.
        // Both enter visual streaming at the same time (server-confirmed).
        startStreaming(data.sessionId, 'pending');
      } else if (state.streamingSessionId === 'pending') {
        // Already started with 'pending' (e.g., thinking chunk arrived first), update to real ID
        updateStreamingSessionId(data.sessionId);
      }
    };

    // Handle context usage update from result message (cumulative billing data + model info)
    const handleContextUsage = (data: ChatUsage) => {
      debugLog.stream('context:usage received', {
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        cacheCreationInputTokens: data.cacheCreationInputTokens,
        cacheReadInputTokens: data.cacheReadInputTokens,
        model: data.model,
        totalCostUSD: data.totalCostUSD,
      });
      // Only use result usage for model extraction and cost tracking;
      // context window percentage comes from assistant:usage instead
      if (data.model) {
        useChatStore.getState().setActiveModel(data.model);
      }
      // Merge cost/model from result into existing contextUsage (token counts come from assistant:usage)
      const existing = useChatStore.getState().contextUsage;
      if (existing) {
        setContextUsage({
          ...existing,
          totalCostUSD: data.totalCostUSD,
          model: data.model ?? existing.model,
          rateLimit: data.rateLimit ?? existing.rateLimit,
        });
      } else {
        setContextUsage(data);
      }
    };

    // Handle assistant message usage (per-turn snapshot for context window tracking)
    const handleAssistantUsage = (data: { inputTokens: number; outputTokens: number; cacheCreationInputTokens: number; cacheReadInputTokens: number }) => {
      const totalContext = data.inputTokens + data.cacheCreationInputTokens + data.cacheReadInputTokens;
      debugLog.stream('assistant:usage received', {
        inputTokens: data.inputTokens,
        cacheCreationInputTokens: data.cacheCreationInputTokens,
        cacheReadInputTokens: data.cacheReadInputTokens,
        totalContext,
      });
      // Build ChatUsage from assistant message data + existing context usage for cost/model
      const existing = useChatStore.getState().contextUsage;
      setContextUsage({
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        cacheCreationInputTokens: data.cacheCreationInputTokens,
        cacheReadInputTokens: data.cacheReadInputTokens,
        totalCostUSD: existing?.totalCostUSD ?? 0,
        contextWindow: existing?.contextWindow ?? 0,
        model: existing?.model,
      });
    };

    // Handle context estimate from server (updates between assistant messages, e.g. after tool results)
    const handleContextEstimate = (data: { estimatedTokens: number; contextWindow: number }) => {
      debugLog.stream('context:estimate received', data);
      const existing = useChatStore.getState().contextUsage;
      // Only update if estimate is higher than current display (context only grows between compactions)
      const currentTotal = existing
        ? existing.inputTokens + existing.cacheCreationInputTokens + existing.cacheReadInputTokens
        : 0;
      if (data.estimatedTokens > currentTotal) {
        setContextUsage({
          inputTokens: data.estimatedTokens,
          outputTokens: existing?.outputTokens ?? 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          totalCostUSD: existing?.totalCostUSD ?? 0,
          contextWindow: data.contextWindow,
          model: existing?.model,
        });
      }
    };

    // Handle stream:status — server tells us if a background stream exists
    const handleStreamStatus = (data: { active: boolean; sessionId: string; permissionMode?: PermissionMode }) => {
      const chatState = useChatStore.getState();
      debugLog.stream('stream:status', {
        active: data.active,
        sessionId: data.sessionId,
        isStreaming: chatState.isStreaming,
        streamingSessionId: chatState.streamingSessionId,
        segmentCount: chatState.streamingSegments.length,
        hadTimeout: !!reconnectTimeoutId,
        msgCount: useMessageStore.getState().messages.length,
      });

      // Session join complete — clear loading indicator.
      // stream:status always arrives after stream:history, so messages are already set.
      // Only clear for the currently viewed session to avoid rapid-switch races.
      const msgStore = useMessageStore.getState();
      if (!msgStore.currentSessionId || msgStore.currentSessionId === data.sessionId) {
        useMessageStore.setState({ isLoading: false });
      }

      // Clear reconnect timeout if set (Task 3)
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
      }

      if (data.active) {
        // Auto-exit branch viewer when streaming starts (AC: 8)
        if (useChatStore.getState().isBranchViewerMode) {
          useChatStore.getState().exitBranchViewer(true);
        }
        // Clear seen permissions so replayed permission:request events are processed
        seenPermissionIds.current.clear();
        // Clear any pending text chunks from a previous buffer replay to prevent
        // doubled text when multiple session:join → stream:status cycles occur
        // (e.g., React Strict Mode double-mount or rapid navigation)
        clearChunkQueue();
        debugLog.stream('DEDUP stream:status ACTIVE → before restoreStreaming', {
          sessionId: data.sessionId,
          msgCount: useMessageStore.getState().messages.length,
          msgTypes: useMessageStore.getState().messages.map(m => m.type),
          prevIsStreaming: chatState.isStreaming,
          prevSegCount: chatState.streamingSegments.length,
        });
        // If we were already streaming (reconnection during active chain),
        // fetch history to pick up intermediate turns completed while disconnected.
        // Without this, chain turns that completed in the background are never
        // loaded — only the active turn's buffer replay arrives via WebSocket.
        // Only on RECONNECTION: streamingSessionId is already set to the real
        // session ID from a prior restoreStreaming/startStreaming. On initial
        // stream start (sendMessage → session:join), streamingSessionId is null
        // or 'pending' — fetching now would get stale JSONL that doesn't yet
        // reflect the new branch (e.g., edit creates branch but SDK hasn't written it).
        // Story 27.1: stream:history already delivers buffer messages on session:join.
        // No intermediate fetch needed — session:join handler sends current buffer state.
        restoreStreaming(data.sessionId);
        // Apply the stream's actual permission mode (overrides local preference)
        if (data.permissionMode) {
          useChatStore.setState({ permissionMode: data.permissionMode });
        }
        debugLog.stream('stream:status ACTIVE → restored', {
          msgCount: useMessageStore.getState().messages.length,
        });
        debugLog.stream('stream:status → restored', { sessionId: data.sessionId });
      } else {
        // Apply per-session permission mode if provided (always policy — restores saved mode)
        if (data.permissionMode) {
          useChatStore.setState({ permissionMode: data.permissionMode });
        }
        // Stream not active — if we were streaming, the stream completed during disconnect.
        // Clean up stale streaming state and fetch authoritative history.
        if (chatState.isStreaming) {
          const hadSegments = chatState.streamingSegments.length > 0;
          flushChunkQueue();
          debugLog.stream('stream:status → completing stale stream', {
            sessionId: data.sessionId,
            hadSegments,
          });
          completeStreaming();
        } else {
          debugLog.stream('stream:status → inactive, no-op (not streaming)');
        }
      }
    };

    // Handle stream:detached — another browser took over or user aborted
    const handleStreamDetached = (data: { sessionId: string; reason: string }) => {
      const chatState = useChatStore.getState();
      const viewingSessionId = useMessageStore.getState().currentSessionId;
      debugLog.stream('stream:detached', {
        reason: data.reason,
        isStreaming: chatState.isStreaming,
        sessionId: data.sessionId,
        viewingSessionId,
      });
      // Ignore detach from a different session (stale event after session switch)
      if (viewingSessionId && data.sessionId !== viewingSessionId) return;

      if (data.reason === 'user-abort') {
        // Keep streaming segments visible until stream:complete-messages arrives
        // with confirmed JSONL data — avoids a flash where messages disappear
        // during the polling window then reappear.
        flushChunkQueue();
        // Watchdog: if stream:complete-messages doesn't arrive within 10s
        // (polling timeout 5s + generous margin), force-complete to avoid
        // permanently stuck streaming state.
        const abortWatchdog = setTimeout(() => {
          if (useChatStore.getState().isStreaming) {
            debugLog.stream('abort watchdog: force-completing after timeout');
            completeStreaming();
          }
        }, 10_000);
        // Clear watchdog when stream:complete-messages arrives
        socket.once('stream:complete-messages', () => clearTimeout(abortWatchdog));
      } else {
        // Another client took over — finalize immediately and lock
        if (chatState.isStreaming) {
          flushChunkQueue();
          completeStreaming();
        }
        useChatStore.setState({ isSessionLocked: true });
        toast.warning(i18n.t('notification:streaming.sessionInUseWarning'), {
          id: 'session-locked',
          duration: Infinity,
        });
      }
    };

    // Handle disconnection during streaming
    const handleDisconnect = () => {
      const state = useChatStore.getState();
      debugLog.reconnect('disconnect', {
        isStreaming: state.isStreaming,
        streamingSessionId: state.streamingSessionId,
        segmentCount: state.streamingSegments.length,
        msgCount: useMessageStore.getState().messages.length,
      });
      // Keep streaming state - wait for reconnect
    };

    // Handle successful reconnection — re-join session mid-stream.
    // Initial background-stream probe is handled by ChatPage's emitJoin,
    // so this only fires for genuine reconnections while already streaming.
    const handleReconnect = () => {
      const state = useChatStore.getState();
      debugLog.reconnect('connect (reconnect handler)', {
        isStreaming: state.isStreaming,
        streamingSessionId: state.streamingSessionId,
        segmentCount: state.streamingSegments.length,
        msgCount: useMessageStore.getState().messages.length,
      });
      if (!state.isStreaming) return;
      const sessionId = state.streamingSessionId
        || useMessageStore.getState().currentSessionId;
      if (sessionId && sessionId !== 'pending') {
        const currentProjectSlug = useMessageStore.getState().currentProjectSlug;
        debugLog.reconnect('session:join emitted', { sessionId, projectSlug: currentProjectSlug });
        socket.emit('session:join', sessionId, currentProjectSlug ?? undefined);

        // Set timeout — if no stream:status received, assume stream completed
        reconnectTimeoutId = setTimeout(() => {
          reconnectTimeoutId = null;
          debugLog.reconnect('timeout fired (10s)', {
            isStreaming: useChatStore.getState().isStreaming,
            sessionId,
          });
          if (useChatStore.getState().isStreaming) {
            // Give-up path: 10s elapsed with no stream:status. The server emits stream:history and
            // stream:status back-to-back, so "no status received" means "no authoritative copy
            // arrived" either — the in-flight turn exists ONLY as live streamingSegments. Salvage it
            // into the message store BEFORE handleStreamStatus → completeStreaming tears it down,
            // otherwise the whole turn vanishes (the mobile sleep/wake disappearance). addMessages
            // dedups by id and a later authoritative reload (stream:history → setMessages) replaces
            // these, so re-salvage or a late server response can't leave a duplicate.
            const st = useChatStore.getState();
            if (st.streamingSegments.length > 0) {
              const salvaged = salvageSegmentsToMessages(st.streamingSegments, st.streamingMessageId, Date.now());
              if (salvaged.length > 0) {
                debugLog.reconnect('timeout salvage: preserving un-persisted turn before teardown', { count: salvaged.length });
                useMessageStore.getState().addMessages(salvaged);
              }
            }
            // Treat as inactive stream (stream completed or server unreachable)
            handleStreamStatus({ active: false, sessionId });
          }
        }, RECONNECT_TIMEOUT);
      }
    };

    // Handle reconnection failure
    const handleReconnectFailed = () => {
      debugLog.reconnect('reconnect_failed', {
        isStreaming: useChatStore.getState().isStreaming,
      });
      if (useChatStore.getState().isStreaming) {
        clearChunkQueue();
        abortStreaming();
      }
    };

    // Handle server errors — display error message to user instead of silently aborting
    const handleError = (data?: unknown) => {
      const currentIsStreaming = useChatStore.getState().isStreaming;
      debugLog.socket('error', { isStreaming: currentIsStreaming, data });

      // Show error message to user if available
      if (data && typeof data === 'object' && 'message' in data) {
        const errorData = data as { code?: string; message: string };
        addResultError({
          subtype: 'error',
          result: errorData.message,
        });
      }

      clearChunkQueue();
      abortStreaming();
    };

    // Handle stream:buffer-replay — process entire buffer as a single batch
    // instead of receiving individual events one by one. This dramatically reduces
    // the number of React re-renders when joining an active streaming session.
    const handleBufferReplay = (data: { sessionId?: string; events: Array<{ event: string; data: unknown }> }) => {
      // Drop replay from a different session (rapid session switch guard)
      if (data.sessionId) {
        const currentSessionId = useChatStore.getState().streamingSessionId
          || useMessageStore.getState().currentSessionId;
        if (currentSessionId && currentSessionId !== data.sessionId) {
          debugLog.stream('stream:buffer-replay dropped: session mismatch', {
            replay: data.sessionId, current: currentSessionId,
          });
          // Clear 'restoring' sentinel to prevent stuck spinner
          if (useChatStore.getState().streamingMessageId === 'restoring') {
            useChatStore.setState({ streamingMessageId: null });
          }
          return;
        }
      }

      if (!data.events || data.events.length === 0) {
        // Clear 'restoring' sentinel even for empty buffer so spinner disappears
        if (useChatStore.getState().streamingMessageId === 'restoring') {
          useChatStore.setState({ streamingMessageId: null });
        }
        return;
      }

      debugLog.stream('stream:buffer-replay received', { eventCount: data.events.length, sessionId: data.sessionId });

      // Local accumulators — avoid setState per event
      const segments: StreamingSegment[] = [];
      // Initialize sessionId from payload (fallback to store value for robustness)
      let sessionId: string | null = data.sessionId ?? useChatStore.getState().streamingSessionId ?? null;
      let messageId: string | null = null;
      const defaultUsage: ChatUsage = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, totalCostUSD: 0, contextWindow: 0 };
      let contextUsage: ChatUsage | null = null;
      let activeModel: string | null = null;
      let isCompacting = false;
      let pendingTextBuffer = '';
      // Story 37.11 (AC4): carry the provisional flag through the buffered-text accumulator so a
      // reconnect mid-turn restores the dimmed + live-badged state (until the authoritative reload).
      let pendingTextProvisional: boolean | undefined;
      const localSeenPermissionIds = new Set<string>();
      // Track completed turns — when message:complete arrives, convert segments to messages
      const completedMessages: HistoryMessage[] = [];
      let lastResultError: ResultErrorData | null = null;
      // CLI progress restoration (Story 36.2 / 32.7). The server buffers cli:phase and
      // generation:progress like every other event, so re-entering a chat mid-turn can
      // restore the LAST value of each instead of resetting the indicator. Reset on every
      // message:complete so only the still-running turn's progress survives. currentTurnStartTs
      // = the first buffered event of that turn (each entry carries `ts`), used to realign the
      // elapsed clock so it continues instead of restarting at 0 on restore.
      let lastCliPhase: 'launching' | 'submitting' | 'waiting' | null = null;
      let lastBackgroundWaiting: { sessionId: string; waiting: boolean; pendingCount: number; ts?: number } | null = null;
      let lastGenerationProgress: { tokens: number; elapsedSeconds: number } | null = null;
      let currentTurnStartTs: number | null = null;

      /** Flush accumulated text into a text segment */
      const flushText = () => {
        if (pendingTextBuffer.length === 0) return;
        // Canonical flush REPLACES the oldest still-provisional text segment in place (mirrors
        // chatStore.appendStreamingContent). The buffer interleaves blocks, so the right target is the
        // OLDEST provisional — not the last segment (another block's provisional can sit after it).
        if (pendingTextProvisional === false) {
          const idx = segments.findIndex((s) => s.type === 'text' && (s as { provisional?: boolean }).provisional);
          if (idx >= 0) {
            segments[idx] = { type: 'text', content: pendingTextBuffer };
            pendingTextBuffer = '';
            pendingTextProvisional = undefined;
            return;
          }
        }
        // Merge only into a SAME-state trailing text segment; otherwise start a new one. Merging a
        // canonical flush into a provisional segment (or vice-versa) is what left both copies alive.
        const lastSeg = segments[segments.length - 1];
        if (lastSeg && lastSeg.type === 'text' && Boolean((lastSeg as { provisional?: boolean }).provisional) === Boolean(pendingTextProvisional)) {
          (lastSeg as { type: 'text'; content: string }).content += pendingTextBuffer;
        } else {
          segments.push({ type: 'text', content: pendingTextBuffer, ...(pendingTextProvisional ? { provisional: true } : {}) });
        }
        pendingTextBuffer = '';
        pendingTextProvisional = undefined;
      };

      /** Find a tool segment by toolCallId */
      const findToolSegment = (toolCallId: string) => {
        for (let i = segments.length - 1; i >= 0; i--) {
          const s = segments[i];
          if (s.type === 'tool' && s.toolCall.id === toolCallId) return { seg: s, idx: i };
        }
        return null;
      };

      /** Convert current segments to HistoryMessages (mirrors completeStreaming logic) */
      const convertSegmentsToMessages = () => {
        flushText();
        let pendingThinking: string | undefined;
        const baseTs = Date.now();
        let tsCounter = completedMessages.length;

        for (const seg of segments) {
          const ts = new Date(baseTs + tsCounter++).toISOString();
          if (seg.type === 'thinking') {
            if (pendingThinking && messageId) {
              completedMessages.push({
                id: `${messageId}-thinking-${completedMessages.length}`,
                type: 'assistant',
                content: '',
                timestamp: ts,
                thinking: pendingThinking,
              });
            }
            pendingThinking = seg.content;
          } else if (seg.type === 'text') {
            completedMessages.push({
              id: `${messageId}-text-${completedMessages.length}`,
              type: 'assistant',
              content: seg.content,
              timestamp: ts,
              thinking: pendingThinking,
            });
            pendingThinking = undefined;
          } else if (seg.type === 'tool') {
            completedMessages.push({
              id: `${messageId}-tool-${seg.toolCall.id}`,
              type: 'tool_use',
              content: `Calling ${seg.toolCall.name}`,
              timestamp: ts,
              toolName: seg.toolCall.name,
              toolInput: seg.toolCall.input,
              thinking: pendingThinking,
              ...(seg.status !== 'pending' && seg.toolCall.output !== undefined && {
                toolResult: {
                  success: seg.status === 'completed',
                  output: seg.status === 'completed' ? seg.toolCall.output : undefined,
                  error: seg.status === 'error' ? seg.toolCall.output : undefined,
                },
              }),
            });
            pendingThinking = undefined;
          } else if (seg.type === 'interactive') {
            const toolCallId = seg.toolCall?.id || seg.id;
            let responseStr: string | undefined;
            if (seg.status === 'responded' && seg.response) {
              if (typeof seg.response === 'string') {
                responseStr = seg.response;
              } else if (Array.isArray(seg.response)) {
                responseStr = seg.response.join(', ');
              } else if (typeof seg.response === 'object') {
                responseStr = Object.values(seg.response).flat().join(', ');
              }
            }
            completedMessages.push({
              id: `${messageId}-tool-${toolCallId}`,
              type: 'tool_use',
              content: `Calling ${seg.toolCall?.name || 'AskUserQuestion'}`,
              timestamp: ts,
              toolName: seg.toolCall?.name || 'AskUserQuestion',
              toolInput: seg.toolCall?.input,
              thinking: pendingThinking,
              ...(responseStr && { toolResult: { success: true, output: responseStr } }),
            });
            pendingThinking = undefined;
          }
        }
        if (pendingThinking && messageId) {
          completedMessages.push({
            id: `${messageId}-thinking`,
            type: 'assistant',
            content: '',
            timestamp: new Date(baseTs + tsCounter++).toISOString(),
            thinking: pendingThinking,
          });
        }
        // Clear segments for next turn
        segments.length = 0;
      };

      // Process each event in the buffer
      for (const entry of data.events) {
        const { event, data: eventData } = entry;
        // Each buffered entry carries the server timestamp (createStreamEmit stamps `ts`).
        // The first event after the last message:complete marks the running turn's start —
        // used below to restore the elapsed clock without restarting it at 0.
        const entryTs = (entry as { ts?: number }).ts;
        if (currentTurnStartTs === null && typeof entryTs === 'number') {
          currentTurnStartTs = entryTs;
        }

        switch (event) {
          case 'user:message': {
            const d = eventData as { content: string; sessionId: string; timestamp?: string; images?: ImageRef[] };
            if (!d.content) break;
            // Skip if this user message already exists in history (delivered via stream:history)
            const existingMsgs = useMessageStore.getState().messages;
            const alreadyExists = d.timestamp && existingMsgs.some(
              m => m.type === 'user' && m.timestamp === d.timestamp && m.content === d.content.trim()
            );
            if (!alreadyExists) {
              useMessageStore.getState().addUserMessage(d.content, d.images, d.timestamp);
            }
            if (d.content.trim() === '/compact') isCompacting = true;
            break;
          }
          case 'session:created':
          case 'session:resumed': {
            const d = eventData as { sessionId: string; model?: string };
            sessionId = d.sessionId;
            if (d.model) activeModel = d.model;
            break;
          }
          case 'message:chunk': {
            const d = eventData as StreamChunk;
            if (!sessionId && d.sessionId) sessionId = d.sessionId;
            if (!messageId && d.messageId) messageId = d.messageId;
            isCompacting = false;
            // Story 37.11 + reconnect parity: the buffer INTERLEAVES provisional (screen-scrape) and
            // canonical (file) text across blocks. Accumulate same-state chunks; when the provisional
            // flag flips, flush first so each flush is purely one or the other. flushText() then routes a
            // canonical flush to REPLACE the oldest still-provisional text in place (drop its badge) —
            // mirrors chatStore.appendStreamingContent. A plain "last segment" replace missed the right
            // block when another block's provisional was interleaved after it, leaving the provisional +
            // canonical copies BOTH alive ("sleep/wake 후 잠정+정본 둘 다 남는" 재연결 중복).
            const incomingProv = d.provisional === false ? false : (d.provisional ? true : undefined);
            if (pendingTextBuffer.length > 0 && pendingTextProvisional !== incomingProv) {
              flushText();
            }
            pendingTextProvisional = incomingProv;
            pendingTextBuffer += d.content;
            break;
          }
          case 'thinking:chunk': {
            const d = eventData as { content: string; provisional?: boolean };
            flushText();
            isCompacting = false;
            // reconnect parity (Story 37.11): a canonical thinking chunk FINALIZES the matching provisional
            // ∴-scrape preview IN PLACE (replace + drop badge). Because the buffer interleaves blocks, the
            // target is the OLDEST still-provisional thinking (findIndex) — not the last segment — mirroring
            // chatStore.addStreamingThinking. Same-state chunks merge into the trailing thinking; else a new
            // card. The old "last segment" check left the provisional + canonical thinking BOTH alive.
            if (d.provisional === false) {
              const idx = segments.findIndex((s) => s.type === 'thinking' && (s as { provisional?: boolean }).provisional);
              if (idx >= 0) {
                segments[idx] = { type: 'thinking', content: d.content };
              } else {
                const lastSeg = segments[segments.length - 1];
                if (lastSeg && lastSeg.type === 'thinking' && !(lastSeg as { provisional?: boolean }).provisional) {
                  (lastSeg as { type: 'thinking'; content: string }).content += d.content;
                } else {
                  segments.push({ type: 'thinking', content: d.content });
                }
              }
            } else {
              const lastSeg = segments[segments.length - 1];
              if (lastSeg && lastSeg.type === 'thinking' && (lastSeg as { provisional?: boolean }).provisional) {
                (lastSeg as { type: 'thinking'; content: string }).content += d.content;
              } else {
                segments.push({ type: 'thinking', content: d.content, provisional: true });
              }
            }
            break;
          }
          case 'tool:call': {
            const d = eventData as { id: string; name: string; input?: Record<string, unknown>; startedAt?: number; provisional?: boolean };
            if (d.name === 'AskUserQuestion') break;
            flushText();
            // Mirror chatStore.addStreamingToolCall (Story 37.11/37.21): a NON-provisional (canonical)
            // tool call FINALIZES the matching provisional card IN PLACE (prefer exact synthId, else the
            // oldest still-provisional tool), keeping its id + status. Without this, a reconnect mid-turn
            // rebuilt every CLI tool as TWO cards — friendly provisional + real canonical — and the
            // completion (tool:result, which binds by id) attached to only ONE, leaving the other stuck
            // spinning forever (the "Read 초록인데 카드 spinner" reconnect symptom).
            if (!d.provisional) {
              let idx = segments.findIndex((s) => s.type === 'tool' && (s as { provisional?: boolean }).provisional === true && s.toolCall.id === d.id);
              if (idx < 0) idx = segments.findIndex((s) => s.type === 'tool' && (s as { provisional?: boolean }).provisional === true);
              if (idx >= 0) {
                const seg = segments[idx];
                if (seg.type === 'tool') {
                  seg.toolCall.name = d.name;
                  seg.toolCall.input = d.input;
                  delete (seg as { provisional?: boolean }).provisional; // badge dropped, id + status kept
                }
                break;
              }
            }
            // Dedup: never create a second card for an id already present (defensive).
            if (segments.some((s) => s.type === 'tool' && s.toolCall.id === d.id)) break;
            segments.push({
              type: 'tool',
              toolCall: { id: d.id, name: d.name, input: d.input, startedAt: d.startedAt },
              status: 'pending',
              ...(d.provisional ? { provisional: true } : {}),
            });
            break;
          }
          case 'tool:input-update': {
            const d = eventData as { toolCallId: string; input: Record<string, unknown> };
            const found = findToolSegment(d.toolCallId);
            if (found) {
              found.seg.toolCall.input = { ...found.seg.toolCall.input, ...d.input };
            }
            break;
          }
          case 'tool:result': {
            const d = eventData as { toolCallId: string; result: ToolResult; provisional?: boolean };
            const found = findToolSegment(d.toolCallId);
            if (found) {
              const toolSeg = found.seg as { type: 'tool'; toolCall: StreamingToolCall; status: string; provisional?: boolean };
              toolSeg.toolCall.output = d.result.output ?? d.result.error ?? '';
              toolSeg.status = d.result.success ? 'completed' : 'error';
              // Story 37.11 + 37.20 (reconnect parity): a provisional grid flip keeps the badge ONLY
              // while the card is STILL provisional. On evaluate-order reconnect the canonical tool:call
              // FINALIZES this card (badge dropped) BEFORE the flip arrives — re-stamping would wrongly
              // re-badge a completed tool. Gate on the card still being provisional, exactly like
              // chatStore.updateStreamingToolCall L769.
              if (d.provisional && toolSeg.provisional === true) toolSeg.provisional = true;
            }
            // Auto-resolve interactive segments for this tool call
            for (const seg of segments) {
              if (seg.type === 'interactive' && seg.status === 'waiting' && seg.toolCall?.id === d.toolCallId) {
                (seg as { status: string }).status = 'responded';
                (seg as { response?: string }).response = i18n.t('notification:streaming.respondedBeforeReconnect');
              }
            }
            break;
          }
          case 'permission:request': {
            const d = eventData as PermissionRequest;
            if (localSeenPermissionIds.has(d.id)) break;
            localSeenPermissionIds.add(d.id);
            flushText();

            if (d.toolCall.name === 'AskUserQuestion' && d.toolCall.input?.questions) {
              const rawQuestions = d.toolCall.input.questions as Array<{
                question: string; header: string;
                options: Array<{ label: string; description?: string }>;
                multiSelect?: boolean;
              }>;
              if (rawQuestions.length > 0) {
                const mappedQuestions = rawQuestions.map((q) => ({
                  question: q.question, header: q.header,
                  choices: q.options.map((opt) => ({ label: opt.label, description: opt.description, value: opt.label })),
                  multiSelect: q.multiSelect,
                }));
                segments.push({
                  type: 'interactive', id: d.id, interactionType: 'question',
                  toolCall: { id: d.toolCall.id, name: d.toolCall.name, input: d.toolCall.input },
                  choices: mappedQuestions[0].choices, questions: mappedQuestions,
                  multiSelect: mappedQuestions[0].multiSelect, status: 'waiting',
                });
                break;
              }
            }
            // CLI engine path (see handlePermissionRequest): render as an independent
            // permission card on buffer replay too.
            if (d.standalone) {
              segments.push({
                type: 'interactive', id: d.id, interactionType: 'permission',
                toolCall: { id: d.toolCall.id, name: d.toolCall.name, input: d.toolCall.input },
                choices: [], status: 'waiting',
              });
              break;
            }
            // Default: attach permission to existing tool segment
            if (d.toolCall.input) {
              const found = findToolSegment(d.toolCall.id);
              if (found) {
                found.seg.toolCall.input = { ...found.seg.toolCall.input, ...d.toolCall.input };
              }
            }
            const toolFound = findToolSegment(d.toolCall.id);
            if (toolFound) {
              (toolFound.seg as { permissionId?: string; permissionStatus?: string }).permissionId = d.id;
              (toolFound.seg as { permissionId?: string; permissionStatus?: string }).permissionStatus = 'waiting';
            }
            break;
          }
          case 'permission:resolved': {
            const d = eventData as { requestId: string; approved: boolean; interactionType: string; response?: string | string[] | Record<string, string | string[]> };
            for (const seg of segments) {
              if (d.interactionType === 'question' && seg.type === 'interactive' && seg.id === d.requestId) {
                let displayResponse: string;
                if (typeof d.response === 'string') displayResponse = d.response;
                else if (Array.isArray(d.response)) displayResponse = d.response.join(', ');
                else if (d.response && typeof d.response === 'object') displayResponse = Object.values(d.response).flat().join(', ');
                else displayResponse = i18n.t('notification:streaming.respondedInOtherBrowser');
                (seg as { status: string }).status = 'responded';
                (seg as { response?: string }).response = displayResponse;
              } else if (seg.type === 'tool' && seg.permissionId === d.requestId) {
                (seg as { permissionStatus?: string }).permissionStatus = d.approved ? 'approved' : 'denied';
              }
            }
            break;
          }
          case 'system:compact': {
            const d = eventData as CompactMetadata;
            flushText();
            isCompacting = true;
            segments.push({ type: 'system', subtype: 'compact', message: `Context compaction (${d.trigger})...` });
            break;
          }
          case 'tool:summary': {
            const d = eventData as { summary: string; precedingToolUseIds: string[] };
            flushText();
            segments.push({ type: 'tool_summary', summary: d.summary, precedingToolUseIds: d.precedingToolUseIds });
            break;
          }
          // system:task-notification: skip during replay — already in the authoritative
          // history at its correct chronological position. Re-adding it here would show
          // stale completion cards at the top of the current turn on every reconnect.
          case 'system:task-notification': break;
          case 'result:error': {
            const d = eventData as ResultErrorData;
            flushText();
            lastResultError = d;
            segments.push({ type: 'result_error', ...d });
            break;
          }
          case 'message:complete': {
            const d = eventData as Message;
            if (d.sessionId) sessionId = d.sessionId;
            if (d.id) messageId = d.id;
            if (d.usage) {
              const prev: ChatUsage = contextUsage ?? defaultUsage;
              contextUsage = {
                ...prev,
                contextWindow: d.usage.contextWindow,
                totalCostUSD: d.usage.totalCostUSD,
                model: d.usage.model ?? prev.model,
                inputTokens: d.usage.inputTokens ?? prev.inputTokens ?? 0,
                outputTokens: d.usage.outputTokens ?? prev.outputTokens ?? 0,
              };
              if (d.usage.model) activeModel = d.usage.model;
            }
            // Reset per-turn identity so next turn doesn't inherit stale ID
            messageId = null;
            // Turn boundary: clear segments from the completed turn so task notifications,
            // system cards, and other transient segments don't carry over to the next turn.
            // The authoritative messages were already delivered via stream:complete-messages.
            segments.length = 0;
            // The just-finished turn's CLI progress is stale. Clear it (and
            // the turn-start marker) so only a still-running next turn restores an indicator.
            lastCliPhase = null;
            lastGenerationProgress = null;
            lastBackgroundWaiting = null;
            currentTurnStartTs = null;
            break;
          }
          case 'context:usage': {
            const d = eventData as ChatUsage;
            if (d.model) activeModel = d.model;
            const prevCtx: ChatUsage = contextUsage ?? defaultUsage;
            contextUsage = {
              ...prevCtx,
              totalCostUSD: d.totalCostUSD,
              model: d.model ?? prevCtx.model,
              rateLimit: d.rateLimit ?? prevCtx.rateLimit,
            };
            break;
          }
          case 'assistant:usage': {
            const d = eventData as { inputTokens: number; outputTokens: number; cacheCreationInputTokens: number; cacheReadInputTokens: number };
            const prevAu: ChatUsage = contextUsage ?? defaultUsage;
            contextUsage = {
              inputTokens: d.inputTokens,
              outputTokens: d.outputTokens,
              cacheCreationInputTokens: d.cacheCreationInputTokens,
              cacheReadInputTokens: d.cacheReadInputTokens,
              totalCostUSD: prevAu.totalCostUSD,
              contextWindow: prevAu.contextWindow,
              model: prevAu.model,
            };
            break;
          }
          case 'context:estimate': {
            const d = eventData as { estimatedTokens: number; contextWindow: number };
            const prevCe: ChatUsage = contextUsage ?? defaultUsage;
            const currentTotal = prevCe.inputTokens + prevCe.cacheCreationInputTokens + prevCe.cacheReadInputTokens;
            if (d.estimatedTokens > currentTotal) {
              contextUsage = {
                inputTokens: d.estimatedTokens,
                outputTokens: prevCe.outputTokens,
                cacheCreationInputTokens: 0,
                cacheReadInputTokens: 0,
                totalCostUSD: prevCe.totalCostUSD,
                contextWindow: d.contextWindow,
                model: prevCe.model,
              };
            }
            break;
          }
          case 'chain:update': {
            const d = eventData as { sessionId: string; items: PromptChainItem[] };
            useChainStore.getState().applyUpdate(d.sessionId, d.items);
            break;
          }
          // CLI progress indicators (Story 36.2 / 32.7). Unlike tool:progress these ARE
          // replayed — but only as the LAST value (tracked here, applied once after the loop),
          // so re-entering a chat mid-turn restores the live phase/counter instead of a reset
          // spinner. message:complete clears them so a finished turn leaves no indicator.
          case 'cli:phase': {
            lastCliPhase = (eventData as { phase: 'launching' | 'submitting' | 'waiting' | null }).phase;
            break;
          }
          case 'generation:progress': {
            lastGenerationProgress = eventData as { tokens: number; elapsedSeconds: number; thinking?: boolean };
            break;
          }
          case 'background:waiting': {
            const d = eventData as { sessionId: string; waiting: boolean; pendingCount: number };
            lastBackgroundWaiting = { ...d, ts: entryTs };
            break;
          }
          // Skip tool:progress during replay (only elapsed times, final state is in tool:result)
          // Skip permission:already-resolved (no toast during replay)
          default:
            break;
        }
      }

      // Flush any remaining text
      flushText();

      // Apply accumulated state in a single batch
      const hasCompletedTurns = completedMessages.length > 0;
      const hasActiveSegments = segments.length > 0;

      // Add completed turn messages to message store
      if (hasCompletedTurns) {
        useMessageStore.getState().addMessages(completedMessages);
      }

      // Update chat store — single setState call
      const chatStateUpdate: Record<string, unknown> = {};
      if (hasActiveSegments && useChatStore.getState().isStreaming) {
        // Stream is actively running (server sent active: true) with in-progress segments
        chatStateUpdate.isStreaming = true;
        chatStateUpdate.streamingSessionId = sessionId;
        chatStateUpdate.streamingMessageId = messageId;
        chatStateUpdate.streamingSegments = segments;
        chatStateUpdate.streamingStartedAt = new Date();
      } else if (hasActiveSegments && !useChatStore.getState().isStreaming) {
        // Buffer has segments but server said active: false (e.g., abort, completed
        // stream without message:complete). Convert remaining segments to messages
        // instead of entering streaming mode.
        // Ensure messageId exists for ID generation (may be null if no chunks arrived).
        // Use event count as fingerprint so replays of the same buffer produce
        // identical IDs (prevents addMessages dedup failure on session rejoin).
        if (!messageId) {
          // Deterministic fallback: use event count + first/last event types
          // so replays of the same buffer produce identical IDs (dedup safe)
          // while different turns are unlikely to collide.
          const first = data.events[0]?.event ?? '';
          const last = data.events[data.events.length - 1]?.event ?? '';
          messageId = `replay-${sessionId ?? 'unknown'}-${data.events.length}-${first}-${last}`;
        }
        convertSegmentsToMessages();
        if (completedMessages.length > 0) {
          useMessageStore.getState().addMessages(completedMessages);
        }
        chatStateUpdate.streamingMessageId = null;
        chatStateUpdate.streamingSegments = [];
      } else if (hasCompletedTurns) {
        // Buffer only had completed turns (all converted to messages via addMessages).
        // Don't set isStreaming — the stream may have already completed (server sent
        // active: false). Completed turn messages are now in messageStore and should
        // be visible without displayMessages filtering them.
        chatStateUpdate.streamingMessageId = null;
        chatStateUpdate.streamingSegments = [];
      } else {
        // Empty/metadata-only buffer — clear 'restoring' sentinel so spinner disappears.
        chatStateUpdate.streamingMessageId = null;
      }
      if (contextUsage) chatStateUpdate.contextUsage = contextUsage;
      if (activeModel) chatStateUpdate.activeModel = activeModel;
      if (isCompacting) chatStateUpdate.isCompacting = true;
      if (lastResultError) chatStateUpdate.lastResultError = lastResultError;

      // Restore the in-flight CLI progress indicator (Story 36.2 / 32.7). Only when the stream
      // is actually running (server said active:true → restoreStreaming already set isStreaming);
      // a completed/aborted stream leaves these null. Set unconditionally (even to null) so a
      // stale live value can't linger after restore. Realign streamingStartedAt to the running
      // turn's first buffered event so the elapsed clock continues from the real start instead of
      // restarting at 0 (overrides the `new Date()` set in the active-segments branch above).
      if (useChatStore.getState().isStreaming) {
        chatStateUpdate.cliPhase = lastCliPhase;
        chatStateUpdate.generationProgress = lastGenerationProgress;
        if (currentTurnStartTs !== null) {
          chatStateUpdate.streamingStartedAt = new Date(currentTurnStartTs);
        }
      }
      // Restore background-waiting state from the last buffered event (survives sleep/wake)
      if (lastBackgroundWaiting) {
        chatStateUpdate.backgroundWaiting = lastBackgroundWaiting.waiting;
        chatStateUpdate.backgroundWaitingSince = lastBackgroundWaiting.waiting ? (lastBackgroundWaiting.ts ?? Date.now()) : null;
        chatStateUpdate.backgroundPendingCount = lastBackgroundWaiting.pendingCount;
      }

      // Update seen permission IDs for live event dedup
      for (const id of localSeenPermissionIds) {
        seenPermissionIds.current.add(id);
      }

      if (Object.keys(chatStateUpdate).length > 0) {
        useChatStore.setState(chatStateUpdate);
      }

      debugLog.stream('stream:buffer-replay processed', {
        eventCount: data.events.length,
        completedTurns: completedMessages.length,
        activeSegments: segments.length,
        sessionId,
      });
    };

    // Register socket event listeners
    socket.on('user:message', handleUserMessage);
    // Story 25.11: Handle session:forked — set forkedSessionId for navigation
    const handleSessionForked = (data: { sessionId: string; originalSessionId: string; model?: string }) => {
      debugLog.stream('session:forked', { sessionId: data.sessionId, originalSessionId: data.originalSessionId });
      // Only accept fork events matching the session we're currently viewing
      const viewingSessionId = useMessageStore.getState().currentSessionId;
      if (viewingSessionId && data.originalSessionId && data.originalSessionId !== viewingSessionId) {
        debugLog.stream('session:forked dropped: originalSessionId mismatch', {
          original: data.originalSessionId, viewing: viewingSessionId,
        });
        return;
      }
      useChatStore.getState().setForkedSessionId(data.sessionId);
    };

    socket.on('session:created', handleSessionInit);
    socket.on('session:resumed', handleSessionInit);
    socket.on('session:forked', handleSessionForked);
    socket.on('message:chunk', handleChunk);
    socket.on('thinking:chunk', handleThinkingChunk);
    socket.on('message:complete', handleComplete);
    socket.on('tool:call', handleToolCall);
    socket.on('tool:input-update', handleToolInputUpdate);
    socket.on('tool:result', handleToolResult);
    socket.on('permission:request', handlePermissionRequest);
    socket.on('permission:resolved', handlePermissionResolved);
    socket.on('permission:already-resolved', handlePermissionAlreadyResolved);
    socket.on('context:usage', handleContextUsage);
    socket.on('assistant:usage', handleAssistantUsage);
    socket.on('context:estimate', handleContextEstimate);
    socket.on('system:compact', handleCompact);
    socket.on('tool:progress', handleToolProgress);
    socket.on('generation:progress', handleGenerationProgress);
    socket.on('cli:phase', handleCliPhase);
    socket.on('cli:screen-stall', handleScreenStall);
    socket.on('background:waiting', handleBackgroundWaiting);
    socket.on('system:task-notification', handleTaskNotification);
    socket.on('tool:summary', handleToolSummary);
    socket.on('result:error', handleResultError);
    // Handle permission:mode-change broadcast from server (another viewer changed mode)
    // Set state directly without re-emitting to avoid infinite loop
    const handlePermissionModeChange = (data: { mode: string }) => {
      const store = useChatStore.getState();
      if (store.permissionMode !== data.mode) {
        useChatStore.setState({ permissionMode: data.mode as typeof store.permissionMode });
      }
    };

    // Handle rateLimit:update — subscription rate limit polling from server
    const handleRateLimitUpdate = (data: SubscriptionRateLimit) => {
      useChatStore.getState().setSubscriptionRateLimit(data);
    };

    // Handle apiHealth:update — API reachability status from server polling
    const handleApiHealthUpdate = (data: ApiHealthStatus) => {
      useChatStore.getState().setApiHealth(data);
    };

    socket.on('permission:mode-change', handlePermissionModeChange);
    socket.on('rateLimit:update', handleRateLimitUpdate);
    socket.on('apiHealth:update', handleApiHealthUpdate);
    // Story 27.1: Handle stream:history — session history delivered on session:join
    const handleStreamHistory = (data: { sessionId: string; messages: HistoryMessage[] }) => {
      debugLog.stream('stream:history received', {
        sessionId: data.sessionId,
        messageCount: data.messages.length,
      });
      const viewingSessionId = useMessageStore.getState().currentSessionId;
      if (viewingSessionId && viewingSessionId !== data.sessionId) {
        debugLog.stream('stream:history dropped: session mismatch', {
          viewing: viewingSessionId, received: data.sessionId,
        });
        return;
      }
      if (data.messages.length > 0) {
        useMessageStore.getState().setMessages(data.messages);
      }
    };

    // Story 27.1: stream:complete-messages — single completion signal after JSONL flush.
    // Replaces messages with confirmed data, processes usage, and ends streaming state.
    // Abort is treated the same as normal completion — messages are replaced with
    // confirmed data and a cancellation message card is appended.
    const handleStreamCompleteMessages = async (data: { sessionId: string; messages: HistoryMessage[]; usage?: ChatUsage; aborted?: boolean }) => {
      debugLog.stream('stream:complete-messages received', {
        sessionId: data.sessionId,
        messageCount: data.messages.length,
        hasUsage: !!data.usage,
        aborted: !!data.aborted,
      });
      const viewingSessionId = useMessageStore.getState().currentSessionId;
      const isCurrentSession = !viewingSessionId || viewingSessionId === data.sessionId;

      if (isCurrentSession) {
        // Process usage metadata (contextWindow, model, totalCostUSD)
        if (data.usage) {
          const existing = useChatStore.getState().contextUsage;
          if (existing) {
            setContextUsage({
              ...existing,
              contextWindow: data.usage.contextWindow,
              totalCostUSD: data.usage.totalCostUSD,
              model: data.usage.model ?? existing.model,
            });
          } else {
            setContextUsage(data.usage as ChatUsage);
          }
          if (data.usage.model) {
            useChatStore.getState().setActiveModel(data.usage.model);
          }
        }
        // Append cancellation message card for aborted streams
        const messages = data.aborted
          ? [...data.messages, {
              id: `abort-${data.sessionId}-${Date.now()}`,
              type: 'system' as const,
              subtype: 'abort',
              content: i18n.t('notification:streaming.aborted'),
              timestamp: new Date().toISOString(),
            }]
          : data.messages;
        // Cancel any pending requestAnimationFrame chunk flush BEFORE clearing
        // streaming state. Without this, a paused rAF (window was minimized before
        // the next frame) fires after completeStreaming() and re-populates segments
        // via appendStreamingContent, creating an orphaned segment that renders as
        // a duplicate message bubble.
        clearChunkQueue();
        useMessageStore.getState().setMessages(messages);
        completeStreaming();
      }
    };

    socket.on('stream:history', handleStreamHistory);
    socket.on('stream:complete-messages', handleStreamCompleteMessages);
    socket.on('stream:status', handleStreamStatus);
    socket.on('stream:buffer-replay', handleBufferReplay);
    socket.on('stream:detached', handleStreamDetached);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleReconnect);
    socket.on('error', handleError);

    // Handle chain:update — server-synced prompt chain state (Story 24.2).
    // Filter by chainStore's bound session so multi-tab updates are applied
    // even when messageStore.currentSessionId briefly goes null on remount.
    const handleChainUpdate = (data: { sessionId: string; items: PromptChainItem[] }) => {
      useChainStore.getState().applyUpdate(data.sessionId, data.items);
    };
    socket.on('chain:update', handleChainUpdate);

    // Story 25.8: Handle rewind result from server
    const handleRewindResult = (data: { success: boolean; dryRun: boolean; error?: string; filesChanged?: string[]; insertions?: number; deletions?: number }) => {
      const { setIsRewinding, setLastDryRunResult } = useChatStore.getState();

      if (data.dryRun) {
        if (data.success && data.filesChanged && data.filesChanged.length > 0) {
          __dryRunFileCount = data.filesChanged.length;
          // dryRun success with changes — show confirmation dialog via lastDryRunResult
          setLastDryRunResult({
            filesChanged: data.filesChanged,
            insertions: data.insertions,
            deletions: data.deletions,
          });
          // Keep isRewinding true — dialog is shown, user decides
        } else if (data.success && (!data.filesChanged || data.filesChanged.length === 0)) {
          // dryRun success but no changes
          toast.info(i18n.t('chat:rewind.noChanges'));
          setIsRewinding(false);
        } else {
          // dryRun failed
          toast.error(i18n.t('chat:rewind.error', { error: data.error || 'Unknown error' }));
          setIsRewinding(false);
        }
      } else {
        if (data.success) {
          const count = __dryRunFileCount || data.filesChanged?.length || 0;
          toast.success(i18n.t('chat:rewind.success', { count }));
        } else {
          toast.error(i18n.t('chat:rewind.error', { error: data.error || 'Unknown error' }));
        }
        __dryRunFileCount = 0;
        setIsRewinding(false);
      }
    };
    socket.on('session:rewind-result', handleRewindResult);

    // Story 25.9: Handle summary result from server
    const handleSummaryResult = (data: { requestId?: string; messageUuid: string; summary?: string; error?: string }) => {
      const { isSummarizing, summarizingMessageUuid, setSummarizing, setSummaryResult } = useChatStore.getState();

      // Ignore stale/cancelled responses — requestId race is handled server-side,
      // client matches by messageUuid only
      if (!isSummarizing || summarizingMessageUuid !== data.messageUuid) return;

      setSummarizing(false, null);

      if (data.error) {
        toast.error(i18n.t('chat:summarize.error') + ': ' + data.error);
        return;
      }

      if (data.summary) {
        setSummaryResult({ messageUuid: data.messageUuid, summary: data.summary });
      }
    };
    socket.on('session:summary-result', handleSummaryResult);

    socket.io.on('reconnect_failed', handleReconnectFailed);

    // Register keyboard event listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      // Clear chunk smoothing timer
      clearChunkQueue();
      // Clear reconnect timeout if pending — prevents stale timeout from
      // firing after session switch or unmount, which would call
      // handleStreamStatus on a no-longer-active session
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
      }
      socket.off('user:message', handleUserMessage);
      socket.off('session:created', handleSessionInit);
      socket.off('session:resumed', handleSessionInit);
      socket.off('session:forked', handleSessionForked);
      socket.off('message:chunk', handleChunk);
      socket.off('thinking:chunk', handleThinkingChunk);
      socket.off('message:complete', handleComplete);
      socket.off('tool:call', handleToolCall);
      socket.off('tool:input-update', handleToolInputUpdate);
      socket.off('tool:result', handleToolResult);
      socket.off('permission:request', handlePermissionRequest);
      socket.off('permission:resolved', handlePermissionResolved);
      socket.off('permission:already-resolved', handlePermissionAlreadyResolved);
      socket.off('context:usage', handleContextUsage);
      socket.off('assistant:usage', handleAssistantUsage);
      socket.off('context:estimate', handleContextEstimate);
      socket.off('system:compact', handleCompact);
      socket.off('tool:progress', handleToolProgress);
      socket.off('generation:progress', handleGenerationProgress);
      socket.off('cli:phase', handleCliPhase);
      socket.off('cli:screen-stall', handleScreenStall);
      socket.off('background:waiting', handleBackgroundWaiting);
      socket.off('system:task-notification', handleTaskNotification);
      socket.off('tool:summary', handleToolSummary);
      socket.off('result:error', handleResultError);
      socket.off('permission:mode-change', handlePermissionModeChange);
      socket.off('rateLimit:update', handleRateLimitUpdate);
      socket.off('apiHealth:update', handleApiHealthUpdate);
      socket.off('stream:history', handleStreamHistory);
      socket.off('stream:complete-messages', handleStreamCompleteMessages);
      socket.off('stream:status', handleStreamStatus);
      socket.off('stream:buffer-replay', handleBufferReplay);
      socket.off('stream:detached', handleStreamDetached);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleReconnect);
      socket.off('error', handleError);
      socket.off('chain:update', handleChainUpdate);
      socket.off('session:rewind-result', handleRewindResult);
      socket.off('session:summary-result', handleSummaryResult);
      socket.io.off('reconnect_failed', handleReconnectFailed);
      document.removeEventListener('keydown', handleKeyDown);
      setCLILogSocket(null);
    };
  }, [
    startStreaming,
    appendStreamingContent,
    addStreamingThinking,
    addStreamingToolCall,
    updateStreamingToolCallInput,
    updateStreamingToolCall,
    completeStreaming,
    abortStreaming,
    abortResponse,
    setContextUsage,
    updateStreamingSessionId,
    addInteractiveSegment,
    setToolPermission,
    addSystemSegment,
    updateToolProgress,
    addTaskNotification,
    addToolSummary,
    addResultError,
    restoreStreaming,
    handleKeyDown,
  ]);
}
