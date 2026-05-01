// Story 28.0.5: Harness workbench shared types (Epic 28)
// Single source of truth for harness tree file I/O used by Story 28.1/28.2/28.3/28.4/28.5/28.6.

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
  HARNESS_PATH_DENIED:         { code: 'HARNESS_PATH_DENIED',         httpStatus: 403 },
  HARNESS_FORBIDDEN:           { code: 'HARNESS_FORBIDDEN',           httpStatus: 403 },
  HARNESS_PLUGIN_SCOPE_DENIED: { code: 'HARNESS_PLUGIN_SCOPE_DENIED', httpStatus: 403 },
  HARNESS_FILE_NOT_FOUND:      { code: 'HARNESS_FILE_NOT_FOUND',      httpStatus: 404 },
  HARNESS_NOT_A_FILE:          { code: 'HARNESS_NOT_A_FILE',          httpStatus: 404 },
  HARNESS_ROOT_MISSING:        { code: 'HARNESS_ROOT_MISSING',        httpStatus: 404 },
  HARNESS_PARENT_NOT_FOUND:    { code: 'HARNESS_PARENT_NOT_FOUND',    httpStatus: 404 },
  HARNESS_PLUGIN_NOT_FOUND:    { code: 'HARNESS_PLUGIN_NOT_FOUND',    httpStatus: 404 },
  HARNESS_STALE_WRITE:         { code: 'HARNESS_STALE_WRITE',         httpStatus: 409 },
  HARNESS_PARSE_ERROR:         { code: 'HARNESS_PARSE_ERROR',         httpStatus: 422 },
  HARNESS_WRITE_ERROR:         { code: 'HARNESS_WRITE_ERROR',         httpStatus: 500 },
} as const;
export type HarnessErrorCode = typeof HARNESS_ERRORS[keyof typeof HARNESS_ERRORS]['code'];

// ---------------------------------------------------------------------------
// Story 28.1 — Plugin list / toggle types
// ---------------------------------------------------------------------------

/** Raw ~/.claude/plugins/installed_plugins.json entry. */
export interface HarnessInstalledPluginEntry {
  scope: HarnessScope;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
  gitCommitSha: string;
  /** Present when scope === 'project'. */
  projectPath?: string;
}

/** Minimal shape of <installPath>/.claude-plugin/plugin.json. */
export interface HarnessPluginManifest {
  name: string;
  description?: string;
  author?: { name?: string; email?: string } | string;
  version?: string;
}

/** Marketplace catalog entry (marketplace.json · plugins[]). */
export interface HarnessMarketplacePluginMeta {
  name: string;
  description?: string;
  category?: string;
  strict?: boolean;
  source?: string;
}

export type HarnessPluginType = 'standard' | 'external-mcp';

export interface HarnessPluginComponentCounts {
  skills: number;
  commands: number;
  agents: number;
  hooks: number;
  mcpServers: number;
}

export interface HarnessPluginCard {
  /** "<name>@<marketplace>" — matches enabledPlugins key space. */
  key: string;
  name: string;
  marketplace: string;
  /** Short commit sha (first 7 chars of gitCommitSha). */
  version: string;
  scope: HarnessScope;
  category?: string;
  projectPath?: string;
  enabled: boolean;
  pluginType: HarnessPluginType;
  componentCounts: HarnessPluginComponentCounts;
  manifest?: HarnessPluginManifest;
  /**
   * Which settings.json this card's enable/disable toggle writes to. Matches
   * the CLI's `/plugin install --scope` semantics:
   *   - 'user'     → ~/.claude/settings.json
   *   - 'project'  → <currentProjectPath>/.claude/settings.json
   * Cards whose installed_plugins.json entry is `scope:project` but whose
   * `projectPath` does not match the current session's project still report
   * `'user'` here (their toggle is gated by `HARNESS_PLUGIN_SCOPE_DENIED` so
   * the field is informational only in that case).
   */
  settingsScope: HarnessScope;
  /**
   * ISO mtime of the settings.json indicated by `settingsScope`. Used as the
   * `expectedMtime` value the client should send with the next toggle for this
   * card — keeps STALE_WRITE detection accurate when user/project settings.json
   * mtimes diverge.
   */
  settingsMtime: string;
}

export type HarnessEnabledPluginsFormat = 'array' | 'object';

export interface HarnessPluginListResponse {
  cards: HarnessPluginCard[];
  enabledPluginsFormat: HarnessEnabledPluginsFormat;
  currentProjectPath?: string;
  /**
   * ISO mtime of ~/.claude/settings.json at read time. Empty string when the
   * file did not yet exist. Consumed by the client store so that the next
   * toggle request carries a fresh `expectedMtime` — prevents a STALE_WRITE
   * → reload → STALE_WRITE loop after external edits.
   */
  settingsMtime: string;
}

export interface HarnessPluginToggleRequest {
  key: string;
  enabled: boolean;
  expectedMtime?: string;
}

export interface HarnessPluginToggleResponse {
  success: true;
  mtime: string;
  /** Informational echo of the format the server actually wrote. */
  appliedFormat: HarnessEnabledPluginsFormat;
}
