/**
 * StreamHandler Service
 * Processes SDK streaming responses and dispatches events via callbacks
 */

import type { SDKMessage } from '@anthropic-ai/claude-code';
import type { ChatResponse } from '@bmad-studio/shared';
import {
  SDKMessageType,
  ContentBlockType,
  type ParsedSDKMessage,
  type ParsedContentBlock,
  type ParsedInitMessage,
  type ParsedAssistantMessage,
  type ParsedUserMessage,
  type ParsedResultMessage,
  type ParsedSystemMessage,
  type ParsedStreamEventMessage,
  type ParsedTextBlock,
  type ParsedToolUseBlock,
  type ParsedToolResultBlock,
  type StreamingState,
  type StreamCallbacks,
  type TrackedToolCall,
  type ToolResult,
  createInitialStreamingState,
} from '@bmad-studio/shared';

/**
 * StreamHandler class for processing SDK streaming messages
 */
export class StreamHandler {
  private state: StreamingState;
  private messageIdCounter: number = 0;
  /** Accumulated partial JSON for each content block index */
  private partialJsonByIndex: Map<number, string> = new Map();
  /** Tool ID for each content block index */
  private toolIdByIndex: Map<number, string> = new Map();
  /** Whether stream_event text deltas have been received (to avoid duplicate text from assistant messages) */
  private receivedStreamTextDelta: boolean = false;

  constructor() {
    this.state = createInitialStreamingState();
  }

  /**
   * Get current streaming state
   */
  getState(): StreamingState {
    return this.state;
  }

  /**
   * Reset the handler state
   */
  reset(): void {
    this.state = createInitialStreamingState();
    this.messageIdCounter = 0;
    this.partialJsonByIndex.clear();
    this.toolIdByIndex.clear();
    this.receivedStreamTextDelta = false;
  }

  /**
   * Generate a unique message ID for stream chunks
   */
  private generateMessageId(): string {
    return `msg-${++this.messageIdCounter}`;
  }

  /**
   * Parse an SDK message into a structured ParsedSDKMessage
   */
  parseMessage(message: SDKMessage): ParsedSDKMessage {
    const type = message.type as string;

    switch (type) {
      case 'init':
        return this.parseInitMessage(message);
      case 'assistant':
        return this.parseAssistantMessage(message);
      case 'user':
        return this.parseUserMessage(message);
      case 'result':
        return this.parseResultMessage(message);
      case 'system':
        return this.parseSystemMessage(message);
      case 'stream_event':
        return this.parseStreamEventMessage(message);
      default:
        // Handle unknown message types gracefully
        return {
          type: SDKMessageType.SYSTEM,
          rawMessage: message,
        } as ParsedSystemMessage;
    }
  }

  /**
   * Parse init message
   */
  private parseInitMessage(message: SDKMessage): ParsedInitMessage {
    const msg = message as unknown as {
      type: 'init';
      session_id: string;
      model?: string;
      cwd?: string;
    };

    return {
      type: SDKMessageType.INIT,
      sessionId: msg.session_id,
      model: msg.model,
      cwd: msg.cwd,
      rawMessage: message,
    };
  }

  /**
   * Parse assistant message with content blocks
   */
  private parseAssistantMessage(message: SDKMessage): ParsedAssistantMessage {
    const msg = message as unknown as {
      type: 'assistant';
      message: {
        content: Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: unknown;
        }>;
      };
    };

    const contentBlocks: ParsedContentBlock[] = [];

    if (msg.message?.content && Array.isArray(msg.message.content)) {
      for (const block of msg.message.content) {
        const parsed = this.parseContentBlock(block);
        if (parsed) {
          contentBlocks.push(parsed);
        }
      }
    }

    return {
      type: SDKMessageType.ASSISTANT,
      contentBlocks,
      rawMessage: message,
    };
  }

  /**
   * Parse user message with content blocks
   */
  private parseUserMessage(message: SDKMessage): ParsedUserMessage {
    const msg = message as unknown as {
      type: 'user';
      message: {
        content: Array<{
          type: string;
          tool_use_id?: string;
          content?: string;
          is_error?: boolean;
        }>;
      };
    };

    const contentBlocks: ParsedContentBlock[] = [];

    if (msg.message?.content && Array.isArray(msg.message.content)) {
      for (const block of msg.message.content) {
        const parsed = this.parseContentBlock(block);
        if (parsed) {
          contentBlocks.push(parsed);
        }
      }
    }

    return {
      type: SDKMessageType.USER,
      contentBlocks,
      rawMessage: message,
    };
  }

  /**
   * Parse result message
   */
  private parseResultMessage(message: SDKMessage): ParsedResultMessage {
    const msg = message as unknown as {
      type: 'result';
      subtype: 'success' | 'error';
      result: string;
      session_id: string;
      uuid: string;
      is_error: boolean;
      usage?: {
        input_tokens: number;
        output_tokens: number;
      };
      total_cost_usd?: number;
    };

    return {
      type: SDKMessageType.RESULT,
      subtype: msg.subtype,
      result: msg.result ?? '',
      sessionId: msg.session_id,
      uuid: msg.uuid,
      isError: msg.is_error,
      usage:
        msg.subtype === 'success' && msg.usage
          ? {
              inputTokens: msg.usage.input_tokens,
              outputTokens: msg.usage.output_tokens,
              totalCostUSD: msg.total_cost_usd ?? 0,
            }
          : undefined,
      rawMessage: message,
    };
  }

  /**
   * Parse system message
   */
  private parseSystemMessage(message: SDKMessage): ParsedSystemMessage {
    return {
      type: SDKMessageType.SYSTEM,
      rawMessage: message,
    };
  }

  /**
   * Parse stream_event message (real-time streaming)
   */
  private parseStreamEventMessage(message: SDKMessage): ParsedStreamEventMessage {
    const msg = message as unknown as {
      type: 'stream_event';
      event: {
        type: string;
        delta?: {
          type: string;
          text?: string;
          partial_json?: string;
        };
        index?: number;
        content_block?: {
          type: string;
          id?: string;
          name?: string;
          input?: Record<string, unknown>;
        };
      };
    };

    let textDelta: string | undefined;
    let toolUse: { id: string; name: string } | undefined;
    let inputJsonDelta: { index: number; partialJson: string } | undefined;

    // Extract text delta from content_block_delta events
    if (msg.event?.type === 'content_block_delta' && msg.event.delta?.type === 'text_delta') {
      textDelta = msg.event.delta.text;
    }

    // Extract tool_use from content_block_start events
    if (msg.event?.type === 'content_block_start' && msg.event.content_block?.type === 'tool_use') {
      toolUse = {
        id: msg.event.content_block.id ?? '',
        name: msg.event.content_block.name ?? '',
      };
    }

    // Extract input_json_delta for tool input streaming
    if (msg.event?.type === 'content_block_delta' && msg.event.delta?.type === 'input_json_delta') {
      inputJsonDelta = {
        index: msg.event.index ?? 0,
        partialJson: msg.event.delta.partial_json ?? '',
      };
    }

    return {
      type: SDKMessageType.STREAM_EVENT,
      eventType: msg.event?.type ?? 'unknown',
      textDelta,
      toolUse,
      inputJsonDelta,
      rawMessage: message,
    };
  }

  /**
   * Parse a content block from assistant or user message
   */
  private parseContentBlock(
    block: Record<string, unknown>
  ): ParsedContentBlock | null {
    const blockType = block.type as string;

    switch (blockType) {
      case 'text':
        return {
          type: ContentBlockType.TEXT,
          text: (block.text as string) ?? '',
        } as ParsedTextBlock;

      case 'tool_use':
        return {
          type: ContentBlockType.TOOL_USE,
          id: (block.id as string) ?? '',
          name: (block.name as string) ?? '',
          input: (block.input as Record<string, unknown>) ?? {},
        } as ParsedToolUseBlock;

      case 'tool_result':
        return {
          type: ContentBlockType.TOOL_RESULT,
          toolUseId: (block.tool_use_id as string) ?? '',
          content: (block.content as string) ?? '',
          isError: (block.is_error as boolean) ?? false,
        } as ParsedToolResultBlock;

      default:
        // Unknown block type - ignore gracefully
        return null;
    }
  }

  /**
   * Process a stream of SDK messages and invoke callbacks
   */
  async processStream(
    generator: AsyncGenerator<SDKMessage, unknown, unknown>,
    callbacks: StreamCallbacks
  ): Promise<ChatResponse> {
    this.reset();

    let finalResponse: ChatResponse = {
      id: '',
      sessionId: '',
      content: '',
      done: false,
      isError: false,
    };

    try {
      for await (const message of generator) {
        const parsed = this.parseMessage(message);
        this.processMessage(parsed, callbacks);

        // Capture final response from result message
        if (parsed.type === SDKMessageType.RESULT) {
          const resultMsg = parsed as ParsedResultMessage;
          finalResponse = {
            id: resultMsg.uuid,
            sessionId: resultMsg.sessionId,
            content: this.state.accumulatedText,
            done: true,
            isError: resultMsg.isError,
            usage: resultMsg.usage,
          };
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.state.error = err;
      callbacks.onError?.(err);
      throw err;
    } finally {
      this.cleanup();
    }

    return finalResponse;
  }

  /**
   * Process a single parsed message and invoke appropriate callbacks
   */
  private processMessage(
    message: ParsedSDKMessage,
    callbacks: StreamCallbacks
  ): void {
    switch (message.type) {
      case SDKMessageType.INIT:
        this.handleInit(message, callbacks);
        break;

      case SDKMessageType.ASSISTANT:
        this.handleAssistant(message, callbacks);
        break;

      case SDKMessageType.USER:
        this.handleUser(message, callbacks);
        break;

      case SDKMessageType.RESULT:
        this.handleResult(message, callbacks);
        break;

      case SDKMessageType.SYSTEM:
        // System messages are logged but not processed
        break;

      case SDKMessageType.STREAM_EVENT:
        this.handleStreamEvent(message as ParsedStreamEventMessage, callbacks);
        break;
    }
  }

  /**
   * Handle init message - extract session info
   */
  private handleInit(
    message: ParsedInitMessage,
    callbacks: StreamCallbacks
  ): void {
    this.state.sessionId = message.sessionId;
    this.state.metadata = {
      model: message.model,
      cwd: message.cwd,
    };

    callbacks.onSessionInit?.(message.sessionId, this.state.metadata);
  }

  /**
   * Handle assistant message - process text and tool_use blocks
   */
  private handleAssistant(
    message: ParsedAssistantMessage,
    callbacks: StreamCallbacks
  ): void {
    for (const block of message.contentBlocks) {
      if (block.type === ContentBlockType.TEXT) {
        this.handleTextBlock(block, callbacks);
      } else if (block.type === ContentBlockType.TOOL_USE) {
        this.handleToolUseBlock(block, callbacks);
      }
    }
  }

  /**
   * Handle text content block
   * Skip if stream_event text deltas already handled this text (avoids double emission)
   */
  private handleTextBlock(
    block: ParsedTextBlock,
    callbacks: StreamCallbacks
  ): void {
    // When stream_event text deltas are active, assistant message text blocks
    // contain the same accumulated text — skip to avoid duplicate output
    if (this.receivedStreamTextDelta) {
      return;
    }

    // Claude Code emits "(no content)" placeholder for thinking-only turns — skip
    if (block.text.trim() === '(no content)') {
      return;
    }

    this.state.accumulatedText += block.text;

    callbacks.onTextChunk?.({
      sessionId: this.state.sessionId ?? '',
      messageId: this.generateMessageId(),
      content: block.text,
      done: false,
    });
  }

  /**
   * Handle tool_use content block
   */
  private handleToolUseBlock(
    block: ParsedToolUseBlock,
    callbacks: StreamCallbacks
  ): void {
    const toolCall: TrackedToolCall = {
      id: block.id,
      name: block.name,
      input: block.input,
      status: 'pending',
    };

    this.state.pendingToolCalls.set(block.id, toolCall);
    // Pass a snapshot to prevent mutation issues
    callbacks.onToolUse?.({ ...toolCall });
  }

  /**
   * Handle user message - process tool_result blocks
   */
  private handleUser(
    message: ParsedUserMessage,
    callbacks: StreamCallbacks
  ): void {
    for (const block of message.contentBlocks) {
      if (block.type === ContentBlockType.TOOL_RESULT) {
        this.handleToolResultBlock(block, callbacks);
      }
    }
  }

  /**
   * Handle tool_result content block
   */
  private handleToolResultBlock(
    block: ParsedToolResultBlock,
    callbacks: StreamCallbacks
  ): void {
    const result: ToolResult = {
      success: !block.isError,
      output: block.isError ? undefined : block.content,
      error: block.isError ? block.content : undefined,
    };

    // Move tool call from pending to completed
    const pendingCall = this.state.pendingToolCalls.get(block.toolUseId);
    if (pendingCall) {
      pendingCall.status = 'completed';
      pendingCall.result = result;
      this.state.pendingToolCalls.delete(block.toolUseId);
      this.state.completedToolCalls.set(block.toolUseId, pendingCall);
    }

    callbacks.onToolResult?.(block.toolUseId, result);
  }

  /**
   * Handle stream_event message - real-time text and tool streaming
   */
  private handleStreamEvent(
    message: ParsedStreamEventMessage,
    callbacks: StreamCallbacks
  ): void {
    // Process text deltas
    if (message.textDelta) {
      this.receivedStreamTextDelta = true;
      this.state.accumulatedText += message.textDelta;

      callbacks.onTextChunk?.({
        sessionId: this.state.sessionId ?? '',
        messageId: this.generateMessageId(),
        content: message.textDelta,
        done: false,
      });
    }

    // Process tool_use from content_block_start
    if (message.toolUse) {
      const toolCall: TrackedToolCall = {
        id: message.toolUse.id,
        name: message.toolUse.name,
        input: {}, // Input will be filled later from input_json_delta
        status: 'pending',
      };

      this.state.pendingToolCalls.set(message.toolUse.id, toolCall);
      callbacks.onToolUse?.({ ...toolCall });

      // Track tool ID by index from the raw message
      const rawMsg = message.rawMessage as { event?: { index?: number } };
      const index = rawMsg.event?.index ?? 0;
      this.toolIdByIndex.set(index, message.toolUse.id);
      this.partialJsonByIndex.set(index, '');
    }

    // Process input_json_delta for tool input streaming
    if (message.inputJsonDelta) {
      const { index, partialJson } = message.inputJsonDelta;

      // Accumulate partial JSON for this content block
      const currentJson = this.partialJsonByIndex.get(index) ?? '';
      const updatedJson = currentJson + partialJson;
      this.partialJsonByIndex.set(index, updatedJson);

      // Try to parse accumulated JSON (may fail if incomplete)
      try {
        const parsedInput = JSON.parse(updatedJson) as Record<string, unknown>;
        const toolId = this.toolIdByIndex.get(index);

        if (toolId) {
          // Update pending tool call with parsed input
          const pendingCall = this.state.pendingToolCalls.get(toolId);
          if (pendingCall) {
            pendingCall.input = parsedInput;
          }

          // Invoke callback with parsed input
          callbacks.onToolInputUpdate?.(toolId, parsedInput);
        }
      } catch {
        // JSON incomplete - continue accumulating
      }
    }
  }

  /**
   * Handle result message - stream completion
   */
  private handleResult(
    message: ParsedResultMessage,
    callbacks: StreamCallbacks
  ): void {
    this.state.isComplete = true;

    const response: ChatResponse = {
      id: message.uuid,
      sessionId: message.sessionId,
      content: this.state.accumulatedText,
      done: true,
      isError: message.isError,
      usage: message.usage,
    };

    callbacks.onComplete?.(response);
  }

  /**
   * Cleanup resources after stream processing
   */
  private cleanup(): void {
    // Clear pending tool calls that weren't completed
    this.state.pendingToolCalls.clear();
  }
}

/**
 * Create a new StreamHandler instance
 */
export function createStreamHandler(): StreamHandler {
  return new StreamHandler();
}
