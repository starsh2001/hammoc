// Story 31.2: SessionStart context-builder shared types (Epic 31)
//
// Single source of truth for the declarative "context builder" manifest that
// drives the generated `.hammoc/hooks/context-builder.mjs` SessionStart hook
// script and the `.claude/settings.json` `hooks.SessionStart` entry.
//
// The manifest at `<projectRoot>/.hammoc/context-builder.json` is the SSoT;
// the script + settings entry are GENERATED artifacts derived from it. Server
// (`contextBuilderService`) and client (`contextBuilderStore`) both import
// these types, so they live in `packages/shared` (one-way dependency
// `shared → server/client`).

/**
 * The 5 built-in dynamic variable identifiers, mirroring Epic 31 § Story 31.2
 * Scope examples (*"현재 브랜치 / 활성 BMad 스토리 / 최근 커밋 N개 / 오늘 날짜 /
 * 미커밋 파일 개수"*). Each is recomputed at script runtime on every session
 * start (AC2.b) — never snapshotted at generation time.
 */
export type ContextBuilderVariableId =
  | 'gitBranch'
  | 'activeBmadStory'
  | 'recentCommits'
  | 'today'
  | 'uncommittedCount';

/**
 * Ordered list of the built-in variable IDs — single source of truth shared by
 * the server (zod validation + script generation) and the client
 * (`CONTEXT_BUILDER_VARIABLES` widget definitions). Order is the canonical
 * display order in the toggle list.
 */
export const CONTEXT_BUILDER_VARIABLE_IDS: readonly ContextBuilderVariableId[] = [
  'gitBranch',
  'activeBmadStory',
  'recentCommits',
  'today',
  'uncommittedCount',
] as const;

/** One user-defined shell command block (AC5). */
export interface ContextBuilderCustomCommand {
  /** The shell command whose stdout is appended as a context block. */
  command: string;
  /**
   * AC5.b — only `acknowledged: true` commands are written into the generated
   * script. The acknowledgement is the explicit "I understand this runs every
   * session" confirmation captured by the security checkbox.
   */
  acknowledged: boolean;
}

/**
 * The declarative manifest — single source of truth for one project's context
 * builder. Persisted at `<projectRoot>/.hammoc/context-builder.json`.
 */
export interface ContextBuilderManifest {
  /** Schema version — bump only on a breaking shape change. */
  version: 1;
  /**
   * AC1.f — when false the generated script + settings entry are removed and
   * NOT regenerated (the declaration is retained so re-enabling restores it).
   */
  enabled: boolean;
  /** Reference files, as project-root-relative POSIX paths (e.g. `docs/architecture.md`). */
  files: string[];
  /** Built-in dynamic variables, on/off. A full record of all 5 IDs. */
  variables: Record<ContextBuilderVariableId, boolean>;
  /** N for the `recentCommits` variable (default 5). Ignored when that variable is off. */
  recentCommitsCount?: number;
  /** User-defined shell command blocks (AC5). */
  customCommands: ContextBuilderCustomCommand[];
}

/**
 * GET /api/harness/context-builder/:projectSlug response.
 *
 * When the manifest file does not yet exist the server returns a default
 * (disabled, empty) manifest with `mtime: ''` so the panel opens in an
 * empty-state instead of erroring (API table — *"매니페스트 없음 → 빈 기본
 * 매니페스트 반환도 허용"*).
 */
export interface ContextBuilderReadResponse {
  manifest: ContextBuilderManifest;
  /** ISO 8601 mtime of the manifest — STALE_WRITE ETag. Empty string when the file is absent. */
  mtime: string;
  /** True when the generated `.hammoc/hooks/context-builder.mjs` exists on disk. */
  scriptExists: boolean;
  /** True when a Hammoc-managed `hooks.SessionStart` entry currently points at the script. */
  entryRegistered: boolean;
}

/**
 * PUT /api/harness/context-builder/:projectSlug response (save + generate).
 * Extends the write ETag with the generated artifact locations.
 */
export interface ContextBuilderGenerateResponse {
  /** ISO 8601 mtime of the manifest after the write — next STALE_WRITE ETag. */
  mtime: string;
  /** Absolute path of the generated script (empty string when manifest.enabled === false). */
  scriptPath: string;
  /** ISO 8601 mtime of `.claude/settings.json` after the entry registration. */
  settingsMtime: string;
  /**
   * AC5.c — indices (into `manifest.customCommands`) whose command string the
   * secret heuristic flagged. NON-BLOCKING: the save still succeeds; the client
   * surfaces these as a notice ("고지"), never a hard block. Empty/omitted when
   * nothing matched.
   */
  secretWarningCommandIndices?: number[];
}

/** POST /api/harness/context-builder/:projectSlug/disable response. */
export interface ContextBuilderDisableResponse {
  success: true;
}

/**
 * Canonical command-path marker that identifies a Hammoc-managed SessionStart
 * entry. AC1.e / AC3.a identify ownership purely by the command string
 * containing this fragment — no extra metadata key is written into
 * settings.json (the path IS the ownership identifier). The generated entry's
 * command is `node "<abs>/.hammoc/hooks/context-builder.mjs"`, so a substring
 * match on this marker is the ownership test on both server and client.
 */
export const CONTEXT_BUILDER_SCRIPT_MARKER = '.hammoc/hooks/context-builder.';

/**
 * Build the default empty manifest (disabled, no files, all variables off, no
 * custom commands). Shared by the server empty-state GET and the client store's
 * initial state so the two never drift.
 */
export function createDefaultContextBuilderManifest(): ContextBuilderManifest {
  return {
    version: 1,
    enabled: false,
    files: [],
    variables: {
      gitBranch: false,
      activeBmadStory: false,
      recentCommits: false,
      today: false,
      uncommittedCount: false,
    },
    recentCommitsCount: 5,
    customCommands: [],
  };
}
