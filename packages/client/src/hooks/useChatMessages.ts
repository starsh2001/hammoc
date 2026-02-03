/**
 * Chat Messages Hook
 * Story 1.5: End-to-End Test Page
 *
 * Manages chat messages state with WebSocket event handling
 * and requestAnimationFrame throttling for streaming performance
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../services/socket';
import type { DisplayMessage, StreamChunk, Message, ToolCall, ToolResult } from '@bmad-studio/shared';

interface ChatError {
  code: string;
  message: string;
}

export interface SendMessageOptions {
  sessionId?: string;
  resume?: boolean;
}

export interface UseChatMessagesReturn {
  messages: DisplayMessage[];
  streamingContent: string;
  isStreaming: boolean;
  lastError: ChatError | null;
  sendMessage: (content: string, workingDirectory: string, options?: SendMessageOptions) => void;
  clearError: () => void;
  clearMessages: () => void;
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Hook for managing chat messages with WebSocket streaming
 * @returns Chat messages state and control functions
 */
export function useChatMessages(): UseChatMessagesReturn {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [lastError, setLastError] = useState<ChatError | null>(null);

  // Refs for throttled streaming updates
  const contentRef = useRef<string>('');
  const updateScheduled = useRef<boolean>(false);
  const currentSessionIdRef = useRef<string>('');

  const socket = getSocket();

  /**
   * Send a message to the server
   */
  const sendMessage = useCallback(
    (content: string, workingDirectory: string, options?: SendMessageOptions) => {
      const messageSessionId = options?.sessionId || generateMessageId();
      currentSessionIdRef.current = messageSessionId;

      // Add user message to messages
      const userMessage: DisplayMessage = {
        id: generateMessageId(),
        type: 'user',
        content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setLastError(null);
      contentRef.current = '';
      setStreamingContent('');

      // Emit chat:send event with session options
      socket.emit('chat:send', {
        content,
        workingDirectory,
        sessionId: options?.sessionId,
        resume: options?.resume,
      });
    },
    [socket]
  );

  /**
   * Clear the last error
   */
  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  /**
   * Clear all messages
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingContent('');
    contentRef.current = '';
  }, []);

  useEffect(() => {
    /**
     * Handle message:chunk event with requestAnimationFrame throttling
     */
    const handleMessageChunk = (chunk: StreamChunk) => {
      contentRef.current += chunk.content;

      if (!updateScheduled.current) {
        updateScheduled.current = true;
        requestAnimationFrame(() => {
          setStreamingContent(contentRef.current);
          updateScheduled.current = false;
        });
      }
    };

    /**
     * Handle message:complete event
     */
    const handleMessageComplete = (message: Message) => {
      // Add assistant message with accumulated content
      const assistantMessage: DisplayMessage = {
        id: message.id || generateMessageId(),
        type: 'assistant',
        content: contentRef.current || message.content,
        timestamp: new Date(message.timestamp),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingContent('');
      contentRef.current = '';
      setIsStreaming(false);
    };

    /**
     * Handle tool:call event
     */
    const handleToolCall = (toolCall: ToolCall) => {
      const toolUseMessage: DisplayMessage = {
        id: generateMessageId(),
        type: 'tool_use',
        content: toolCall.name,
        timestamp: new Date(),
        toolCall: {
          name: toolCall.name,
          arguments: toolCall.input,
        },
      };

      setMessages((prev) => [...prev, toolUseMessage]);
    };

    /**
     * Handle tool:result event
     */
    const handleToolResult = (data: { toolCallId: string; result: ToolResult }) => {
      const toolResultMessage: DisplayMessage = {
        id: generateMessageId(),
        type: 'tool_result',
        content: data.result.success ? (data.result.output || 'Success') : (data.result.error || 'Error'),
        timestamp: new Date(),
        toolResult: {
          success: data.result.success,
          output: data.result.output,
          error: data.result.error,
        },
      };

      setMessages((prev) => [...prev, toolResultMessage]);
    };

    /**
     * Handle error event
     */
    const handleError = (error: { code: string; message: string }) => {
      setLastError({
        code: error.code,
        message: error.message,
      });
      setIsStreaming(false);

      // Add error message to messages
      const errorMessage: DisplayMessage = {
        id: generateMessageId(),
        type: 'error',
        content: `[${error.code}] ${error.message}`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    };

    // Register event listeners
    socket.on('message:chunk', handleMessageChunk);
    socket.on('message:complete', handleMessageComplete);
    socket.on('tool:call', handleToolCall);
    socket.on('tool:result', handleToolResult);
    socket.on('error', handleError);

    // Cleanup on unmount
    return () => {
      socket.off('message:chunk', handleMessageChunk);
      socket.off('message:complete', handleMessageComplete);
      socket.off('tool:call', handleToolCall);
      socket.off('tool:result', handleToolResult);
      socket.off('error', handleError);
    };
  }, [socket]);

  return {
    messages,
    streamingContent,
    isStreaming,
    lastError,
    sendMessage,
    clearError,
    clearMessages,
  };
}
