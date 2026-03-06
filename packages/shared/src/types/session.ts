/**
 * Session Types for Session Management
 * Story 1.6: Session Management
 */

/**
 * Session information from sessions-index.json
 */
export interface SessionInfo {
  sessionId: string;
  projectSlug: string;
  firstPrompt: string;
  messageCount: number;
  created: Date;
  modified: Date;
}

/**
 * Raw session entry from sessions-index.json (dates as strings)
 */
export interface SessionIndexEntry {
  sessionId: string;
  firstPrompt: string;
  messageCount: number;
  created: string;
  modified: string;
}

/**
 * Structure of sessions-index.json file
 */
export interface SessionsIndex {
  version: number;
  entries: SessionIndexEntry[];
}

/**
 * Session state for client-side management
 */
export interface SessionState {
  currentSessionId: string | null;
  isResuming: boolean;
}

// Story 3.3: Session List API types

/**
 * Session list item for API response
 * (firstPrompt is truncated to 100 chars)
 */
export interface SessionListItem {
  sessionId: string;
  firstPrompt: string; // Max 100 chars, truncated with "..."
  messageCount: number;
  created: string; // ISO 8601 format
  modified: string; // ISO 8601 format
  isStreaming?: boolean; // true if an active stream is running for this session
  name?: string; // User-assigned session name (from .bmad-studio/session-names.json)
}

/**
 * Response for GET /api/projects/:projectSlug/sessions
 */
export interface SessionListResponse {
  sessions: SessionListItem[];
  total: number;    // Total number of sessions available
  hasMore: boolean; // Whether more sessions can be loaded
}

/**
 * Response for DELETE /api/projects/:projectSlug/sessions/:sessionId
 */
export interface DeleteSessionResponse {
  success: boolean;
}

/**
 * Request for POST /api/projects/:projectSlug/sessions/delete-batch
 */
export interface DeleteSessionsBatchRequest {
  sessionIds: string[];
}

/**
 * Response for POST /api/projects/:projectSlug/sessions/delete-batch
 */
export interface DeleteSessionsBatchResponse {
  deleted: number;
  failed: number;
}

/**
 * Session-related error codes and messages
 *
 * NOTE: PROJECT_NOT_FOUND is used when a project is not found during session list query.
 * This error occurs in the context of Session API, so it's included in SESSION_ERRORS.
 * Consider separating to COMMON_ERRORS or PROJECT_ERRORS if project-related errors increase.
 */
export const SESSION_ERRORS = {
  /** Project not found when listing sessions */
  PROJECT_NOT_FOUND: {
    code: 'PROJECT_NOT_FOUND',
    message: '프로젝트를 찾을 수 없습니다.',
    httpStatus: 404,
  },
  /** Unexpected error during session list query */
  SESSION_LIST_ERROR: {
    code: 'SESSION_LIST_ERROR',
    message: '세션 목록을 가져오는 중 오류가 발생했습니다.',
    httpStatus: 500,
  },
  // Story 3.5: Session History Loading error codes
  /** Session file not found */
  SESSION_NOT_FOUND: {
    code: 'SESSION_NOT_FOUND',
    message: '세션을 찾을 수 없습니다.',
    httpStatus: 404,
  },
  /** JSONL parsing failure */
  SESSION_PARSE_ERROR: {
    code: 'SESSION_PARSE_ERROR',
    message: '세션 파일 파싱 중 오류가 발생했습니다.',
    httpStatus: 500,
  },
  /** Invalid path parameter (path traversal attempt) */
  INVALID_PATH: {
    code: 'INVALID_PATH',
    message: '잘못된 경로 파라미터입니다.',
    httpStatus: 400,
  },
  /** Session delete error */
  SESSION_DELETE_ERROR: {
    code: 'SESSION_DELETE_ERROR',
    message: '세션 삭제 중 오류가 발생했습니다.',
    httpStatus: 500,
  },
} as const;

export type SessionErrorCode = keyof typeof SESSION_ERRORS;

/**
 * Parameters for session list API request
 * Story 23.1: Server-Side Session Search API
 */
export interface SessionListParams {
  includeEmpty?: boolean;
  limit?: number;
  offset?: number;
  query?: string;
  searchContent?: boolean;
}

/**
 * Request for PATCH /api/projects/:projectSlug/sessions/:sessionId/name
 */
export interface UpdateSessionNameRequest {
  name: string | null;
}

/**
 * Response for PATCH /api/projects/:projectSlug/sessions/:sessionId/name
 */
export interface UpdateSessionNameResponse {
  sessionId: string;
  name: string | null;
}
