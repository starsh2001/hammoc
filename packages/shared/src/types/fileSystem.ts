/**
 * File System Types
 * Types for file system read API (file content reading and directory listing)
 * [Source: Story 11.1 - Task 1]
 */

/**
 * Response for GET /api/projects/:projectSlug/fs/read
 */
export interface FileReadResponse {
  /** File text content (null for binary files) */
  content: string | null;
  /** Whether the file is binary */
  isBinary: boolean;
  /** Whether the file was truncated (> 1MB) */
  isTruncated: boolean;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
}

/**
 * Single entry in a directory listing
 */
export interface DirectoryEntry {
  /** File/folder name */
  name: string;
  /** Entry type */
  type: 'file' | 'directory';
  /** Size in bytes (0 for directories) */
  size: number;
  /** Last modified date (ISO 8601) */
  modifiedAt: string;
}

/**
 * Response for GET /api/projects/:projectSlug/fs/list
 */
export interface DirectoryListResponse {
  /** Requested path */
  path: string;
  /** Directory entries */
  entries: DirectoryEntry[];
}

/**
 * File System error codes and messages
 * Pattern: PROJECT_ERRORS (packages/shared/src/types/project.ts)
 */
export const FILE_SYSTEM_ERRORS = {
  PATH_TRAVERSAL: {
    code: 'PATH_TRAVERSAL',
    message: '프로젝트 루트 외부 경로에 접근할 수 없습니다.',
    httpStatus: 403,
  },
  FILE_NOT_FOUND: {
    code: 'FILE_NOT_FOUND',
    message: '파일을 찾을 수 없습니다.',
    httpStatus: 404,
  },
  DIRECTORY_NOT_FOUND: {
    code: 'DIRECTORY_NOT_FOUND',
    message: '디렉토리를 찾을 수 없습니다.',
    httpStatus: 404,
  },
  NOT_A_DIRECTORY: {
    code: 'NOT_A_DIRECTORY',
    message: '지정한 경로가 디렉토리가 아닙니다.',
    httpStatus: 400,
  },
  FS_READ_ERROR: {
    code: 'FS_READ_ERROR',
    message: '파일 시스템 읽기 중 오류가 발생했습니다.',
    httpStatus: 500,
  },
} as const;

export type FileSystemErrorCode = keyof typeof FILE_SYSTEM_ERRORS;
