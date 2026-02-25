/**
 * StreamHandler Service
 * Processes SDK streaming responses and dispatches events via callbacks
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ChatResponse } from '@bmad-studio/shared';
import { createLogger } from '../utils/logger.js';
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
  type ParsedToolProgressMessage,
  type ParsedToolUseSummaryMessage,
  type ParsedTextBlock,
  type ParsedToolUseBlock,
  type ParsedToolResultBlock,
  type ParsedThinkingBlock,
  type StreamingState,
  type StreamCallbacks,
  type TrackedToolCall,
  type ToolResult,
  createInitialStreamingState,
} from '@bmad-studio/shared';

const log = createLogger('streamHandler');

// Intentionally duplicated in chatService.ts for file independence
function extractContextWindow(modelUsage?: { [model: string]: { contextWindow: number } }): number {
  if (!modelUsage) return 0;
  const windows = Object.values(modelUsage).map(m => m.contextWindow);
  return windows.length > 0 ? Math.max(...windows) : 0;
}

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
  /** Whether stream_event thinking deltas have been received (to avoid duplicate thinking from assistant messages) */
  private receivedStreamThinkingDelta: boolean = false;

  /** Throttle tracker: last emit time per tool ID for partial input updates */
  private lastPartialEmitByTool: Map<string, number> = new Map();

  /** Running estimate of context window token consumption (updated from assistant usage + tool results) */
  private estimatedContextTokens = 0;
  /** Known context window size from modelUsage (defaults to 200K) */
  private contextWindowSize = 200000;

  constructor() {
    this.state = createInitialStreamingState();
  }

  /**
   * Extract partial fields from incomplete JSON for streaming preview.
   * Called when JSON.parse fails during input_json_delta accumulation.
   * Extracts file_path and content fields using string matching.
   */
  static extractPartialInput(rawJson: string): Record<string, unknown> | null {
    const result: Record<string, unknown> = {};

    // Extract file_path (should be complete early in the stream)
    const pathMatch = rawJson.match(/"file_path"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (pathMatch) result.file_path = pathMatch[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"');

    // Extract partial content (may be incomplete — no closing quote)
    const contentStart = rawJson.match(/"content"\s*:\s*"/);
    if (contentStart) {
      const start = contentStart.index! + contentStart[0].length;
      let partial = rawJson.slice(start);
      // Remove trailing quote/brace if JSON happened to close
      if (partial.endsWith('"}')) partial = partial.slice(0, -2);
      else if (partial.endsWith('"')) partial = partial.slice(0, -1);
      // Unescape JSON string escapes
      result.content = partial
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }

    // Extract old_string for Edit tool
    const oldStart = rawJson.match(/"old_string"\s*:\s*"/);
    if (oldStart) {
      const start = oldStart.index! + oldStart[0].length;
      // Find the closing quote (not escaped)
      const remaining = rawJson.slice(start);
      const closeMatch = remaining.match(/(?<!\\)"/);
      if (closeMatch) {
        result.old_string = remaining.slice(0, closeMatch.index)
          .replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
    }

    // Extract new_string for Edit tool
    const newStart = rawJson.match(/"new_string"\s*:\s*"/);
    if (newStart) {
      const start = newStart.index! + newStart[0].length;
      let partial = rawJson.slice(start);
      if (partial.endsWith('"}')) partial = partial.slice(0, -2);
      else if (partial.endsWith('"')) partial = partial.slice(0, -1);
      result.new_string = partial
        .replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }

    return Object.keys(result).length > 0 ? result : null;
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
    this.lastPartialEmitByTool.clear();
    this.receivedStreamTextDelta = false;
    this.receivedStreamThinkingDelta = false;
    this.estimatedContextTokens = 0;
    // Keep contextWindowSize across resets (learned from previous result)
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
      case 'tool_progress':
        return this.parseToolProgressMessage(message);
      case 'tool_use_summary':
        return this.parseToolUseSummaryMessage(message);
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
      parent_tool_use_id?: string | null;
      message: {
        content: Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: unknown;
        }>;
        usage?: {
          input_tokens: number;
          output_tokens: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
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

    // Extract usage from assistant message (for context window tracking, not billing)
    // Only main chain messages (parent_tool_use_id === null) represent actual context
    const isSidechain = msg.parent_tool_use_id !== null;
    const messageUsage = !isSidechain && msg.message?.usage
      ? {
          inputTokens: msg.message.usage.input_tokens,
          outputTokens: msg.message.usage.output_tokens,
          cacheCreationInputTokens: msg.message.usage.cache_creation_input_tokens ?? 0,
          cacheReadInputTokens: msg.message.usage.cache_read_input_tokens ?? 0,
        }
      : undefined;

    return {
      type: SDKMessageType.ASSISTANT,
      contentBlocks,
      messageUsage,
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
      subtype: 'success' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd' | 'error_max_structured_output_retries';
      result: string;
      session_id: string;
      uuid: string;
      is_error: boolean;
      errors?: string[];
      num_turns?: number;
      usage?: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens: number;
        cache_creation_input_tokens: number;
      };
      total_cost_usd?: number;
      modelUsage?: {
        [modelName: string]: {
          contextWindow: number;
          inputTokens: number;
          outputTokens: number;
          cacheReadInputTokens: number;
          cacheCreationInputTokens: number;
          costUSD: number;
          webSearchRequests: number;
        };
      };
    };

    return {
      type: SDKMessageType.RESULT,
      subtype: msg.subtype,
      result: msg.result ?? '',
      sessionId: msg.session_id,
      uuid: msg.uuid,
      isError: msg.is_error,
      errors: msg.errors,
      totalCostUSD: msg.total_cost_usd,
      numTurns: msg.num_turns,
      usage: msg.usage
        ? {
            inputTokens: msg.usage.input_tokens,
            outputTokens: msg.usage.output_tokens,
            cacheReadInputTokens: msg.usage.cache_read_input_tokens ?? 0,
            cacheCreationInputTokens: msg.usage.cache_creation_input_tokens ?? 0,
            totalCostUSD: msg.total_cost_usd ?? 0,
            contextWindow: extractContextWindow(msg.modelUsage),
            model: msg.modelUsage ? Object.keys(msg.modelUsage)[0] : undefined,
          }
        : undefined,
      rawMessage: message,
    };
  }

  /**
   * Parse system message (init or compact_boundary)
   */
  private parseSystemMessage(message: SDKMessage): ParsedSystemMessage {
    const msg = message as unknown as {
      type: 'system';
      subtype?: string;
      compact_metadata?: {
        trigger: 'manual' | 'auto';
        pre_tokens: number;
      };
    };

    const parsed: ParsedSystemMessage = {
      type: SDKMessageType.SYSTEM,
      rawMessage: message,
    };

    if (msg.subtype === 'compact_boundary' && msg.compact_metadata) {
      parsed.subtype = 'compact_boundary';
      parsed.compactMetadata = {
        trigger: msg.compact_metadata.trigger,
        preTokens: msg.compact_metadata.pre_tokens,
      };
    }

    if (msg.subtype === 'task_notification') {
      const taskMsg = message as unknown as {
        task_id: string;
        status: 'completed' | 'failed' | 'stopped';
        output_file?: string;
        summary?: string;
      };
      parsed.subtype = 'task_notification';
      parsed.taskNotification = {
        taskId: taskMsg.task_id ?? '',
        status: taskMsg.status ?? 'completed',
        outputFile: taskMsg.output_file,
        summary: taskMsg.summary,
      };
    }

    return parsed;
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
    let thinkingDelta: string | undefined;
    let toolUse: { id: string; name: string } | undefined;
    let inputJsonDelta: { index: number; partialJson: string } | undefined;

    // Extract text delta from content_block_delta events
    if (msg.event?.type === 'content_block_delta' && msg.event.delta?.type === 'text_delta') {
      textDelta = msg.event.delta.text;
    }

    // Extract thinking delta from content_block_delta events
    if (msg.event?.type === 'content_block_delta' && msg.event.delta?.type === 'thinking_delta') {
      thinkingDelta = (msg.event.delta as unknown as { thinking?: string }).thinking;
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
      thinkingDelta,
      toolUse,
      inputJsonDelta,
      rawMessage: message,
    };
  }

  /**
   * Parse tool_progress message
   */
  private parseToolProgressMessage(message: SDKMessage): ParsedToolProgressMessage {
    const msg = message as unknown as {
      type: 'tool_progress';
      tool_use_id: string;
      tool_name: string;
      parent_tool_use_id?: string;
      elapsed_time_seconds: number;
    };

    return {
      type: SDKMessageType.TOOL_PROGRESS,
      toolUseId: msg.tool_use_id,
      toolName: msg.tool_name,
      parentToolUseId: msg.parent_tool_use_id ?? undefined,
      elapsedTimeSeconds: msg.elapsed_time_seconds,
      rawMessage: message,
    };
  }

  /**
   * Parse tool_use_summary message
   */
  private parseToolUseSummaryMessage(message: SDKMessage): ParsedToolUseSummaryMessage {
    const msg = message as unknown as {
      type: 'tool_use_summary';
      summary: string;
      preceding_tool_use_ids: string[];
    };

    return {
      type: SDKMessageType.TOOL_USE_SUMMARY,
      summary: msg.summary ?? '',
      precedingToolUseIds: msg.preceding_tool_use_ids ?? [],
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
          content: typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map((c: Record<string, unknown>) => (c.text as string) || '').join('')
              : '',
          isError: (block.is_error as boolean) ?? false,
        } as ParsedToolResultBlock;

      case 'thinking':
        return {
          type: ContentBlockType.THINKING,
          thinking: (block.thinking as string) ?? '',
          signature: (block.signature as string) ?? '',
        } as ParsedThinkingBlock;

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
    // Fire activity callback for every SDK message (timeout reset)
    callbacks.onActivity?.(message.type);

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
        this.handleSystem(message as ParsedSystemMessage, callbacks);
        break;

      case SDKMessageType.STREAM_EVENT:
        this.handleStreamEvent(message as ParsedStreamEventMessage, callbacks);
        break;

      case SDKMessageType.TOOL_PROGRESS:
        this.handleToolProgress(message as ParsedToolProgressMessage, callbacks);
        break;

      case SDKMessageType.TOOL_USE_SUMMARY:
        this.handleToolUseSummary(message as ParsedToolUseSummaryMessage, callbacks);
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

    // If there's buffered text from before init, send it now
    if (this.state.accumulatedText && this.receivedStreamTextDelta) {
      callbacks.onTextChunk?.({
        sessionId: message.sessionId,
        messageId: this.generateMessageId(),
        content: this.state.accumulatedText,
        done: false,
      });
    }
  }

  /**
   * Handle assistant message - process text and tool_use blocks
   */
  private handleAssistant(
    message: ParsedAssistantMessage,
    callbacks: StreamCallbacks
  ): void {
    // Fallback: extract session_id from assistant message if not yet set
    const rawSessionId = (message.rawMessage as unknown as { session_id?: string }).session_id;
    if (rawSessionId && !this.state.sessionId) {
      this.state.sessionId = rawSessionId;
      this.state.metadata = this.state.metadata || {};
      callbacks.onSessionInit?.(rawSessionId, this.state.metadata);
    }

    for (const block of message.contentBlocks) {
      if (block.type === ContentBlockType.THINKING) {
        // Skip if stream_event thinking deltas already handled this (avoids double emission)
        if (!this.receivedStreamThinkingDelta) {
          callbacks.onThinking?.(block.thinking);
        }
      } else if (block.type === ContentBlockType.TEXT) {
        this.handleTextBlock(block, callbacks);
      } else if (block.type === ContentBlockType.TOOL_USE) {
        this.handleToolUseBlock(block, callbacks);
      }
    }

    // Emit assistant message usage for context window tracking (main chain only)
    if (message.messageUsage) {
      callbacks.onAssistantUsage?.(message.messageUsage);
      // Update running estimate: input context + output tokens (output will be part of next turn's input)
      const u = message.messageUsage;
      this.estimatedContextTokens = u.inputTokens + u.cacheCreationInputTokens + u.cacheReadInputTokens + u.outputTokens;
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
    // Check if this is a main-chain message (sidechain tool results don't affect main context)
    const rawMsg = message.rawMessage as { parent_tool_use_id?: string | null };
    const isMainChain = !rawMsg.parent_tool_use_id;

    for (const block of message.contentBlocks) {
      if (block.type === ContentBlockType.TOOL_RESULT) {
        this.handleToolResultBlock(block, callbacks);

        // Estimate tokens added by tool result content (main chain only)
        if (isMainChain && this.estimatedContextTokens > 0) {
          const contentLength = block.content?.length || 0;
          // Rough estimate: ~4 chars per token for English/code, slightly less for JSON
          this.estimatedContextTokens += Math.ceil(contentLength / 4);
        }
      }
    }

    // Emit updated context estimate after processing main-chain tool results
    if (isMainChain && this.estimatedContextTokens > 0) {
      callbacks.onContextEstimate?.(this.estimatedContextTokens, this.contextWindowSize);
    }
  }

  /**
   * Handle tool_result content block
   */
  private handleToolResultBlock(
    block: ParsedToolResultBlock,
    callbacks: StreamCallbacks
  ): void {
    // Strip SDK XML wrapper tags (e.g. <tool_use_error>...</tool_use_error>)
    const rawContent = typeof block.content === 'string' ? block.content : '';
    const cleanContent = rawContent.replace(/<\/?(?:tool_use_error|error|result)>/g, '').trim();
    const result: ToolResult = {
      success: !block.isError,
      output: block.isError ? undefined : cleanContent,
      error: block.isError ? cleanContent : undefined,
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
    // Extract session_id from SDKPartialAssistantMessage (available on all stream_event messages)
    // The SDK does NOT send a separate 'init' message — session_id is carried on stream_event/assistant/result
    const rawSessionId = (message.rawMessage as unknown as { session_id?: string }).session_id;
    if (rawSessionId && !this.state.sessionId) {
      this.state.sessionId = rawSessionId;
      this.state.metadata = this.state.metadata || {};
      callbacks.onSessionInit?.(rawSessionId, this.state.metadata);
    }

    // Process thinking deltas
    if (message.thinkingDelta) {
      this.receivedStreamThinkingDelta = true;
      callbacks.onThinking?.(message.thinkingDelta);
    }

    // Process text deltas
    if (message.textDelta) {
      this.receivedStreamTextDelta = true;
      this.state.accumulatedText += message.textDelta;

      // Always emit - websocket.ts uses actualSessionId fallback
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

      const toolId = this.toolIdByIndex.get(index);

      // Try to parse accumulated JSON (may fail if incomplete)
      try {
        const parsedInput = JSON.parse(updatedJson) as Record<string, unknown>;

        if (toolId) {
          // Update pending tool call with parsed input
          const pendingCall = this.state.pendingToolCalls.get(toolId);
          if (pendingCall) {
            pendingCall.input = parsedInput;
          }

          log.debug(`input_json_delta COMPLETE: toolId=${toolId}, keys=${Object.keys(parsedInput).join(',')}`);
          // Invoke callback with parsed input
          callbacks.onToolInputUpdate?.(toolId, parsedInput);
        }
      } catch {
        // JSON incomplete — extract partial fields for streaming preview (throttled to 200ms)
        if (toolId) {
          const now = Date.now();
          const lastEmit = this.lastPartialEmitByTool.get(toolId) ?? 0;
          if (now - lastEmit >= 200) {
            const partial = StreamHandler.extractPartialInput(updatedJson);
            if (partial) {
              this.lastPartialEmitByTool.set(toolId, now);
              log.verbose(`input_json_delta PARTIAL: toolId=${toolId}, keys=${Object.keys(partial).join(',')}, jsonLen=${updatedJson.length}`);
              callbacks.onToolInputUpdate?.(toolId, partial);
            }
          }
        }
      }
    }
  }

  /**
   * Handle system message - detect compact_boundary
   */
  private handleSystem(
    message: ParsedSystemMessage,
    callbacks: StreamCallbacks
  ): void {
    // Extract session_id and metadata from system/init message (the FIRST SDK message)
    const raw = message.rawMessage as unknown as { subtype?: string; tools?: string[]; session_id?: string; model?: string };
    if (raw.subtype === 'init') {
      if (raw.tools) {
        log.debug(`Available tools: ${raw.tools.join(', ')}`);
        const hasMcpAsk = raw.tools.some(t => t.includes('AskUserQuestion'));
        log.debug(`AskUserQuestion available: ${hasMcpAsk}`);
      }
      // system/init is the first SDK message — extract session_id for early URL navigation
      if (raw.session_id && !this.state.sessionId) {
        this.state.sessionId = raw.session_id;
        this.state.metadata = { model: raw.model };
        callbacks.onSessionInit?.(raw.session_id, this.state.metadata);
      }
    }

    if (message.subtype === 'compact_boundary' && message.compactMetadata) {
      // Sync running estimate with actual pre-compact token count from SDK
      if (message.compactMetadata.preTokens > 0) {
        this.estimatedContextTokens = message.compactMetadata.preTokens;
      }
      callbacks.onCompact?.(message.compactMetadata);
    }

    if (message.subtype === 'task_notification' && message.taskNotification) {
      callbacks.onTaskNotification?.(message.taskNotification);
    }
  }

  /**
   * Handle tool_progress message - update elapsed time for a running tool
   */
  private handleToolProgress(
    message: ParsedToolProgressMessage,
    callbacks: StreamCallbacks
  ): void {
    callbacks.onToolProgress?.(message.toolUseId, message.elapsedTimeSeconds, message.toolName);
  }

  /**
   * Handle tool_use_summary message - summary of preceding tool calls
   */
  private handleToolUseSummary(
    message: ParsedToolUseSummaryMessage,
    callbacks: StreamCallbacks
  ): void {
    callbacks.onToolUseSummary?.(message.summary, message.precedingToolUseIds);
  }

  /**
   * Handle result message - stream completion
   */
  private handleResult(
    message: ParsedResultMessage,
    callbacks: StreamCallbacks
  ): void {
    this.state.isComplete = true;

    // Update known context window size from result's modelUsage
    if (message.usage?.contextWindow && message.usage.contextWindow > 0) {
      this.contextWindowSize = message.usage.contextWindow;
    }

    // Dispatch error details for error subtypes (before onComplete)
    if (message.isError && message.subtype !== 'success') {
      callbacks.onResultError?.({
        subtype: message.subtype,
        errors: message.errors,
        totalCostUSD: message.totalCostUSD,
        numTurns: message.numTurns,
        result: message.result,
      });
    }

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
