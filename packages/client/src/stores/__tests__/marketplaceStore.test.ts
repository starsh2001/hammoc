/**
 * Story 31.4: marketplaceStore tests.
 *
 * Covers:
 *  - load success populates entries/marketplaces/errors/formatWarning
 *  - load failure surfaces an error
 *  - filter selectors (category / type / search / installed) + categories
 *  - handleExternalChange refetches on tracked user paths, ignores others
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  HarnessExternalChangeEvent,
  HarnessMarketplaceCatalogEntry,
  HarnessMarketplaceCatalogResponse,
} from '@hammoc/shared';

vi.mock('../../services/api/marketplaceApi', () => ({
  fetchMarketplaceCatalog: vi.fn(),
}));

import { fetchMarketplaceCatalog } from '../../services/api/marketplaceApi';
import {
  useMarketplaceStore,
  selectFilteredEntries,
  selectAvailableCategories,
} from '../marketplaceStore';
import { ApiError } from '../../services/api/client';

const mockedFetch = vi.mocked(fetchMarketplaceCatalog);

function entry(overrides: Partial<HarnessMarketplaceCatalogEntry> = {}): HarnessMarketplaceCatalogEntry {
  return {
    key: 'context7@claude-plugins-official',
    name: 'context7',
    marketplace: 'claude-plugins-official',
    pluginType: 'external-mcp',
    installed: false,
    ...overrides,
  };
}

function response(overrides: Partial<HarnessMarketplaceCatalogResponse> = {}): HarnessMarketplaceCatalogResponse {
  return {
    marketplaces: ['claude-plugins-official'],
    entries: [entry()],
    errors: [],
    ...overrides,
  };
}

describe('marketplaceStore', () => {
  beforeEach(() => {
    useMarketplaceStore.getState().reset();
    mockedFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('load() populates entries, marketplaces, errors, formatWarning', async () => {
    mockedFetch.mockResolvedValue(
      response({
        errors: [{ marketplace: 'bad', code: 'HARNESS_PARSE_ERROR' }],
        formatWarning: { detectedVersion: 99, reason: 'unrecognizedVersion' },
      }),
    );

    await useMarketplaceStore.getState().load('proj');
    const s = useMarketplaceStore.getState();
    expect(s.entries).toHaveLength(1);
    expect(s.marketplaces).toEqual(['claude-plugins-official']);
    expect(s.errors).toEqual([{ marketplace: 'bad', code: 'HARNESS_PARSE_ERROR' }]);
    expect(s.formatWarning).toEqual({ detectedVersion: 99, reason: 'unrecognizedVersion' });
    expect(s.isLoading).toBe(false);
    expect(s.lastProjectSlug).toBe('proj');
  });

  it('load() surfaces an ApiError', async () => {
    mockedFetch.mockRejectedValue(new ApiError(404, 'HARNESS_ROOT_MISSING', 'no root'));
    await useMarketplaceStore.getState().load('proj');
    const s = useMarketplaceStore.getState();
    expect(s.error).toEqual({ code: 'HARNESS_ROOT_MISSING', message: 'no root' });
    expect(s.isLoading).toBe(false);
  });

  it('selectFilteredEntries filters by category, type, search, and installed', async () => {
    mockedFetch.mockResolvedValue(
      response({
        entries: [
          entry({ key: 'a@m', name: 'alpha', category: 'development', pluginType: 'standard', installed: true }),
          entry({ key: 'b@m', name: 'beta', category: 'productivity', pluginType: 'external-mcp', installed: false }),
          entry({ key: 'c@m', name: 'gamma', category: 'development', pluginType: 'external-mcp', installed: false, description: 'alpha helper' }),
        ],
      }),
    );
    await useMarketplaceStore.getState().load('proj');
    const store = useMarketplaceStore;

    // category filter
    store.getState().setFilter({ category: 'development' });
    expect(selectFilteredEntries(store.getState()).map((e) => e.name)).toEqual(['alpha', 'gamma']);

    // + type filter
    store.getState().setFilter({ pluginType: 'external-mcp' });
    expect(selectFilteredEntries(store.getState()).map((e) => e.name)).toEqual(['gamma']);

    // reset + installed filter
    store.getState().resetFilters();
    store.getState().setFilter({ installed: 'installed' });
    expect(selectFilteredEntries(store.getState()).map((e) => e.name)).toEqual(['alpha']);

    // reset + search matches name or description (case-insensitive)
    store.getState().resetFilters();
    store.getState().setFilter({ search: 'ALPHA' });
    expect(selectFilteredEntries(store.getState()).map((e) => e.name).sort()).toEqual(['alpha', 'gamma']);
  });

  it('selectAvailableCategories returns distinct sorted categories', async () => {
    mockedFetch.mockResolvedValue(
      response({
        entries: [
          entry({ key: 'a@m', category: 'productivity' }),
          entry({ key: 'b@m', category: 'development' }),
          entry({ key: 'c@m', category: 'development' }),
          entry({ key: 'd@m', category: undefined }),
        ],
      }),
    );
    await useMarketplaceStore.getState().load('proj');
    expect(selectAvailableCategories(useMarketplaceStore.getState())).toEqual(['development', 'productivity']);
  });

  it('handleExternalChange refetches on a tracked user-scope path', async () => {
    mockedFetch.mockResolvedValue(response());
    await useMarketplaceStore.getState().load('proj');
    mockedFetch.mockClear();

    const payload: HarnessExternalChangeEvent = {
      scope: 'user',
      path: 'plugins/installed_plugins.json',
    } as HarnessExternalChangeEvent;
    useMarketplaceStore.getState().handleExternalChange(payload);
    expect(mockedFetch).toHaveBeenCalledWith('proj');
  });

  it('handleExternalChange refetches on a per-market marketplace.json change', async () => {
    mockedFetch.mockResolvedValue(response());
    await useMarketplaceStore.getState().load('proj');
    mockedFetch.mockClear();

    useMarketplaceStore.getState().handleExternalChange({
      scope: 'user',
      path: 'plugins/marketplaces/claude-plugins-official/.claude-plugin/marketplace.json',
    } as HarnessExternalChangeEvent);
    expect(mockedFetch).toHaveBeenCalledWith('proj');
  });

  it('handleExternalChange ignores project-scope and untracked paths', async () => {
    mockedFetch.mockResolvedValue(response());
    await useMarketplaceStore.getState().load('proj');
    mockedFetch.mockClear();

    useMarketplaceStore.getState().handleExternalChange({
      scope: 'project',
      path: 'plugins/installed_plugins.json',
    } as HarnessExternalChangeEvent);
    useMarketplaceStore.getState().handleExternalChange({
      scope: 'user',
      path: 'plugins/some-other-file.json',
    } as HarnessExternalChangeEvent);
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
