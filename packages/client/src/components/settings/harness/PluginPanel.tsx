/**
 * Story 28.1: Plugin list + toggle panel (inside "Harness Workbench").
 *
 * Renders one card per installed_plugins.json entry; same `<name>@<market>`
 * key can show as multiple cards (one per scope/project pair) but toggling
 * any of them writes the single shared `enabledPlugins` key to
 * `~/.claude/settings.json`.
 *
 * External-change events (another tab toggled, user edited the file by hand)
 * flow through `useHarnessPluginStore.handleExternalChange` which refetches
 * the card list.
 */

import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { HarnessPluginCard } from '@hammoc/shared';
import { useHarnessPluginStore } from '../../../stores/harnessPluginStore';
import { generateUUID } from '../../../utils/uuid';
import { getSocket } from '../../../services/socket';

interface Props {
  projectSlug: string;
}

interface CardGatingResult {
  toggleEnabled: boolean;
  tooltipKey?: string;
}

function computeGating(
  card: HarnessPluginCard,
  currentProjectPath: string | undefined,
): CardGatingResult {
  if (card.scope === 'user') return { toggleEnabled: true };
  // scope === 'project'
  if (!card.projectPath) {
    return { toggleEnabled: false, tooltipKey: 'harness.plugin.projectScopeAmbiguous' };
  }
  if (!currentProjectPath) {
    return { toggleEnabled: false, tooltipKey: 'harness.plugin.projectScopeDisabled' };
  }
  const a = card.projectPath.replace(/\\/g, '/').toLowerCase();
  const b = currentProjectPath.replace(/\\/g, '/').toLowerCase();
  if (a === b) return { toggleEnabled: true };
  return { toggleEnabled: false, tooltipKey: 'harness.plugin.projectScopeDisabled' };
}

export function PluginPanel({ projectSlug }: Props) {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();

  const cards = useHarnessPluginStore((s) => s.cards);
  const currentProjectPath = useHarnessPluginStore((s) => s.currentProjectPath);
  const isLoading = useHarnessPluginStore((s) => s.isLoading);
  const error = useHarnessPluginStore((s) => s.error);
  const bannerVisible = useHarnessPluginStore((s) => s.bannerVisible);
  const load = useHarnessPluginStore((s) => s.load);
  const toggle = useHarnessPluginStore((s) => s.toggle);
  const dismissBanner = useHarnessPluginStore((s) => s.dismissBanner);
  const handleExternalChange = useHarnessPluginStore((s) => s.handleExternalChange);

  useEffect(() => {
    // Keep cached cards alive after this panel unmounts so re-entering the
    // workbench (e.g. switching to Skills and back) renders instantly while
    // the store revalidates in the background. The store's `load()` is
    // stale-while-revalidate, and `handleExternalChange` invalidates on file
    // edits.
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

  const handleNewSession = () => {
    const newSessionId = generateUUID();
    dismissBanner();
    navigate(`/project/${projectSlug}/session/${encodeURIComponent(newSessionId)}`);
  };

  const isForbidden = error?.code === 'HARNESS_FORBIDDEN';

  const cardKeys = useMemo(
    () => cards.map((c, idx) => `${c.key}#${c.scope}#${c.projectPath ?? ''}#${idx}`),
    [cards],
  );

  return (
    <div className="flex flex-col gap-4">
      {bannerVisible && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
        >
          <div className="flex-1">
            <p>{t('harness.plugin.banner.freshSpawn')}</p>
            <button
              type="button"
              onClick={handleNewSession}
              className="mt-1 inline-flex items-center rounded-md bg-amber-600 hover:bg-amber-700 px-2.5 py-1 text-white text-xs font-medium"
            >
              {t('harness.plugin.banner.newSession')}
            </button>
          </div>
          <button
            type="button"
            aria-label={t('harness.plugin.banner.dismiss', 'Dismiss')}
            onClick={dismissBanner}
            className="text-amber-700 dark:text-amber-200 hover:text-amber-900"
          >
            ×
          </button>
        </div>
      )}

      {isForbidden && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/30 px-3 py-2 text-sm text-yellow-900 dark:text-yellow-100">
          {t('harness.plugin.readonly.forbidden')}
        </div>
      )}

      {isLoading && cards.length === 0 && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((n) => (
            <div
              key={n}
              className="h-24 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
      )}

      {!isLoading && !isForbidden && cards.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-6 text-sm text-gray-600 dark:text-gray-400">
          <p className="font-medium text-gray-800 dark:text-gray-200">
            {t('harness.plugin.empty')}
          </p>
          <p className="mt-1">{t('harness.plugin.emptyHint')}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {cards.map((card, idx) => {
          const gating = computeGating(card, currentProjectPath);
          const tooltip = gating.tooltipKey ? t(gating.tooltipKey) : undefined;
          return (
            <div
              key={cardKeys[idx]}
              className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {card.manifest?.name ?? card.name}
                  </div>
                  {card.manifest?.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {card.manifest.description}
                    </div>
                  )}
                </div>
                <label
                  className={
                    'inline-flex items-center '
                    + (gating.toggleEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60')
                  }
                  title={tooltip}
                >
                  <input
                    type="checkbox"
                    checked={card.enabled}
                    disabled={!gating.toggleEnabled}
                    aria-label={card.enabled ? t('harness.plugin.toggle.on') : t('harness.plugin.toggle.off')}
                    onChange={(e) => {
                      if (!gating.toggleEnabled) return;
                      void toggle(card.key, e.target.checked, projectSlug);
                    }}
                    className="h-4 w-4"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span
                  className={
                    'inline-flex rounded px-1.5 py-0.5 font-medium '
                    + (card.scope === 'user'
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200'
                      : 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200')
                  }
                >
                  {t(`harness.plugin.scope.${card.scope}`)}
                </span>
                <span className="text-gray-500 dark:text-gray-400">{card.marketplace}</span>
                {card.version && (
                  <span className="text-gray-500 dark:text-gray-400 font-mono">{card.version}</span>
                )}
                {card.category && (
                  <span className="text-gray-500 dark:text-gray-400">{card.category}</span>
                )}
                <span
                  className={
                    'inline-flex rounded px-1.5 py-0.5 font-medium '
                    + (card.pluginType === 'standard'
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
                      : 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200')
                  }
                >
                  {t(card.pluginType === 'standard'
                    ? 'harness.plugin.type.standard'
                    : 'harness.plugin.type.externalMcp')}
                </span>
              </div>
              <ComponentCounts counts={card.componentCounts} t={t} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComponentCounts({
  counts,
  t,
}: {
  counts: HarnessPluginCard['componentCounts'];
  t: (key: string) => string;
}) {
  const entries: [keyof typeof counts, number][] = [
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
          {t(`harness.plugin.counts.${key}`)} × {n}
        </span>
      ))}
    </div>
  );
}
