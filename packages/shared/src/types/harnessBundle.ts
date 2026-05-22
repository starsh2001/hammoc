// Story 30.3 — Harness Export/Import bundle DTOs.
//
// Single source of truth for the ZIP-bundled harness archive used by the
// "Export bundle" / "Import bundle" workbench dialogs. The runtime Zod
// validation lives in `packages/server/src/schemas/harnessBundle.schema.ts`
// to keep the shared package zero-runtime-dep — clients consume the parsed
// JSON envelope and only need the TypeScript surface.

import type { HarnessHookEvent } from './harness.js';

export const HARNESS_BUNDLE_VERSION = 1 as const;
export type HarnessBundleVersion = typeof HARNESS_BUNDLE_VERSION;

/**
 * Domain-level sections that can be opted into / out of the bundle. Mirrors
 * the export dialog's section checkboxes 1:1. `bmad` is conditionally enabled
 * only when the source project is a BMad project (the export endpoint detects
 * the `.bmad-core/core-config.yaml` presence and gates the checkbox).
 */
export type BundleSection =
  | 'claude-md'
  | 'skills'
  | 'commands'
  | 'agents'
  | 'hooks'
  | 'mcp'
  | 'bmad';

export const BUNDLE_SECTIONS: readonly BundleSection[] = [
  'claude-md',
  'skills',
  'commands',
  'agents',
  'hooks',
  'mcp',
  'bmad',
] as const;

/**
 * Three-stage secrets policy applied at export time. The export dialog forces
 * `excluded` as the radio default every time the dialog opens — never persists
 * a riskier choice across sessions ("AC2.a — never let a remembered risky
 * option cause an accident").
 */
export type SecretsPolicy = 'excluded' | 'placeholder' | 'included-explicit';

/**
 * Per-card domain enum. Matches the 5 R/W harness domains + the two
 * project-level files (`claude-md`, `bmad`). Used in `BundleItem.domain` to
 * disambiguate the identity scheme.
 */
export type BundleItemDomain =
  | 'claude-md'
  | 'skill'
  | 'mcp'
  | 'hook'
  | 'command'
  | 'agent'
  | 'bmad';

/**
 * Share-scope of a card at export time, copied through the manifest so the
 * import preview can show the source verdict alongside the new project's
 * verdict (helps the user understand whether re-import will re-introduce a
 * file that was originally local).
 */
export type BundleSourceShareScope = 'shared' | 'local' | 'fullyIgnored';

/** Plugin dependency reference — see AC4. */
export interface BundlePluginRef {
  /** Plugin name (matches the marketplace catalog `plugins[].name`). */
  name: string;
  /** Marketplace identifier — "<name>@<marketplace>" together form the catalog key. */
  marketplace: string;
  /** Optional version string (short SHA or semver) recorded at export time. */
  version?: string;
}

/**
 * One card / file inside the bundle. The `identity` carries the domain-
 * specific identifier (skill: `name`, mcp: `name`, hook:
 * `event:groupIndex:hookIndex`, command: `slashName`, agent: `name`,
 * `claude-md`: 'CLAUDE.md', bmad: '.bmad-core/core-config.yaml').
 */
export interface BundleItem {
  domain: BundleItemDomain;
  identity: string;
  /** Path inside the ZIP archive (POSIX). */
  relativePath: string;
  /** Source-side share-scope badge at export time. */
  sourceShareScope: BundleSourceShareScope;
}

/**
 * Top-level manifest serialized as `manifest.json` at the ZIP root. The
 * version is intentionally narrow (`1` literal) so the import path can do a
 * strict equality check and bail on unknown values per AC5.
 */
export interface BundleManifest {
  bundleVersion: HarnessBundleVersion;
  /** Hammoc version at export time (from server `package.json`). */
  hammocVersion: string;
  /** Claude Code spec version when known (28.0.5 SDK tracking). `null` otherwise. */
  claudeCodeSpecVersion: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** Slug of the source project at export time (audit trail). */
  sourceProjectSlug: string;
  /** Sections actually included in this bundle. */
  includes: BundleSection[];
  /** Policy applied to secrets in the bundle. */
  secretsPolicy: SecretsPolicy;
  /** Active plugins at export time — informational, not bundled as payload. */
  pluginDependencies: BundlePluginRef[];
  /** Per-card metadata used by the import preview. */
  items: BundleItem[];
}

/**
 * Status of one item in the import dry-run preview. The four states partition
 * the preview rows into 4 visual groups (new / overwrite / same / conflict).
 */
export type ImportItemStatus = 'new' | 'overwrite' | 'same' | 'conflict';

/**
 * Action the user picks per item (or in bulk). `appendSection` is only valid
 * for the `claude-md` domain — every other item falls back to `skip` if the
 * UI ever issues `appendSection` against them (guarded server-side).
 */
export type ImportItemAction = 'overwrite' | 'skip' | 'rename' | 'appendSection';

/**
 * Server-side preview row for one bundle item. The `targetPath` is the path
 * the item would land at after import; for `rename` actions the server picks
 * a deterministic suffix (`<basename>.bundle-<ts><ext>`) and echoes it here
 * so the UI can show what the apply step will actually create.
 */
export interface ImportPreviewItem {
  domain: BundleItemDomain;
  identity: string;
  /** Status computed by comparing the bundle item against the current project. */
  status: ImportItemStatus;
  /** Default action the UI should display for this status. */
  defaultAction: ImportItemAction;
  /** Project-relative POSIX path the item would write to. */
  targetPath: string;
  /** Optional human-readable detail surfaced in tooltips. */
  detail?: string;
}

/**
 * One unrecognised plugin from the source manifest — the project does not
 * currently have it installed. Surfaced as a red banner in the preview.
 */
export interface ImportMissingPlugin extends BundlePluginRef {}

export interface ImportPreview {
  /** One row per bundle item, in manifest order. */
  items: ImportPreviewItem[];
  /** Plugin references the manifest declared but the current project lacks. */
  missingPlugins: ImportMissingPlugin[];
  /** Sections in the manifest the current Hammoc version does not recognise. */
  unknownSections: string[];
}

/**
 * The single batched apply request body. `itemActions` maps `BundleItem.identity`
 * (prefixed with `<domain>:` to avoid cross-domain identity collision —
 * e.g. `skill:my-skill` vs `agent:my-skill`) to the chosen action.
 */
export interface ImportApplyRequest {
  bundleToken: string;
  itemActions: Record<string, ImportItemAction>;
}

/** Per-item outcome surfaced after the apply transaction succeeds. */
export interface ImportApplyItemResult {
  domain: BundleItemDomain;
  identity: string;
  action: ImportItemAction;
  status: 'applied' | 'skipped' | 'renamed';
  /** Final path written when `status === 'applied' | 'renamed'`. */
  finalPath?: string;
}

export interface ImportApplySummary {
  applied: number;
  skipped: number;
  renamed: number;
  results: ImportApplyItemResult[];
  /** Removed-secret count when the bundle's `secretsPolicy === 'excluded'`. */
  secretsRemovedCount?: number;
  /** Replaced-with-ENV-ref count when `secretsPolicy === 'placeholder'`. */
  secretsReplacedCount?: number;
  /** True when the bundle carried plaintext secrets (`included-explicit`). */
  hadPlaintextSecrets?: boolean;
}

/** Export request body. */
export interface ExportBundleRequest {
  projectSlug: string;
  includes: BundleSection[];
  secretsPolicy: SecretsPolicy;
}

/**
 * Server response of `POST /api/harness/bundle/import/preview`. The
 * `bundleToken` is the handle the apply call must echo (the server stashes
 * the parsed ZIP in a temp directory keyed by this token until apply or TTL).
 */
export interface ImportPreviewResponse {
  bundleToken: string;
  manifest: BundleManifest;
  preview: ImportPreview;
}

export interface PluginDependenciesResponse {
  pluginDependencies: BundlePluginRef[];
}
