/**
 * Story 31.4 (C.2): Catalog filter controls — category / type / name search /
 * installed. Reads + writes the marketplace store filter state directly.
 */

import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { HarnessPluginType } from '@hammoc/shared';
import {
  useMarketplaceStore,
  selectAvailableCategories,
  type InstalledFilter,
} from '../../../../stores/marketplaceStore';

const SELECT_CLASS =
  'rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 '
  + 'text-sm px-2 py-1 text-gray-800 dark:text-gray-100';

export function MarketplaceFilters() {
  const { t } = useTranslation('settings');
  const filters = useMarketplaceStore((s) => s.filters);
  const setFilter = useMarketplaceStore((s) => s.setFilter);
  // useShallow: the selector builds a fresh array each call — shallow-compare
  // its contents so an unrelated store update doesn't loop the render.
  const categories = useMarketplaceStore(useShallow(selectAvailableCategories));

  return (
    <div data-testid="marketplace-filters" className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        data-testid="marketplace-filter-search"
        value={filters.search}
        onChange={(e) => setFilter({ search: e.target.value })}
        placeholder={t('harness.marketplace.filters.searchPlaceholder')}
        aria-label={t('harness.marketplace.filters.searchPlaceholder')}
        className={SELECT_CLASS + ' flex-1 min-w-[10rem]'}
      />

      <select
        data-testid="marketplace-filter-category"
        value={filters.category ?? ''}
        onChange={(e) => setFilter({ category: e.target.value || null })}
        aria-label={t('harness.marketplace.filters.category')}
        className={SELECT_CLASS}
      >
        <option value="">{t('harness.marketplace.filters.allCategories')}</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        data-testid="marketplace-filter-type"
        value={filters.pluginType ?? ''}
        onChange={(e) => setFilter({ pluginType: (e.target.value || null) as HarnessPluginType | null })}
        aria-label={t('harness.marketplace.filters.type')}
        className={SELECT_CLASS}
      >
        <option value="">{t('harness.marketplace.filters.allTypes')}</option>
        <option value="standard">{t('harness.marketplace.type.standard')}</option>
        <option value="external-mcp">{t('harness.marketplace.type.externalMcp')}</option>
      </select>

      <select
        data-testid="marketplace-filter-installed"
        value={filters.installed}
        onChange={(e) => setFilter({ installed: e.target.value as InstalledFilter })}
        aria-label={t('harness.marketplace.filters.installedLabel')}
        className={SELECT_CLASS}
      >
        <option value="all">{t('harness.marketplace.filters.installed.all')}</option>
        <option value="installed">{t('harness.marketplace.filters.installed.installed')}</option>
        <option value="not-installed">{t('harness.marketplace.filters.installed.notInstalled')}</option>
      </select>
    </div>
  );
}
