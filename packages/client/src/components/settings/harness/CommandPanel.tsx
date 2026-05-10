/**
 * Story 28.5: Slash command list panel inside "Harness Workbench → Commands".
 *
 * Layout: a single tree of `.claude/commands/**\/*.md` files merged across
 * project / global / plugin scopes. Internal nodes are directories (collapsible
 * + carry directory-level copy actions); leaf nodes are individual `.md` files
 * (open the editor on click + carry per-file copy actions).
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, FolderOpen, Lock, Plus } from 'lucide-react';
import type {
  HarnessCommandCard,
  HarnessCommandCopyRequest,
  HarnessCommandSourceScope,
} from '@hammoc/shared';
import { useHarnessCommandStore } from '../../../stores/harnessCommandStore';
import { ApiError } from '../../../services/api/client';
import {
  copyCommandDirectory,
  createCommand,
} from '../../../services/api/harnessCommandsApi';
import { getSocket } from '../../../services/socket';
import { CommandEditor } from './CommandEditor';
import { CommandCopyConflictDialog } from './CommandCopyConflictDialog';
import { CommandDirectoryCopyDialog } from './CommandDirectoryCopyDialog';
import { CardShareBadge } from './CardShareBadge';

interface Props {
  projectSlug: string;
}

interface CopyAction {
  key: 'toUser' | 'toProject' | 'overrideToProject' | 'overrideToUser';
  request: Omit<HarnessCommandCopyRequest, 'onConflict' | 'acknowledgedSecret'>;
  hasSecret: boolean;
  raw: string | null;
}

const ENV_REF_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/g;
const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]{16,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /[A-Za-z0-9+/=]{32,}/,
];

function detectSecretsInDescription(card: HarnessCommandCard): boolean {
  // Conservative client-side hint — the canonical detection happens server-side
  // and walks the full body. Here we only inspect the frontmatter description
  // to keep the menu's `hasSecret` flag in sync with what the user can see.
  const text = card.frontmatter.description ?? '';
  if (!text) return false;
  const stripped = text.replace(ENV_REF_RE, '');
  return SECRET_PATTERNS.some((re) => re.test(stripped));
}

function buildCopyActions(card: HarnessCommandCard, projectSlug: string): CopyAction[] {
  const actions: CopyAction[] = [];
  const hasSecret = detectSecretsInDescription(card);
  const raw = null;
  const baseRequest = { sourceRelativePath: card.relativePath };
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
      raw,
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
      raw,
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
      raw,
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
      raw,
    });
  }
  return actions;
}

interface TreeNode {
  type: 'dir' | 'file';
  name: string;
  fullPath: string; // posix path under commands root for project/user, may collide across scopes — keyed below.
  children?: TreeNode[];
  card?: HarnessCommandCard;
}

interface ScopedTree {
  scope: HarnessCommandSourceScope;
  pluginKey?: string;
  projectSlug?: string;
  root: TreeNode;
  cards: HarnessCommandCard[];
}

function buildTrees(cards: HarnessCommandCard[]): ScopedTree[] {
  const buckets = new Map<string, ScopedTree>();
  for (const card of cards) {
    const key = `${card.scope}#${card.pluginKey ?? ''}#${card.projectSlug ?? ''}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        scope: card.scope,
        pluginKey: card.pluginKey,
        projectSlug: card.projectSlug,
        root: { type: 'dir', name: '', fullPath: '', children: [] },
        cards: [],
      };
      buckets.set(key, bucket);
    }
    bucket.cards.push(card);
    const segments = card.relativePath.split('/');
    let cursor = bucket.root;
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      const childPath = segments.slice(0, i + 1).join('/');
      if (isLast) {
        cursor.children!.push({ type: 'file', name: seg, fullPath: childPath, card });
        continue;
      }
      let dir = cursor.children!.find((c) => c.type === 'dir' && c.name === seg);
      if (!dir) {
        dir = { type: 'dir', name: seg, fullPath: childPath, children: [] };
        cursor.children!.push(dir);
      }
      cursor = dir;
    }
  }
  return Array.from(buckets.values());
}

export function CommandPanel({ projectSlug }: Props) {
  const { t } = useTranslation('settings');

  const cards = useHarnessCommandStore((s) => s.cards);
  const malformed = useHarnessCommandStore((s) => s.malformed);
  const paletteVisibleCount = useHarnessCommandStore((s) => s.paletteVisibleCount);
  const isLoading = useHarnessCommandStore((s) => s.isLoading);
  const error = useHarnessCommandStore((s) => s.error);
  const load = useHarnessCommandStore((s) => s.load);
  const copy = useHarnessCommandStore((s) => s.copy);
  const handleExternalChange = useHarnessCommandStore((s) => s.handleExternalChange);
  const notifyChanged = useHarnessCommandStore((s) => s.notifySlashCommandsChanged);

  const [openCard, setOpenCard] = useState<HarnessCommandCard | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [pendingCopy, setPendingCopy] = useState<CopyAction | null>(null);
  const [pendingConflict, setPendingConflict] = useState<{ action: CopyAction; errorMessage?: string } | null>(null);
  const [pendingDirCopy, setPendingDirCopy] = useState<{
    sourceScope: HarnessCommandSourceScope;
    sourcePluginKey?: string;
    sourceProjectSlug?: string;
    sourceDirectoryPath: string;
    cardCount: number;
    targetScope: 'project' | 'user';
    conflicts: string[];
  } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  const trees = useMemo(() => buildTrees(cards), [cards]);

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleStartCopy = (action: CopyAction) => {
    setOpenMenu(null);
    if (action.hasSecret) {
      // Server will ultimately enforce — first attempt without ack so we can route to a
      // dedicated dialog if it returns 403. To keep UX consistent with hooks (single
      // confirmation), forward straight to the conflict dialog with ack=true; the server
      // returns secret-not-acknowledged when needed which we surface as an inline error.
      setPendingConflict({ action });
      return;
    }
    void runCopy(action, 'overwrite', undefined, false);
  };

  const runCopy = async (
    action: CopyAction,
    onConflict: 'overwrite' | 'skip' | 'rename',
    renamePath: string | undefined,
    acknowledgedSecret: boolean,
  ) => {
    try {
      await copy({
        ...action.request,
        ...(renamePath ? { targetRelativePath: renamePath } : {}),
        onConflict,
        acknowledgedSecret,
      } as HarnessCommandCopyRequest);
      setPendingCopy(null);
      setPendingConflict(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'HARNESS_FORBIDDEN' && (err.details as { cause?: string })?.cause === 'secret-not-acknowledged') {
          // Re-open conflict dialog with secret ack now required.
          setPendingConflict({ action: { ...action, hasSecret: true }, errorMessage: t('harness.command.copy.secret.intro', { defaultValue: 'Sensitive content detected — click Continue to acknowledge.' }) });
          return;
        }
        if (err.code === 'HARNESS_COMMAND_NAME_CONFLICT') {
          setPendingConflict({ action, errorMessage: err.message });
          return;
        }
        setPendingConflict((s) => (s ? { ...s, errorMessage: err.message } : s));
      }
    }
  };

  const handleConflictSubmit = (
    choice: 'overwrite' | 'skip' | 'rename',
    renamePath?: string,
  ) => {
    if (!pendingConflict) return;
    void runCopy(pendingConflict.action, choice, renamePath, pendingConflict.action.hasSecret);
  };

  const handleDirectoryCopy = (
    scope: HarnessCommandSourceScope,
    sourcePluginKey: string | undefined,
    sourceProjectSlug: string | undefined,
    sourceDirectoryPath: string,
    cardCount: number,
  ) => {
    setOpenMenu(null);
    setPendingDirCopy({
      sourceScope: scope,
      sourcePluginKey,
      sourceProjectSlug,
      sourceDirectoryPath,
      cardCount,
      targetScope: scope === 'project' ? 'user' : 'project',
      conflicts: [],
    });
  };

  const handleDirectoryCopySubmit = async (
    onConflict: 'overwrite-all' | 'skip-all' | 'per-file',
    perFileChoices?: Record<string, 'overwrite' | 'skip' | 'rename'>,
    perFileRenames?: Record<string, string>,
  ) => {
    if (!pendingDirCopy) return;
    try {
      await copyCommandDirectory({
        sourceScope: pendingDirCopy.sourceScope,
        sourcePluginKey: pendingDirCopy.sourcePluginKey,
        sourceProjectSlug: pendingDirCopy.sourceProjectSlug,
        sourceDirectoryPath: pendingDirCopy.sourceDirectoryPath,
        targetScope: pendingDirCopy.targetScope,
        targetProjectSlug: pendingDirCopy.targetScope === 'project' ? projectSlug : undefined,
        onConflict,
        perFileChoices,
        perFileRenames,
        acknowledgedSecret: true,
      });
      notifyChanged();
      await load(projectSlug);
      setPendingDirCopy(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'HARNESS_COMMAND_NAME_CONFLICT') {
        const conflicts = (err.details as { conflicts?: string[] })?.conflicts ?? [];
        setPendingDirCopy((prev) => (prev ? { ...prev, conflicts } : prev));
      }
    }
  };

  const handleCreateSubmit = async (input: {
    scope: 'project' | 'user';
    directoryPath: string;
    fileName: string;
  }) => {
    const directoryPart = input.directoryPath.replace(/^\/+|\/+$/g, '');
    const fileNameWithExt = input.fileName.endsWith('.md') ? input.fileName : `${input.fileName}.md`;
    const relativePath = directoryPart ? `${directoryPart}/${fileNameWithExt}` : fileNameWithExt;
    try {
      await createCommand({
        scope: input.scope,
        projectSlug: input.scope === 'project' ? projectSlug : undefined,
        relativePath,
        body: '',
      });
      notifyChanged();
      await load(projectSlug);
      setShowCreateModal(false);
    } catch (err) {
      // surface inline (the modal owns the error state)
      throw err;
    }
  };

  const renderTree = (tree: ScopedTree) => {
    const scopeKey = `${tree.scope}#${tree.pluginKey ?? ''}#${tree.projectSlug ?? ''}`;
    return (
      <section key={scopeKey} className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <header className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span
              className={
                'inline-flex rounded px-1.5 py-0.5 text-xs font-medium ' +
                (tree.scope === 'project'
                  ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200'
                  : tree.scope === 'user'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200'
                    : 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200')
              }
            >
              {tree.scope === 'plugin'
                ? t('harness.command.scopeBadge.pluginWithKey', {
                    key: tree.pluginKey,
                    defaultValue: `Plugin: ${tree.pluginKey}`,
                  })
                : t(`harness.command.scopeBadge.${tree.scope}`, {
                    defaultValue: tree.scope === 'project' ? 'Project' : 'Global',
                  })}
            </span>
            <span className="text-xs text-gray-500">{tree.cards.length}</span>
          </div>
        </header>
        <ul className="px-3 pb-3 space-y-1" role="tree">
          {(tree.root.children ?? []).map((node) => renderNode(node, tree, scopeKey, 0))}
        </ul>
      </section>
    );
  };

  const renderNode = (node: TreeNode, tree: ScopedTree, parentKey: string, depth: number): JSX.Element => {
    const key = `${parentKey}::${node.fullPath}`;
    const indent = { paddingLeft: `${depth * 12}px` };
    if (node.type === 'dir') {
      const isCollapsed = collapsed.has(key);
      const cardCount = countLeaves(node);
      const dirEditableTarget: 'project' | 'user' = tree.scope === 'project' ? 'user' : 'project';
      return (
        <li key={key} role="treeitem" aria-expanded={!isCollapsed}>
          <div style={indent} className="flex items-center justify-between gap-2 py-0.5">
            <button
              type="button"
              onClick={() => toggleCollapse(key)}
              className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-200 hover:text-blue-700 dark:hover:text-blue-300"
            >
              {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <FolderOpen className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span className="font-mono">{node.name}</span>
              <span className="text-gray-500">{cardCount}</span>
            </button>
            {tree.scope !== 'plugin' || true /* plugin dirs also overrideable */ ? (
              <button
                type="button"
                onClick={() =>
                  handleDirectoryCopy(
                    tree.scope,
                    tree.pluginKey,
                    tree.projectSlug,
                    node.fullPath,
                    cardCount,
                  )
                }
                aria-label={t('harness.command.copy.directory.title', {
                  defaultValue: 'Copy entire directory',
                })}
                className="text-xs px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30"
              >
                ⇒ {dirEditableTarget}
              </button>
            ) : null}
          </div>
          {!isCollapsed && (
            <ul className="space-y-0.5">
              {(node.children ?? []).map((child) => renderNode(child, tree, parentKey, depth + 1))}
            </ul>
          )}
        </li>
      );
    }
    const card = node.card!;
    const actions = buildCopyActions(card, projectSlug);
    return (
      <li key={key} role="treeitem">
        <div style={indent} className="flex items-center justify-between gap-2 py-1">
          <button
            type="button"
            onClick={() => setOpenCard(card)}
            data-testid={`cmd-card-${card.scope}-${card.relativePath}`}
            aria-label={t('harness.command.cardOpen', {
              slashName: card.slashName,
              defaultValue: `Open ${card.slashName}`,
            })}
            className="flex items-center gap-2 min-w-0 text-left text-sm hover:text-blue-700 dark:hover:text-blue-300"
          >
            {card.isBmadMirror && (
              <Lock
                className="w-3 h-3 text-amber-600 dark:text-amber-400 flex-shrink-0"
                aria-hidden="true"
              />
            )}
            <span className="font-mono truncate">{card.slashName}</span>
            {card.frontmatter.model && (
              <span className="text-xs px-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                {card.frontmatter.model}
              </span>
            )}
            <CardShareBadge
              projectSlug={projectSlug}
              scope={card.scope}
              relativePath={card.scope === 'project' ? `.claude/commands/${card.relativePath}` : null}
            />
          </button>
          <div className="flex items-center gap-1">
            {(card.tokens.usesPositionalArgs || card.tokens.usesArgumentsAll) && (
              <span title={t('harness.command.tokens.args', { defaultValue: 'args' })} className="text-xs px-1 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">args</span>
            )}
            {card.tokens.usesFileRefs && (
              <span title={t('harness.command.tokens.fileRefs', { defaultValue: '@path' })} className="text-xs px-1 rounded bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-200">@</span>
            )}
            {card.tokens.usesBashExec && (
              <span title={t('harness.command.tokens.bashExec', { defaultValue: '!cmd' })} className="text-xs px-1 rounded bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-200">!cmd</span>
            )}
            <div className="relative">
              <button
                type="button"
                aria-label={t('harness.command.copy.menuLabel', { defaultValue: 'Copy actions' })}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenu(openMenu === key ? null : key);
                }}
                className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
              >
                ⋮
              </button>
              {openMenu === key && (
                <ul
                  role="menu"
                  className="absolute right-0 top-full mt-1 z-20 min-w-[200px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-md"
                >
                  {actions.map((action) => (
                    <li key={action.key}>
                      <button
                        type="button"
                        onClick={() => handleStartCopy(action)}
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        {t(`harness.command.copy.${action.key}.label`, {
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
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            data-testid="cmd-palette-count"
            className="text-xs text-gray-700 dark:text-gray-200"
          >
            {t('harness.command.banner.paletteCount', {
              count: paletteVisibleCount,
              defaultValue: `${paletteVisibleCount} commands available in the chat / palette.`,
            })}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('harness.command.create.title', { defaultValue: 'New slash command' })}
        </button>
      </header>

      {malformed.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">{t('harness.command.malformed.title', { defaultValue: 'Some commands were skipped due to invalid frontmatter:' })}</p>
          <ul className="mt-1 list-disc ml-5">
            {malformed.map((m, idx) => (
              <li key={`${m.absoluteFile}#${idx}`} className="text-xs">
                <code className="font-mono">{m.absoluteFile}</code> — {m.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-900 dark:text-red-100">
          {error.message}
        </div>
      )}

      {isLoading && trees.length === 0 && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-12 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {!isLoading && trees.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-6 text-sm text-gray-600 dark:text-gray-400">
          <p className="font-medium text-gray-800 dark:text-gray-200">
            {t('harness.command.empty.title', { defaultValue: 'No slash commands configured.' })}
          </p>
          <p className="mt-1">
            {t('harness.command.empty.description', {
              defaultValue:
                'Add a command file under <projectRoot>/.claude/commands/ or your global ~/.claude/commands/ directory, or install a plugin bundle that ships commands.',
            })}
          </p>
        </div>
      )}

      {trees.map((tree) => renderTree(tree))}

      {openCard && (
        <CommandEditor card={openCard} projectSlug={projectSlug} onClose={() => setOpenCard(null)} />
      )}

      {pendingConflict && (
        <CommandCopyConflictDialog
          slashName={pendingConflict.action.request.sourceRelativePath}
          targetScope={pendingConflict.action.request.targetScope}
          errorMessage={pendingConflict.errorMessage}
          defaultRenamePath={pendingConflict.action.request.sourceRelativePath}
          onSubmit={handleConflictSubmit}
          onClose={() => {
            setPendingConflict(null);
            setPendingCopy(null);
          }}
        />
      )}

      {pendingDirCopy && (
        <CommandDirectoryCopyDialog
          sourceDir={pendingDirCopy.sourceDirectoryPath}
          targetDir={pendingDirCopy.targetScope}
          fileCount={pendingDirCopy.cardCount}
          conflicts={pendingDirCopy.conflicts}
          onSubmit={handleDirectoryCopySubmit}
          onClose={() => setPendingDirCopy(null)}
        />
      )}

      {showCreateModal && (
        <CreateCommandDialog
          onSubmit={handleCreateSubmit}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

function countLeaves(node: TreeNode): number {
  if (node.type === 'file') return 1;
  return (node.children ?? []).reduce((acc, c) => acc + countLeaves(c), 0);
}

interface CreateDialogProps {
  onSubmit(input: { scope: 'project' | 'user'; directoryPath: string; fileName: string }): Promise<void>;
  onClose(): void;
}

function CreateCommandDialog({ onSubmit, onClose }: CreateDialogProps) {
  const { t } = useTranslation('settings');
  const [scope, setScope] = useState<'project' | 'user'>('project');
  const [directoryPath, setDirectoryPath] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const slashPreview = useMemo(() => {
    const dir = directoryPath.replace(/^\/+|\/+$/g, '');
    const name = fileName.replace(/\.md$/i, '');
    if (!name) return '';
    return dir ? `/${dir.split('/').join(':')}:${name}` : `/${name}`;
  }, [directoryPath, fileName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) {
      setError(t('harness.command.create.errors.fileNameRequired', { defaultValue: 'File name is required.' }));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({ scope, directoryPath: directoryPath.trim(), fileName: fileName.trim() });
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
      aria-label={t('harness.command.create.title', { defaultValue: 'New slash command' })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <form
        className="w-full max-w-md rounded-lg bg-white dark:bg-gray-900 p-5 shadow-lg flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('harness.command.create.title', { defaultValue: 'New slash command' })}
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('harness.command.create.scopeLabel', { defaultValue: 'Scope' })}</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'project' | 'user')}
            className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800"
          >
            <option value="project">{t('harness.command.create.scopeProject', { defaultValue: 'Project' })}</option>
            <option value="user">{t('harness.command.create.scopeUser', { defaultValue: 'Global' })}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('harness.command.create.directoryLabel', { defaultValue: 'Directory (optional)' })}</span>
          <input
            type="text"
            value={directoryPath}
            onChange={(e) => setDirectoryPath(e.target.value)}
            placeholder="e.g. mytools/sub"
            data-testid="cmd-create-directory"
            className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800 font-mono text-xs"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('harness.command.create.fileNameLabel', { defaultValue: 'File name' })}</span>
          <input
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="my-command"
            data-testid="cmd-create-filename"
            className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800 font-mono text-xs"
            required
          />
        </label>
        {slashPreview && (
          <p data-testid="cmd-create-preview" className="text-xs text-gray-700 dark:text-gray-200">
            {t('harness.command.create.preview', {
              slashName: slashPreview,
              defaultValue: `Will be invoked as ${slashPreview}`,
            })}
          </p>
        )}
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
            {t('harness.command.create.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t('harness.command.create.submit', { defaultValue: 'Create' })}
          </button>
        </div>
      </form>
    </div>
  );
}
