/**
 * System Browse Types
 * Types for the directory-only system browse API (Epic 34, Story 34.1).
 *
 * Unlike fileSystem.ts (which is project-scoped and uses RELATIVE paths under a
 * project root), this API operates on ABSOLUTE paths across the whole host
 * filesystem — it runs *before* a project is registered, so there is no project
 * boundary. It exposes directory enumeration + drive-root listing + folder
 * create/rename only. There is intentionally NO delete surface.
 * [Source: docs/prd/epic-34-directory-browser.md#Story 34.1]
 */

/**
 * Single directory entry in a browse listing.
 * Files are never returned — only directories.
 */
export interface BrowseEntry {
  /** Directory name (basename) */
  name: string;
  /** Absolute path to the directory */
  path: string;
  /** Whether this directory has at least one child directory (tree-chevron signal) */
  hasChildren: boolean;
}

/**
 * Response for GET /api/system/browse
 */
export interface BrowseResponse {
  /** Enumerated directory (absolute); null for the drive-roots view */
  path: string | null;
  /** Parent directory (absolute) for breadcrumb/up navigation; null at a filesystem root or the drive-roots view */
  parent: string | null;
  /** os.homedir() — always included so the client can "start expanded at home" */
  home: string;
  /** true = "My PC" (drive roots) view */
  isDriveRoots: boolean;
  /** Child directories only, sorted by name ascending */
  entries: BrowseEntry[];
}

/**
 * Request body for POST /api/system/browse/mkdir
 */
export interface MkdirRequest {
  /** Absolute path of the parent directory */
  parentPath: string;
  /** New folder name (single path segment, sanitized server-side) */
  name: string;
}

/**
 * Response for POST /api/system/browse/mkdir
 */
export interface MkdirResponse {
  success: true;
  /** Absolute path of the created directory */
  path: string;
}

/**
 * Request body for POST /api/system/browse/rename
 */
export interface RenameRequest {
  /** Absolute path of the entry to rename */
  path: string;
  /** New name (single path segment, sanitized server-side) — rename stays within the same parent */
  newName: string;
}

/**
 * Response for POST /api/system/browse/rename
 */
export interface RenameResponse {
  success: true;
  /** Original absolute path */
  oldPath: string;
  /** New absolute path (same parent, renamed leaf) */
  newPath: string;
}

/**
 * System Browse error codes and messages.
 * Same shape as FILE_SYSTEM_ERRORS ({ code, message, httpStatus }) but kept as a
 * dedicated constant so messages never carry project-root context. The `message`
 * field is a developer-facing fallback only — the controller fills user-facing
 * text from i18n (`systemBrowse.error.*`).
 * [Source: packages/shared/src/types/fileSystem.ts:129-200]
 */
export const SYSTEM_BROWSE_ERRORS = {
  INVALID_PATH: {
    code: 'INVALID_PATH',
    message: 'Invalid path: must be a normalized absolute path without null bytes or UNC prefixes.',
    httpStatus: 400,
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    message: 'Path not found.',
    httpStatus: 404,
  },
  NOT_A_DIRECTORY: {
    code: 'NOT_A_DIRECTORY',
    message: 'Path is not a directory.',
    httpStatus: 400,
  },
  PERMISSION_DENIED: {
    code: 'PERMISSION_DENIED',
    message: 'Permission denied.',
    httpStatus: 403,
  },
  ALREADY_EXISTS: {
    code: 'ALREADY_EXISTS',
    message: 'A file or directory with that name already exists.',
    httpStatus: 409,
  },
  INVALID_NAME: {
    code: 'INVALID_NAME',
    message: 'Invalid name: contains path separators, reserved characters, or a reserved device name.',
    httpStatus: 400,
  },
  BROWSE_ERROR: {
    code: 'BROWSE_ERROR',
    message: 'Filesystem browse error.',
    httpStatus: 500,
  },
} as const;
