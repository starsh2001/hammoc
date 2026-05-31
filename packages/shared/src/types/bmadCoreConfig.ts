// Story 31.1: BMad core-config.yaml editor shared types (Epic 31)
//
// Single source of truth for the typed shape of the 18 known keys plus the
// read-response envelope used by the BMad config form editor. The 18-key
// widget matrix itself lives client-side (BMAD_KNOWN_KEYS_MATRIX in
// bmadCoreConfigStore.ts); these types describe the *values* that travel over
// the wire after the server partitions a parsed config into known vs unknown
// top-level keys (see bmadCoreConfigService.parseUnknownKeys).

/**
 * Typed shape of the 18 known keys of `.bmad-core/core-config.yaml`.
 *
 * Every key is optional: a config that omits a key is valid, and the form
 * renders an empty widget for it. The nested groups (`qa`, `prd`,
 * `architecture`, `brownfieldEpic`) mirror the on-disk YAML nesting so the
 * value of a leaf such as `prd.epicFilePattern` is reachable at the same path
 * the AST patch op uses (`['prd', 'epicFilePattern']`).
 *
 * `customTechnicalDocuments` is `string[] | null` because the canonical
 * default on disk is the literal `null` (an explicit "no extra docs" marker)
 * that the form promotes to an array on first item add.
 */
export interface BmadCoreConfigKnownKeys {
  markdownExploder?: boolean;
  qa?: {
    qaLocation?: string;
  };
  prd?: {
    prdFile?: string;
    prdVersion?: string;
    prdSharded?: boolean;
    prdShardedLocation?: string;
    epicFilePattern?: string;
  };
  architecture?: {
    architectureFile?: string;
    architectureVersion?: string;
    architectureSharded?: boolean;
    architectureShardedLocation?: string;
  };
  customTechnicalDocuments?: string[] | null;
  devLoadAlwaysFiles?: string[];
  brownfieldEpic?: {
    updateOnCreate?: string[];
    doNotUpdate?: string[];
  };
  devDebugLog?: string;
  devStoryLocation?: string;
  slashPrefix?: string;
}

/**
 * The 10 known TOP-LEVEL keys of `.bmad-core/core-config.yaml`. Any other
 * top-level key in the parsed YAML is treated as "unknown" and round-trips
 * untouched (AC4). Nested groups (`qa`/`prd`/`architecture`/`brownfieldEpic`)
 * count as one top-level key each; their leaves are the 18-key matrix.
 *
 * Single source of truth shared by the server partition logic and any client
 * consumer that needs to reason about top-level membership.
 */
export const BMAD_CORE_CONFIG_KNOWN_TOP_LEVEL_KEYS = [
  'markdownExploder',
  'qa',
  'prd',
  'architecture',
  'customTechnicalDocuments',
  'devLoadAlwaysFiles',
  'brownfieldEpic',
  'devDebugLog',
  'devStoryLocation',
  'slashPrefix',
] as const;

/** GET /api/harness/bmad-config/:projectSlug response. */
export interface BmadCoreConfigReadResponse {
  /** Full raw text of `.bmad-core/core-config.yaml` — feeds the Raw editor toggle. */
  content: string;
  /** ISO 8601 mtime — STALE_WRITE ETag echoed back on the next patch/raw write. */
  mtime: string;
  /** Known top-level keys, typed. Drives the 18-key form widgets. */
  knownKeys: BmadCoreConfigKnownKeys;
  /**
   * Unknown top-level keys (BMad schema extensions or user-defined keys) shown
   * read-only in the "unknown keys" section with a JS-type hint each (AC4.a).
   */
  unknownKeys: Record<string, unknown>;
}

/** PATCH / PUT(raw) write response. */
export interface BmadCoreConfigWriteResponse {
  /** ISO 8601 mtime after the write — the client persists this as the next ETag. */
  mtime: string;
}
