/**
 * Message Types
 * Story 5.5: Attachment, ImageAttachment, IMAGE_CONSTRAINTS
 */

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
 * URL-based image reference for client rendering (replaces base64 data in broadcasts/history)
 * Story 27.2: Image Server Storage
 */
export interface ImageRef {
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
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
