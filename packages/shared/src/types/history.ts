/**
 * History Message Types
 * Story 3.5: Session History Loading
 */

/**
 * Content block types used in Claude Code messages
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ThinkingContentBlock {
  type: 'thinking';
  thinking: string;
  signature: string;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContentBlock {
  tool_use_id: string;
  type: 'tool_result';
  content: string | unknown[];
}

export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export type ContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock
  | ImageContentBlock;

/**
 * Raw JSONL message structure from Claude Code session file
 * Note: content can be a string or an array of content blocks
 */
export interface RawJSONLMessage {
  uuid: string;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'init' | 'system' | 'progress';
  parentUuid?: string | null;
  timestamp: string;
  // For user/assistant messages
  message?: {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
  };
  // For tool_use (inline format)
  toolName?: string;
  toolInput?: Record<string, unknown>;
  // For tool_result (inline format)
  result?: string;
  error?: string;
  // Meta messages are system-injected (e.g., expanded slash commands) - should be hidden
  isMeta?: boolean;
}

/**
 * Processed message for client display
 */
export interface HistoryMessage {
  id: string;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content: string;
  timestamp: string; // ISO 8601 format
  // Thinking content (assistant messages only)
  thinking?: string;
  // Image attachments (user messages only)
  images?: Array<{
    mimeType: string;
    data: string; // Base64 raw data
    name: string;
  }>;
  // Tool-specific fields
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: {
    success: boolean;
    output?: string;
    error?: string;
  };
}

/**
 * Pagination information
 */
export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * API response for GET /api/projects/:projectSlug/sessions/:sessionId/messages
 */
export interface HistoryMessagesResponse {
  messages: HistoryMessage[];
  pagination: PaginationInfo;
  /** Last slash command found in user messages (for agent detection across pagination) */
  lastAgentCommand?: string | null;
}

/**
 * Pagination options for getSessionMessages
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}
