/**
 * Story 31.4 (C.1): One marketplace catalog entry card.
 *
 * Visual sibling of Story 28.1 PluginPanel cards (same badge / counts layout).
 * The install / uninstall buttons open the copy-guide modal (handled by the
 * parent) — there is no in-card automation (spike #1/#2 negative → copy-only).
 */

import { useTranslation } from 'react-i18next';
import type { HarnessMarketplaceCatalogEntry, HarnessPluginComponentCounts } from '@hammoc/shared';

interface Props {
  entry: HarnessMarketplaceCatalogEntry;
  onInstall: (entry: HarnessMarketplaceCatalogEntry) => void;
  onUninstall: (entry: HarnessMarketplaceCatalogEntry) => void;
}

function authorName(author: HarnessMarketplaceCatalogEntry['author']): string | undefined {
  if (!author) return undefined;
  if (typeof author === 'string') return author;
  return author.name;
}

export function MarketplaceCard({ entry, onInstall, onUninstall }: Props) {
  const { t } = useTranslation('settings');
  const author = authorName(entry.author);

  return (
    <div
      data-testid="marketplace-card"
      className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{entry.name}</div>
          {entry.description && (
            <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{entry.description}</div>
          )}
        </div>
        {entry.installed ? (
          <button
            type="button"
            data-testid="marketplace-card-uninstall"
            onClick={() => onUninstall(entry)}
            className="shrink-0 inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('harness.marketplace.card.uninstall')}
          </button>
        ) : (
          <button
            type="button"
            data-testid="marketplace-card-install"
            onClick={() => onInstall(entry)}
            className="shrink-0 inline-flex items-center rounded-md bg-blue-600 hover:bg-blue-700 px-2.5 py-1 text-xs font-medium text-white"
          >
            {t('harness.marketplace.card.install')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span
          data-testid="marketplace-type-badge"
          className={
            'inline-flex rounded px-1.5 py-0.5 font-medium '
            + (entry.pluginType === 'standard'
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
              : 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200')
          }
        >
          {t(entry.pluginType === 'standard'
            ? 'harness.marketplace.type.standard'
            : 'harness.marketplace.type.externalMcp')}
        </span>
        {entry.installed && (
          <span
            data-testid="marketplace-card-installed-badge"
            className="inline-flex rounded px-1.5 py-0.5 font-medium bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200"
          >
            {t('harness.marketplace.card.installed')}
          </span>
        )}
        <span className="text-gray-500 dark:text-gray-400">{entry.marketplace}</span>
        {entry.version && (
          <span className="text-gray-500 dark:text-gray-400 font-mono">{entry.version}</span>
        )}
        {entry.category && <span className="text-gray-500 dark:text-gray-400">{entry.category}</span>}
        {author && <span className="text-gray-500 dark:text-gray-400">{author}</span>}
      </div>

      <ComponentCounts counts={entry.componentCounts} t={t} />
    </div>
  );
}

function ComponentCounts({
  counts,
  t,
}: {
  counts: HarnessPluginComponentCounts | undefined;
  t: (key: string) => string;
}) {
  if (!counts) return null;
  const entries: [string, number][] = [
    ['skills', counts.skills],
    ['commands', counts.commands],
    ['agents', counts.agents],
    ['hooks', counts.hooks],
    ['mcpServers', counts.mcpServers],
  ];
  const visible = entries.filter(([, n]) => n > 0);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      {visible.map(([key, n]) => (
        <span
          key={key}
          className="inline-flex rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-1.5 py-0.5"
        >
          {t(`harness.marketplace.counts.${key}`)} × {n}
        </span>
      ))}
    </div>
  );
}
