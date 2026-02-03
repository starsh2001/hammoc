/**
 * SDK Types for ChatService
 * These types wrap the @anthropic-ai/claude-code SDK types for use in the application
 */

/**
 * Configuration for initializing ChatService
 */
export interface ChatServiceConfig {
  /** Working directory for the Claude session */
  workingDirectory?: string;
  /** Permission mode for tool usage */
  permissionMode?: PermissionMode;
}

/**
 * Options for sending a chat message
 */
export interface ChatOptions {
  /** List of tools that are allowed to be used */
  allowedTools?: string[];
  /** List of tools that are disallowed */
  disallowedTools?: string[];
  /** Maximum number of turns before stopping */
  maxTurns?: number;
  /** Abort controller for cancellation */
  abortController?: AbortController;
  /** Model to use for the query */
  model?: string;
  /** Session ID to resume (pass the session ID string to resume) */
  resume?: string;
}

/**
 * Response from a chat message
 */
export interface ChatResponse {
  /** Unique identifier for the response */
  id: string;
  /** Session ID */
  sessionId: string;
  /** Response content */
  content: string;
  /** Whether the response is complete */
  done: boolean;
  /** Whether this is an error response */
  isError: boolean;
  /** Usage statistics */
  usage?: ChatUsage;
}

/**
 * Usage statistics for a chat response
 */
export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  totalCostUSD: number;
}

/**
 * Configuration for allowed/disallowed tools
 */
export interface AllowedToolsConfig {
  /** Tools that are explicitly allowed */
  allowed: string[];
  /** Tools that are explicitly disallowed */
  disallowed: string[];
}

/**
 * Default tools that are commonly allowed
 */
export const DEFAULT_ALLOWED_TOOLS: string[] = [
  'Read',
  'Edit',
  'Write',
  'Bash',
  'Glob',
  'Grep',
];

/**
 * Permission modes for tool usage
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

/**
 * Stream chunk for real-time message streaming
 */
export interface StreamChunk {
  sessionId: string;
  messageId: string;
  content: string;
  done: boolean;
}

/**
 * Tool call information
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Permission request for tool approval
 */
export interface PermissionRequest {
  id: string;
  sessionId: string;
  toolCall: ToolCall;
  requiresApproval: boolean;
}

/**
 * Message in a chat session
 */
export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  streaming?: boolean;
}
