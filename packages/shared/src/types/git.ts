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

/**
 * Git API error constants (follows FILE_SYSTEM_ERRORS pattern)
 * Note: GIT_NOT_INITIALIZED is defined for future use (Story 16.2+).
 * In Story 16.1, non-git repos return { initialized: false } as a 200 response,
 * not via this error constant. Only GIT_ERROR is used in controller catch blocks.
 */
export const GIT_ERRORS = {
  GIT_NOT_INITIALIZED: {
    code: 'GIT_NOT_INITIALIZED',
    httpStatus: 200,
    message: 'Project is not a Git repository',
  },
  GIT_ERROR: {
    code: 'GIT_ERROR',
    httpStatus: 500,
    message: 'Git operation failed',
  },
} as const;
