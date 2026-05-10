/**
 * Story 28.2: Skill list panel inside "Harness Workbench → Skills".
 *
 * Renders one card per merged skill name; cards know about every source the
 * skill exists in (project / user / plugin). Clicking a card opens the
 * SkillEditor as a modal. The card row also exposes a copy-action menu —
 * the available actions depend on the active source (e.g. a plugin source
 * only allows "override-clone" copies into project / user).
 *
 * External-change events flow through `harness:external-change`; the panel
 * subscribes to both user and project scopes since either tree may host
 * skills.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  HarnessSkillCard,
  HarnessSkillCopyRequest,
  HarnessSkillSource,
  HarnessSkillSourceScope,
} from '@hammoc/shared';
import { useHarnessSkillStore } from '../../../stores/harnessSkillStore';
import { getSocket } from '../../../services/socket';
import { ApiError } from '../../../services/api/client';
import { SkillEditor } from './SkillEditor';
import { SkillCopyConflictDialog } from './SkillCopyConflictDialog';
import { CardShareBadge } from './CardShareBadge';

interface Props {
  projectSlug: string;
}

interface CopyMenuAction {
  /** i18n key under harness.skill.copy.<key>.label */
  key: 'toUser' | 'toProject' | 'overrideToProject' | 'overrideToUser';
  /** Pre-populated request to feed the copy modal (without onConflict). */
  request: Omit<HarnessSkillCopyRequest, 'onConflict' | 'targetName'>;
}

function buildCopyActions(card: HarnessSkillCard, projectSlug: string): CopyMenuAction[] {
  const actions: CopyMenuAction[] = [];
  const active = card.sources.find((s) => s.scope === card.activeScope);
  if (!active) return actions;
  if (active.scope === 'project') {
    actions.push({
      key: 'toUser',
      request: {
        sourceScope: 'project',
        sourceProjectSlug: projectSlug,
        sourceName: card.name,
        targetScope: 'user',
      },
    });
  } else if (active.scope === 'user') {
    actions.push({
      key: 'toProject',
      request: {
        sourceScope: 'user',
        sourceName: card.name,
        targetScope: 'project',
        targetProjectSlug: projectSlug,
      },
    });
  } else {
    // plugin → override-clone in either direction
    actions.push({
      key: 'overrideToProject',
      request: {
        sourceScope: 'plugin',
        sourcePluginKey: active.pluginKey,
        sourceName: card.name,
        targetScope: 'project',
        targetProjectSlug: projectSlug,
      },
    });
    actions.push({
      key: 'overrideToUser',
      request: {
        sourceScope: 'plugin',
        sourcePluginKey: active.pluginKey,
        sourceName: card.name,
        targetScope: 'user',
      },
    });
  }
  return actions;
}

export function SkillPanel({ projectSlug }: Props) {
  const { t } = useTranslation('settings');

  const cards = useHarnessSkillStore((s) => s.cards);
  const malformed = useHarnessSkillStore((s) => s.malformed);
  const isLoading = useHarnessSkillStore((s) => s.isLoading);
  const error = useHarnessSkillStore((s) => s.error);
  const load = useHarnessSkillStore((s) => s.load);
  const copy = useHarnessSkillStore((s) => s.copy);
  const handleExternalChange = useHarnessSkillStore((s) => s.handleExternalChange);

  const [openCard, setOpenCard] = useState<HarnessSkillCard | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [conflictAction, setConflictAction] = useState<CopyMenuAction | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    // Keep cached cards alive after this panel unmounts so re-entering the
    // workbench renders instantly while the store revalidates in the
    // background. `load()` is stale-while-revalidate.
    void load(projectSlug);
  }, [load, projectSlug]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('harness:subscribe', { scope: 'user' });
    socket.emit('harness:subscribe', { scope: 'project', projectSlug });
    const handler = (payload: Parameters<typeof handleExternalChange>[0]) => {
      handleExternalChange(payload);
    };
    socket.on('harness:external-change', handler);
    return () => {
      socket.off('harness:external-change', handler);
      socket.emit('harness:unsubscribe', { scope: 'user' });
      socket.emit('harness:unsubscribe', { scope: 'project', projectSlug });
    };
  }, [handleExternalChange, projectSlug]);

  const cardKeys = useMemo(() => cards.map((c) => `${c.name}#${c.activeScope}`), [cards]);

  const isForbidden = error?.code === 'HARNESS_FORBIDDEN';

  // The conflict dialog handles every copy resolution path (overwrite / skip /
  // rename), so a click on a copy menu item just opens the dialog rather than
  // attempting a direct copy first.
  const handleOpenCopyMenu = (action: CopyMenuAction) => {
    setOpenMenu(null);
    setConflictAction(action);
    setCopyError(null);
  };

  const handleConflictSubmit = async (resolution: {
    onConflict: 'overwrite' | 'skip' | 'rename';
    targetName: string;
  }) => {
    if (!conflictAction) return;
    setCopyError(null);
    try {
      const result = await copy({
        ...conflictAction.request,
        targetName: resolution.targetName,
        onConflict: resolution.onConflict,
      } as HarnessSkillCopyRequest);
      // success — close dialog. Card list refresh is triggered by the store.
      setConflictAction(null);
      void result;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'HARNESS_WRITE_ERROR'
        && (err.details as { cause?: string } | undefined)?.cause === 'cross-device') {
        setCopyError(t('harness.skill.copy.error.crossDevice'));
        return;
      }
      if (err instanceof ApiError && err.code === 'HARNESS_SKILL_NAME_CONFLICT') {
        setCopyError(t('harness.skill.copy.conflict.renameInvalid'));
        return;
      }
      setCopyError((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
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
            {t('harness.skill.empty.title')}
          </p>
          <p className="mt-1">{t('harness.skill.empty.description')}</p>
        </div>
      )}

      {malformed.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">{t('harness.skill.malformed.title')}</p>
          <ul className="mt-1 list-disc ml-5">
            {malformed.map((m, idx) => (
              <li key={`${m.absoluteRoot}#${idx}`} className="text-xs">
                <code className="font-mono">{m.absoluteRoot}</code> — {m.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {cards.map((card, idx) => {
          const actions = buildCopyActions(card, projectSlug);
          const cardKey = cardKeys[idx];
          return (
            <div
              key={cardKey}
              className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex flex-col gap-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700"
              onClick={() => setOpenCard(card)}
              role="button"
              aria-label={t('harness.skill.cardOpen', { name: card.name, defaultValue: `Open ${card.name}` })}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {card.name}
                  </div>
                  {card.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                      {card.description}
                    </div>
                  )}
                </div>
                {actions.length > 0 && (
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      aria-label={t('harness.skill.copy.menuLabel', { defaultValue: 'Copy actions' })}
                      onClick={() => setOpenMenu((curr) => (curr === cardKey ? null : cardKey))}
                      className="px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      ⋮
                    </button>
                    {openMenu === cardKey && (
                      <ul className="absolute right-0 top-7 z-10 min-w-[14rem] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg text-sm">
                        {actions.map((action) => (
                          <li key={action.key}>
                            <button
                              type="button"
                              onClick={() => handleOpenCopyMenu(action)}
                              className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              {t(`harness.skill.copy.${action.key}.label`)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                {card.sources.map((src) => (
                  <ScopeBadge
                    key={`${src.scope}#${src.pluginKey ?? ''}`}
                    source={src}
                    isActive={src.scope === card.activeScope}
                    activeScopeLabel={t(`harness.skill.scopeBadge.${card.activeScope}`)}
                    shadowedScopeLabel={t(`harness.skill.scopeBadge.${src.scope}`)}
                    tooltipKey="harness.skill.activeSourceTooltip"
                  />
                ))}
                {card.sources.some((s) => s.scope === 'project') && (
                  <CardShareBadge
                    projectSlug={projectSlug}
                    scope="project"
                    relativePath={`.claude/skills/${card.name}/SKILL.md`}
                  />
                )}
                {card.version && (
                  <span className="text-gray-500 dark:text-gray-400 font-mono">{card.version}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {openCard && (
        <SkillEditor
          card={openCard}
          projectSlug={projectSlug}
          onClose={() => setOpenCard(null)}
        />
      )}

      {conflictAction && (
        <SkillCopyConflictDialog
          defaultName={conflictAction.request.sourceName}
          targetScope={conflictAction.request.targetScope}
          errorMessage={copyError}
          onSubmit={handleConflictSubmit}
          onClose={() => {
            setConflictAction(null);
            setCopyError(null);
          }}
        />
      )}
    </div>
  );
}

function ScopeBadge({
  source,
  isActive,
  activeScopeLabel,
  shadowedScopeLabel,
  tooltipKey,
}: {
  source: HarnessSkillSource;
  isActive: boolean;
  activeScopeLabel: string;
  shadowedScopeLabel: string;
  tooltipKey: string;
}) {
  const { t } = useTranslation('settings');
  const scopeColor: Record<HarnessSkillSourceScope, string> = {
    project: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200',
    user: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200',
    plugin: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200',
  };
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 font-medium ${scopeColor[source.scope]} ${
        isActive ? '' : 'opacity-50'
      }`}
      title={
        isActive
          ? undefined
          : t(tooltipKey, {
              active: activeScopeLabel,
              shadowed: shadowedScopeLabel,
            })
      }
    >
      {source.scope === 'plugin'
        ? t('harness.skill.scopeBadge.pluginWithKey', {
            key: source.pluginKey,
            defaultValue: t('harness.skill.scopeBadge.plugin'),
          })
        : t(`harness.skill.scopeBadge.${source.scope}`)}
    </span>
  );
}

