/** Git file status entry with path and status indicator */
export interface GitFileStatus {
  path: string;
  /** Working tree status indicator (M=modified, D=deleted, A=added, ?=untracked, etc.) */
  index: string;
  working_dir: string;
}

/** Git status response */
export interface GitStatusResponse {
  initialized: boolean;
  branch?: string;
  ahead?: number;
  behind?: number;
  staged?: GitFileStatus[];
  unstaged?: GitFileStatus[];
  untracked?: string[];
}

/** Git commit entry */
export interface GitCommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string; // ISO 8601
}

/** Git log response */
export interface GitLogResponse {
  commits: GitCommitInfo[];
  total?: number;
}

/** Git branches response */
export interface GitBranchesResponse {
  current: string;
  local: string[];
  remote: string[];
}

/** Git diff response */
export interface GitDiffResponse {
  initialized: boolean;
  diff?: string;
  file?: string;
  staged?: boolean;
}

/** Generic response for Git write operations (Story 16.2, AC: 9) */
export interface GitOperationResponse {
  success: boolean;
  message: string;
}

/**
 * Git API error constants (follows FILE_SYSTEM_ERRORS pattern)
 * Note: GIT_NOT_INITIALIZED httpStatus is 400 for write operations (Story 16.2).
 * Story 16.1 read endpoints return { initialized: false } as a 200 response
 * without using this constant, so the change has zero impact on read endpoints.
 */
export const GIT_ERRORS = {
  GIT_NOT_INITIALIZED: {
    code: 'GIT_NOT_INITIALIZED',
    httpStatus: 400,
    message: 'Project is not a Git repository',
  },
  GIT_ERROR: {
    code: 'GIT_ERROR',
    httpStatus: 500,
    message: 'Git operation failed',
  },
  GIT_CONFLICT: {
    code: 'GIT_CONFLICT',
    httpStatus: 409,
    message: 'Git conflict detected. Use terminal (Epic 17) for advanced resolution.',
  },
  GIT_NOTHING_TO_COMMIT: {
    code: 'GIT_NOTHING_TO_COMMIT',
    httpStatus: 400,
    message: 'Nothing to commit',
  },
  GIT_BRANCH_EXISTS: {
    code: 'GIT_BRANCH_EXISTS',
    httpStatus: 409,
    message: 'Branch already exists',
  },
} as const;
