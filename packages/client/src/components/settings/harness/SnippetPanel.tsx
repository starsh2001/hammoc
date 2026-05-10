/**
 * Story 29.2: Snippet & favorites management panel inside the Harness Workbench.
 *
 * One sub-panel hosts two distinct sections — `%snippet%` (Hammoc-native) on
 * top and `/slash` favorites (Claude Code) below. Each section gets a
 * `SystemBadge` so the data-path / lifecycle distinction is visible at a
 * glance:
 *
 *   ┌─ Snippets (Hammoc) ─────────────────┐
 *   │  + new snippet · scope filter       │
 *   │  [card grid: project / user / bundled] │
 *   └────────────────────────────────────┘
 *   ┌─ Command Favorites (Claude Code) ──┐
 *   │  drag-reorder list of favorites    │
 *   │  + add modal                       │
 *   └────────────────────────────────────┘
 *
 * Editing of snippet bodies opens `SnippetEditor` (modal). Copy actions live
 * on the per-card kebab menu and show `SnippetCopyConflictDialog` on collision.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, GripVertical, HelpCircle, Plus, Star } from 'lucide-react';
import type {
  SnippetCard,
  SnippetCopyRequest,
} from '@hammoc/shared';
import { ApiError } from '../../../services/api/client';
import { useSnippetStore } from '../../../stores/snippetStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useFavoriteCommands } from '../../../hooks/useFavoriteCommands';
import { useSlashCommands } from '../../../hooks/useSlashCommands';
import { SystemBadge } from './SystemBadge';
import { SnippetEditor } from './SnippetEditor';
import { SnippetCopyConflictDialog } from './SnippetCopyConflictDialog';
import { ScopePill, SNIPPET_NAME_RE } from './snippetShared';
import { CardShareBadge } from './CardShareBadge';

interface Props {
  projectSlug: string;
}

const SCOPE_FILTERS = ['all', 'project', 'user', 'bundled'] as const;
type ScopeFilter = (typeof SCOPE_FILTERS)[number];

const MAX_FAVORITES = 20;

interface PendingCopy {
  source: SnippetCard;
  targetScope: 'project' | 'user';
  errorMessage?: string;
}

export function SnippetPanel({ projectSlug }: Props) {
  const { t } = useTranslation('settings');

  // Resolve the project's filesystem root for the broadcast headers — the
  // server uses it to recompute the snippet list it broadcasts. When the
  // project is not in the cache the panel still works, but other-tab sync
  // (Phase 2) won't fire.
  const workingDirectory = useProjectStore(
    (s) => s.projects.find((p) => p.projectSlug === projectSlug)?.originalPath,
  );

  const cards = useSnippetStore((s) => s.cards);
  const isLoading = useSnippetStore((s) => s.isLoading);
  const error = useSnippetStore((s) => s.error);
  const load = useSnippetStore((s) => s.load);
  const create = useSnippetStore((s) => s.create);
  const copy = useSnippetStore((s) => s.copy);

  const [openCard, setOpenCard] = useState<SnippetCard | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [pendingCopy, setPendingCopy] = useState<PendingCopy | null>(null);

  useEffect(() => {
    void load(projectSlug);
  }, [load, projectSlug]);

  const filteredCards = useMemo(
    () => (scopeFilter === 'all' ? cards : cards.filter((c) => c.scope === scopeFilter)),
    [cards, scopeFilter],
  );

  const handleStartCopy = (source: SnippetCard, targetScope: 'project' | 'user') => {
    setOpenMenu(null);
    void runCopy({
      sourceScope: source.scope,
      sourceName: source.name,
      sourceProjectSlug: source.scope === 'project' ? projectSlug : undefined,
      targetScope,
      targetProjectSlug: targetScope === 'project' ? projectSlug : undefined,
    }, source);
  };

  const runCopy = async (
    req: SnippetCopyRequest,
    source: SnippetCard,
    onConflict?: 'overwrite' | 'rename',
    renameName?: string,
  ) => {
    try {
      await copy(
        {
          ...req,
          ...(onConflict ? { onConflict } : {}),
          ...(renameName ? { targetName: renameName } : {}),
        },
        workingDirectory,
      );
      setPendingCopy(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'HARNESS_FILE_EXISTS') {
          setPendingCopy({
            source,
            targetScope: req.targetScope,
            errorMessage: err.message,
          });
          return;
        }
        // For other errors, surface in store-level error display.
      }
    }
  };

  const handleConflictSubmit = (
    choice: 'overwrite' | 'abort' | 'rename',
    renameName?: string,
  ) => {
    if (!pendingCopy) return;
    if (choice === 'abort') {
      setPendingCopy(null);
      return;
    }
    void runCopy(
      {
        sourceScope: pendingCopy.source.scope,
        sourceName: pendingCopy.source.name,
        sourceProjectSlug:
          pendingCopy.source.scope === 'project' ? projectSlug : undefined,
        targetScope: pendingCopy.targetScope,
        targetProjectSlug:
          pendingCopy.targetScope === 'project' ? projectSlug : undefined,
      },
      pendingCopy.source,
      choice,
      renameName,
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ─────────── Snippets section (Hammoc-native) ─────────── */}
      <section className="flex flex-col gap-3" data-testid="snippets-section">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <SystemBadge variant="hammoc" />
            <span
              title={t('harness.snippets.systemBadge.hammoc.help', {
                defaultValue:
                  'Hammoc-native asset. Stored under <projectRoot>/.hammoc/snippets/, ~/.hammoc/snippets/, or the server bundle, and substituted as %name% in chat input. Claude Code CLI does NOT recognize these files.',
              })}
              className="inline-flex items-center text-gray-500 dark:text-gray-400 cursor-help"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('harness.snippets.sections.snippets', { defaultValue: 'Snippets' })}
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div role="tablist" className="flex items-center gap-1">
              {SCOPE_FILTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={scopeFilter === s}
                  data-testid={`snippet-filter-${s}`}
                  onClick={() => setScopeFilter(s)}
                  className={
                    'px-2 py-0.5 text-xs rounded-full ' +
                    (scopeFilter === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200')
                  }
                >
                  {s === 'all'
                    ? t('harness.snippets.filter.all', { defaultValue: 'All' })
                    : t(`harness.snippets.scope.${s}`, {
                        defaultValue: s === 'project' ? 'Project' : s === 'user' ? 'Global' : 'Bundled',
                      })}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              data-testid="snippet-create-cta"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('harness.snippets.create.cta', { defaultValue: 'New snippet' })}
            </button>
          </div>
        </header>

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
          <div
            data-testid="snippets-empty-state"
            className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-6 text-sm text-gray-600 dark:text-gray-400"
          >
            <p className="font-medium text-gray-800 dark:text-gray-200">
              {t('harness.snippets.empty.title', { defaultValue: 'No snippets configured.' })}
            </p>
            <p className="mt-1">
              {t('harness.snippets.empty.description', {
                defaultValue:
                  'Create a snippet to expand %name% references in chat input.',
              })}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('harness.snippets.create.cta', { defaultValue: 'New snippet' })}
              </button>
            </div>
          </div>
        )}

        {filteredCards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredCards.map((card) => {
              const cardKey = `${card.scope}#${card.name}`;
              const copyTargets: Array<'project' | 'user'> = [];
              if (card.scope === 'project') copyTargets.push('user');
              else if (card.scope === 'user') copyTargets.push('project');
              else {
                copyTargets.push('project', 'user');
              }
              return (
                <article
                  key={cardKey}
                  data-testid={`snippet-card-${card.scope}-${card.name}`}
                  className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex flex-col gap-2"
                >
                  <header className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenCard(card)}
                      data-testid={`snippet-card-open-${card.scope}-${card.name}`}
                      aria-label={t('harness.snippets.cardOpen', {
                        name: card.name,
                        defaultValue: `Open ${card.name}`,
                      })}
                      className="flex items-center gap-2 min-w-0 text-left"
                    >
                      <span className="font-mono text-sm font-semibold truncate text-gray-900 dark:text-gray-100">
                        {card.name}
                      </span>
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        aria-label={t('harness.snippets.copy.menuLabel', {
                          defaultValue: 'Copy actions',
                        })}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenu(openMenu === cardKey ? null : cardKey);
                        }}
                        className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
                      >
                        ⋯
                      </button>
                      {openMenu === cardKey && (
                        <ul
                          role="menu"
                          className="absolute right-0 top-full mt-1 z-20 min-w-[200px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-md"
                        >
                          {copyTargets.map((target) => (
                            <li key={target}>
                              <button
                                type="button"
                                data-testid={`snippet-copy-action-${card.scope}-${card.name}-${target}`}
                                onClick={() => handleStartCopy(card, target)}
                                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
                              >
                                {target === 'user'
                                  ? t('harness.snippets.copy.toUser', {
                                      defaultValue:
                                        card.scope === 'bundled'
                                          ? 'Clone to global'
                                          : 'Copy to global →',
                                    })
                                  : t('harness.snippets.copy.toProject', {
                                      defaultValue:
                                        card.scope === 'bundled'
                                          ? 'Clone to project'
                                          : 'Copy to project ←',
                                    })}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </header>

                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <ScopePill scope={card.scope} />
                    <CardShareBadge
                      projectSlug={projectSlug}
                      scope={card.scope === 'project' ? 'project' : 'user'}
                      relativePath={card.scope === 'project' ? `.claude/snippets/${card.name}.md` : null}
                    />
                    {card.scope === 'bundled' && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        {t('harness.snippets.readOnly', { defaultValue: 'read-only' })}
                      </span>
                    )}
                  </div>

                  {card.preview && (
                    <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">
                      {card.preview}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ─────────── Favorites section (Claude Code) ─────────── */}
      <FavoritesSection projectSlug={projectSlug} />

      {openCard && (
        <SnippetEditor
          card={openCard}
          projectSlug={projectSlug}
          workingDirectory={workingDirectory}
          onClose={() => setOpenCard(null)}
        />
      )}

      {pendingCopy && (
        <SnippetCopyConflictDialog
          snippetName={pendingCopy.source.name}
          targetScope={pendingCopy.targetScope}
          errorMessage={pendingCopy.errorMessage}
          defaultRenameName={pendingCopy.source.name}
          onSubmit={handleConflictSubmit}
          onClose={() => setPendingCopy(null)}
        />
      )}

      {showCreate && (
        <CreateSnippetDialog
          existingNames={cards.map((c) => c.name)}
          onSubmit={async (input) => {
            await create({
              scope: input.scope,
              projectSlug: input.scope === 'project' ? projectSlug : undefined,
              name: input.name,
              content: input.content,
              workingDirectory,
            });
            setShowCreate(false);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Favorites section
// ---------------------------------------------------------------------------

function FavoritesSection({ projectSlug }: { projectSlug: string }) {
  const { t } = useTranslation('settings');
  const { favoriteCommands, addFavorite, removeFavorite, reorderFavorites, isFavorite } =
    useFavoriteCommands();
  const { commands } = useSlashCommands(projectSlug);
  const [showAdd, setShowAdd] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const next = [...favoriteCommands];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    reorderFavorites(next);
    setDragIdx(null);
  };

  const handleMove = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= favoriteCommands.length) return;
    const next = [...favoriteCommands];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    reorderFavorites(next);
  };

  return (
    <section className="flex flex-col gap-3" data-testid="favorites-section">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <SystemBadge variant="claudeCode" />
          <span
            title={t('harness.snippets.systemBadge.claudeCode.help', {
              defaultValue:
                'Stores starring + ordering metadata for Claude Code /slash commands at ~/.hammoc/preferences.json. Edit the underlying command bodies under Slash commands (Story 28.5).',
            })}
            className="inline-flex items-center text-gray-500 dark:text-gray-400 cursor-help"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t('harness.snippets.sections.favorites', { defaultValue: 'Command favorites' })}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          disabled={favoriteCommands.length >= MAX_FAVORITES}
          data-testid="favorites-add-cta"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Star className="w-3.5 h-3.5" />
          {t('harness.snippets.favorites.addCta', { defaultValue: 'Add favorite' })}
        </button>
      </header>

      {favoriteCommands.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-400">
          {t('harness.snippets.favorites.empty', {
            defaultValue:
              'No favorites yet — pick frequently used /slash commands to surface them in the chip bar above the chat input.',
          })}
        </div>
      ) : (
        <ul role="list" className="flex flex-col gap-1.5">
          {favoriteCommands.map((entry, idx) => {
            const cmd = commands.find((c) => c.command === entry.command);
            const valid = Boolean(cmd);
            return (
              <li
                key={`${entry.command}#${entry.scope ?? 'project'}`}
                data-testid={`favorite-row-${idx}`}
                draggable
                role="button"
                tabIndex={0}
                aria-keyshortcuts="ArrowUp ArrowDown"
                aria-label={t('harness.snippets.favorites.rowAria', {
                  command: cmd?.name ?? entry.command,
                  index: idx + 1,
                  total: favoriteCommands.length,
                  defaultValue: `Favorite ${cmd?.name ?? entry.command}, position ${idx + 1} of ${favoriteCommands.length}. Use Arrow Up or Arrow Down to reorder.`,
                })}
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => setDragIdx(null)}
                onKeyDown={(e) => {
                  // Plain ArrowUp/ArrowDown reorders the row; modifiers reserved
                  // so the keyboard shortcut never collides with focus traversal.
                  if (e.key === 'ArrowUp' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    handleMove(idx, -1);
                  } else if (e.key === 'ArrowDown' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    handleMove(idx, 1);
                  }
                }}
                className={
                  'flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
                  (dragIdx === idx ? 'opacity-50' : '')
                }
              >
                <span
                  aria-label={t('harness.snippets.favorites.dragHandle', { defaultValue: 'Drag to reorder' })}
                  className="cursor-grab text-gray-400"
                >
                  <GripVertical className="w-4 h-4" />
                </span>
                <span className="font-mono text-xs truncate flex-1 min-w-0">
                  {cmd?.name ?? entry.command}
                </span>
                <span
                  className={
                    'px-1.5 py-0.5 rounded text-xs font-medium ' +
                    (entry.scope === 'global'
                      ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200'
                      : 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200')
                  }
                >
                  {entry.scope === 'global'
                    ? t('harness.snippets.scope.user', { defaultValue: 'Global' })
                    : t('harness.snippets.scope.project', { defaultValue: 'Project' })}
                </span>
                {!valid && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="w-3 h-3" />
                    {t('harness.snippets.favorites.notFound', { defaultValue: 'Not found' })}
                  </span>
                )}
                <span className="flex sm:hidden gap-1">
                  <button
                    type="button"
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0}
                    aria-label={t('harness.snippets.favorites.moveUp', { defaultValue: 'Move up' })}
                    className="p-1 text-gray-500 disabled:opacity-50"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === favoriteCommands.length - 1}
                    aria-label={t('harness.snippets.favorites.moveDown', { defaultValue: 'Move down' })}
                    className="p-1 text-gray-500 disabled:opacity-50"
                  >
                    ↓
                  </button>
                </span>
                <button
                  type="button"
                  data-testid={`favorite-remove-${idx}`}
                  onClick={() => removeFavorite(entry)}
                  aria-label={t('harness.snippets.favorites.remove', {
                    defaultValue: 'Remove favorite',
                  })}
                  className="px-1.5 py-0.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showAdd && (
        <AddFavoriteDialog
          candidates={commands.filter((c) => !isFavorite(c.command))}
          onSubmit={(commandStr) => {
            if (favoriteCommands.length >= MAX_FAVORITES) return;
            addFavorite(commandStr, 'project');
            setShowAdd(false);
          }}
          onClose={() => setShowAdd(false)}
          maxReached={favoriteCommands.length >= MAX_FAVORITES}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

interface CreateSnippetInput {
  scope: 'project' | 'user';
  name: string;
  content: string;
}

interface CreateDialogProps {
  existingNames: string[];
  onSubmit(input: CreateSnippetInput): Promise<void>;
  onClose(): void;
}

function CreateSnippetDialog({ existingNames, onSubmit, onClose }: CreateDialogProps) {
  const { t } = useTranslation('settings');
  const [scope, setScope] = useState<'project' | 'user'>('project');
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(
        t('harness.snippets.create.errors.nameRequired', {
          defaultValue: 'Name is required.',
        }),
      );
      return;
    }
    if (!SNIPPET_NAME_RE.test(trimmed) || trimmed === '..' || trimmed === '.') {
      setError(
        t('harness.snippets.create.errors.namePattern', {
          defaultValue:
            'Use letters, digits, dots, underscores, and hyphens only.',
        }),
      );
      return;
    }
    if (existingNames.includes(trimmed)) {
      setError(
        t('harness.snippets.create.errors.nameTaken', {
          defaultValue: 'A snippet with this name already exists.',
        }),
      );
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({ scope, name: trimmed, content });
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
      aria-label={t('harness.snippets.create.title', { defaultValue: 'New snippet' })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      data-testid="snippet-create-dialog"
    >
      <form
        className="w-full max-w-md rounded-lg bg-white dark:bg-gray-900 p-5 shadow-lg flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('harness.snippets.create.title', { defaultValue: 'New snippet' })}
        </h2>

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('harness.snippets.create.scopeLabel', { defaultValue: 'Scope' })}</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'project' | 'user')}
            data-testid="snippet-create-scope"
            className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800"
          >
            <option value="project">
              {t('harness.snippets.scope.project', { defaultValue: 'Project' })}
            </option>
            <option value="user">
              {t('harness.snippets.scope.user', { defaultValue: 'Global' })}
            </option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>{t('harness.snippets.create.nameLabel', { defaultValue: 'Name' })}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="snippet-create-name"
            className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800 font-mono text-xs"
            placeholder="commit-and-done"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>
            {t('harness.snippets.create.contentLabel', { defaultValue: 'Body (optional)' })}
          </span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            data-testid="snippet-create-content"
            rows={5}
            className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800 text-xs font-mono"
          />
        </label>

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
            {t('common.close', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="snippet-create-submit"
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t('harness.snippets.create.submit', { defaultValue: 'Create' })}
          </button>
        </div>
      </form>
    </div>
  );
}

interface AddFavoriteDialogProps {
  candidates: import('@hammoc/shared').SlashCommand[];
  maxReached: boolean;
  onSubmit(commandStr: string): void;
  onClose(): void;
}

function AddFavoriteDialog({ candidates, maxReached, onSubmit, onClose }: AddFavoriteDialogProps) {
  const { t } = useTranslation('settings');
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('harness.snippets.favorites.addTitle', {
        defaultValue: 'Add favorite slash command',
      })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      data-testid="favorites-add-dialog"
    >
      <div
        className="w-full max-w-md max-h-[70vh] overflow-y-auto rounded-lg bg-white dark:bg-gray-900 p-5 shadow-lg flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('harness.snippets.favorites.addTitle', { defaultValue: 'Add favorite' })}
        </h2>
        {maxReached && (
          <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
            {t('harness.snippets.favorites.maxReached', {
              max: MAX_FAVORITES,
              defaultValue: `You can star at most ${MAX_FAVORITES} commands. Remove one to add another.`,
            })}
          </p>
        )}
        {candidates.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('harness.snippets.favorites.noCandidates', {
              defaultValue: 'No more commands available — every visible /slash command is already starred.',
            })}
          </p>
        ) : (
          <ul role="list" className="flex flex-col gap-1">
            {candidates.map((cmd) => (
              <li key={cmd.command}>
                <button
                  type="button"
                  data-testid={`favorite-add-${cmd.command}`}
                  onClick={() => onSubmit(cmd.command)}
                  disabled={maxReached}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  <span className="font-mono text-xs">{cmd.name}</span>
                  {cmd.description && (
                    <span className="block text-xs text-gray-600 dark:text-gray-400">
                      {cmd.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('common.close', { defaultValue: 'Close' })}
          </button>
        </div>
      </div>
    </div>
  );
}
