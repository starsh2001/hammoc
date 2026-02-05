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

import { useEffect, useCallback } from 'react';
import { getSocket } from '../services/socket';
import { useChatStore } from '../stores/chatStore';
import { useMessageStore } from '../stores/messageStore';
import type { StreamChunk, Message, ChatUsage } from '@bmad-studio/shared';

export function useStreaming() {
  const {
    startStreaming,
    appendStreamingContent,
    addStreamingToolCall,
    updateStreamingToolCallInput,
    updateStreamingToolCall,
    completeStreaming,
    abortStreaming,
    abortResponse,
    setContextUsage,
    updateStreamingSessionId,
  } = useChatStore();

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

    // Handle incoming stream chunks
    const handleChunk = (data: StreamChunk) => {
      const state = useChatStore.getState();
      // Start streaming if not yet started, or update sessionId if still 'pending'
      // Note: Check explicitly for null/pending, not falsy (empty string '' is valid sessionId)
      if (state.streamingSessionId === null || state.streamingSessionId === 'pending') {
        startStreaming(data.sessionId, data.messageId);
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

      // Use getState() for fresh values instead of potentially stale closure values
      const msgState = useMessageStore.getState();
      const projectSlug = msgState.currentProjectSlug;
      const sessId = msgState.currentSessionId;

      if (projectSlug && sessId) {
        // Fetch authoritative message list from server
        await msgState.fetchMessages(projectSlug, sessId, { silent: true });
      } else if (data.content && data.content.trim() && data.content.trim() !== '(no content)') {
        // New session: server data contains the complete message — add it directly
        // Skip empty content and placeholder "(no content)" from Claude Code
        msgState.addMessages([{
          id: data.id,
          type: 'assistant',
          content: data.content,
          timestamp: typeof data.timestamp === 'string'
            ? data.timestamp
            : new Date(data.timestamp).toISOString(),
        }]);
      }
      completeStreaming();
    };

    // Handle tool call start - add tool segment
    const handleToolCall = (data: { id: string; name: string; input?: Record<string, unknown> }) => {
      addStreamingToolCall({
        id: data.id,
        name: data.name,
        input: data.input,
      });
    };

    // Handle tool input update (for real-time file path display)
    const handleToolInputUpdate = (data: { toolCallId: string; input: Record<string, unknown> }) => {
      updateStreamingToolCallInput(data.toolCallId, data.input);
    };

    // Handle tool result - update tool segment status
    const handleToolResult = (data: { toolCallId: string; output?: string; isError?: boolean }) => {
      updateStreamingToolCall(data.toolCallId, data.output ?? '', data.isError);
    };

    // Handle context usage update
    const handleContextUsage = (data: ChatUsage) => {
      setContextUsage(data);
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
    socket.on('message:complete', handleComplete);
    socket.on('tool:call', handleToolCall);
    socket.on('tool:input-update', handleToolInputUpdate);
    socket.on('tool:result', handleToolResult);
    socket.on('context:usage', handleContextUsage);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleReconnect);
    socket.on('error', handleError);
    socket.io.on('reconnect_failed', handleReconnectFailed);

    // Register keyboard event listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      socket.off('message:chunk', handleChunk);
      socket.off('message:complete', handleComplete);
      socket.off('tool:call', handleToolCall);
      socket.off('tool:input-update', handleToolInputUpdate);
      socket.off('tool:result', handleToolResult);
      socket.off('context:usage', handleContextUsage);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleReconnect);
      socket.off('error', handleError);
      socket.io.off('reconnect_failed', handleReconnectFailed);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    startStreaming,
    appendStreamingContent,
    addStreamingToolCall,
    updateStreamingToolCallInput,
    updateStreamingToolCall,
    completeStreaming,
    abortStreaming,
    abortResponse,
    setContextUsage,
    updateStreamingSessionId,
    handleKeyDown,
  ]);
}
