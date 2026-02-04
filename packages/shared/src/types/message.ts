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

// ===== Image Attachment Types =====

/**
 * Serializable attachment for shared use (client ↔ server)
 * Story 5.5: Image Attachment
 */
export interface Attachment {
  id: string;
  type: 'image';
  name: string;
  size: number;
  mimeType: string;
  data: string; // Base64 raw data
}

/**
 * Minimal image data for WebSocket transmission
 */
export interface ImageAttachment {
  mimeType: string;
  data: string; // Base64 raw data
  name: string;
}

/**
 * Image constraint constants
 */
export const IMAGE_CONSTRAINTS = {
  MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MAX_COUNT: 5,
  ACCEPTED_TYPES: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const,
  ACCEPT_STRING: 'image/png,image/jpeg,image/gif,image/webp',
} as const;
