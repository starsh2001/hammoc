/**
 * useStreaming Hook - Manages real-time streaming state via WebSocket
 * [Source: Story 4.5 - Task 2]
 *
 * Features:
 * - WebSocket event listeners for message:chunk and message:complete
 * - Reconnection handling with streaming state recovery
 * - Escape key to abort streaming
 * - Automatic cleanup on unmount
 */

import { useEffect, useCallback } from 'react';
import { getSocket } from '../services/socket';
import { useChatStore } from '../stores/chatStore';
import { useMessageStore } from '../stores/messageStore';
import type { StreamChunk, Message } from '@bmad-studio/shared';

export function useStreaming() {
  const { startStreaming, appendStreamingContent, addStreamingToolCall, updateStreamingToolCallInput, completeStreamingToolCall, completeStreaming, abortStreaming } =
    useChatStore();
  const { fetchMessages, currentProjectSlug, currentSessionId } = useMessageStore();

  // Handle Escape key to abort streaming
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape' && useChatStore.getState().isStreaming) {
      event.preventDefault();
      abortStreaming();
    }
  }, [abortStreaming]);

  useEffect(() => {
    const socket = getSocket();

    // Handle incoming stream chunks
    const handleChunk = (data: StreamChunk) => {
      const state = useChatStore.getState();
      if (!state.isStreaming) {
        startStreaming(data.sessionId, data.messageId);
      }
      appendStreamingContent(data.content);
    };

    // Handle stream completion
    const handleComplete = (_data: Message) => {
      completeStreaming();
      // Refresh messages to get the complete message from server
      if (currentProjectSlug && currentSessionId) {
        fetchMessages(currentProjectSlug, currentSessionId);
      }
    };

    // Handle tool call start
    const handleToolCall = (data: { id: string; name: string; input?: Record<string, unknown> }) => {
      addStreamingToolCall({
        id: data.id,
        name: data.name,
        input: data.input,
        status: 'pending',
      });
    };

    // Handle tool input update (for real-time file path display)
    const handleToolInputUpdate = (data: { toolCallId: string; input: Record<string, unknown> }) => {
      updateStreamingToolCallInput(data.toolCallId, data.input);
    };

    // Handle tool result (mark tool as completed)
    const handleToolResult = (data: { toolCallId: string }) => {
      completeStreamingToolCall(data.toolCallId);
    };

    // Handle disconnection during streaming
    const handleDisconnect = () => {
      // Keep streaming state - wait for reconnect
    };

    // Handle successful reconnection
    const handleReconnect = () => {
      const state = useChatStore.getState();
      if (state.isStreaming && state.streamingMessage) {
        // Request current streaming status from server
        socket.emit('streaming:status' as 'chat:send', {
          content: '',
          workingDirectory: '',
          sessionId: state.streamingMessage.sessionId,
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
    completeStreamingToolCall,
    completeStreaming,
    abortStreaming,
    handleKeyDown,
    fetchMessages,
    currentProjectSlug,
    currentSessionId,
  ]);
}
