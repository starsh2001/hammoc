/**
 * Story 31.4 (D.1): Marketplace panel — top-level project-settings section.
 *
 * Filters + catalog card grid + per-market parse-error badges (AC5) +
 * installed_plugins.json format-warning banner (AC6) + the copy-guide modal
 * (install / uninstall / marketplace-add). External CLI installs refresh the
 * "installed" badges automatically via the shared user-scope harness watcher
 * (AC2.b) — same socket event PluginPanel already listens to, no new channel.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { HarnessMarketplaceCatalogEntry } from '@hammoc/shared';
import {
  useMarketplaceStore,
  selectFilteredEntries,
} from '../../stores/marketplaceStore';
import { getSocket } from '../../services/socket';
import { MarketplaceCard } from './harness/marketplace/MarketplaceCard';
import { MarketplaceFilters } from './harness/marketplace/MarketplaceFilters';
import { InstallGuideModal, type GuideMode } from './harness/marketplace/InstallGuideModal';

interface Props {
  projectSlug: string;
}

interface ModalState {
  mode: GuideMode;
  entryKey?: string;
}

export function MarketplacePanel({ projectSlug }: Props) {
  const { t } = useTranslation('settings');

  const isLoading = useMarketplaceStore((s) => s.isLoading);
  const error = useMarketplaceStore((s) => s.error);
  const entriesTotal = useMarketplaceStore((s) => s.entries.length);
  const errors = useMarketplaceStore((s) => s.errors);
  const formatWarning = useMarketplaceStore((s) => s.formatWarning);
  const filtered = useMarketplaceStore(useShallow(selectFilteredEntries));
  const load = useMarketplaceStore((s) => s.load);
  const handleExternalChange = useMarketplaceStore((s) => s.handleExternalChange);

  const [modal, setModal] = useState<ModalState | null>(null);

  useEffect(() => {
    void load(projectSlug);
  }, [load, projectSlug]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('harness:subscribe', { scope: 'user' });
    const handler = (payload: Parameters<typeof handleExternalChange>[0]) => {
      handleExternalChange(payload);
    };
    socket.on('harness:external-change', handler);
    return () => {
      socket.off('harness:external-change', handler);
      socket.emit('harness:unsubscribe', { scope: 'user' });
    };
  }, [handleExternalChange]);

  const isForbidden = error?.code === 'HARNESS_FORBIDDEN';

  const openInstall = (entry: HarnessMarketplaceCatalogEntry) =>
    setModal({ mode: 'install', entryKey: entry.key });
  const openUninstall = (entry: HarnessMarketplaceCatalogEntry) =>
    setModal({ mode: 'uninstall', entryKey: entry.key });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('harness.marketplace.nav.title')}
        </h3>
        <button
          type="button"
          data-testid="marketplace-add-button"
          onClick={() => setModal({ mode: 'add' })}
          className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {t('harness.marketplace.addButton')}
        </button>
      </div>

      {/* AC6: installed_plugins.json format warning */}
      {formatWarning && (
        <div
          role="alert"
          data-testid="marketplace-format-warning"
          className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
        >
          <p className="font-medium">{t('harness.marketplace.formatWarning.title')}</p>
          <p className="mt-0.5 text-xs">
            {t(`harness.marketplace.formatWarning.reason.${formatWarning.reason}`)}
            {typeof formatWarning.detectedVersion === 'number'
              ? ` (v${formatWarning.detectedVersion})`
              : ''}
          </p>
        </div>
      )}

      {/* AC5: per-market parse failures, isolated */}
      {errors.length > 0 && (
        <div
          data-testid="marketplace-market-errors"
          className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-900 dark:text-red-100 flex flex-col gap-1"
        >
          {errors.map((e) => (
            <span key={e.marketplace} data-testid="marketplace-market-error">
              {t('harness.marketplace.error.market', { marketplace: e.marketplace, code: e.code })}
            </span>
          ))}
        </div>
      )}

      <MarketplaceFilters />

      {isForbidden && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/30 px-3 py-2 text-sm text-yellow-900 dark:text-yellow-100">
          {t('harness.marketplace.forbidden')}
        </div>
      )}

      {isLoading && entriesTotal === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {!isLoading && !isForbidden && entriesTotal === 0 && errors.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-6 text-sm text-gray-600 dark:text-gray-400">
          <p className="font-medium text-gray-800 dark:text-gray-200">
            {t('harness.marketplace.empty')}
          </p>
          <p className="mt-1">{t('harness.marketplace.emptyHint')}</p>
        </div>
      )}

      {entriesTotal > 0 && filtered.length === 0 && (
        <div
          data-testid="marketplace-no-matches"
          className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-400"
        >
          {t('harness.marketplace.noMatches')}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filtered.map((entry) => (
          <MarketplaceCard
            key={entry.key}
            entry={entry}
            onInstall={openInstall}
            onUninstall={openUninstall}
          />
        ))}
      </div>

      {modal && (
        <InstallGuideModal
          mode={modal.mode}
          entryKey={modal.entryKey}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
