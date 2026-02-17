/**
 * Project Types
 * Types for project list API
 * [Source: Story 3.1 - Task 1]
 * [Extended: Story 3.6 - Task 1: New Project Creation types]
 * [Extended: Story 10.3 - Task 1: Project settings overrides]
 */

import type { PermissionMode } from './sdk.js';

/**
 * Project information returned by the API
 */
export interface ProjectInfo {
  /** Original project path (e.g., /Users/user/my-project) */
  originalPath: string;
  /** Project hash/slug (folder name in ~/.claude/projects/) */
  projectSlug: string;
  /** Number of sessions in this project */
  sessionCount: number;
  /** ISO 8601 formatted last modified date */
  lastModified: string;
  /** Whether this project has .bmad-core folder */
  isBmadProject: boolean;
  /** Whether this project is hidden (from .bmad-studio/settings.json) */
  hidden?: boolean;
}

/**
 * Project-level settings stored in <project>/.bmad-studio/settings.json
 */
export interface ProjectSettings {
  hidden?: boolean;
  /** undefined = use global, '' = CLI default, 'model-id' = specific model */
  modelOverride?: string;
  /** undefined = use global */
  permissionModeOverride?: PermissionMode;
}

/**
 * Request for PATCH /api/projects/:projectSlug/settings
 * null = clear override (use global), undefined = no change
 */
export interface UpdateProjectSettingsRequest {
  hidden?: boolean;
  modelOverride?: string | null;
  permissionModeOverride?: PermissionMode | null;
}

/**
 * Response for GET /api/projects/:projectSlug/settings
 * Includes effective values after merging with global preferences
 */
export interface ProjectSettingsApiResponse extends ProjectSettings {
  /** Effective model after merging with global preferences */
  effectiveModel: string;
  /** Effective permission mode after merging with global preferences */
  effectivePermissionMode: PermissionMode;
  /** Which fields have project-level overrides (for UI indicator) */
  _overrides: string[];
}

/**
 * Response for GET /api/projects
 */
export interface ProjectListResponse {
  projects: ProjectInfo[];
}

/**
 * Project error codes and messages
 */
export const PROJECT_ERRORS = {
  SCAN_ERROR: {
    code: 'PROJECT_SCAN_ERROR',
    message: '프로젝트 목록을 가져오는 중 오류가 발생했습니다.',
    httpStatus: 500,
  },
  DIR_NOT_FOUND: {
    code: 'PROJECTS_DIR_NOT_FOUND',
    message: 'Claude projects 디렉토리가 없습니다.',
    httpStatus: 200, // Return empty array (AC 6)
  },
  PERMISSION_DENIED: {
    code: 'PERMISSION_DENIED',
    message: '디렉토리 접근 권한이 없습니다.',
    httpStatus: 500,
  },
  INVALID_SESSION_INDEX: {
    code: 'INVALID_SESSION_INDEX',
    message: 'sessions-index.json 파일 형식이 올바르지 않습니다.',
    httpStatus: 500,
  },
  // Story 3.6 - Project Creation Error Codes
  PATH_NOT_FOUND: {
    code: 'PATH_NOT_FOUND',
    message: '지정한 경로가 존재하지 않습니다.',
    httpStatus: 400,
  },
  PATH_NOT_DIRECTORY: {
    code: 'PATH_NOT_DIRECTORY',
    message: '지정한 경로가 디렉토리가 아닙니다.',
    httpStatus: 400,
  },
  INVALID_PATH_FORMAT: {
    code: 'INVALID_PATH_FORMAT',
    message: '경로 형식이 올바르지 않습니다.',
    httpStatus: 400,
  },
  BMAD_SETUP_FAILED: {
    code: 'BMAD_SETUP_FAILED',
    message: 'BMad 설정 중 오류가 발생했습니다.',
    httpStatus: 500,
  },
  ALREADY_BMAD: {
    code: 'ALREADY_BMAD',
    message: '이미 BMad가 설정된 프로젝트입니다. 재설정하려면 force 옵션을 사용하세요.',
    httpStatus: 409,
  },
  PROJECT_ALREADY_EXISTS: {
    code: 'PROJECT_ALREADY_EXISTS',
    message: '이미 등록된 프로젝트입니다.',
    httpStatus: 409,
  },
} as const;

export type ProjectErrorCode = keyof typeof PROJECT_ERRORS;

/**
 * Request for POST /api/projects
 * [Source: Story 3.6 - Task 1]
 */
export interface CreateProjectRequest {
  /** Absolute path to the project directory */
  path: string;
  /** Whether to initialize .bmad-core folder (default: true) */
  setupBmad?: boolean;
  /** BMad method version to install (e.g., "4.44.3"). Required when setupBmad is true. */
  bmadVersion?: string;
}

/**
 * Response for GET /api/projects/bmad-versions
 */
export interface BmadVersionsResponse {
  /** Available BMad method versions, sorted descending (latest first) */
  versions: string[];
}

/**
 * Request for POST /api/projects/:projectSlug/setup-bmad
 * [Source: Story 9.1 - Task 1]
 */
export interface SetupBmadRequest {
  /** BMad method version to install (e.g., "4.44.3"). Defaults to latest. */
  bmadVersion?: string;
  /** Force setup even if project already has .bmad-core (default: false) */
  force?: boolean;
}

/**
 * Response for POST /api/projects/:projectSlug/setup-bmad
 * [Source: Story 9.1 - Task 1]
 */
export interface SetupBmadResponse {
  /** Updated project info with isBmadProject = true */
  project: ProjectInfo;
  /** BMad version that was installed */
  installedVersion: string;
}

/**
 * Response for POST /api/projects
 * [Source: Story 3.6 - Task 1]
 */
export interface CreateProjectResponse {
  /** Created or existing project info */
  project: ProjectInfo;
  /** True if project already existed */
  isExisting: boolean;
  /** BMad setup error message if project was created but BMad setup failed */
  bmadSetupError?: string;
}

/**
 * Request for POST /api/projects/validate-path
 * [Source: Story 3.6 - Task 1]
 */
export interface ValidatePathRequest {
  /** Path to validate */
  path: string;
}

/**
 * Response for DELETE /api/projects/:projectSlug
 */
export interface DeleteProjectResponse {
  /** Whether deletion was successful */
  success: boolean;
}

/**
 * Response for POST /api/projects/validate-path
 * [Source: Story 3.6 - Task 1]
 */
export interface ValidatePathResponse {
  /** Whether path is valid (exists and is directory) */
  valid: boolean;
  /** Whether directory exists */
  exists: boolean;
  /** Whether path is already a Claude project */
  isProject: boolean;
  /** Project slug if isProject is true */
  projectSlug?: string;
  /** Error message if not valid */
  error?: string;
}
