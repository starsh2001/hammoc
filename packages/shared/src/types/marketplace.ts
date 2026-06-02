/**
 * Story 31.4: Plugin marketplace catalog DTOs (Epic 31).
 *
 * Read-only view models for the marketplace browse experience. The server
 * `marketplaceService` parses `~/.claude/plugins/known_marketplaces.json` and
 * each market's `.claude-plugin/marketplace.json` into a unified catalog, joins
 * it with `installed_plugins.json` for the "installed" flag, and reports
 * per-market parse failures + an `installed_plugins.json` format warning
 * (without aborting the whole catalog).
 *
 * Reuses `HarnessPluginType` and `HarnessPluginComponentCounts` from
 * `harness.ts` — no duplicate definitions. The existing
 * `HarnessMarketplacePluginMeta` (harness.ts) is the raw marketplace.json
 * entry shape; the catalog entry below is that shape *enriched* with plugin
 * type, installed flag, and best-effort component counts.
 */

import type { HarnessPluginType, HarnessPluginComponentCounts } from './harness.js';

/**
 * One installable plugin surfaced from a market's `marketplace.json` `plugins[]`
 * array, enriched for the browse UI.
 */
export interface HarnessMarketplaceCatalogEntry {
  /** "<name>@<marketplace>" — same key space as installed_plugins.json. */
  key: string;
  name: string;
  /** known_marketplaces.json market name this entry belongs to. */
  marketplace: string;
  description?: string;
  version?: string;
  author?: { name?: string; email?: string } | string;
  category?: string;
  /**
   * 'standard' | 'external-mcp' — decided by the `source` path prefix
   * (`./plugins/...` → standard, `./external_plugins/...` → external-mcp).
   * Distinct from installed cards' count-based `decideType`, since unbuilt
   * catalog entries have no installPath. (AC1.c)
   */
  pluginType: HarnessPluginType;
  /** marketplace.json plugins[].source — the type-decision signal. */
  source?: string;
  /** True when `key` exists in installed_plugins.json. (AC1.d) */
  installed: boolean;
  /**
   * Best-effort component tally read from the cloned market repo source dir
   * (`plugins/marketplaces/<name>/<source>/`). Omitted when unreadable —
   * the type badge still renders. (AC1.c)
   */
  componentCounts?: HarnessPluginComponentCounts;
}

/**
 * Per-market parse failure. A single bad `marketplace.json` is isolated here
 * instead of aborting the whole catalog (AC5). `code` reuses a `HARNESS_ERRORS`
 * code (e.g. `HARNESS_PARSE_ERROR`).
 */
export interface HarnessMarketplaceCatalogError {
  marketplace: string;
  code: string;
}

/**
 * Warning emitted when `installed_plugins.json` does not match the known shape
 * (e.g. an unrecognized `version`, possibly from the
 * `tengu_enable_versioned_plugins` feature flag). The catalog still renders;
 * the "installed" join degrades gracefully. (AC6)
 */
export interface HarnessMarketplaceFormatWarning {
  detectedVersion?: number;
  reason: string;
}

/**
 * GET /api/harness/marketplace/:projectSlug/catalog response. Partial success
 * is expressed via `errors[]` (per-market) and `formatWarning`.
 */
export interface HarnessMarketplaceCatalogResponse {
  /** Market names discovered in known_marketplaces.json. */
  marketplaces: string[];
  entries: HarnessMarketplaceCatalogEntry[];
  errors: HarnessMarketplaceCatalogError[];
  formatWarning?: HarnessMarketplaceFormatWarning;
}
