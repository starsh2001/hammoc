/**
 * Streaming Types for StreamHandler
 * Types for processing SDK streaming responses
 */

import type { StreamChunk, ToolCall, ChatResponse, ChatUsage } from './sdk.js';

// ===== Message Type Enums =====

/**
 * SDK message types (top-level SDKMessage.type)
 */
export enum SDKMessageType {
  INIT = 'init',
  ASSISTANT = 'assistant',
  USER = 'user',
  RESULT = 'result',
  SYSTEM = 'system',
  STREAM_EVENT = 'stream_event',
}

/**
 * Content block types (within assistant/user messages)
 */
export enum ContentBlockType {
  TEXT = 'text',
  TOOL_USE = 'tool_use',
  TOOL_RESULT = 'tool_result',
}

// ===== Content Block Interfaces =====

/**
 * Base interface for parsed content blocks
 */
export interface ParsedContentBlockBase {
  type: ContentBlockType;
}

/**
 * Parsed text content block
 */
export interface ParsedTextBlock extends ParsedContentBlockBase {
  type: ContentBlockType.TEXT;
  text: string;
}

/**
 * Parsed tool_use content block
 */
export interface ParsedToolUseBlock extends ParsedContentBlockBase {
  type: ContentBlockType.TOOL_USE;
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Parsed tool_result content block
 */
export interface ParsedToolResultBlock extends ParsedContentBlockBase {
  type: ContentBlockType.TOOL_RESULT;
  toolUseId: string;
  content: string;
  isError: boolean;
}

/**
 * Union type for all parsed content blocks
 */
export type ParsedContentBlock =
  | ParsedTextBlock
  | ParsedToolUseBlock
  | ParsedToolResultBlock;

// ===== Parsed Message Interfaces =====

/**
 * Base interface for parsed SDK messages
 */
export interface ParsedSDKMessageBase {
  type: SDKMessageType;
  rawMessage: unknown;
}

/**
 * Parsed init message
 */
export interface ParsedInitMessage extends ParsedSDKMessageBase {
  type: SDKMessageType.INIT;
  sessionId: string;
  model?: string;
  cwd?: string;
}

/**
 * Parsed assistant message
 */
export interface ParsedAssistantMessage extends ParsedSDKMessageBase {
  type: SDKMessageType.ASSISTANT;
  contentBlocks: ParsedContentBlock[];
}

/**
 * Parsed user message
 */
export interface ParsedUserMessage extends ParsedSDKMessageBase {
  type: SDKMessageType.USER;
  contentBlocks: ParsedContentBlock[];
}

/**
 * Parsed result message
 */
export interface ParsedResultMessage extends ParsedSDKMessageBase {
  type: SDKMessageType.RESULT;
  subtype: 'success' | 'error';
  result: string;
  sessionId: string;
  uuid: string;
  isError: boolean;
  usage?: ChatUsage;
}

/**
 * Parsed system message
 */
export interface ParsedSystemMessage extends ParsedSDKMessageBase {
  type: SDKMessageType.SYSTEM;
}

/**
 * Parsed stream event message (real-time streaming)
 */
export interface ParsedStreamEventMessage extends ParsedSDKMessageBase {
  type: SDKMessageType.STREAM_EVENT;
  eventType: string;
  textDelta?: string;
  /** Tool use info from content_block_start event */
  toolUse?: {
    id: string;
    name: string;
  };
  /** Partial JSON for tool input from input_json_delta event */
  inputJsonDelta?: {
    index: number;
    partialJson: string;
  };
}

/**
 * Union type for all parsed SDK messages
 */
export type ParsedSDKMessage =
  | ParsedInitMessage
  | ParsedAssistantMessage
  | ParsedUserMessage
  | ParsedResultMessage
  | ParsedSystemMessage
  | ParsedStreamEventMessage;

// ===== Streaming State =====

/**
 * Tool call status for tracking
 */
export type ToolCallStatus = 'pending' | 'completed';

/**
 * Extended tool call with status tracking
 */
export interface TrackedToolCall extends ToolCall {
  status: ToolCallStatus;
  result?: ToolResult;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Session metadata from init message
 */
export interface SessionMetadata {
  model?: string;
  cwd?: string;
}

/**
 * Streaming state for tracking session progress
 */
export interface StreamingState {
  sessionId: string | null;
  metadata: SessionMetadata;
  accumulatedText: string;
  pendingToolCalls: Map<string, TrackedToolCall>;
  completedToolCalls: Map<string, TrackedToolCall>;
  isComplete: boolean;
  error?: Error;
}

// ===== Callback Interfaces =====

/**
 * Callbacks for stream processing events
 */
export interface StreamCallbacks {
  onSessionInit?: (sessionId: string, metadata: SessionMetadata) => void;
  onTextChunk?: (chunk: StreamChunk) => void;
  onToolUse?: (toolCall: TrackedToolCall) => void;
  onToolInputUpdate?: (toolCallId: string, input: Record<string, unknown>) => void;
  onToolResult?: (toolCallId: string, result: ToolResult) => void;
  onComplete?: (response: ChatResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * Create initial streaming state
 */
export function createInitialStreamingState(): StreamingState {
  return {
    sessionId: null,
    metadata: {},
    accumulatedText: '',
    pendingToolCalls: new Map(),
    completedToolCalls: new Map(),
    isComplete: false,
  };
}
