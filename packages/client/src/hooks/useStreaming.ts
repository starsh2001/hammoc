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
        const attemptFetch = async (retryMs?: number) => {
          const store = useMessageStore.getState();
          const countBefore = store.messages.length;
          await store.fetchMessages(projectSlug, sessId, { silent: true, minMessageCount: countBefore });
          const countAfter = useMessageStore.getState().messages.length;
          if (countAfter > countBefore) {
            // History updated — safe to clear streaming segments
            useChatStore.getState().clearStreamingSegments();
          } else if (retryMs) {
            // Stale data (SDK hasn't flushed JSONL yet) — retry once
            setTimeout(() => attemptFetch(), retryMs);
          }
        };
        setTimeout(() => attemptFetch(3000), 2000);
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

    // Handle context usage update (also extracts model from result)
    const handleContextUsage = (data: ChatUsage) => {
      setContextUsage(data);
      if (data.model) {
        useChatStore.getState().setActiveModel(data.model);
      }
    };

    // Handle disconnection during streaming
    const handleDisconnect = () => {
      // Keep streaming state - wait for reconnect
    };

    // Handle successful reconnection
    const handleReconnect = () => {
      const state = useChatStore.getState();
      if (state.isStreaming && state.streamingSessionId) {
        // Request current streaming status from server
        socket.emit('streaming:status' as 'chat:send', {
          content: '',
          workingDirectory: '',
          sessionId: state.streamingSessionId,
        });
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
    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleReconnect);
    socket.on('error', handleError);
    socket.io.on('reconnect_failed', handleReconnectFailed);

    // Register keyboard event listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
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
    handleKeyDown,
  ]);
}
