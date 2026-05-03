/**
 * Story 28.4: Hook list panel inside "Harness Workbench → Hook".
 *
 * Layout — nine collapsible event sections (PreToolUse / PostToolUse / Stop /
 * SubagentStop / SessionStart / SessionEnd / UserPromptSubmit / PreCompact /
 * Notification). Each section shows the hooks registered for that event across
 * all three sources (project / user / plugin); plugin cards are read-only and
 * surface "override-clone" copy actions only.
 *
 * All copy actions go through the type-warning modal first (command vs prompt
 * differs only in copy/text); the conflict dialog appears only when the target
 * scope already contains an identical hook.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type {
  HarnessHookCard,
  HarnessHookCopyRequest,
  HarnessHookEvent,
  HarnessHookSourceScope,
} from '@hammoc/shared';
import { HARNESS_HOOK_EVENTS } from '@hammoc/shared';
import { useHarnessHookStore } from '../../../stores/harnessHookStore';
import { getSocket } from '../../../services/socket';
import { ApiError } from '../../../services/api/client';
import { generateUUID } from '../../../utils/uuid';
import { HookEditor } from './HookEditor';
import { HookCopyTypeWarningDialog } from './HookCopyTypeWarningDialog';
import { HookCopyConflictDialog } from './HookCopyConflictDialog';

interface Props {
  projectSlug: string;
}

interface CopyMenuAction {
  key: 'toUser' | 'toProject' | 'overrideToProject' | 'overrideToUser';
  request: Omit<HarnessHookCopyRequest, 'onConflict' | 'acknowledgedWarning'>;
  /** Source body for the type-warning modal preview. */
  body: string;
  /** Source hook type for the type-warning modal. */
  hookType: 'command' | 'prompt';
  /** Pre-detected secret paths so the warning modal can show the callout. */
  secretPaths: string[];
}

const ENV_REF_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/g;

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]{16,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /[A-Za-z0-9+/=]{32,}/,
];

function detectSecretsClient(value: string | undefined): string[] {
  if (!value) return [];
  const stripped = value.replace(ENV_REF_RE, '');
  for (const re of SECRET_PATTERNS) {
    if (re.test(stripped)) return ['body'];
  }
  return [];
}

function buildCopyActions(card: HarnessHookCard, projectSlug: string): CopyMenuAction[] {
  const actions: CopyMenuAction[] = [];
  const body = card.config.command ?? card.config.prompt ?? '';
  const hookType = card.config.type;
  const secretPaths = detectSecretsClient(card.config.command ?? card.config.prompt);
  const baseRequest = {
    sourceEvent: card.event,
    sourceGroupIndex: card.groupIndex,
    sourceHookIndex: card.hookIndex,
  };
  if (card.scope === 'project') {
    actions.push({
      key: 'toUser',
      request: {
        sourceScope: 'project',
        sourceProjectSlug: card.projectSlug,
        ...baseRequest,
        targetScope: 'user',
      },
      body,
      hookType,
      secretPaths,
    });
  } else if (card.scope === 'user') {
    actions.push({
      key: 'toProject',
      request: {
        sourceScope: 'user',
        ...baseRequest,
        targetScope: 'project',
        targetProjectSlug: projectSlug,
      },
      body,
      hookType,
      secretPaths,
    });
  } else {
    actions.push({
      key: 'overrideToProject',
      request: {
        sourceScope: 'plugin',
        sourcePluginKey: card.pluginKey,
        ...baseRequest,
        targetScope: 'project',
        targetProjectSlug: projectSlug,
      },
      body,
      hookType,
      secretPaths,
    });
    actions.push({
      key: 'overrideToUser',
      request: {
        sourceScope: 'plugin',
        sourcePluginKey: card.pluginKey,
        ...baseRequest,
        targetScope: 'user',
      },
      body,
      hookType,
      secretPaths,
    });
  }
  return actions;
}

export function HookPanel({ projectSlug }: Props) {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();

  const cardsByEvent = useHarnessHookStore((s) => s.cardsByEvent);
  const malformed = useHarnessHookStore((s) => s.malformed);
  const isLoading = useHarnessHookStore((s) => s.isLoading);
  const error = useHarnessHookStore((s) => s.error);
  const bannerVisible = useHarnessHookStore((s) => s.bannerVisible);
  const load = useHarnessHookStore((s) => s.load);
  const copy = useHarnessHookStore((s) => s.copy);
  const toggleEnabled = useHarnessHookStore((s) => s.toggleEnabled);
  const dismissBanner = useHarnessHookStore((s) => s.dismissBanner);
  const handleExternalChange = useHarnessHookStore((s) => s.handleExternalChange);

  const [openCard, setOpenCard] = useState<HarnessHookCard | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<CopyMenuAction | null>(null);
  const [conflictAction, setConflictAction] = useState<CopyMenuAction | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [pluginRootWarning, setPluginRootWarning] = useState<string | null>(null);
  const [collapsedEvents, setCollapsedEvents] = useState<Set<HarnessHookEvent>>(() => {
    const initial = new Set<HarnessHookEvent>();
    for (const e of HARNESS_HOOK_EVENTS) initial.add(e);
    return initial;
  });
  // New-hook dialog: clicking "+ Add" on an empty event opens a HookEditor with
  // an in-memory placeholder card that is created on first save.
  const [pendingNewEvent, setPendingNewEvent] = useState<HarnessHookEvent | null>(null);

  useEffect(() => {
    void load(projectSlug);
    return () => {
      useHarnessHookStore.getState().reset();
    };
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

  // Auto-expand events that have at least one hook.
  useEffect(() => {
    setCollapsedEvents((prev) => {
      const next = new Set(prev);
      for (const event of HARNESS_HOOK_EVENTS) {
        if ((cardsByEvent[event]?.length ?? 0) > 0) next.delete(event);
      }
      return next;
    });
  }, [cardsByEvent]);

  const totalHooks = useMemo(
    () => HARNESS_HOOK_EVENTS.reduce((acc, e) => acc + (cardsByEvent[e]?.length ?? 0), 0),
    [cardsByEvent],
  );

  const toggleCollapse = (event: HarnessHookEvent) => {
    setCollapsedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) next.delete(event);
      else next.add(event);
      return next;
    });
  };

  const handleOpenCopyMenu = (action: CopyMenuAction) => {
    setOpenMenu(null);
    setPendingAction(action);
  };

  const handleWarningConfirm = () => {
    if (!pendingAction) return;
    setConflictAction(pendingAction);
    setPendingAction(null);
    setCopyError(null);
  };

  const handleConflictSubmit = async (resolution: 'overwrite' | 'skip' | 'duplicate') => {
    if (!conflictAction) return;
    setCopyError(null);
    setPluginRootWarning(null);
    try {
      const result = await copy({
        ...conflictAction.request,
        onConflict: resolution,
        acknowledgedWarning: true,
      } as HarnessHookCopyRequest);
      if (result.warnings?.includes('plugin-root-reference')) {
        setPluginRootWarning(t('harness.hook.copy.conflict.pluginRootWarning'));
      }
      setConflictAction(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setCopyError(err.message);
        return;
      }
      setCopyError((err as Error).message);
    }
  };

  const handleToggleHook = async (card: HarnessHookCard) => {
    if (card.scope === 'plugin') return;
    try {
      await toggleEnabled(card, !card.enabled);
    } catch (err) {
      // STALE_WRITE → reload picks up the latest mtimes, user can retry.
      if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
        void load(projectSlug);
      }
    }
  };

  const handleNewSession = () => {
    const newSessionId = generateUUID();
    dismissBanner();
    navigate(`/project/${projectSlug}/session/${encodeURIComponent(newSessionId)}`);
  };

  const isForbidden = error?.code === 'HARNESS_FORBIDDEN';

  return (
    <div className="flex flex-col gap-4">
      {bannerVisible && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
        >
          <div className="flex-1">
            <p>{t('harness.hook.banner.freshSpawn')}</p>
            <button
              type="button"
              onClick={handleNewSession}
              className="mt-1 inline-flex items-center rounded-md bg-amber-600 hover:bg-amber-700 px-2.5 py-1 text-white text-xs font-medium"
            >
              {t('harness.hook.banner.newSession')}
            </button>
          </div>
          <button
            type="button"
            aria-label={t('harness.hook.banner.dismiss', { defaultValue: 'Dismiss' })}
            onClick={dismissBanner}
            className="text-amber-700 dark:text-amber-200 hover:text-amber-900"
          >
            ×
          </button>
        </div>
      )}

      {pluginRootWarning && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
        >
          {pluginRootWarning}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setPluginRootWarning(null)}
          >
            {t('harness.hook.banner.dismiss', { defaultValue: 'Dismiss' })}
          </button>
        </div>
      )}

      {malformed.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">{t('harness.hook.malformed.title')}</p>
          <ul className="mt-1 list-disc ml-5">
            {malformed.map((m, idx) => (
              <li key={`${m.absoluteFile}#${idx}`} className="text-xs">
                <code className="font-mono">{m.absoluteFile}</code> — {m.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading && totalHooks === 0 && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((n) => (
            <div
              key={n}
              className="h-16 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
      )}

      {!isLoading && !isForbidden && totalHooks === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-6 text-sm text-gray-600 dark:text-gray-400">
          <p className="font-medium text-gray-800 dark:text-gray-200">
            {t('harness.hook.empty.title')}
          </p>
          <p className="mt-1">{t('harness.hook.empty.description')}</p>
        </div>
      )}

      {HARNESS_HOOK_EVENTS.map((event) => {
        const cards = cardsByEvent[event] ?? [];
        const isCollapsed = collapsedEvents.has(event);
        const otherSourceCount = countOtherSourceHooks(cards);
        return (
          <section key={event} className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <header
              className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
              onClick={() => toggleCollapse(event)}
            >
              <div className="flex items-center gap-2">
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                )}
                <h3 className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t(`harness.hook.events.${event}`, { defaultValue: event })}
                </h3>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {cards.length}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingNewEvent(event);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('harness.hook.add', { defaultValue: 'Add' })}
              </button>
            </header>
            {!isCollapsed && (
              <div className="px-3 pb-3">
                {cards.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic py-2">
                    {t('harness.hook.empty.perEvent', {
                      event,
                      defaultValue: `No hooks for ${event}.`,
                    })}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {cards.map((card) => {
                      const cardKey = `${card.scope}#${card.event}#${card.groupIndex}#${card.hookIndex}#${
                        card.disabledByBackup ? 'bk' : 'ok'
                      }`;
                      const actions = buildCopyActions(card, projectSlug);
                      const showParallelBadge = otherSourceCount > 0;
                      return (
                        <div
                          key={cardKey}
                          className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex flex-col gap-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700"
                          onClick={() => setOpenCard(card)}
                          role="button"
                          aria-label={t('harness.hook.cardOpen', { defaultValue: 'Open hook' })}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
                                {card.matcher && card.matcher.length > 0
                                  ? card.matcher
                                  : t('harness.hook.matcher.empty', {
                                      defaultValue: '(matches all calls)',
                                    })}
                              </div>
                              <div className="mt-1 text-xs font-mono text-gray-700 dark:text-gray-200 truncate">
                                {(card.config.command ?? card.config.prompt ?? '').slice(0, 120)}
                              </div>
                            </div>
                            <div
                              className="flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {card.scope !== 'plugin' ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleHook(card)}
                                  className={
                                    'px-2 py-1 text-xs rounded font-medium '
                                    + (card.enabled
                                      ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'
                                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300')
                                  }
                                >
                                  {card.enabled
                                    ? t('harness.hook.toggle.on')
                                    : t('harness.hook.toggle.off')}
                                </button>
                              ) : (
                                <span
                                  className="px-2 py-1 text-xs rounded font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200"
                                  title={t('harness.hook.toggle.readOnly')}
                                >
                                  🔒 {t('harness.hook.toggle.readOnly')}
                                </span>
                              )}
                              {actions.length > 0 && (
                                <div className="relative">
                                  <button
                                    type="button"
                                    aria-label={t('harness.hook.copy.menuLabel', {
                                      defaultValue: 'Copy actions',
                                    })}
                                    onClick={() =>
                                      setOpenMenu((curr) => (curr === cardKey ? null : cardKey))
                                    }
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
                                            {t(`harness.hook.copy.${action.key}.label`)}
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                            <ScopeBadge card={card} />
                            <TypeBadge type={card.config.type} />
                            {card.disabledByBackup && (
                              <span className="text-[10px] text-gray-500 dark:text-gray-400 italic">
                                {t('harness.hook.toggle.disabledByBackup')}
                              </span>
                            )}
                            {showParallelBadge && (
                              <span
                                className="text-[10px] text-gray-500 dark:text-gray-400 italic"
                                title={t('harness.hook.parallelExecutionBadge_other', {
                                  count: otherSourceCount,
                                  defaultValue: `Runs in parallel with ${otherSourceCount} other source(s).`,
                                })}
                              >
                                {otherSourceCount === 1
                                  ? t('harness.hook.parallelExecutionBadge_one', {
                                      defaultValue: 'Runs in parallel with 1 hook from another source.',
                                    })
                                  : t('harness.hook.parallelExecutionBadge_other', {
                                      count: otherSourceCount,
                                      defaultValue: `Runs in parallel with ${otherSourceCount} hooks from other sources.`,
                                    })}
                              </span>
                            )}
                            {card.config.type === 'prompt' && (
                              <span className="text-[10px] text-violet-700 dark:text-violet-300">
                                {t('harness.hook.banner.promptCost', {
                                  defaultValue: 'Prompt-type hooks invoke the LLM each time.',
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      {openCard && (
        <HookEditor
          card={openCard}
          projectSlug={projectSlug}
          onClose={() => setOpenCard(null)}
        />
      )}

      {pendingNewEvent && (
        <HookEditor
          createForEvent={pendingNewEvent}
          projectSlug={projectSlug}
          onClose={() => setPendingNewEvent(null)}
        />
      )}

      {pendingAction && (
        <HookCopyTypeWarningDialog
          hookType={pendingAction.hookType}
          body={pendingAction.body}
          secretPaths={pendingAction.secretPaths}
          onConfirm={handleWarningConfirm}
          onClose={() => setPendingAction(null)}
        />
      )}

      {conflictAction && (
        <HookCopyConflictDialog
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

function countOtherSourceHooks(cards: HarnessHookCard[]): number {
  // Number of cards minus 1 — because the panel renders all sources for the
  // same event side-by-side, the parallel badge tells the user that this
  // entry will fire alongside the others.
  return Math.max(0, cards.length - 1);
}

function ScopeBadge({ card }: { card: HarnessHookCard }) {
  const { t } = useTranslation('settings');
  const colorByScope: Record<HarnessHookSourceScope, string> = {
    project: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200',
    user: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200',
    plugin: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200',
  };
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 font-medium ${colorByScope[card.scope]}`}>
      {card.scope === 'plugin'
        ? t('harness.hook.scopeBadge.pluginWithKey', {
            key: card.pluginKey,
            defaultValue: t('harness.hook.scopeBadge.plugin'),
          })
        : t(`harness.hook.scopeBadge.${card.scope}`)}
    </span>
  );
}

function TypeBadge({ type }: { type: 'command' | 'prompt' }) {
  const className =
    type === 'command'
      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'
      : 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-200';
  return (
    <span className={`inline-flex rounded font-mono px-1.5 py-0.5 text-[11px] ${className}`}>
      {type}
    </span>
  );
}
