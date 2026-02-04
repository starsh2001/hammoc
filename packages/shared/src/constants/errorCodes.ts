/**
 * Standard Error Codes
 * Story 1.5: End-to-End Test Page
 */

/**
 * Standard error codes for WebSocket communication
 */
export const ERROR_CODES = {
  /** General chat processing error */
  CHAT_ERROR: 'CHAT_ERROR',
  /** Claude Code CLI connection failure */
  SDK_CONNECTION_ERROR: 'SDK_CONNECTION_ERROR',
  /** SDK response timeout */
  SDK_TIMEOUT: 'SDK_TIMEOUT',
  /** Invalid working directory */
  INVALID_WORKING_DIR: 'INVALID_WORKING_DIR',
  /** Session not found */
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  /** Network connection issue */
  NETWORK_ERROR: 'NETWORK_ERROR',
  // Story 3.5: Session History Loading error codes
  /** JSONL parsing failure */
  SESSION_PARSE_ERROR: 'SESSION_PARSE_ERROR',
  /** Invalid path parameter (path traversal attempt) */
  INVALID_PATH: 'INVALID_PATH',
  // Story 4.6: Timeout error code
  /** Chat response timeout */
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  // Story 5.5: Image Attachment validation
  /** Input validation error (e.g., invalid image) */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
