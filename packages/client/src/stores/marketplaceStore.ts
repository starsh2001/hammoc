/**
 * Story 31.4: Marketplace catalog store.
 *
 * Holds the unified plugin catalog rendered by the "Marketplace" project
 * settings panel, plus the browse filter state (category / type / name search /
 * installed). The catalog is read-only server data, so there is no optimistic
 * concurrency (no STALE_WRITE) — unlike `harnessPluginStore`.
 *
 * External-change refresh mirrors `harnessPluginStore`: the same four tracked
 * user-scope paths (installed_plugins.json / known_marketplaces.json /
 * settings.json / per-market marketplace.json) trigger a refetch, so installing
 * from an external CLI updates the "installed" badge here automatically — no new
 * socket channel or watcher. (AC2.b)
 */

import { create } from 'zustand';
import type {
  HarnessExternalChangeEvent,
  HarnessMarketplaceCatalogEntry,
  HarnessMarketplaceCatalogError,
  HarnessMarketplaceFormatWarning,
  HarnessPluginType,
} from '@hammoc/shared';
import { ApiError } from '../services/api/client';
import { fetchMarketplaceCatalog } from '../services/api/marketplaceApi';

export type InstalledFilter = 'all' | 'installed' | 'not-installed';

export interface MarketplaceFilters {
  /** null = all categories */
  category: string | null;
  /** null = all types */
  pluginType: HarnessPluginType | null;
  /** case-insensitive substring over name + description */
  search: string;
  installed: InstalledFilter;
}

const DEFAULT_FILTERS: MarketplaceFilters = {
  category: null,
  pluginType: null,
  search: '',
  installed: 'all',
};

interface MarketplaceStoreState {
  entries: HarnessMarketplaceCatalogEntry[];
  marketplaces: string[];
  errors: HarnessMarketplaceCatalogError[];
  formatWarning?: HarnessMarketplaceFormatWarning;
  filters: MarketplaceFilters;
  lastProjectSlug?: string;
  isLoading: boolean;
  error?: { code: string; message: string };

  load(projectSlug: string): Promise<void>;
  setFilter(partial: Partial<MarketplaceFilters>): void;
  resetFilters(): void;
  handleExternalChange(payload: HarnessExternalChangeEvent): void;
  reset(): void;
}

/**
 * The four user-scope paths whose change should refresh the catalog. Mirrors
 * `harnessPluginStore.pathMatchesTrackedFile` (same paths → both the installed
 * card list and this catalog refetch on a single external change).
 */
function pathMatchesTrackedFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  if (normalized === 'plugins/installed_plugins.json') return true;
  if (normalized === 'plugins/known_marketplaces.json') return true;
  if (normalized === 'settings.json') return true;
  if (/^plugins\/marketplaces\/[^/]+\/\.claude-plugin\/marketplace\.json$/.test(normalized)) return true;
  return false;
}

export const useMarketplaceStore = create<MarketplaceStoreState>((set, get) => ({
  entries: [],
  marketplaces: [],
  errors: [],
  filters: { ...DEFAULT_FILTERS },
  isLoading: false,

  async load(projectSlug: string) {
    // Stale-while-revalidate: keep cached entries when re-entering for the same
    // project; only show the skeleton on first load / project change / error.
    const state = get();
    const isWarmCache = state.lastProjectSlug === projectSlug && !state.error;
    if (isWarmCache) {
      set({ error: undefined, lastProjectSlug: projectSlug });
    } else {
      set({
        entries: [],
        marketplaces: [],
        errors: [],
        formatWarning: undefined,
        isLoading: true,
        error: undefined,
        lastProjectSlug: projectSlug,
      });
    }
    try {
      const res = await fetchMarketplaceCatalog(projectSlug);
      set({
        entries: res.entries,
        marketplaces: res.marketplaces,
        errors: res.errors,
        formatWarning: res.formatWarning,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: { code: toErrorCode(err), message: toErrorMessage(err) },
      });
    }
  },

  setFilter(partial: Partial<MarketplaceFilters>) {
    set((s) => ({ filters: { ...s.filters, ...partial } }));
  },

  resetFilters() {
    set({ filters: { ...DEFAULT_FILTERS } });
  },

  handleExternalChange(payload: HarnessExternalChangeEvent) {
    if (payload.scope !== 'user') return;
    if (!pathMatchesTrackedFile(payload.path)) return;
    const slug = get().lastProjectSlug;
    if (!slug) return;
    void get().load(slug);
  },

  reset() {
    set({
      entries: [],
      marketplaces: [],
      errors: [],
      formatWarning: undefined,
      filters: { ...DEFAULT_FILTERS },
      lastProjectSlug: undefined,
      isLoading: false,
      error: undefined,
    });
  },
}));

// --- selectors --------------------------------------------------------------

/** Distinct, sorted category list present in the current catalog. */
export function selectAvailableCategories(state: MarketplaceStoreState): string[] {
  const set = new Set<string>();
  for (const e of state.entries) {
    if (e.category) set.add(e.category);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Apply the active filters to the catalog entries. */
export function selectFilteredEntries(state: MarketplaceStoreState): HarnessMarketplaceCatalogEntry[] {
  const { category, pluginType, search, installed } = state.filters;
  const needle = search.trim().toLowerCase();
  return state.entries.filter((e) => {
    if (category && e.category !== category) return false;
    if (pluginType && e.pluginType !== pluginType) return false;
    if (installed === 'installed' && !e.installed) return false;
    if (installed === 'not-installed' && e.installed) return false;
    if (needle) {
      const hay = `${e.name} ${e.description ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

function toErrorCode(err: unknown): string {
  if (err instanceof ApiError) return err.code;
  return 'UNKNOWN_ERROR';
}

function toErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
