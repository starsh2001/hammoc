/**
 * Message Types for Client Display
 * Story 1.5: End-to-End Test Page
 *
 * Note: These types are for UI display purposes, distinct from SDKMessageType
 * which handles SDK-level message types (init, assistant, user, result, system)
 */

// ===== Display Message Types =====

/**
 * Message types for client-side display
 * Different from SDK's SDKMessageType (init, assistant, user, result, system)
 */
export type DisplayMessageType = 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'error';

/**
 * Message structure for display in chat UI
 */
export interface DisplayMessage {
  id: string;
  type: DisplayMessageType;
  content: string;
  timestamp: Date;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  toolResult?: {
    success: boolean;
    output?: string;
    error?: string;
  };
}
