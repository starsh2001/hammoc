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
import { getSocket } from '../services/socket';
import { useChatStore } from '../stores/chatStore';
import { useMessageStore } from '../stores/messageStore';
import { debugLog } from '../utils/debugLogger';
import type { StreamChunk, Message, ChatUsage, PermissionRequest, ToolResult, CompactMetadata, TaskNotificationData } from '@bmad-studio/shared';
import type { InteractiveStatus } from '../stores/chatStore';

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

    // Escape key → abort
    if (event.key === 'Escape') {
      event.preventDefault();
      abortResponse();
      return;
    }

    // Ctrl+C (Windows/Linux) or Cmd+C (macOS) → abort (only if no text selected)
    if (event.key === 'c' && (event.ctrlKey || event.metaKey)) {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        // No text selected — treat as abort
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
    const handleUserMessage = (data: { content: string; sessionId: string }) => {
      if (!data.content) return;
      const msgs = useMessageStore.getState().messages;
      const incomingTrimmed = data.content.trim();
      // Check against the last user message with trimmed comparison
      // (addOptimisticMessage stores content.trim(), so comparison must also trim)
      const lastUserMsg = [...msgs].reverse().find(m => m.type === 'user');
      const isDuplicate = lastUserMsg && lastUserMsg.content.trim() === incomingTrimmed;
      console.log('[DEDUP] user:message received', {
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
        useMessageStore.getState().addOptimisticMessage(data.content);
        console.log('[DEDUP] user:message → added optimistic', {
          newMsgCount: useMessageStore.getState().messages.length,
        });
      }
      // Detect /compact command and restore compacting indicator
      if (incomingTrimmed.startsWith('/compact')) {
        useChatStore.setState({ isCompacting: true });
      }
    };

    // Handle incoming thinking chunks
    const handleThinkingChunk = (data: { content: string }) => {
      const state = useChatStore.getState();
      // Only call startStreaming when null (first chunk) — 'pending' means already started
      if (state.streamingSessionId === null) {
        startStreaming('pending', 'pending');
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
      if (state.streamingSessionId === null) {
        // First chunk — initialize streaming state
        startStreaming(data.sessionId, data.messageId);
      } else if (state.streamingSessionId === 'pending') {
        // Update sessionId without resetting segments (preserves thinking content)
        updateStreamingSessionId(data.sessionId);
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
            response: '(reconnect 전 응답됨)',
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

      // Complete streaming: converts segments to messages and clears them
      // No need to fetch from JSONL - data is already in memory
      console.log('[DEDUP] message:complete → before completeStreaming', {
        segCount: useChatStore.getState().streamingSegments.length,
        segTypes: useChatStore.getState().streamingSegments.map(s => s.type),
        msgCount: useMessageStore.getState().messages.length,
        msgTypes: useMessageStore.getState().messages.map(m => m.type),
      });
      completeStreaming();
      console.log('[DEDUP] message:complete → after completeStreaming', {
        msgCount: useMessageStore.getState().messages.length,
        msgTypes: useMessageStore.getState().messages.map(m => m.type),
        isStreaming: useChatStore.getState().isStreaming,
        segCount: useChatStore.getState().streamingSegments.length,
      });
    };

    // Handle tool call start - add tool segment (skip AskUserQuestion — handled via permission:request)
    const handleToolCall = (data: { id: string; name: string; input?: Record<string, unknown> }) => {
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

      // Default: attach permission to existing tool segment
      setToolPermission(data.toolCall.id, data.id);
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
            response: '(reconnect 전 응답됨)',
          };
          useChatStore.setState({ streamingSegments: updated });
        }
      }
    };

    // Handle context compaction notification
    const handleCompact = (data: CompactMetadata) => {
      flushChunkQueue();
      // Set isCompacting first (before adding segment) so MessageArea shows correct indicator
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

    // Handle session:created / session:resumed — update streamingSessionId as early as possible
    // (fires before message:chunk, so URL can navigate from /new to real sessionId immediately)
    const handleSessionInit = (data: { sessionId: string; model?: string }) => {
      const state = useChatStore.getState();
      debugLog.stream('session:init', {
        sessionId: data.sessionId,
        model: data.model,
        currentStreamingSessionId: state.streamingSessionId,
        isStreaming: state.isStreaming,
      });
      if (!state.streamingSessionId || state.streamingSessionId === 'pending') {
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
      });
      // Only use result usage for model extraction and cost tracking;
      // context window percentage comes from assistant:usage instead
      if (data.model) {
        useChatStore.getState().setActiveModel(data.model);
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
        contextWindow: existing?.contextWindow ?? 200000,
        model: existing?.model,
      });
    };

    // Handle stream:status — server tells us if a background stream exists
    const handleStreamStatus = (data: { active: boolean; sessionId: string }) => {
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
        console.log('[DEDUP] stream:status ACTIVE → before restoreStreaming', {
          sessionId: data.sessionId,
          msgCount: useMessageStore.getState().messages.length,
          msgTypes: useMessageStore.getState().messages.map(m => m.type),
          prevIsStreaming: chatState.isStreaming,
          prevSegCount: chatState.streamingSegments.length,
        });
        restoreStreaming(data.sessionId);
        // Trim all messages after the last user message to avoid duplication
        // with buffer replay (which replays the entire assistant turn)
        trimMessagesAfterLastUser();
        console.log('[DEDUP] stream:status ACTIVE → after trim', {
          msgCount: useMessageStore.getState().messages.length,
          msgTypes: useMessageStore.getState().messages.map(m => m.type),
        });
        debugLog.stream('stream:status → restored', { sessionId: data.sessionId });
      } else {
        // Stream not active — if we were streaming, the stream completed during disconnect.
        // Clean up stale streaming state and fetch authoritative history.
        if (chatState.isStreaming) {
          flushChunkQueue();
          debugLog.stream('stream:status → completing stale stream', {
            sessionId: data.sessionId,
          });
          // Complete streaming: converts segments to messages and clears them
          completeStreaming();
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

    // Handle stream:detached — another browser took over this stream
    const handleStreamDetached = () => {
      debugLog.stream('stream:detached', {
        isStreaming: useChatStore.getState().isStreaming,
      });
      if (useChatStore.getState().isStreaming) {
        flushChunkQueue();
        completeStreaming();
      }
      // Lock this session until page refresh — prevents sending messages
      // from a stale browser while another browser is actively using this session
      useChatStore.setState({ isSessionLocked: true });
      toast.warning('다른 브라우저에서 이 세션을 사용 중입니다. 새로고침 후 다시 사용할 수 있습니다.', {
        duration: Infinity,
      });

      // Fetch latest messages from server so this client has up-to-date history
      // (the other browser may receive additional responses after taking over)
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
        debugLog.reconnect('session:join emitted', { sessionId });
        socket.emit('session:join', sessionId);

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
    };

    // Handle server errors
    const handleError = () => {
      debugLog.socket('error', { isStreaming: useChatStore.getState().isStreaming });
      clearChunkQueue();
      abortStreaming();
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
    socket.on('context:usage', handleContextUsage);
    socket.on('assistant:usage', handleAssistantUsage);
    socket.on('system:compact', handleCompact);
    socket.on('tool:progress', handleToolProgress);
    socket.on('system:task-notification', handleTaskNotification);
    socket.on('tool:summary', handleToolSummary);
    socket.on('result:error', handleResultError);
    socket.on('stream:status', handleStreamStatus);
    socket.on('stream:detached', handleStreamDetached);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleReconnect);
    socket.on('error', handleError);
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
      socket.off('context:usage', handleContextUsage);
      socket.off('assistant:usage', handleAssistantUsage);
      socket.off('system:compact', handleCompact);
      socket.off('tool:progress', handleToolProgress);
      socket.off('system:task-notification', handleTaskNotification);
      socket.off('tool:summary', handleToolSummary);
      socket.off('result:error', handleResultError);
      socket.off('stream:status', handleStreamStatus);
      socket.off('stream:detached', handleStreamDetached);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleReconnect);
      socket.off('error', handleError);
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
