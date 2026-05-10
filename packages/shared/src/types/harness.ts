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
  /**
   * Optional resolved absolute path of the file on disk. Populated by services
   * (e.g. claudeMdService) that need the UI to display the canonical location
   * in confirmation dialogs. Other harness services may leave this unset.
   */
  absolutePath?: string;
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
  HARNESS_SKILL_NOT_FOUND:     { code: 'HARNESS_SKILL_NOT_FOUND',     httpStatus: 404 },
  HARNESS_MCP_NOT_FOUND:       { code: 'HARNESS_MCP_NOT_FOUND',       httpStatus: 404 },
  HARNESS_HOOK_NOT_FOUND:      { code: 'HARNESS_HOOK_NOT_FOUND',      httpStatus: 404 },
  HARNESS_HOOK_INVALID_EVENT:  { code: 'HARNESS_HOOK_INVALID_EVENT',  httpStatus: 400 },
  HARNESS_COMMAND_NOT_FOUND:   { code: 'HARNESS_COMMAND_NOT_FOUND',   httpStatus: 404 },
  HARNESS_STALE_WRITE:         { code: 'HARNESS_STALE_WRITE',         httpStatus: 409 },
  HARNESS_FILE_EXISTS:         { code: 'HARNESS_FILE_EXISTS',         httpStatus: 409 },
  HARNESS_SKILL_NAME_CONFLICT: { code: 'HARNESS_SKILL_NAME_CONFLICT', httpStatus: 409 },
  HARNESS_MCP_NAME_CONFLICT:   { code: 'HARNESS_MCP_NAME_CONFLICT',   httpStatus: 409 },
  HARNESS_COMMAND_NAME_CONFLICT: { code: 'HARNESS_COMMAND_NAME_CONFLICT', httpStatus: 409 },
  HARNESS_AGENT_NOT_FOUND:      { code: 'HARNESS_AGENT_NOT_FOUND',      httpStatus: 404 },
  HARNESS_AGENT_NAME_CONFLICT:  { code: 'HARNESS_AGENT_NAME_CONFLICT',  httpStatus: 409 },
  HARNESS_PARSE_ERROR:         { code: 'HARNESS_PARSE_ERROR',         httpStatus: 422 },
  HARNESS_WRITE_ERROR:         { code: 'HARNESS_WRITE_ERROR',         httpStatus: 500 },
  // Story 29.2: bundled snippet scope is read-only — `create`/`update`/`delete`
  // against `bundled` source/target are rejected with this code. `copy` from
  // `bundled` to `project`/`user` remains allowed (one-way clone).
  HARNESS_BUNDLED_READONLY:    { code: 'HARNESS_BUNDLED_READONLY',    httpStatus: 409 },
  // Story 30.1 (AC4.b): secret heuristic detected a plaintext token in a file
  // whose share-scope badge is `shared` (i.e. tracked by git). Both the client
  // dialog and the server-side write guard raise this code so direct API
  // callers also hit the same policy.
  HARNESS_SECRET_ON_SHARED:    { code: 'HARNESS_SECRET_ON_SHARED',    httpStatus: 409 },
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

// ---------------------------------------------------------------------------
// Story 28.2 — Skill section types
// ---------------------------------------------------------------------------

export type HarnessSkillSourceScope = 'project' | 'user' | 'plugin';

/** YAML frontmatter shape inside <skillDir>/SKILL.md. */
export interface HarnessSkillFrontmatter {
  name: string;
  description: string;
  version?: string;
}

/** File counts under each well-known bundle directory of a skill. */
export interface HarnessSkillBundleCounts {
  references: number;
  examples: number;
  scripts: number;
  assets: number;
}

/**
 * Identifies one source location that holds a particular skill name. The same
 * `name` (directory name) may exist in 1–3 places (project, user, plugin) and
 * each gets a separate `HarnessSkillSourceLocation`.
 */
export interface HarnessSkillSourceLocation {
  scope: HarnessSkillSourceScope;
  /**
   * Absolute path of the skill folder root. For project / user this is
   * `<scopeRoot>/.claude/skills/<name>/`; for plugin this is
   * `<installPath>/skills/<name>/`.
   */
  absoluteRoot: string;
  /** scope === 'plugin' → "<pluginName>@<marketplace>". */
  pluginKey?: string;
  /** scope === 'project' → the active project's slug. */
  projectSlug?: string;
}

/**
 * Card-level DTO. Even when the same skill name exists in all three sources,
 * the UI shows a single card with `sources[]` populated; `activeScope`
 * reflects the priority resolution (project > user > plugin).
 */
export interface HarnessSkillCard {
  /** Skill directory name; matches the `name` frontmatter field. */
  name: string;
  /** Active source's frontmatter description (if present). */
  description?: string;
  /** Active source's frontmatter version (if present). */
  version?: string;
  /** 1–3 entries — one per existing scope. Sorted by priority. */
  sources: HarnessSkillSource[];
  /** Resolved priority (project > user > plugin). */
  activeScope: HarnessSkillSourceScope;
}

/** A single source entry attached to a card. */
export interface HarnessSkillSource extends HarnessSkillSourceLocation {
  /** Validated frontmatter — sources whose frontmatter failed parse are excluded. */
  frontmatter: HarnessSkillFrontmatter;
  /** ISO mtime of SKILL.md — used as STALE_WRITE ETag. */
  skillMdMtime: string;
}

export interface HarnessSkillListResponse {
  cards: HarnessSkillCard[];
  /**
   * SKILL.md files that failed frontmatter validation. Surfaced separately so
   * the UI can render a "shadowed by malformed frontmatter" badge without the
   * card list silently growing.
   */
  malformed: HarnessSkillMalformedEntry[];
}

export interface HarnessSkillMalformedEntry {
  scope: HarnessSkillSourceScope;
  absoluteRoot: string;
  pluginKey?: string;
  projectSlug?: string;
  /** Raw failure reason — UI maps to an i18n key. */
  reason: string;
}

export interface HarnessSkillReadResponse {
  source: HarnessSkillSourceLocation;
  frontmatter: HarnessSkillFrontmatter;
  /** SKILL.md body — content after the closing `---` of the frontmatter block. */
  body: string;
  /** Full SKILL.md text (frontmatter + body) — used by the Raw editor toggle. */
  raw: string;
  bundleCounts: HarnessSkillBundleCounts;
  skillMdMtime: string;
  bundleEntries: HarnessSkillBundleEntry[];
  /** True when the bundle tree was clipped at the configured depth limit. */
  truncatedAtDepth: boolean;
}

export interface HarnessSkillBundleEntry {
  /** Path relative to the skill root, e.g. "references/foo.md". */
  relativePath: string;
  isBinary: boolean;
  isTruncated: boolean;
  size: number;
  mtime: string;
}

export interface HarnessSkillUpdateRequest {
  /** Frontmatter form save — translated into a YAML round-trip on disk. */
  frontmatter?: Partial<HarnessSkillFrontmatter>;
  /** Body-only replace — keeps the existing frontmatter block intact. */
  body?: string;
  /** Raw replace — overwrites the entire SKILL.md with the supplied text. */
  raw?: string;
  /** STALE_WRITE guard — most recent skillMdMtime the client saw. */
  expectedMtime?: string;
}

export interface HarnessSkillUpdateResponse {
  success: true;
  mtime: string;
}

export interface HarnessSkillCopyRequest {
  sourceScope: HarnessSkillSourceScope;
  /** Required when sourceScope === 'project'. */
  sourceProjectSlug?: string;
  /** Required when sourceScope === 'plugin'. */
  sourcePluginKey?: string;
  /** Skill directory name on the source side. */
  sourceName: string;
  /** Plugin destinations are forbidden — only project/user are allowed. */
  targetScope: 'project' | 'user';
  /** Required when targetScope === 'project'. */
  targetProjectSlug?: string;
  /** Final directory name on the target side; equal to `sourceName` for non-rename copies. */
  targetName: string;
  onConflict: 'overwrite' | 'skip' | 'rename';
}

export interface HarnessSkillCopyResponse {
  success: true;
  /** Number of files written under the new tree. */
  copied: number;
  /** True when onConflict === 'skip' and a conflict was actually hit. */
  skipped: boolean;
  /** Final directory name actually created (may differ from the request when renaming). */
  finalName: string;
}

// ---------------------------------------------------------------------------
// Story 28.3 — MCP section types
// ---------------------------------------------------------------------------

export type HarnessMcpSourceScope = 'project' | 'user' | 'plugin';
/** Stdio default per official MCP schema; explicit when set. */
export type HarnessMcpServerType = 'stdio' | 'sse' | 'http' | 'ws';

/** Common shape — all four type variants. type=stdio when omitted on disk. */
export interface HarnessMcpServerConfig {
  type?: HarnessMcpServerType;
  // stdio
  command?: string;
  args?: string[];
  // sse / http / ws
  url?: string;
  // http only
  headers?: Record<string, string>;
  // common
  env?: Record<string, string>;
  /**
   * Disk-level enabled flag. Spike A 경로 1 (flag honored) 채택 시에만 디스크에
   * 등장 — 명시 false 가 비활성, 키 부재(또는 true) 가 활성. 경로 2 (backup
   * file) 채택 시 디스크에는 절대 나타나지 않으며 비활성은 entry 를
   * mcp.disabled.json 백업 파일로 이동시켜 표현한다. 응답 측
   * HarnessMcpCard.enabled 가 두 경로의 의미 차이를 흡수해 UI 토글에 단일
   * boolean 으로 노출한다.
   */
  enabled?: boolean;
}

/** File kind hosting the server entry — informs server-side path/parsing. */
export type HarnessMcpSourceFileKind = 'mcp.json' | 'settings.json' | 'plugin.json';

export interface HarnessMcpSourceLocation {
  scope: HarnessMcpSourceScope;
  /** Absolute path of the file holding this server's entry. */
  absoluteFile: string;
  /** scope === 'plugin' → "<pluginName>@<marketplace>". */
  pluginKey?: string;
  /** scope === 'project' → the active project's slug. */
  projectSlug?: string;
  /** Spike B 후보 2 채택 시 'settings.json' / 후보 1 채택 시 'mcp.json' / plugin 은 'mcp.json' 또는 'plugin.json'. */
  sourceFileKind: HarnessMcpSourceFileKind;
}

export interface HarnessMcpSource extends HarnessMcpSourceLocation {
  config: HarnessMcpServerConfig;
  /** ISO mtime of `absoluteFile` — STALE_WRITE ETag. */
  mtime: string;
  /** True when this entry currently lives in the disabled-backup file (Spike A 경로 2). */
  disabledByBackup: boolean;
}

export interface HarnessMcpCard {
  /** Server name = `mcpServers.<name>` key. */
  name: string;
  /** Active source's `type` field after default-stdio resolution. */
  activeType: HarnessMcpServerType;
  /**
   * Resolved active state — UI uses this directly for the toggle.
   * 경로 1 (Spike A flag 지원): true ⇔ active source 의 HarnessMcpServerConfig.enabled !== false.
   * 경로 2 (Spike A backup 우회): true ⇔ active source 가 main 파일에 살아 있음
   *                                (= !sources[activeIndex].disabledByBackup).
   */
  enabled: boolean;
  /** 1–N entries — one per existing scope×file. Sorted by priority (project > user > plugin). */
  sources: HarnessMcpSource[];
  activeScope: HarnessMcpSourceScope;
}

export interface HarnessMcpMalformedEntry {
  scope: HarnessMcpSourceScope;
  absoluteFile: string;
  serverName: string;
  pluginKey?: string;
  projectSlug?: string;
  reason: string;
}

export interface HarnessMcpListResponse {
  cards: HarnessMcpCard[];
  /**
   * Servers whose JSON object failed schema validation. Surfaced separately so
   * the UI shows a "shadowed by malformed config" badge without the card list
   * silently growing.
   */
  malformed: HarnessMcpMalformedEntry[];
  /**
   * Spike B outcome cached so the client UI can render the right empty-state.
   * `null` means Claude Code does not recognise a global MCP file at all.
   */
  userFileKind: 'mcp.json' | 'settings.json' | null;
  /**
   * Spike A outcome cached. 'flag' = enabled flag honored (경로 1).
   * 'backup' = disabled-backup file (경로 2).
   */
  disableStrategy: 'flag' | 'backup';
}

export interface HarnessMcpReadResponse {
  source: HarnessMcpSourceLocation;
  config: HarnessMcpServerConfig;
  /** Raw JSON/JSONC text of the entire `mcpServers.<name>` object — used by the Raw editor toggle. */
  raw: string;
  mtime: string;
  disabledByBackup: boolean;
}

/**
 * Update request — exactly one of `config`, `raw`, or `enabled` is required.
 * `enabled` is a no-arg toggle that routes through `disableStrategy` (see Spike A):
 *   - 'flag'  → patches `mcpServers.<name>.enabled` true/false
 *   - 'backup' → moves the entry between main file and `mcp.disabled.json`
 */
export interface HarnessMcpUpdateRequest {
  config?: HarnessMcpServerConfig;
  raw?: string;
  enabled?: boolean;
  expectedMtime?: string;
}

export interface HarnessMcpUpdateResponse {
  success: true;
  mtime: string;
}

export interface HarnessMcpCopyRequest {
  sourceScope: HarnessMcpSourceScope;
  sourceProjectSlug?: string;
  sourcePluginKey?: string;
  /** plugin sources may live in either .mcp.json or plugin.json — must be echoed. */
  sourceFileKind?: HarnessMcpSourceFileKind;
  sourceName: string;
  /** plugin destinations forbidden — only project/user are allowed. */
  targetScope: 'project' | 'user';
  targetProjectSlug?: string;
  targetName: string;
  onConflict: 'overwrite' | 'skip' | 'rename';
  /** Client must echo `true` after showing the secret-confirmation modal when heuristics matched. */
  acknowledgedSecret?: boolean;
}

export interface HarnessMcpCopyResponse {
  success: true;
  finalName: string;
  skipped: boolean;
  /**
   * Optional warnings the client surfaces as toasts. Currently only
   * `'plugin-root-reference'` (the source contained `${CLAUDE_PLUGIN_ROOT}`).
   */
  warnings?: string[];
}

export interface HarnessMcpDeleteRequest {
  scope: 'project' | 'user';
  projectSlug?: string;
  expectedMtime?: string;
}

// ---------------------------------------------------------------------------
// Story 28.4 — Hook section types
// ---------------------------------------------------------------------------

export type HarnessHookSourceScope = 'project' | 'user' | 'plugin';
export type HarnessHookType = 'command' | 'prompt';

export const HARNESS_HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SubagentStop',
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreCompact',
  'Notification',
] as const;
export type HarnessHookEvent = (typeof HARNESS_HOOK_EVENTS)[number];

/** Single hook entry — what one card represents. */
export interface HarnessHookConfig {
  type: HarnessHookType;
  /** Required when type === 'command'. */
  command?: string;
  /** Required when type === 'prompt'. */
  prompt?: string;
  /** Seconds (official spec); omit = Claude Code default. */
  timeout?: number;
}

export interface HarnessHookSourceLocation {
  scope: HarnessHookSourceScope;
  /** Absolute path of the file holding this hook. */
  absoluteFile: string;
  /** scope === 'plugin' → "<pluginName>@<marketplace>". */
  pluginKey?: string;
  /** scope === 'project' → the active project's slug. */
  projectSlug?: string;
  /** Hook event name. */
  event: HarnessHookEvent;
  /** Index within `hooks.<event>` array (the matcher group index). */
  groupIndex: number;
  /** Index within `hooks.<event>[groupIndex].hooks` array. */
  hookIndex: number;
  /** True when this entry currently lives in the disabled-backup file (AC5). */
  disabledByBackup: boolean;
}

export interface HarnessHookCard extends HarnessHookSourceLocation {
  /** Group-level matcher (may be undefined or empty string). */
  matcher?: string;
  config: HarnessHookConfig;
  /** ISO mtime of `absoluteFile` — STALE_WRITE ETag. */
  mtime: string;
  /**
   * Resolved active state — UI uses this directly for the toggle.
   * true ⇔ this entry currently lives in the main settings/hooks file.
   * false ⇔ disabledByBackup === true.
   */
  enabled: boolean;
}

export interface HarnessHookMalformedEntry {
  scope: HarnessHookSourceScope;
  absoluteFile: string;
  event?: HarnessHookEvent;
  pluginKey?: string;
  projectSlug?: string;
  reason: string;
}

export interface HarnessHookListResponse {
  /** Cards keyed by event for fast UI grouping; each list sorted by (scope, groupIndex, hookIndex). */
  cardsByEvent: Record<HarnessHookEvent, HarnessHookCard[]>;
  malformed: HarnessHookMalformedEntry[];
  /**
   * Spike outcome cached. 'supported' = `prompt` type works ⇒ UI radio enabled.
   * 'unsupported' = `prompt` rejected ⇒ UI radio disabled (existing prompt cards still listed read-only).
   * 'unknown' = pre-impl path, dev agent has not yet run the spike.
   */
  promptTypeSupport: 'supported' | 'unsupported' | 'unknown';
  /**
   * AC5 two-file STALE_WRITE guard support — current mtime of `hooks.disabled.json`
   * for each writable scope. Absent key ⇔ backup file does not exist yet (server will
   * create it on first disable). Clients must echo this back as
   * `HarnessHookUpdateRequest.expectedBackupMtime` whenever toggling `enabled`.
   */
  backupMtimeByScope: { project?: string; user?: string };
}

export interface HarnessHookReadResponse {
  source: HarnessHookSourceLocation;
  matcher?: string;
  config: HarnessHookConfig;
  /** Raw JSONC text of `{ matcher?, hooks: [<this>] }` — used by the Raw editor toggle. */
  raw: string;
  mtime: string;
  disabledByBackup: boolean;
}

/**
 * Update request — exactly one of `config`/`matcher`/`raw`/`enabled` is required.
 * `enabled` toggles backup-file movement (AC5 path).
 * `matcher` updates the parent matcher group's matcher field; if `splitFromGroup` is true
 *   the hook is first extracted into a new single-hook group and the matcher applies to
 *   only that new group (sibling hooks keep the original matcher untouched).
 */
export interface HarnessHookUpdateRequest {
  config?: HarnessHookConfig;
  /** null = unset (omit the field on disk). */
  matcher?: string | null;
  raw?: string;
  enabled?: boolean;
  /** STALE_WRITE guard for the main settings.json file. */
  expectedMtime?: string;
  /**
   * AC5 two-file guard — STALE_WRITE guard for `hooks.disabled.json`. Required when
   * `enabled` is being toggled AND the backup file already exists (per
   * HarnessHookListResponse.backupMtimeByScope). Server returns 409 with
   * `details.staleFile: 'main' | 'backup'` to disambiguate which file conflicted.
   */
  expectedBackupMtime?: string;
  /**
   * AC3 sibling protection — only meaningful when `matcher` is also set. When true and
   * the parent group contains 2+ hooks, server first extracts this hook into a new
   * single-hook group (preserving the original group for siblings) and then applies the
   * new matcher to the extracted group only. False (default) keeps the existing behavior
   * — matcher updates the parent group and affects all sibling hooks.
   */
  splitFromGroup?: boolean;
}

export interface HarnessHookUpdateResponse {
  success: true;
  mtime: string;
  /**
   * Present only when AC5 enabled-toggle path was taken — the backup file's new mtime
   * after the two-file transaction. Clients persist this back into
   * `HarnessHookListResponse.backupMtimeByScope` so the next toggle has the freshest guard.
   */
  backupMtime?: string;
  /**
   * Present only when `matcher` was updated AND server affected sibling hooks
   * (group had 2+ hooks AND splitFromGroup was false/omitted). Tells the client how
   * many other hooks now share the new matcher so it can show the post-save banner.
   */
  affectedSiblings?: number;
  /**
   * Present only when `matcher + splitFromGroup:true` extracted this hook to a new
   * group; the new (groupIndex, hookIndex) replaces the request coordinates.
   */
  newGroupIndex?: number;
  newHookIndex?: number;
}

export interface HarnessHookCopyRequest {
  sourceScope: HarnessHookSourceScope;
  sourceProjectSlug?: string;
  sourcePluginKey?: string;
  sourceEvent: HarnessHookEvent;
  sourceGroupIndex: number;
  sourceHookIndex: number;
  /** plugin destinations forbidden — only project/user are allowed. */
  targetScope: 'project' | 'user';
  targetProjectSlug?: string;
  onConflict: 'overwrite' | 'skip' | 'duplicate';
  /** Client must echo `true` after showing the type-warning modal. */
  acknowledgedWarning: boolean;
}

export interface HarnessHookCopyResponse {
  success: true;
  newGroupIndex: number;
  newHookIndex: number;
  skipped: boolean;
  /** Returned when ${CLAUDE_PLUGIN_ROOT} appeared in source body. */
  warnings?: Array<'plugin-root-reference'>;
}

export interface HarnessHookDeleteRequest {
  scope: 'project' | 'user';
  projectSlug?: string;
  event: HarnessHookEvent;
  groupIndex: number;
  hookIndex: number;
  expectedMtime?: string;
}

export interface HarnessHookCreateRequest {
  scope: 'project' | 'user';
  projectSlug?: string;
  event: HarnessHookEvent;
  matcher?: string;
  config: HarnessHookConfig;
  expectedMtime?: string;
}

export interface HarnessHookCreateResponse {
  success: true;
  newGroupIndex: number;
  newHookIndex: number;
  mtime: string;
}

// ---------------------------------------------------------------------------
// Story 28.5 — Slash command section types
// ---------------------------------------------------------------------------

export type HarnessCommandSourceScope = 'project' | 'user' | 'plugin';
export type HarnessCommandModel = 'inherit' | 'sonnet' | 'opus' | 'haiku';

/** Frontmatter — all four fields optional per official spec. */
export interface HarnessCommandFrontmatter {
  description?: string;
  'argument-hint'?: string;
  'allowed-tools'?: string;
  model?: HarnessCommandModel;
}

export interface HarnessCommandSourceLocation {
  scope: HarnessCommandSourceScope;
  /** Absolute path of the .md file. */
  absoluteFile: string;
  /** scope === 'plugin' → "<pluginName>@<marketplace>". */
  pluginKey?: string;
  /** scope === 'project' → the active project's slug. */
  projectSlug?: string;
  /** Path under the commands root, with `/` separator. e.g. "BMad/agents/sm.md". */
  relativePath: string;
  /** Slash-name derived from relativePath. e.g. "/BMad:agents:sm". */
  slashName: string;
}

export interface HarnessCommandTokens {
  usesPositionalArgs: boolean; // $1 / $2 / $N
  usesArgumentsAll: boolean; // $ARGUMENTS
  usesFileRefs: boolean; // @path
  usesBashExec: boolean; // !`cmd`
  usesPluginRoot: boolean; // ${CLAUDE_PLUGIN_ROOT}
}

export interface HarnessCommandCard extends HarnessCommandSourceLocation {
  frontmatter: HarnessCommandFrontmatter;
  /** Token usage flags — driven by simple regex over body, used by AC1(c) badges. */
  tokens: HarnessCommandTokens;
  /** ISO mtime of `absoluteFile` — STALE_WRITE ETag. */
  mtime: string;
  /**
   * True when the file body's first 10 lines contain `<!-- Powered by BMAD™ Core -->`
   * (AC5.b). Real BMad mirrors place the marker at line 5, not line 1, so a
   * leading-window substring match — not a "starts with" check — is required.
   */
  isBmadMirror: boolean;
}

export interface HarnessCommandMalformedEntry {
  scope: HarnessCommandSourceScope;
  absoluteFile: string;
  pluginKey?: string;
  projectSlug?: string;
  reason: string;
}

export interface HarnessCommandListResponse {
  cards: HarnessCommandCard[];
  malformed: HarnessCommandMalformedEntry[];
  /**
   * Total count after de-dup with scanAgents/scanTasks (the chat slash palette merge layer).
   * Used by the workbench panel header badge ("N개 커맨드가 채팅의 / 팔레트에 노출됩니다").
   */
  paletteVisibleCount: number;
}

export interface HarnessCommandReadResponse {
  source: HarnessCommandSourceLocation;
  frontmatter: HarnessCommandFrontmatter;
  /** Body markdown after the closing `---` (frontmatter stripped). */
  body: string;
  /** Raw text of the entire file (frontmatter + body) — used by Raw editor toggle. */
  raw: string;
  mtime: string;
  isBmadMirror: boolean;
}

/**
 * Update request — exactly one of `frontmatter`/`body`/`raw` is required.
 * `frontmatter` and `body` patch separately (frontmatter via yaml round-trip,
 * body as plain text replacement). `raw` replaces the whole file.
 */
export interface HarnessCommandUpdateRequest {
  frontmatter?: HarnessCommandFrontmatter;
  body?: string;
  raw?: string;
  /** STALE_WRITE guard. */
  expectedMtime?: string;
}

export interface HarnessCommandUpdateResponse {
  success: true;
  mtime: string;
  slashName: string;
  tokens: HarnessCommandTokens;
}

export interface HarnessCommandCreateRequest {
  scope: 'project' | 'user';
  projectSlug?: string;
  /** Relative path under commands root. Must end in `.md`. */
  relativePath: string;
  frontmatter?: HarnessCommandFrontmatter;
  body?: string;
}

export interface HarnessCommandCreateResponse {
  success: true;
  source: HarnessCommandSourceLocation;
  mtime: string;
}

export interface HarnessCommandCopyRequest {
  sourceScope: HarnessCommandSourceScope;
  sourceProjectSlug?: string;
  sourcePluginKey?: string;
  sourceRelativePath: string;
  /** plugin destinations forbidden — only project/user allowed. */
  targetScope: 'project' | 'user';
  targetProjectSlug?: string;
  /** When undefined, server uses sourceRelativePath. */
  targetRelativePath?: string;
  onConflict: 'overwrite' | 'skip' | 'rename';
  /** Required when sensitive content is detected by the secret heuristic. */
  acknowledgedSecret?: boolean;
}

export interface HarnessCommandCopyResponse {
  success: true;
  target: HarnessCommandSourceLocation;
  skipped: boolean;
  /** Returned when ${CLAUDE_PLUGIN_ROOT} appeared in source. */
  warnings?: Array<'plugin-root-reference'>;
}

export interface HarnessCommandDirectoryCopyRequest {
  sourceScope: HarnessCommandSourceScope;
  sourceProjectSlug?: string;
  sourcePluginKey?: string;
  /** Directory path under commands root. e.g. "BMad/agents". */
  sourceDirectoryPath: string;
  targetScope: 'project' | 'user';
  targetProjectSlug?: string;
  targetDirectoryPath?: string;
  onConflict: 'overwrite-all' | 'skip-all' | 'per-file';
  /**
   * When onConflict === 'per-file', the server returns 409 with a `details.conflicts`
   * payload listing the relative paths. The client populates this map and re-issues.
   */
  perFileChoices?: Record<string, 'overwrite' | 'skip' | 'rename'>;
  /** Renamed targets when 'rename' is chosen for any file. */
  perFileRenames?: Record<string, string>;
  acknowledgedSecret?: boolean;
}

export interface HarnessCommandDirectoryCopyResponse {
  success: true;
  copied: HarnessCommandSourceLocation[];
  skipped: string[];
  warnings?: Array<'plugin-root-reference'>;
}

export interface HarnessCommandDeleteRequest {
  scope: 'project' | 'user';
  projectSlug?: string;
  relativePath: string;
  expectedMtime?: string;
}

// ---------------------------------------------------------------------------
// Story 28.6 — Sub-agent section types
// ---------------------------------------------------------------------------

export type HarnessAgentSourceScope = 'project' | 'user' | 'plugin';
export type HarnessAgentModel = 'inherit' | 'sonnet' | 'opus' | 'haiku';
export type HarnessAgentColor = 'blue' | 'cyan' | 'green' | 'yellow' | 'magenta' | 'red';

/**
 * Frontmatter — name/description/model/color are required per official spec.
 * `tools` is optional and uses a 3-state model:
 *   - key absent      → all tools allowed (omit on disk)
 *   - empty array     → no tools allowed (preserved as `tools: []`)
 *   - populated array → explicit allowlist
 * The discriminated `toolsState` field on the read response surfaces the
 * three states explicitly so the form can render the right radio option
 * without ambiguity.
 */
export interface HarnessAgentFrontmatter {
  name: string;
  description: string;
  model: HarnessAgentModel;
  color: HarnessAgentColor;
  /** undefined = key absent (state A), [] = state B, ['Read', ...] = state C. */
  tools?: string[];
}

export type HarnessAgentToolsState = 'omitted' | 'empty' | 'populated';

export interface HarnessAgentSourceLocation {
  scope: HarnessAgentSourceScope;
  /** Absolute path of the .md file. */
  absoluteFile: string;
  /** scope === 'plugin' → "<pluginName>@<marketplace>". */
  pluginKey?: string;
  /** scope === 'project' → the active project's slug. */
  projectSlug?: string;
  /** Agent name = file stem (with .md stripped) — must equal frontmatter.name. */
  name: string;
}

export interface HarnessAgentCard extends HarnessAgentSourceLocation {
  /** Required frontmatter fields. */
  description: string;
  model: HarnessAgentModel;
  color: HarnessAgentColor;
  /** Resolved 3-state tools indicator — drives the AC1.c list badge. */
  toolsState: HarnessAgentToolsState;
  /** Tool names when toolsState === 'populated'; empty otherwise. */
  tools: string[];
  /** True when the body contains at least one `<example>` block — drives AC4.c warning badge. */
  hasExampleBlock: boolean;
  /** ISO mtime of `absoluteFile` — STALE_WRITE ETag. */
  mtime: string;
}

export interface HarnessAgentMalformedEntry {
  scope: HarnessAgentSourceScope;
  absoluteFile: string;
  pluginKey?: string;
  projectSlug?: string;
  /**
   * Reason category — UI maps to an i18n key:
   *   'invalid-frontmatter'   — YAML parse failure or missing required field
   *   'name-mismatch'         — frontmatter.name !== file stem
   *   'invalid-name-pattern'  — frontmatter.name fails the lowercase-hyphen regex
   *   'invalid-model'         — model not in enum
   *   'invalid-color'         — color not in enum
   *   'nested-directory'      — file located under a subdirectory (flat-only policy, AC1.a)
   */
  reason:
    | 'invalid-frontmatter'
    | 'name-mismatch'
    | 'invalid-name-pattern'
    | 'invalid-model'
    | 'invalid-color'
    | 'nested-directory';
  /** Free-form detail (e.g. the offending value) — appended to the i18n message in tooltips. */
  detail?: string;
}

export interface HarnessAgentListResponse {
  cards: HarnessAgentCard[];
  malformed: HarnessAgentMalformedEntry[];
}

export interface HarnessAgentReadResponse {
  source: HarnessAgentSourceLocation;
  frontmatter: HarnessAgentFrontmatter;
  /** Body markdown after the closing `---` (frontmatter stripped) — the system prompt. */
  body: string;
  /** Raw text of the entire file (frontmatter + body) — used by Raw editor toggle. */
  raw: string;
  mtime: string;
  /** Discriminated tools state for the form radio. */
  toolsState: HarnessAgentToolsState;
  /** True when body contains at least one <example>...</example> block. */
  hasExampleBlock: boolean;
}

/**
 * Update request — exactly one of `frontmatter`/`body`/`raw` is required.
 * `frontmatter` and `body` patch separately (frontmatter via yaml round-trip
 * with explicit tools-state preservation, body as plain text replacement).
 * `raw` replaces the whole file.
 */
export interface HarnessAgentUpdateRequest {
  frontmatter?: HarnessAgentFrontmatter;
  /**
   * When `frontmatter` is present and `tools` is undefined in the object,
   * the server uses this discriminator to decide between state A (omit on disk)
   * and state B (write `tools: []`). When `tools` is a non-empty array this
   * field is ignored and state C is implied.
   */
  toolsState?: HarnessAgentToolsState;
  body?: string;
  raw?: string;
  /** STALE_WRITE guard. */
  expectedMtime?: string;
}

export interface HarnessAgentUpdateResponse {
  success: true;
  mtime: string;
  toolsState: HarnessAgentToolsState;
  hasExampleBlock: boolean;
}

export interface HarnessAgentCreateRequest {
  scope: 'project' | 'user';
  projectSlug?: string;
  /** File stem — must match frontmatter.name and pass the agent name regex. */
  name: string;
  frontmatter: HarnessAgentFrontmatter;
  body?: string;
  /** State A vs B discriminator — same semantics as update. */
  toolsState?: HarnessAgentToolsState;
}

export interface HarnessAgentCreateResponse {
  success: true;
  source: HarnessAgentSourceLocation;
  mtime: string;
}

export interface HarnessAgentCopyRequest {
  sourceScope: HarnessAgentSourceScope;
  sourceProjectSlug?: string;
  sourcePluginKey?: string;
  /** Source agent name = file stem. */
  sourceName: string;
  /** plugin destinations forbidden — only project/user allowed. */
  targetScope: 'project' | 'user';
  targetProjectSlug?: string;
  /** When undefined, server uses sourceName. Must pass agent name regex. */
  targetName?: string;
  onConflict: 'overwrite' | 'skip' | 'rename';
  /** Required when sensitive content is detected by the secret heuristic. */
  acknowledgedSecret?: boolean;
}

export interface HarnessAgentCopyResponse {
  success: true;
  target: HarnessAgentSourceLocation;
  skipped: boolean;
  /** Returned when ${CLAUDE_PLUGIN_ROOT} appeared in source. */
  warnings?: Array<'plugin-root-reference'>;
}

export interface HarnessAgentDeleteRequest {
  scope: 'project' | 'user';
  projectSlug?: string;
  name: string;
  expectedMtime?: string;
}

export interface HarnessAgentDeleteResponse {
  success: true;
}

// ---------------------------------------------------------------------------
// Story 29.2 — Snippet management (`%name%` reusable prompts)
//
// The snippet system is Hammoc-native (NOT a Claude Code harness primitive)
// but reuses the same I/O patterns (mtime/STALE_WRITE/HARNESS_FILE_EXISTS),
// so its DTOs sit alongside the harness DTOs for type-system locality.
// ---------------------------------------------------------------------------

/**
 * Snippet scope:
 *   - project   → `<projectRoot>/.hammoc/snippets/<name>.md`
 *   - user      → `~/.hammoc/snippets/<name>.md`
 *   - bundled   → server-bundled snippet directory (read-only)
 */
export type SnippetScope = 'project' | 'user' | 'bundled';

export interface SnippetCard {
  scope: SnippetScope;
  name: string;
  /** First non-empty line of the body, capped to 80 chars. */
  preview?: string;
  /** ISO 8601 mtime — empty string for bundled snippets that lack a stat (rare). */
  mtime: string;
  /** Bytes on disk. */
  size: number;
}

export interface SnippetListResponse {
  snippets: SnippetCard[];
}

export interface SnippetReadResponse {
  scope: SnippetScope;
  name: string;
  content: string;
  mtime: string;
  size: number;
  /** Resolved absolute path on disk. */
  absolutePath: string;
}

export interface SnippetWriteRequest {
  content: string;
  /** Omit to force overwrite (new file creation or explicit bypass). */
  expectedMtime?: string;
}

export interface SnippetWriteResponse {
  success: true;
  size: number;
  mtime: string;
}

export interface SnippetDeleteRequest {
  expectedMtime?: string;
}

export interface SnippetDeleteResponse {
  success: true;
}

/**
 * 4-direction copy matrix:
 *   project ↔ user      → bi-directional
 *   bundled → project   → one-way clone (bundled is read-only)
 *   bundled → user      → one-way clone
 *
 * `targetName` defaults to `sourceName`. When the target file already exists
 * the request fails with HARNESS_FILE_EXISTS unless `onConflict` is set:
 *   - 'abort'      → 409 (default — client renders SnippetCopyConflictDialog)
 *   - 'overwrite'  → replace target body
 *   - 'rename'     → caller MUST supply a fresh `targetName` distinct from any existing target file
 */
export interface SnippetCopyRequest {
  sourceScope: SnippetScope;
  sourceName: string;
  /** Required when sourceScope === 'project'. */
  sourceProjectSlug?: string;
  targetScope: 'project' | 'user';
  targetName?: string;
  /** Required when targetScope === 'project'. */
  targetProjectSlug?: string;
  onConflict?: 'abort' | 'overwrite' | 'rename';
}

export interface SnippetCopyResponse {
  success: true;
  target: {
    scope: 'project' | 'user';
    name: string;
    absolutePath: string;
  };
}

// ---------------------------------------------------------------------------
// Story 30.1 — Harness share-scope (shared / local / fully-ignored) types
// ---------------------------------------------------------------------------

/**
 * Share-scope of a single harness file as inferred from `.gitignore`.
 *
 * - `shared`        — file is tracked by git (committed to the team repo)
 * - `local`         — file path is matched by `.gitignore` (personal-only)
 * - `fullyIgnored`  — the project's `.claude/` directory itself is ignored
 *                     (Mode B project — nothing in `.claude/` reaches git)
 */
export type ShareScope = 'shared' | 'local' | 'fullyIgnored';

/**
 * Project-mode classification derived from running `.gitignore` against the
 * virtual `.claude/settings.json` path. Mode A = team-shared harness; Mode B =
 * private (the entire `.claude/` is ignored).
 */
export type ShareMode = 'A' | 'B' | 'unknown';

export interface HarnessShareScopeRequest {
  /** Currently always `'project'` — `.gitignore` does not apply to user scope. */
  scope: 'project';
  projectSlug: string;
  /** Project-relative POSIX paths inside `.claude/` (or sibling files like `.mcp.json`). */
  paths: string[];
}

export interface HarnessShareScopeResponse {
  /** Mode classification (derived from `.claude/settings.json` virtual path). */
  mode: ShareMode;
  /** Per-path verdict — keys mirror the `paths` request, values are `ShareScope`. */
  cards: Record<string, ShareScope>;
}
