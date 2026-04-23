// Story 28.0.5: Harness workbench shared types (Epic 28)
// Single source of truth for harness tree file I/O used by Story 28.1/28.4/28.5/28.6/28.8/28.9.

export type HarnessScope = 'user' | 'project';

export interface HarnessPathRef {
  scope: HarnessScope;
  /** Required when scope === 'project' */
  projectSlug?: string;
  /** Relative to ~/.claude (user) or <projectRoot>/.claude (project) */
  relativePath: string;
}

export interface HarnessEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  /** ISO 8601 — doubles as ETag */
  modifiedAt: string;
}

export interface HarnessListResponse {
  scope: HarnessScope;
  projectSlug?: string;
  /** Absolute path of ~/.claude or <project>/.claude */
  resolvedRoot: string;
  /** Echoed relativePath */
  path: string;
  entries: HarnessEntry[];
}

export interface HarnessReadResponse {
  scope: HarnessScope;
  projectSlug?: string;
  path: string;
  /** null when binary */
  content: string | null;
  isBinary: boolean;
  /** True when file exceeds 1MB and was truncated */
  isTruncated: boolean;
  size: number;
  /** ISO 8601 — ETag for conflict detection */
  mtime: string;
  mimeType: string;
}

export interface HarnessWriteRequest {
  content: string;
  /** Omit to force overwrite (new file creation or explicit bypass) */
  expectedMtime?: string;
}

export interface HarnessWriteResponse {
  success: true;
  size: number;
  mtime: string;
}

/** One AST-level patch operation for structured files (YAML/JSONC). */
export interface HarnessStructuredPatchOp {
  /** Key path into the parsed AST */
  path: (string | number)[];
  /** undefined = delete */
  value: unknown | undefined;
}

export interface HarnessStructuredPatchRequest {
  format: 'yaml' | 'jsonc';
  ops: HarnessStructuredPatchOp[];
  expectedMtime?: string;
}

export interface HarnessExternalChangeEvent {
  scope: HarnessScope;
  projectSlug?: string;
  /** Relative path inside the resolved root (POSIX separators) */
  path: string;
  type: 'modified' | 'deleted' | 'created';
  /** ISO 8601 when type !== 'deleted' */
  mtime?: string;
}

/**
 * Error code + HTTP status pairs. Modeled on the spirit of FILE_SYSTEM_ERRORS in
 * packages/shared/src/types/fileSystem.ts but intentionally slimmer —
 * FILE_SYSTEM_ERRORS carries `{code, message, httpStatus}` where `message` is a
 * static Korean fallback that controllers never actually use (see
 * fileSystemController.ts:297-328 — all user-facing messages go through
 * `req.t!(...)` for i18n). Harness controllers follow the same pattern, so the
 * static `message` field is dropped here and the envelope message is always
 * produced by `req.t!('harness.error.<key>')`.
 *
 * There is no global Express error middleware in this codebase; this constant
 * IS the single source of truth for (code → HTTP status) mapping.
 */
export const HARNESS_ERRORS = {
  HARNESS_PATH_DENIED:      { code: 'HARNESS_PATH_DENIED',      httpStatus: 403 },
  HARNESS_FORBIDDEN:        { code: 'HARNESS_FORBIDDEN',        httpStatus: 403 },
  HARNESS_FILE_NOT_FOUND:   { code: 'HARNESS_FILE_NOT_FOUND',   httpStatus: 404 },
  HARNESS_NOT_A_FILE:       { code: 'HARNESS_NOT_A_FILE',       httpStatus: 400 },
  HARNESS_ROOT_MISSING:     { code: 'HARNESS_ROOT_MISSING',     httpStatus: 404 },
  HARNESS_PARENT_NOT_FOUND: { code: 'HARNESS_PARENT_NOT_FOUND', httpStatus: 404 },
  HARNESS_STALE_WRITE:      { code: 'HARNESS_STALE_WRITE',      httpStatus: 409 },
  HARNESS_PARSE_ERROR:      { code: 'HARNESS_PARSE_ERROR',      httpStatus: 422 },
  HARNESS_WRITE_ERROR:      { code: 'HARNESS_WRITE_ERROR',      httpStatus: 500 },
} as const;
export type HarnessErrorCode = typeof HARNESS_ERRORS[keyof typeof HARNESS_ERRORS]['code'];
