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
import { getSocket } from '../services/socket';
import { useChatStore } from '../stores/chatStore';
import { useMessageStore } from '../stores/messageStore';
import type { StreamChunk, Message, ChatUsage, PermissionRequest, ToolResult, CompactMetadata, TaskNotificationData } from '@bmad-studio/shared';

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

    // Handle user:message from buffer replay (restores the user's sent message
    // when reconnecting before SDK has flushed the JSONL file)
    const handleUserMessage = (data: { content: string; sessionId: string }) => {
      if (!data.content) return;
      const msgs = useMessageStore.getState().messages;
      // Add if not already present as the last user message (handles both
      // empty store and existing history where JSONL hasn't flushed the latest message)
      const lastUserMsg = [...msgs].reverse().find(m => m.type === 'user');
      if (!lastUserMsg || lastUserMsg.content !== data.content) {
        useMessageStore.getState().addOptimisticMessage(data.content);
      }
      // Detect /compact command and restore compacting indicator
      if (data.content.trim().startsWith('/compact')) {
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
      addStreamingThinking(data.content);
    };

    // Handle incoming stream chunks
    const handleChunk = (data: StreamChunk) => {
      const state = useChatStore.getState();
      if (state.streamingSessionId === null) {
        // First chunk — initialize streaming state
        startStreaming(data.sessionId, data.messageId);
      } else if (state.streamingSessionId === 'pending') {
        // Update sessionId without resetting segments (preserves thinking content)
        updateStreamingSessionId(data.sessionId);
      }
      appendStreamingContent(data.content);
    };

    // Handle stream completion
    const handleComplete = async (data: Message) => {
      // Update streamingSessionId with the actual sessionId from result
      // (SDK doesn't send 'init' message, so sessionId only comes in 'result')
      const chatState = useChatStore.getState();
      // Update sessionId if not yet set, pending, or empty string (from no-init resume mode)
      // Use updateStreamingSessionId to avoid resetting segments
      if (data.sessionId && (!chatState.streamingSessionId || chatState.streamingSessionId === 'pending')) {
        updateStreamingSessionId(data.sessionId);
      }

      completeStreaming();

      // Background sync: fetch authoritative history (includes tool calls, thinking blocks, etc.)
      // Deferred to allow SDK time to flush JSONL session file to disk.
      // Streaming segments are kept visible (correct interleaved order) until history loads.
      // After successful fetch, clear streaming segments to avoid duplication with history.
      const msgState = useMessageStore.getState();
      const projectSlug = msgState.currentProjectSlug;
      const sessId = msgState.currentSessionId;

      if (projectSlug && sessId) {
        const INITIAL_DELAY = 2000; // completeStreaming → first fetch wait (SDK JSONL flush time)
        const MAX_RETRIES = 3;
        const RETRY_DELAYS = [2000, 3000, 5000]; // Progressive retry delays
        const ABSOLUTE_TIMEOUT = 15000; // 15s absolute timeout

        // Absolute timeout fallback: clear segments no matter what
        const timeoutId = setTimeout(() => {
          useChatStore.getState().clearStreamingSegments();
        }, ABSOLUTE_TIMEOUT);

        // Store timeoutId in chatStore for cleanup on rapid successive completions
        useChatStore.getState().setSegmentCleanupTimeoutId(timeoutId);

        const attemptFetch = async (attempt: number) => {
          const store = useMessageStore.getState();
          const countBefore = store.messages.length;
          await store.fetchMessages(projectSlug, sessId, { silent: true, minMessageCount: countBefore });
          const countAfter = useMessageStore.getState().messages.length;
          if (countAfter > countBefore) {
            // History updated — safe to clear segments
            clearTimeout(timeoutId);
            useChatStore.getState().clearStreamingSegments();
          } else if (attempt < MAX_RETRIES) {
            // Retry with increasing delay
            setTimeout(() => attemptFetch(attempt + 1), RETRY_DELAYS[attempt] ?? 5000);
          } else {
            // All retries exhausted — force clear segments
            clearTimeout(timeoutId);
            useChatStore.getState().clearStreamingSegments();
          }
        };

        setTimeout(() => attemptFetch(0), INITIAL_DELAY);
      } else {
        // No session context — clear segments immediately
        useChatStore.getState().clearStreamingSegments();
      }
    };

    // Handle tool call start - add tool segment (skip AskUserQuestion — handled via permission:request)
    const handleToolCall = (data: { id: string; name: string; input?: Record<string, unknown> }) => {
      // Skip AskUserQuestion from stream events — stream-based tool:call has empty input
      // because input_json_delta hasn't been fully received yet. The interactive card is
      // created later via permission:request (from canUseTool) which has the full input.
      if (data.name === 'AskUserQuestion') {
        return;
      }

      addStreamingToolCall({
        id: data.id,
        name: data.name,
        input: data.input,
      });
    };

    // Handle permission:request event — add interactive segment for permission or question (Story 7.1)
    const handlePermissionRequest = (data: PermissionRequest) => {
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
    };

    // Handle context compaction notification
    const handleCompact = (data: CompactMetadata) => {
      addSystemSegment(`Context compaction (${data.trigger})...`);
    };

    // Handle tool:progress — update elapsed time on existing tool segment
    const handleToolProgress = (data: { toolUseId: string; elapsedTimeSeconds: number; toolName: string }) => {
      updateToolProgress(data.toolUseId, data.elapsedTimeSeconds);
    };

    // Handle system:task-notification — add task notification segment
    const handleTaskNotification = (data: TaskNotificationData) => {
      addTaskNotification(data);
    };

    // Handle tool:summary — add tool summary segment
    const handleToolSummary = (data: { summary: string; precedingToolUseIds: string[] }) => {
      addToolSummary(data.summary, data.precedingToolUseIds);
    };

    // Handle result:error — add result error segment before completion
    const handleResultError = (data: { subtype: string; errors?: string[]; totalCostUSD?: number; numTurns?: number; result: string }) => {
      addResultError(data);
    };

    // Handle session:created / session:resumed — update streamingSessionId as early as possible
    // (fires before message:chunk, so URL can navigate from /new to real sessionId immediately)
    const handleSessionInit = (data: { sessionId: string; model?: string }) => {
      const state = useChatStore.getState();
      if (!state.streamingSessionId || state.streamingSessionId === 'pending') {
        updateStreamingSessionId(data.sessionId);
      }
    };

    // Handle context usage update (also extracts model from result)
    const handleContextUsage = (data: ChatUsage) => {
      setContextUsage(data);
      if (data.model) {
        useChatStore.getState().setActiveModel(data.model);
      }
    };

    // Handle stream:status — server tells us if a background stream exists
    const handleStreamStatus = (data: { active: boolean; sessionId: string }) => {
      if (data.active) {
        // Clear seen permissions so replayed permission:request events are processed
        seenPermissionIds.current.clear();
        restoreStreaming(data.sessionId);
        // Trim the last assistant message from history to avoid duplication
        // with buffer replay (which provides the complete streaming version)
        trimLastAssistantMessage();
      }
    };

    // Remove the last assistant message from the message store.
    // Called when restoring a background stream to prevent overlap between
    // fetched history (JSONL) and replayed buffer events.
    const trimLastAssistantMessage = () => {
      const msgs = useMessageStore.getState().messages;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].type === 'assistant') {
          useMessageStore.setState({ messages: msgs.slice(0, i) });
          break;
        }
      }
    };

    // Handle stream:detached — another browser took over this stream
    const handleStreamDetached = () => {
      if (useChatStore.getState().isStreaming) {
        addSystemSegment('다른 브라우저에서 이 세션에 연결되어 실시간 스트리밍이 중단되었습니다.', 'info');
        completeStreaming();
      }
    };

    // Handle disconnection during streaming
    const handleDisconnect = () => {
      // Keep streaming state - wait for reconnect
    };

    // Handle successful reconnection — re-join session mid-stream.
    // Initial background-stream probe is handled by ChatPage's emitJoin,
    // so this only fires for genuine reconnections while already streaming.
    const handleReconnect = () => {
      if (!useChatStore.getState().isStreaming) return;
      const sessionId = useChatStore.getState().streamingSessionId
        || useMessageStore.getState().currentSessionId;
      if (sessionId && sessionId !== 'pending') {
        socket.emit('session:join', sessionId);
      }
    };

    // Handle reconnection failure
    const handleReconnectFailed = () => {
      if (useChatStore.getState().isStreaming) {
        abortStreaming();
      }
    };

    // Handle server errors
    const handleError = () => {
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
