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
 * Response for PUT /api/projects/:projectSlug/fs/write
 */
export interface FileWriteResponse {
  success: boolean;
  /** File size in bytes after write */
  size: number;
}

/**
 * Response for POST /api/projects/:projectSlug/fs/create
 */
export interface FileCreateResponse {
  success: boolean;
  /** Created entry type */
  type: 'file' | 'directory';
  /** Created entry path (relative) */
  path: string;
}

/**
 * Response for DELETE /api/projects/:projectSlug/fs/delete
 */
export interface FileDeleteResponse {
  success: boolean;
  /** Deleted entry path (relative) */
  path: string;
}

/**
 * Response for PATCH /api/projects/:projectSlug/fs/rename
 */
export interface FileRenameResponse {
  success: boolean;
  /** Original path */
  oldPath: string;
  /** New path */
  newPath: string;
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
  FS_WRITE_ERROR: {
    code: 'FS_WRITE_ERROR',
    message: '파일 시스템 쓰기 중 오류가 발생했습니다.',
    httpStatus: 500,
  },
  FILE_ALREADY_EXISTS: {
    code: 'FILE_ALREADY_EXISTS',
    message: '파일 또는 디렉토리가 이미 존재합니다.',
    httpStatus: 409,
  },
  PROTECTED_PATH: {
    code: 'PROTECTED_PATH',
    message: '보호된 경로는 force 플래그 없이 삭제할 수 없습니다.',
    httpStatus: 403,
  },
  RENAME_TARGET_EXISTS: {
    code: 'RENAME_TARGET_EXISTS',
    message: '이름 변경 대상 경로에 파일이 이미 존재합니다.',
    httpStatus: 409,
  },
  PARENT_NOT_FOUND: {
    code: 'PARENT_NOT_FOUND',
    message: '상위 디렉토리가 존재하지 않습니다.',
    httpStatus: 404,
  },
} as const;

export type FileSystemErrorCode = keyof typeof FILE_SYSTEM_ERRORS;

/**
 * Single search result entry
 */
export interface FileSearchResult {
  /** Relative path from project root */
  path: string;
  /** File/folder name */
  name: string;
  /** Entry type */
  type: 'file' | 'directory';
}

/**
 * Response for GET /api/projects/:projectSlug/fs/search
 */
export interface FileSearchResponse {
  /** Search query */
  query: string;
  /** Matching entries */
  results: FileSearchResult[];
}

/**
 * Recursive directory tree entry (for full-tree API)
 */
export interface DirectoryTreeEntry {
  /** File/folder name */
  name: string;
  /** Entry type */
  type: 'file' | 'directory';
  /** Children entries (directory only) */
  children?: DirectoryTreeEntry[];
}

/**
 * Response for GET /api/projects/:projectSlug/fs/tree
 */
export interface DirectoryTreeResponse {
  /** Requested base path */
  path: string;
  /** Recursive tree of entries */
  tree: DirectoryTreeEntry[];
}
