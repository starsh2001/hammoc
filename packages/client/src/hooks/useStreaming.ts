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
import { debugLog } from '../utils/debugLogger';
import { useChainStore } from '../stores/chainStore';
import type { StreamChunk, Message, ChatUsage, PermissionRequest, ToolResult, CompactMetadata, TaskNotificationData, SubscriptionRateLimit, ApiHealthStatus, PromptChainItem, PermissionMode, HistoryMessage, ImageAttachment } from '@hammoc/shared';
import type { InteractiveStatus, StreamingSegment, StreamingToolCall, ResultErrorData } from '../stores/chatStore';

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

  // Track pending fetch generation to prevent duplicate fetches for the same
  // stream completion (e.g. message:complete + stream:status for same stream).
  const pendingFetchGenRef = useRef<number | null>(null);

  /** Fetch authoritative history from server after stream completion/abort.
   *  Uses generation counter to deduplicate and prevent stale clears. */
  const fetchAndClearSegments = useCallback(() => {
    const gen = useChatStore.getState().segmentClearGeneration;
    // Deduplicate: skip if a fetch is already in progress for this generation
    if (pendingFetchGenRef.current === gen) return;
    const { currentProjectSlug, currentSessionId } = useMessageStore.getState();
    if (!currentProjectSlug || !currentSessionId) {
      // No session context — clear segments immediately to avoid permanent freeze
      useChatStore.getState().clearStreamingSegments(gen);
      return;
    }
    pendingFetchGenRef.current = gen;
    useMessageStore.getState().fetchMessages(currentProjectSlug, currentSessionId, { silent: true, force: true }).then(() => {
      useChatStore.getState().clearStreamingSegments(gen);
      if (pendingFetchGenRef.current === gen) pendingFetchGenRef.current = null;
    }).catch(() => {
      // On fetch failure, keep segments visible (don't lose user's data).
      // Segments will be cleared naturally on next send, session switch, or refresh.
      if (pendingFetchGenRef.current === gen) pendingFetchGenRef.current = null;
    });
  }, []);

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

    const flushFrameBuffer = () => {
      frameRequestId = null;
      if (frameBuffer.length > 0) {
        const text = frameBuffer;
        frameBuffer = '';
        appendStreamingContent(text);
      }
    };

    /** Enqueue text content for coalesced rendering (one state update per frame) */
    const enqueueChunk = (content: string) => {
      frameBuffer += content;
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
        frameBuffer = '';
        appendStreamingContent(text);
      }
    };

    /** Discard all pending text (for abort/error) */
    const clearChunkQueue = () => {
      frameBuffer = '';
      if (frameRequestId !== null) {
        cancelAnimationFrame(frameRequestId);
        frameRequestId = null;
      }
    };

    // Handle user:message from buffer replay (restores the user's sent message
    // when reconnecting before SDK has flushed the JSONL file)
    const handleUserMessage = (data: { content: string; sessionId: string; timestamp?: string; imageCount?: number }) => {
      if (!data.content) return;
      const msgs = useMessageStore.getState().messages;
      const incomingTrimmed = data.content.trim();
      // Check against the last user message with trimmed comparison
      // (addOptimisticMessage stores content.trim(), so comparison must also trim).
      // Note: JSONL timestamps and buffer timestamps differ (different sources), so
      // timestamp-based dedup is unreliable here — content match is more robust.
      const lastUserMsg = [...msgs].reverse().find(m => m.type === 'user');
      const isDuplicate = !!lastUserMsg && lastUserMsg.content.trim() === incomingTrimmed;
      debugLog.stream('DEDUP user:message received', {
        sessionId: data.sessionId,
        contentPreview: data.content.slice(0, 50),
        msgCount: msgs.length,
        msgTypes: msgs.map(m => m.type),
        isDuplicate,
        lastUserContent: lastUserMsg?.content?.slice(0, 50),
        isStreaming: useChatStore.getState().isStreaming,
      });
      debugLog.message('user:message', {
        sessionId: data.sessionId,
        contentPreview: data.content.slice(0, 50),
        msgCount: msgs.length,
        isDuplicate,
        lastUserMsgId: lastUserMsg?.id,
      });
      if (!isDuplicate) {
        const placeholderImages: ImageAttachment[] | undefined = data.imageCount
          ? Array.from({ length: data.imageCount }, (_, i) => ({ mimeType: 'image/jpeg', data: '', name: `image-${i + 1}` }))
          : undefined;
        useMessageStore.getState().addOptimisticMessage(data.content, placeholderImages, data.timestamp);
        debugLog.stream('DEDUP user:message → added optimistic', {
          newMsgCount: useMessageStore.getState().messages.length,
        });
      }
      // Detect /compact command and restore compacting indicator
      if (incomingTrimmed === '/compact') {
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
    const handleThinkingChunk = (data: { content: string }) => {
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
      // Flush pending text before thinking segment to maintain correct ordering
      flushChunkQueue();
      addStreamingThinking(data.content);
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

      enqueueChunk(data.content);
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
      // Flush any buffered chunks before completing
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

      // Freeze segments and fetch authoritative history from server
      completeStreaming();
      fetchAndClearSegments();
    };

    // Handle tool call start - add tool segment (skip AskUserQuestion — handled via permission:request)
    const handleToolCall = (data: { id: string; name: string; input?: Record<string, unknown>; startedAt?: number }) => {
      // Skip AskUserQuestion from stream events — stream-based tool:call has empty input
      // because input_json_delta hasn't been fully received yet. The interactive card is
      // created later via permission:request (from canUseTool) which has the full input.
      if (data.name === 'AskUserQuestion') {
        return;
      }

      // Flush pending text BEFORE inserting tool segment to prevent message splitting.
      // Without this, buffered text would drain after the tool segment and create a
      // new text segment (visually splitting the assistant's response).
      flushChunkQueue();

      addStreamingToolCall({
        id: data.id,
        name: data.name,
        input: data.input,
        startedAt: data.startedAt,
      });
    };

    // Handle permission:request event — add interactive segment for permission or question (Story 7.1)
    const handlePermissionRequest = (data: PermissionRequest) => {
      // Flush pending text before interactive/permission segment
      flushChunkQueue();
      debugLog.stream('permission:request received', {
        permissionId: data.id,
        toolCallId: data.toolCall.id,
        toolName: data.toolCall.name,
        alreadySeen: seenPermissionIds.current.has(data.id),
        segmentCount: useChatStore.getState().streamingSegments.length,
        existingToolIds: useChatStore.getState().streamingSegments
          .filter(s => s.type === 'tool')
          .map(s => (s as { type: 'tool'; toolCall: { id: string } }).toolCall.id),
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
          addInteractiveSegment({
            id: data.id,
            interactionType: 'question',
            toolCall: { id: data.toolCall.id, name: data.toolCall.name, input: data.toolCall.input },
            choices: firstQuestion.choices,
            questions: mappedQuestions,
            multiSelect: firstQuestion.multiSelect,
          });
          return;
        }
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
    const handlePermissionAlreadyResolved = (data: { requestId: string }) => {
      toast.info(i18n.t('notification:streaming.alreadyResponded'));
    };

    // Handle tool input update (for real-time file path display)
    const handleToolInputUpdate = (data: { toolCallId: string; input: Record<string, unknown> }) => {
      updateStreamingToolCallInput(data.toolCallId, data.input);
    };

    // Handle tool result - update tool segment status
    const handleToolResult = (data: { toolCallId: string; result: ToolResult }) => {
      const { success, output, error } = data.result;
      updateStreamingToolCall(data.toolCallId, output ?? error ?? '', !success);

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
    };

    // Handle context compaction notification
    const handleCompact = (data: CompactMetadata) => {
      flushChunkQueue();
      // Extend stale-data guard cooldown when compact arrives after streaming completed.
      // Auto-compact rewrites the JSONL file — without this, the cooldown from the
      // preceding message:complete could expire before the rewrite finishes, allowing
      // fetchMessages to overwrite in-memory messages with stale/partial JSONL data.
      if (!useChatStore.getState().isStreaming) {
        useChatStore.setState({ streamCompletedAt: Date.now() });
      }
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
      addSystemSegment(`Context compaction (${data.trigger})...`, 'compact');
    };

    // Handle tool:progress — update elapsed time on existing tool segment
    const handleToolProgress = (data: { toolUseId: string; elapsedTimeSeconds: number; toolName: string }) => {
      updateToolProgress(data.toolUseId, data.elapsedTimeSeconds);
    };

    // Handle system:task-notification — add task notification segment
    const handleTaskNotification = (data: TaskNotificationData) => {
      flushChunkQueue();
      addTaskNotification(data);
    };

    // Handle tool:summary — add tool summary segment
    const handleToolSummary = (data: { summary: string; precedingToolUseIds: string[] }) => {
      flushChunkQueue();
      addToolSummary(data.summary, data.precedingToolUseIds);
    };

    // Handle result:error — add result error segment before completion
    const handleResultError = (data: { subtype: string; errors?: string[]; totalCostUSD?: number; numTurns?: number; result: string }) => {
      flushChunkQueue();
      addResultError(data);
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

      // Clear reconnect timeout if set (Task 3)
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
      }

      if (data.active) {
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
        if (chatState.isStreaming) {
          const { currentProjectSlug } = useMessageStore.getState();
          if (currentProjectSlug && data.sessionId) {
            debugLog.stream('stream:status ACTIVE → fetching intermediate chain history', {
              sessionId: data.sessionId,
            });
            useMessageStore.getState().fetchMessages(currentProjectSlug, data.sessionId, { silent: true });
          }
        }
        restoreStreaming(data.sessionId);
        // Apply the stream's actual permission mode (overrides local preference)
        if (data.permissionMode) {
          useChatStore.setState({ permissionMode: data.permissionMode });
        }
        // Trim all messages after the last user message to avoid duplication
        // with buffer replay (which replays the entire assistant turn)
        trimMessagesAfterLastUser();
        debugLog.stream('DEDUP stream:status ACTIVE → after trim', {
          msgCount: useMessageStore.getState().messages.length,
          msgTypes: useMessageStore.getState().messages.map(m => m.type),
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
          // Freeze segments and fetch authoritative history from server
          completeStreaming();
          fetchAndClearSegments();
        } else {
          debugLog.stream('stream:status → inactive, no-op (not streaming)');
        }
      }
    };

    // Remove all messages after the last user message from the message store.
    // Called when restoring a background stream to prevent overlap between
    // fetched history (JSONL) and replayed buffer events. The entire assistant
    // turn (multiple assistant/tool_use messages) will be recreated from
    // streaming segments via completeStreaming.
    const trimMessagesAfterLastUser = () => {
      const msgs = useMessageStore.getState().messages;
      let lastUserIdx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].type === 'user') {
          lastUserIdx = i;
          break;
        }
      }
      if (lastUserIdx >= 0 && lastUserIdx < msgs.length - 1) {
        useMessageStore.setState({ messages: msgs.slice(0, lastUserIdx + 1) });
      }
    };

    // Handle stream:detached — another browser took over or user aborted from another viewer
    const handleStreamDetached = (data: { sessionId: string; reason: string }) => {
      const wasStreaming = useChatStore.getState().isStreaming;
      debugLog.stream('stream:detached', {
        reason: data.reason,
        isStreaming: wasStreaming,
      });
      if (wasStreaming) {
        flushChunkQueue();
        completeStreaming();
        fetchAndClearSegments();
      }

      if (data.reason === 'user-abort') {
        // Abort initiated from another viewer — just complete streaming, no lock needed.
        // If wasStreaming is false, this socket already called abortResponse() itself
        // (i.e., the user who initiated the abort) — skip the redundant toast.
        if (wasStreaming) {
          toast.info(i18n.t('notification:streaming.abortedInOtherBrowser'));
        }
      } else {
        // Another client took over (another-client) — lock this session
        useChatStore.setState({ isSessionLocked: true });
        toast.warning(i18n.t('notification:streaming.sessionInUseWarning'), {
          id: 'session-locked',
          duration: Infinity,
        });
      }

      // Fetch latest messages from server so this client has up-to-date history
      const msgState = useMessageStore.getState();
      const { currentProjectSlug, currentSessionId } = msgState;
      if (currentProjectSlug && currentSessionId) {
        // Delay slightly to allow server JSONL to flush
        setTimeout(() => {
          useMessageStore.getState().fetchMessages(currentProjectSlug, currentSessionId, { silent: true });
        }, 1000);
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
      // STATE-001: Reset isRewinding on reconnect failure to prevent stuck state
      if (useChatStore.getState().isRewinding) {
        useChatStore.setState({ isRewinding: false });
      }
    };

    // Handle server errors
    const handleError = (data?: unknown) => {
      const currentIsStreaming = useChatStore.getState().isStreaming;
      debugLog.socket('error', { isStreaming: currentIsStreaming, data });
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
      const localSeenPermissionIds = new Set<string>();
      // Track completed turns — when message:complete arrives, convert segments to messages
      const completedMessages: HistoryMessage[] = [];
      let lastResultError: ResultErrorData | null = null;

      /** Flush accumulated text into a text segment */
      const flushText = () => {
        if (pendingTextBuffer.length > 0) {
          // Merge into last text segment if possible
          const lastSeg = segments[segments.length - 1];
          if (lastSeg && lastSeg.type === 'text') {
            (lastSeg as { type: 'text'; content: string }).content += pendingTextBuffer;
          } else {
            segments.push({ type: 'text', content: pendingTextBuffer });
          }
          pendingTextBuffer = '';
        }
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

        switch (event) {
          case 'user:message': {
            const d = eventData as { content: string; sessionId: string; timestamp?: string; imageCount?: number };
            if (!d.content) break;
            const msgs = useMessageStore.getState().messages;
            const incomingTrimmed = d.content.trim();
            const lastUserMsg = [...msgs].reverse().find(m => m.type === 'user');
            if (!lastUserMsg || lastUserMsg.content.trim() !== incomingTrimmed) {
              // Create placeholder images for buffer replay (full data not stored in buffer).
              // addOptimisticMessage will try to restore from client-side cache first;
              // if not cached, these placeholders render as "[image attached]" in the UI.
              const placeholderImages: ImageAttachment[] | undefined = d.imageCount
                ? Array.from({ length: d.imageCount }, (_, i) => ({ mimeType: 'image/jpeg', data: '', name: `image-${i + 1}` }))
                : undefined;
              useMessageStore.getState().addOptimisticMessage(d.content, placeholderImages, d.timestamp);
            }
            if (incomingTrimmed === '/compact') isCompacting = true;
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
            pendingTextBuffer += d.content;
            break;
          }
          case 'thinking:chunk': {
            const d = eventData as { content: string };
            flushText();
            isCompacting = false;
            // Merge into last thinking segment
            const lastSeg = segments[segments.length - 1];
            if (lastSeg && lastSeg.type === 'thinking') {
              (lastSeg as { type: 'thinking'; content: string }).content += d.content;
            } else {
              segments.push({ type: 'thinking', content: d.content });
            }
            break;
          }
          case 'tool:call': {
            const d = eventData as { id: string; name: string; input?: Record<string, unknown>; startedAt?: number };
            if (d.name === 'AskUserQuestion') break;
            flushText();
            segments.push({
              type: 'tool',
              toolCall: { id: d.id, name: d.name, input: d.input, startedAt: d.startedAt },
              status: 'pending',
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
            const d = eventData as { toolCallId: string; result: ToolResult };
            const found = findToolSegment(d.toolCallId);
            if (found) {
              const toolSeg = found.seg as { type: 'tool'; toolCall: StreamingToolCall; status: string };
              toolSeg.toolCall.output = d.result.output ?? d.result.error ?? '';
              toolSeg.status = d.result.success ? 'completed' : 'error';
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
          case 'system:task-notification': {
            const d = eventData as TaskNotificationData;
            flushText();
            segments.push({ type: 'task_notification', ...d });
            break;
          }
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
            const viewingSessionId = useMessageStore.getState().currentSessionId;
            if (viewingSessionId && viewingSessionId === d.sessionId) {
              useChainStore.getState().setChainItems(d.items);
            }
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
        chatStateUpdate.streamCompletedAt = Date.now();
      } else if (hasCompletedTurns) {
        // Buffer only had completed turns (all converted to messages via addMessages).
        // Don't set isStreaming — the stream may have already completed (server sent
        // active: false). Completed turn messages are now in messageStore and should
        // be visible without displayMessages filtering them.
        chatStateUpdate.streamingMessageId = null;
        chatStateUpdate.streamingSegments = [];
        chatStateUpdate.streamCompletedAt = Date.now();
      } else {
        // Empty/metadata-only buffer — clear 'restoring' sentinel so spinner disappears.
        chatStateUpdate.streamingMessageId = null;
      }
      if (contextUsage) chatStateUpdate.contextUsage = contextUsage;
      if (activeModel) chatStateUpdate.activeModel = activeModel;
      if (isCompacting) chatStateUpdate.isCompacting = true;
      if (lastResultError) chatStateUpdate.lastResultError = lastResultError;

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
    socket.on('session:created', handleSessionInit);
    socket.on('session:resumed', handleSessionInit);
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
    socket.on('stream:status', handleStreamStatus);
    socket.on('stream:buffer-replay', handleBufferReplay);
    socket.on('stream:detached', handleStreamDetached);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleReconnect);
    socket.on('error', handleError);

    // Handle chain:update — server-synced prompt chain state (Story 24.2)
    const handleChainUpdate = (data: { sessionId: string; items: PromptChainItem[] }) => {
      const viewingSessionId = useMessageStore.getState().currentSessionId;
      if (!viewingSessionId || viewingSessionId !== data.sessionId) return;
      useChainStore.getState().setChainItems(data.items);
    };
    socket.on('chain:update', handleChainUpdate);

    // Story 25.2: Handle chat:rewound — rewind/regenerate result from server
    const handleChatRewound = (data: { sessionId: string; truncatedBeforeMessageId: string; success: boolean; error?: string; warning?: string }) => {
      // CLIENT-001: Validate sessionId matches the currently viewed session
      // This prevents refreshing the wrong session if user switches sessions before response arrives.
      // For passive viewers (isRewinding=false), refresh if sessionId matches current session.
      const { currentSessionId, currentProjectSlug } = useMessageStore.getState();
      const isRewinding = useChatStore.getState().isRewinding;

      if (!isRewinding) {
        // Passive viewer: refresh if this event is for the currently viewed session
        if (data.success && data.sessionId && currentSessionId === data.sessionId && currentProjectSlug) {
          useMessageStore.getState().fetchMessages(currentProjectSlug, currentSessionId, { silent: true, force: true }).catch(() => {});
        }
        return;
      }

      // STATE-001: Active rewinder: verify sessionId matches.
      // If mismatch (user switched sessions before response), reset isRewinding to prevent stuck state.
      if (data.sessionId && currentSessionId && data.sessionId !== currentSessionId) {
        useChatStore.setState({ isRewinding: false });
        return;
      }

      if (data.success) {
        // Refresh history from server
        if (currentProjectSlug && currentSessionId) {
          useMessageStore.getState().fetchMessages(currentProjectSlug, currentSessionId, { silent: true, force: true }).then(() => {
            useChatStore.setState({ isRewinding: false });
          }).catch(() => {
            useChatStore.setState({ isRewinding: false });
          });
        } else {
          useChatStore.setState({ isRewinding: false });
        }
        // UX-001: Show warning toast for partial success (e.g., git checkout failed, no user message for regenerate)
        if (data.warning) {
          toast.warning(data.warning);
        }
      } else {
        useChatStore.setState({ isRewinding: false });
        toast.error(data.error || i18n.t('chat:rewindDialog.error.rewindFailed'));
      }
    };
    socket.on('chat:rewound', handleChatRewound);

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
      socket.off('system:task-notification', handleTaskNotification);
      socket.off('tool:summary', handleToolSummary);
      socket.off('result:error', handleResultError);
      socket.off('permission:mode-change', handlePermissionModeChange);
      socket.off('rateLimit:update', handleRateLimitUpdate);
      socket.off('apiHealth:update', handleApiHealthUpdate);
      socket.off('stream:status', handleStreamStatus);
      socket.off('stream:buffer-replay', handleBufferReplay);
      socket.off('stream:detached', handleStreamDetached);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleReconnect);
      socket.off('error', handleError);
      socket.off('chain:update', handleChainUpdate);
      socket.off('chat:rewound', handleChatRewound);
      socket.io.off('reconnect_failed', handleReconnectFailed);
      document.removeEventListener('keydown', handleKeyDown);
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
