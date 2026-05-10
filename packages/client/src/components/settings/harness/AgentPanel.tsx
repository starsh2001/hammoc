/**
 * Story 28.6: Sub-agent panel inside "Harness Workbench → Agents".
 *
 * Layout: a flat card grid of `.claude/agents/*.md` files merged across
 * project / global / plugin scopes. Each card opens the AgentEditor modal on
 * click and exposes a ⋮ menu with the per-scope copy actions (project ↔
 * global, override-clone for plugin). A "+ 새 에이전트" CTA at the top opens
 * a creation modal asking for the 5 frontmatter fields.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Plus } from 'lucide-react';
import type {
  HarnessAgentCard,
  HarnessAgentColor,
  HarnessAgentCopyRequest,
  HarnessAgentMalformedEntry,
  HarnessAgentModel,
  HarnessAgentSourceScope,
  HarnessAgentToolsState,
} from '@hammoc/shared';
import { useHarnessAgentStore } from '../../../stores/harnessAgentStore';
import { ApiError } from '../../../services/api/client';
import { createAgent } from '../../../services/api/harnessAgentsApi';
import { getSocket } from '../../../services/socket';
import { AgentEditor } from './AgentEditor';
import { AgentCopyConflictDialog } from './AgentCopyConflictDialog';
import { CardShareBadge } from './CardShareBadge';
import { LintMarker } from './LintMarker';
import { LintIssueList } from './LintIssueList';
import { useCardLintIssues, useDomainLintIssues } from '../../../hooks/useCardLintIssues';
import type { LintIssue } from '@hammoc/shared';

/** Wrapper that calls the hook per card — necessary because hooks can't be called inside `.map`. */
function AgentLintMarker({
  name,
  onActivate,
}: {
  name: string;
  onActivate: (issue: LintIssue) => void;
}) {
  const issues = useCardLintIssues('agent', name);
  return <LintMarker issues={issues} onActivate={onActivate} />;
}

interface Props {
  projectSlug: string;
  /** Opens the workbench-level Lint rules dialog (AC3.c CTA). */
  onOpenLintPreferences?: () => void;
}

interface CopyAction {
  key: 'toUser' | 'toProject' | 'overrideToProject' | 'overrideToUser';
  request: Omit<HarnessAgentCopyRequest, 'onConflict' | 'acknowledgedSecret'>;
  hasSecret: boolean;
}

const ENV_REF_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/g;
const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]{16,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /[A-Za-z0-9+/=]{32,}/,
];

const COLOR_HEX: Record<HarnessAgentColor, string> = {
  blue: '#3b82f6',
  cyan: '#06b6d4',
  green: '#22c55e',
  yellow: '#eab308',
  magenta: '#d946ef',
  red: '#ef4444',
};

const SCOPE_FILTERS = ['all', 'project', 'user', 'plugin'] as const;
type ScopeFilter = (typeof SCOPE_FILTERS)[number];

function detectSecretsInDescription(card: HarnessAgentCard): boolean {
  const text = card.description ?? '';
  if (!text) return false;
  const stripped = text.replace(ENV_REF_RE, '');
  return SECRET_PATTERNS.some((re) => re.test(stripped));
}

function buildCopyActions(card: HarnessAgentCard, projectSlug: string): CopyAction[] {
  const actions: CopyAction[] = [];
  const hasSecret = detectSecretsInDescription(card);
  const baseRequest = { sourceName: card.name };
  if (card.scope === 'project') {
    actions.push({
      key: 'toUser',
      request: {
        sourceScope: 'project',
        sourceProjectSlug: card.projectSlug,
        ...baseRequest,
        targetScope: 'user',
      },
      hasSecret,
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
      hasSecret,
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
      hasSecret,
    });
    actions.push({
      key: 'overrideToUser',
      request: {
        sourceScope: 'plugin',
        sourcePluginKey: card.pluginKey,
        ...baseRequest,
        targetScope: 'user',
      },
      hasSecret,
    });
  }
  return actions;
}

export function AgentPanel({ projectSlug, onOpenLintPreferences }: Props) {
  const { t } = useTranslation('settings');

  const cards = useHarnessAgentStore((s) => s.cards);
  const malformed = useHarnessAgentStore((s) => s.malformed);
  const isLoading = useHarnessAgentStore((s) => s.isLoading);
  const error = useHarnessAgentStore((s) => s.error);
  const load = useHarnessAgentStore((s) => s.load);
  const copy = useHarnessAgentStore((s) => s.copy);
  const handleExternalChange = useHarnessAgentStore((s) => s.handleExternalChange);

  const lintIssues = useDomainLintIssues('agent');

  const [openCard, setOpenCard] = useState<HarnessAgentCard | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  /**
   * Open the editor for the card whose name matches the lint issue (AC2.b).
   * Falls back to scrolling the matching card root into view when the name
   * lookup fails (e.g. card was deleted between lint evaluation and click).
   */
  const handleActivateLintIssue = (issue: LintIssue) => {
    const target = cards.find((c) => c.name === issue.cardName);
    if (target) {
      setOpenCard(target);
      return;
    }
    const el = document.querySelector(
      `[data-testid^="agent-card-"][data-testid$="-${issue.cardName}"]`,
    );
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  const [pendingConflict, setPendingConflict] = useState<{
    action: CopyAction;
    errorMessage?: string;
  } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');

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

  const filteredCards = useMemo(
    () => (scopeFilter === 'all' ? cards : cards.filter((c) => c.scope === scopeFilter)),
    [cards, scopeFilter],
  );

  // Build a "shadowed" indicator: same name appearing across scopes is allowed
  // (multi-row cards), but for non-active duplicates we add a tooltip.
  const nameOccurrences = useMemo(() => {
    const map = new Map<string, HarnessAgentSourceScope[]>();
    for (const c of cards) {
      const arr = map.get(c.name) ?? [];
      arr.push(c.scope);
      map.set(c.name, arr);
    }
    return map;
  }, [cards]);

  const handleStartCopy = (action: CopyAction) => {
    setOpenMenu(null);
    if (action.hasSecret) {
      setPendingConflict({ action });
      return;
    }
    void runCopy(action, 'overwrite', undefined, false);
  };

  const runCopy = async (
    action: CopyAction,
    onConflict: 'overwrite' | 'skip' | 'rename',
    renameName: string | undefined,
    acknowledgedSecret: boolean,
  ) => {
    try {
      await copy({
        ...action.request,
        ...(renameName ? { targetName: renameName } : {}),
        onConflict,
        acknowledgedSecret,
      } as HarnessAgentCopyRequest);
      setPendingConflict(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (
          err.code === 'HARNESS_FORBIDDEN' &&
          (err.details as { cause?: string })?.cause === 'secret-not-acknowledged'
        ) {
          setPendingConflict({
            action: { ...action, hasSecret: true },
            errorMessage: t('harness.agent.copy.secret.intro', {
              defaultValue:
                'Sensitive content detected — click Continue to acknowledge.',
            }),
          });
          return;
        }
        if (err.code === 'HARNESS_AGENT_NAME_CONFLICT') {
          setPendingConflict({ action, errorMessage: err.message });
          return;
        }
        setPendingConflict((s) => (s ? { ...s, errorMessage: err.message } : s));
      }
    }
  };

  const handleConflictSubmit = (
    choice: 'overwrite' | 'skip' | 'rename',
    renameName?: string,
  ) => {
    if (!pendingConflict) return;
    void runCopy(
      pendingConflict.action,
      choice,
      renameName,
      pendingConflict.action.hasSecret,
    );
  };

  const handleCreateSubmit = async (input: CreateAgentInput) => {
    await createAgent({
      scope: input.scope,
      projectSlug: input.scope === 'project' ? projectSlug : undefined,
      name: input.name,
      frontmatter: {
        name: input.name,
        description: input.description,
        model: input.model,
        color: input.color,
        ...(input.toolsState === 'empty' ? { tools: [] } : {}),
      },
      toolsState: input.toolsState,
      body: '',
    });
    await load(projectSlug);
    setShowCreateModal(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div role="tablist" className="flex items-center gap-1">
          {SCOPE_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scopeFilter === s}
              data-testid={`agent-filter-${s}`}
              onClick={() => setScopeFilter(s)}
              className={
                'px-2 py-0.5 text-xs rounded-full ' +
                (scopeFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200')
              }
            >
              {s === 'all'
                ? t('harness.agent.filter.all', { defaultValue: 'All' })
                : s === 'plugin'
                  ? t('harness.agent.scopeBadge.plugin', { defaultValue: 'Plugin' })
                  : t(`harness.agent.scopeBadge.${s}`, {
                      defaultValue: s === 'project' ? 'Project' : 'Global',
                    })}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          data-testid="agent-create-cta"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('harness.agent.create.title', { defaultValue: 'New sub-agent' })}
        </button>
      </header>

      {malformed.length > 0 && (
        <MalformedBanner malformed={malformed} />
      )}

      {lintIssues.length > 0 && (
        <LintIssueList
          issues={lintIssues}
          onActivate={handleActivateLintIssue}
          onOpenRulePreferences={onOpenLintPreferences}
        />
      )}

      {error && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-900 dark:text-red-100">
          {error.message}
        </div>
      )}

      {isLoading && filteredCards.length === 0 && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-16 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {!isLoading && filteredCards.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-6 text-sm text-gray-600 dark:text-gray-400">
          <p className="font-medium text-gray-800 dark:text-gray-200">
            {t('harness.agent.empty.title', {
              defaultValue: 'No sub-agents configured.',
            })}
          </p>
          <p className="mt-1">
            {t('harness.agent.empty.description', {
              defaultValue:
                'Add an agent file under <projectRoot>/.claude/agents/ or your global ~/.claude/agents/ directory, or install a plugin bundle that ships agents.',
            })}
          </p>
        </div>
      )}

      {filteredCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredCards.map((card) => {
            const cardKey = `${card.scope}#${card.pluginKey ?? ''}#${card.projectSlug ?? ''}#${card.name}`;
            const actions = buildCopyActions(card, projectSlug);
            const occurrences = nameOccurrences.get(card.name) ?? [];
            const isShadowed = occurrences.length > 1 && occurrences[0] !== card.scope;
            return (
              <article
                key={cardKey}
                data-testid={`agent-card-${card.scope}-${card.name}`}
                data-shadowed={isShadowed ? 'true' : 'false'}
                className={
                  'rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex flex-col gap-2 ' +
                  (isShadowed ? 'opacity-70' : '')
                }
                title={
                  isShadowed
                    ? t('harness.agent.shadowedTooltip', {
                        defaultValue:
                          'A higher-priority agent with the same name is active.',
                      })
                    : undefined
                }
              >
                <header className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenCard(card)}
                    aria-label={t('harness.agent.cardOpen', {
                      name: card.name,
                      defaultValue: `Open ${card.name}`,
                    })}
                    className="flex items-center gap-2 min-w-0 text-left"
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLOR_HEX[card.color] }}
                      title={t(`harness.agent.color.${card.color}`, {
                        defaultValue: card.color,
                      })}
                    />
                    {card.scope === 'plugin' && (
                      <Lock className="w-3 h-3 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                    )}
                    <span className="font-mono text-sm font-semibold truncate text-gray-900 dark:text-gray-100">
                      {card.name}
                    </span>
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      aria-label={t('harness.agent.copy.menuLabel', {
                        defaultValue: 'Copy actions',
                      })}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenu(openMenu === cardKey ? null : cardKey);
                      }}
                      className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
                    >
                      ⋮
                    </button>
                    {openMenu === cardKey && (
                      <ul
                        role="menu"
                        className="absolute right-0 top-full mt-1 z-20 min-w-[200px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-md"
                      >
                        {actions.map((action) => (
                          <li key={action.key}>
                            <button
                              type="button"
                              onClick={() => handleStartCopy(action)}
                              data-testid={`agent-copy-action-${action.key}`}
                              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              {t(`harness.agent.copy.${action.key}.label`, {
                                defaultValue:
                                  action.key === 'toUser'
                                    ? 'Copy to global →'
                                    : action.key === 'toProject'
                                      ? 'Copy to project ←'
                                      : action.key === 'overrideToProject'
                                        ? 'Override-clone (project)'
                                        : 'Override-clone (global)',
                              })}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </header>

                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <ScopeBadge card={card} />
                  <CardShareBadge
                    projectSlug={projectSlug}
                    scope={card.scope}
                    relativePath={card.scope === 'project' ? `.claude/agents/${card.name}.md` : null}
                  />
                  <AgentLintMarker name={card.name} onActivate={handleActivateLintIssue} />
                  <span
                    className={
                      'px-1.5 py-0.5 rounded text-xs font-medium ' +
                      (card.model === 'opus'
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                        : card.model === 'sonnet'
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200'
                          : card.model === 'haiku'
                            ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200')
                    }
                  >
                    {card.model}
                  </span>
                  <ToolsBadge state={card.toolsState} count={card.tools.length} />
                </div>

                {card.description && (
                  <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">
                    {card.description.slice(0, 80)}
                    {card.description.length > 80 ? '…' : ''}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {openCard && (
        <AgentEditor
          card={openCard}
          projectSlug={projectSlug}
          onClose={() => setOpenCard(null)}
        />
      )}

      {pendingConflict && (
        <AgentCopyConflictDialog
          agentName={pendingConflict.action.request.sourceName}
          targetScope={pendingConflict.action.request.targetScope}
          errorMessage={pendingConflict.errorMessage}
          defaultRenameName={pendingConflict.action.request.sourceName}
          onSubmit={handleConflictSubmit}
          onClose={() => setPendingConflict(null)}
        />
      )}

      {showCreateModal && (
        <CreateAgentDialog
          onSubmit={handleCreateSubmit}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

function ScopeBadge({ card }: { card: HarnessAgentCard }) {
  const { t } = useTranslation('settings');
  const color =
    card.scope === 'project'
      ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200'
      : card.scope === 'user'
        ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200'
        : 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200';
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${color}`}>
      {card.scope === 'plugin'
        ? t('harness.agent.scopeBadge.pluginWithKey', {
            key: card.pluginKey,
            defaultValue: `Plugin: ${card.pluginKey}`,
          })
        : t(`harness.agent.scopeBadge.${card.scope}`, {
            defaultValue: card.scope === 'project' ? 'Project' : 'Global',
          })}
    </span>
  );
}

function ToolsBadge({
  state,
  count,
}: {
  state: HarnessAgentToolsState;
  count: number;
}) {
  const { t } = useTranslation('settings');
  if (state === 'omitted') {
    return (
      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
        {t('harness.agent.tools.omitted', { defaultValue: 'All allowed' })}
      </span>
    );
  }
  if (state === 'empty') {
    return (
      <span
        data-testid="agent-tools-empty"
        className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200"
      >
        {t('harness.agent.tools.empty', { defaultValue: 'Disabled' })}
      </span>
    );
  }
  return (
    <span
      data-testid="agent-tools-populated"
      className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200"
    >
      {t('harness.agent.tools.populated', {
        count,
        defaultValue: `${count} tools`,
      })}
    </span>
  );
}

function MalformedBanner({
  malformed,
}: {
  malformed: HarnessAgentMalformedEntry[];
}) {
  const { t } = useTranslation('settings');
  return (
    <div
      role="alert"
      data-testid="agent-malformed-banner"
      className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
    >
      <p className="font-medium">
        {t('harness.agent.malformed.title', {
          defaultValue: 'Some agent files were skipped:',
        })}
      </p>
      <ul className="mt-1 list-disc ml-5">
        {malformed.map((m, idx) => {
          const reasonKey = (() => {
            switch (m.reason) {
              case 'invalid-frontmatter':
                return 'invalidFrontmatter';
              case 'name-mismatch':
                return 'nameMismatch';
              case 'invalid-name-pattern':
                return 'invalidNamePattern';
              case 'invalid-model':
                return 'invalidModel';
              case 'invalid-color':
                return 'invalidColor';
              case 'nested-directory':
                return 'nestedDirectory';
              default:
                return 'invalidFrontmatter';
            }
          })();
          const stem = m.absoluteFile.replace(/.*[\\/]/, '').replace(/\.md$/, '');
          return (
            <li
              key={`${m.absoluteFile}#${idx}`}
              data-reason={m.reason}
              className="text-xs"
            >
              {t(`harness.agent.malformed.reason.${reasonKey}`, {
                name: stem,
                detail: m.detail ?? '',
                defaultValue: `${stem} — ${m.reason}${m.detail ? ` (${m.detail})` : ''}`,
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface CreateAgentInput {
  scope: 'project' | 'user';
  name: string;
  description: string;
  model: HarnessAgentModel;
  color: HarnessAgentColor;
  toolsState: HarnessAgentToolsState;
}

interface CreateDialogProps {
  onSubmit(input: CreateAgentInput): Promise<void>;
  onClose(): void;
}

const NAME_RE = /^[a-z][a-z0-9-]{1,48}[a-z0-9]$/;

function CreateAgentDialog({ onSubmit, onClose }: CreateDialogProps) {
  const { t } = useTranslation('settings');
  const [scope, setScope] = useState<'project' | 'user'>('project');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState<HarnessAgentModel>('inherit');
  const [color, setColor] = useState<HarnessAgentColor>('blue');
  const [toolsState, setToolsState] = useState<HarnessAgentToolsState>('omitted');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const COLORS: HarnessAgentColor[] = ['blue', 'cyan', 'green', 'yellow', 'magenta', 'red'];
  const MODELS: HarnessAgentModel[] = ['inherit', 'sonnet', 'opus', 'haiku'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('harness.agent.create.errors.nameRequired', {
        defaultValue: 'Name is required.',
      }));
      return;
    }
    if (!NAME_RE.test(name.trim())) {
      setError(t('harness.agent.create.errors.namePattern', {
        defaultValue:
          'Use 3–50 lowercase letters / digits / hyphens. Cannot start or end with hyphen.',
      }));
      return;
    }
    if (!description.trim()) {
      setError(t('harness.agent.create.errors.descriptionRequired', {
        defaultValue: 'Description is required.',
      }));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        scope,
        name: name.trim(),
        description: description.trim(),
        model,
        color,
        toolsState,
      });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else if (err instanceof Error) setError(err.message);
      else setError('Unknown error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('harness.agent.create.title', { defaultValue: 'New sub-agent' })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <form
        className="w-full max-w-md rounded-lg bg-white dark:bg-gray-900 p-5 shadow-lg flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('harness.agent.create.title', { defaultValue: 'New sub-agent' })}
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('harness.agent.create.scopeLabel', { defaultValue: 'Scope' })}</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'project' | 'user')}
            data-testid="agent-create-scope"
            className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800"
          >
            <option value="project">
              {t('harness.agent.create.scopeProject', { defaultValue: 'Project' })}
            </option>
            <option value="user">
              {t('harness.agent.create.scopeUser', { defaultValue: 'Global' })}
            </option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('harness.agent.create.nameLabel', { defaultValue: 'Name' })}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('harness.agent.create.namePlaceholder', {
              defaultValue: 'e.g. code-reviewer',
            })}
            data-testid="agent-create-name"
            className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800 font-mono text-xs"
            required
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t('harness.agent.create.nameHelp', {
              defaultValue:
                'Lowercase letters, digits, hyphens. 3–50 characters. Cannot start or end with a hyphen.',
            })}
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>
            {t('harness.agent.create.descriptionLabel', { defaultValue: 'Description' })}
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="agent-create-description"
            rows={4}
            className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800 text-xs font-mono"
            required
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t('harness.agent.create.descriptionHelp', {
              defaultValue:
                'Describe when this agent should be auto-selected. Including <example> blocks improves auto-selection quality.',
            })}
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('harness.agent.create.modelLabel', { defaultValue: 'Model' })}</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as HarnessAgentModel)}
            data-testid="agent-create-model"
            className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800"
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {t(`harness.agent.create.modelOptions.${m}`, { defaultValue: m })}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend>
            {t('harness.agent.create.colorLabel', { defaultValue: 'Color' })}
          </legend>
          <div role="radiogroup" data-testid="agent-create-color-picker" className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                data-color={c}
                title={t(`harness.agent.color.${c}`, { defaultValue: c })}
                onClick={() => setColor(c)}
                className={
                  'w-7 h-7 rounded-full border-2 transition-transform ' +
                  (color === c
                    ? 'border-gray-900 dark:border-gray-100 scale-110'
                    : 'border-transparent hover:scale-105')
                }
                style={{ backgroundColor: COLOR_HEX[c] }}
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend>
            {t('harness.agent.create.toolsLabel', { defaultValue: 'Tools' })}
          </legend>
          <div role="radiogroup" className="flex flex-col gap-1 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="agent-create-tools"
                value="omitted"
                checked={toolsState === 'omitted'}
                onChange={() => setToolsState('omitted')}
              />
              <span>
                {t('harness.agent.editor.toolsRadio.omitted', {
                  defaultValue: 'All allowed (key omitted)',
                })}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="agent-create-tools"
                value="empty"
                checked={toolsState === 'empty'}
                onChange={() => setToolsState('empty')}
              />
              <span>
                {t('harness.agent.editor.toolsRadio.empty', {
                  defaultValue: 'Disabled (empty array)',
                })}
              </span>
            </label>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('harness.agent.create.toolsHelp', {
              defaultValue:
                'Use the editor after creation to switch to a custom allow-list.',
            })}
          </span>
        </fieldset>
        {error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('harness.agent.create.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="agent-create-submit"
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t('harness.agent.create.submit', { defaultValue: 'Create' })}
          </button>
        </div>
      </form>
    </div>
  );
}
