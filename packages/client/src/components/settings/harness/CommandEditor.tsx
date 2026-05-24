/**
 * Story 28.5: Slash command editor.
 *
 * Two modes:
 *   - Form: separate inputs for the four optional frontmatter keys
 *     (description, argument-hint, allowed-tools, model) + a CodeMirror
 *     markdown editor for the body. Friendly inline validations cover the
 *     argument-hint placeholder shape, the description length cap, and the
 *     three AC4 cross-frontmatter consistency warnings.
 *   - Raw: a single CodeMirror buffer with frontmatter + body. Frontmatter
 *     parse errors surface a banner that disables the toggle back to Form
 *     until the user fixes the YAML.
 *
 * STALE_WRITE handling mirrors the 28.4 HookEditor reload/overwrite banner.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, Loader2, Maximize2, X } from 'lucide-react';
import type { Extension } from '@codemirror/state';
import type {
  HarnessCommandCard,
  HarnessCommandFrontmatter,
  HarnessCommandModel,
  HarnessCommandReadResponse,
} from '@hammoc/shared';
import { ApiError } from '../../../services/api/client';
import {
  deleteCommand,
  readCommand,
  updateCommand,
} from '../../../services/api/harnessCommandsApi';
import { useHarnessCommandStore } from '../../../stores/harnessCommandStore';
import { useSecretOnSharedDialogStore } from '../../../stores/secretOnSharedDialogStore';
import {
  getActionLabelKey,
  routeToLocal,
  appendGitignorePattern,
  REQUIRED_LOCAL_PATTERN,
} from '../../../services/secretOnSharedRouter';
import { useTextExpansionStore } from '../../../stores/textExpansionStore';
import { getSocket } from '../../../services/socket';

const LazyCodeMirror = lazy(() => import('@uiw/react-codemirror'));
const lazyBodyExtensions = (): Promise<Extension[]> =>
  Promise.all([
    import('@codemirror/lang-markdown').then((m) => m.markdown()),
    import('./commandTokenHighlight').then((m) => m.commandTokenHighlightExtension),
  ]);

interface Props {
  card: HarnessCommandCard;
  projectSlug: string;
  onClose(): void;
}

type EditorMode = 'form' | 'raw';

const DEBOUNCE_MS = 300;
const ARGUMENT_HINT_DEBOUNCE_MS = 100;
const DESCRIPTION_MAX = 256;

const POSITIONAL_RE = /\$([1-9]\d*)\b/;
const ARGUMENTS_ALL_RE = /\$ARGUMENTS\b/;
const FILE_REF_RE = /(?:^|\s)@([\w./-]+)/;
const BASH_EXEC_RE = /!`[^`]+`/;
const PLUGIN_ROOT_RE = /\$\{CLAUDE_PLUGIN_ROOT\}/;
const ALLOWED_BASH_RE = /\bBash(\s*\(|\b)/;

interface ArgumentHintCheck {
  status: 'ok' | 'invalid';
}

function checkArgumentHint(value: string): ArgumentHintCheck {
  if (!value) return { status: 'ok' };
  // Bracket balance — every `[` must have a matching `]` after it on the same string.
  let depth = 0;
  for (const ch of value) {
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth < 0) return { status: 'invalid' };
    }
  }
  return { status: depth === 0 ? 'ok' : 'invalid' };
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
}

export function CommandEditor({ card, projectSlug, onClose }: Props) {
  const { t } = useTranslation('settings');
  const reload = useHarnessCommandStore((s) => s.load);
  const notifyChanged = useHarnessCommandStore((s) => s.notifySlashCommandsChanged);

  const [data, setData] = useState<HarnessCommandReadResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('form');
  const [mtime, setMtime] = useState<string>(card.mtime);
  const [staleBanner, setStaleBanner] = useState(false);
  const [freshFromDisk, setFreshFromDisk] = useState<HarnessCommandReadResponse | null>(null);
  const [bodyExtensions, setBodyExtensions] = useState<Extension[] | null>(null);
  const [rawParseError, setRawParseError] = useState(false);
  const [showTokenGuide, setShowTokenGuide] = useState(false);
  // Story 30.7 (Task D.1-D.4): see McpEditor for prompt contract.
  const [gitignorePrompt, setGitignorePrompt] = useState<
    | null
    | { siblingRelativePath: string; retry: () => Promise<void> }
  >(null);

  // Form drafts
  const [descriptionDraft, setDescriptionDraft] = useState<string>('');
  const [argHintDraft, setArgHintDraft] = useState<string>('');
  const [allowedToolsDraft, setAllowedToolsDraft] = useState<string>('');
  const [modelDraft, setModelDraft] = useState<HarnessCommandModel | ''>('');
  const [bodyDraft, setBodyDraft] = useState<string>('');
  const [rawDraft, setRawDraft] = useState<string>('');
  const [argHintCheck, setArgHintCheck] = useState<ArgumentHintCheck>({ status: 'ok' });

  const isReadOnly = card.scope === 'plugin' || card.isBmadMirror;

  useEffect(() => {
    let alive = true;
    void lazyBodyExtensions().then((exts) => {
      if (alive) setBodyExtensions(exts);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    readCommand(card)
      .then((res) => {
        setData(res);
        setMtime(res.mtime);
        setDescriptionDraft(res.frontmatter.description ?? '');
        setArgHintDraft(res.frontmatter['argument-hint'] ?? '');
        setAllowedToolsDraft(res.frontmatter['allowed-tools'] ?? '');
        setModelDraft(res.frontmatter.model ?? '');
        setBodyDraft(res.body);
        setRawDraft(res.raw);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : (err as Error).message))
      .finally(() => setIsLoading(false));
  }, [card]);

  // Subscribe to harness:external-change so external edits surface as a stale banner.
  useEffect(() => {
    const socket = getSocket();
    socket.emit('harness:subscribe', { scope: 'user' });
    socket.emit('harness:subscribe', { scope: 'project', projectSlug });
    const handler = (payload: { scope: string; path: string }) => {
      if (payload.scope !== 'user' && payload.scope !== 'project') return;
      const myBase = basename(card.absoluteFile);
      if (!payload.path.includes(myBase)) return;
      readCommand(card)
        .then((fresh) => {
          if (fresh.mtime !== mtime) {
            setStaleBanner(true);
            setFreshFromDisk(fresh);
          }
        })
        .catch(() => {
          // ignore
        });
    };
    socket.on('harness:external-change', handler);
    return () => {
      socket.off('harness:external-change', handler);
      socket.emit('harness:unsubscribe', { scope: 'user' });
      socket.emit('harness:unsubscribe', { scope: 'project', projectSlug });
    };
  }, [card, mtime, projectSlug]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const argHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildFrontmatter = useCallback((): HarnessCommandFrontmatter => {
    const fm: HarnessCommandFrontmatter = {};
    if (descriptionDraft) fm.description = descriptionDraft;
    if (argHintDraft) fm['argument-hint'] = argHintDraft;
    if (allowedToolsDraft) fm['allowed-tools'] = allowedToolsDraft;
    if (modelDraft) fm.model = modelDraft as HarnessCommandModel;
    return fm;
  }, [descriptionDraft, argHintDraft, allowedToolsDraft, modelDraft]);

  const flushSave = useCallback(
    async (payload:
      | { kind: 'frontmatter'; frontmatter: HarnessCommandFrontmatter }
      | { kind: 'body'; body: string }
      | { kind: 'raw'; raw: string }) => {
      if (isReadOnly) return;
      try {
        const res = await updateCommand(card, {
          ...(payload.kind === 'frontmatter' ? { frontmatter: payload.frontmatter } : {}),
          ...(payload.kind === 'body' ? { body: payload.body } : {}),
          ...(payload.kind === 'raw' ? { raw: payload.raw } : {}),
          expectedMtime: mtime,
        });
        setMtime(res.mtime);
        setStaleBanner(false);
        setFreshFromDisk(null);
        setError(null);
        notifyChanged();
        void reload(projectSlug);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
          const fresh = await readCommand(card).catch(() => null);
          if (fresh) {
            setStaleBanner(true);
            setFreshFromDisk(fresh);
          }
          return;
        }
        if (err instanceof ApiError && err.code === 'HARNESS_PARSE_ERROR') {
          setRawParseError(true);
          return;
        }
        // Story 30.7 (Task C.2): server hard-blocked because the command
        // file is git-tracked and contains a plaintext secret. Open the
        // cross-panel dialog with the command domain's label + a real
        // env-ref routing callback. The callback hits
        // `POST /api/harness/commands/replace-secret-with-env-ref` which
        // walks the body via `applyPolicyToText` (Story 30.5 single source
        // of truth) and writes the placeholder-rewritten file back.
        if (err instanceof ApiError && err.code === 'HARNESS_SECRET_ON_SHARED') {
          const details = (err.details ?? {}) as {
            relativePath?: string;
            lines?: number[];
            paths?: string[];
          };
          const locations = [
            ...(details.lines?.map((n) => `line ${n}`) ?? []),
            ...(details.paths ?? []),
          ];
          const performMoveToLocal = async (): Promise<void> => {
            if (card.scope !== 'project') {
              // User scope is not git-tracked — share-scope guard cannot
              // fire here. Close silently to avoid confusing fallback noise.
              useSecretOnSharedDialogStore.getState().close();
              return;
            }
            const result = await routeToLocal({
              domain: 'command',
              projectSlug,
              card: { relativePath: card.relativePath, expectedMtime: mtime },
              payload: {},
            });
            if (result.ok) {
              void reload(projectSlug);
              return;
            }
            if (result.reason === 'gitignorePatternMissing') {
              setGitignorePrompt({
                siblingRelativePath: result.siblingRelativePath,
                retry: performMoveToLocal,
              });
              return;
            }
            setError(t('harness.tools.secretOnShared.routing.apiErrorToast'));
          };
          useSecretOnSharedDialogStore.getState().open({
            origin: 'command',
            targetPath:
              details.relativePath
              ?? (card.scope === 'project'
                ? `.claude/commands/${card.relativePath}`
                : `~/.claude/commands/${card.relativePath}`),
            secretLocations: locations,
            actionLabelKey: getActionLabelKey('command'),
            onMoveToLocal: () => {
              void performMoveToLocal();
            },
            onMarkNotSecret: () => {
              useSecretOnSharedDialogStore.getState().close();
            },
          });
          return;
        }
        setError(err instanceof ApiError ? err.message : (err as Error).message);
      }
    },
    [card, isReadOnly, mtime, notifyChanged, projectSlug, reload, t],
  );

  const scheduleFormSave = useCallback(() => {
    if (isReadOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushSave({ kind: 'frontmatter', frontmatter: buildFrontmatter() });
    }, DEBOUNCE_MS);
  }, [buildFrontmatter, flushSave, isReadOnly]);

  const scheduleBodySave = useCallback(
    (next: string) => {
      if (isReadOnly) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void flushSave({ kind: 'body', body: next });
      }, DEBOUNCE_MS);
    },
    [flushSave, isReadOnly],
  );

  const scheduleRawSave = useCallback(
    (next: string) => {
      if (isReadOnly) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setRawParseError(false);
        void flushSave({ kind: 'raw', raw: next });
      }, DEBOUNCE_MS);
    },
    [flushSave, isReadOnly],
  );

  // Close any expansion overlay this editor opened when the modal unmounts.
  useEffect(() => {
    return () => {
      if (useTextExpansionStore.getState().isOpen) {
        useTextExpansionStore.getState().close();
      }
    };
  }, []);

  const expandBody = () => {
    useTextExpansionStore.getState().open({
      label: `${card.slashName} — ${t('harness.command.editor.bodyTitle', { defaultValue: 'Body (markdown)' })}`,
      content: bodyDraft,
      isMarkdown: true,
      readOnly: isReadOnly,
      projectSlug,
      onChange: (value) => {
        setBodyDraft(value);
        scheduleBodySave(value);
      },
    });
  };

  const expandRaw = () => {
    useTextExpansionStore.getState().open({
      label: `${card.slashName} — ${t('harness.command.editor.rawTitle', { defaultValue: 'Raw' })}`,
      content: rawDraft,
      isMarkdown: true,
      readOnly: isReadOnly,
      projectSlug,
      onChange: (value) => {
        setRawDraft(value);
        scheduleRawSave(value);
      },
    });
  };

  const handleArgHintChange = (value: string) => {
    setArgHintDraft(value);
    if (argHintTimer.current) clearTimeout(argHintTimer.current);
    argHintTimer.current = setTimeout(() => {
      setArgHintCheck(checkArgumentHint(value));
    }, ARGUMENT_HINT_DEBOUNCE_MS);
    scheduleFormSave();
  };

  const handleReload = () => {
    if (!freshFromDisk) return;
    setData(freshFromDisk);
    setMtime(freshFromDisk.mtime);
    setDescriptionDraft(freshFromDisk.frontmatter.description ?? '');
    setArgHintDraft(freshFromDisk.frontmatter['argument-hint'] ?? '');
    setAllowedToolsDraft(freshFromDisk.frontmatter['allowed-tools'] ?? '');
    setModelDraft(freshFromDisk.frontmatter.model ?? '');
    setBodyDraft(freshFromDisk.body);
    setRawDraft(freshFromDisk.raw);
    setStaleBanner(false);
    setFreshFromDisk(null);
  };

  const handleOverwrite = async () => {
    if (isReadOnly) return;
    try {
      const res = await updateCommand(card, {
        ...(mode === 'raw' ? { raw: rawDraft } : { frontmatter: buildFrontmatter() }),
        // expectedMtime omitted → force overwrite
      });
      setMtime(res.mtime);
      setStaleBanner(false);
      setFreshFromDisk(null);
      notifyChanged();
      void reload(projectSlug);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (isReadOnly) return;
    if (!window.confirm(
      t('harness.command.editor.delete.confirm', {
        slashName: card.slashName,
        scope: card.scope,
        defaultValue: `Delete ${card.slashName} from ${card.scope}?`,
      }),
    )) {
      return;
    }
    try {
      await deleteCommand({
        scope: card.scope as 'project' | 'user',
        projectSlug: card.projectSlug,
        relativePath: card.relativePath,
        expectedMtime: mtime,
      });
      notifyChanged();
      await reload(projectSlug);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const consistencyWarnings = useMemo(() => {
    const warnings: Array<'argumentsWithoutHint' | 'bashWithoutAllowedTool' | 'pluginRootInNonPlugin'> = [];
    const hasArgs = POSITIONAL_RE.test(bodyDraft) || ARGUMENTS_ALL_RE.test(bodyDraft);
    if (hasArgs && !argHintDraft) warnings.push('argumentsWithoutHint');
    if (BASH_EXEC_RE.test(bodyDraft) && !ALLOWED_BASH_RE.test(allowedToolsDraft)) {
      warnings.push('bashWithoutAllowedTool');
    }
    if (PLUGIN_ROOT_RE.test(bodyDraft) && card.scope !== 'plugin') {
      warnings.push('pluginRootInNonPlugin');
    }
    return warnings;
  }, [allowedToolsDraft, argHintDraft, bodyDraft, card.scope]);

  const tokenClasses = useMemo(() => {
    return {
      args: POSITIONAL_RE.test(bodyDraft),
      argumentsAll: ARGUMENTS_ALL_RE.test(bodyDraft),
      fileRefs: FILE_REF_RE.test(bodyDraft),
      bashExec: BASH_EXEC_RE.test(bodyDraft),
      pluginRoot: PLUGIN_ROOT_RE.test(bodyDraft),
    };
  }, [bodyDraft]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('harness.command.editor.frontmatterTitle', { defaultValue: 'Edit slash command' })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-lg bg-white dark:bg-gray-900 p-5 shadow-lg flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 font-mono truncate">
              {card.slashName}
            </h2>
            {card.isBmadMirror && (
              <span
                className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200"
                title={t('harness.command.bmadMirrorMarker', {
                  defaultValue: '.bmad-core mirror — managed by BMad',
                })}
              >
                .bmad-core
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', { defaultValue: 'Close' })}
            className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {card.isBmadMirror && (
          <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
            {t('harness.command.editor.bmadMirrorReadOnly', {
              defaultValue: 'This file is a .bmad-core mirror — edit via /BMad agent commands instead.',
            })}
          </div>
        )}

        {staleBanner && (
          <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 flex items-center justify-between gap-2">
            <span>
              {t('harness.command.editor.staleBanner', {
                defaultValue: 'This command was changed externally — your save was rejected.',
              })}
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={handleReload} className="underline">
                {t('harness.command.editor.staleReload', { defaultValue: 'Reload' })}
              </button>
              <button type="button" onClick={handleOverwrite} className="underline">
                {t('harness.command.editor.staleOverwrite', { defaultValue: 'Overwrite' })}
              </button>
            </span>
          </div>
        )}

        {rawParseError && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-900 dark:text-red-100">
            {t('harness.command.editor.rawParseError', {
              defaultValue: 'Frontmatter cannot be parsed — fix the YAML to return to Form mode.',
            })}
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-900 dark:text-red-100">
            {error}
          </div>
        )}

        {gitignorePrompt && (
          <div
            role="alert"
            data-testid="gitignore-pattern-missing-alert"
            className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 flex flex-col gap-2"
          >
            <p className="font-semibold">
              {t('harness.tools.shareBadge.gitignorePatternMissing.toastTitle')}
            </p>
            <p>
              {t('harness.tools.shareBadge.gitignorePatternMissing.toastDetail', {
                pattern: REQUIRED_LOCAL_PATTERN,
                sibling: gitignorePrompt.siblingRelativePath,
              })}
            </p>
            <div className="flex gap-2 self-end">
              <button
                type="button"
                data-testid="gitignore-pattern-missing-cancel"
                onClick={() => {
                  setError(
                    t('harness.tools.shareBadge.gitignorePatternMissing.fallbackHint', {
                      pattern: REQUIRED_LOCAL_PATTERN,
                    }),
                  );
                  setGitignorePrompt(null);
                }}
                className="px-2 py-1 text-xs rounded-md text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-800/40"
              >
                {t('common.button.cancel', { ns: 'common', defaultValue: 'Cancel' })}
              </button>
              <button
                type="button"
                data-testid="gitignore-pattern-missing-confirm"
                onClick={async () => {
                  const retry = gitignorePrompt.retry;
                  setGitignorePrompt(null);
                  try {
                    await appendGitignorePattern(projectSlug, REQUIRED_LOCAL_PATTERN);
                    await retry();
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : (err as Error).message);
                  }
                }}
                className="px-2 py-1 text-xs rounded-md bg-amber-600 hover:bg-amber-700 text-white"
              >
                {t('harness.tools.shareBadge.gitignorePatternMissing.confirmCta')}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMode('form')}
            disabled={rawParseError}
            data-testid="cmd-mode-form"
            className={`px-2 py-1 rounded-md ${mode === 'form' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200' : 'text-gray-600'}`}
          >
            Form
          </button>
          <button
            type="button"
            onClick={() => setMode('raw')}
            data-testid="cmd-mode-raw"
            className={`px-2 py-1 rounded-md ${mode === 'raw' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200' : 'text-gray-600'}`}
          >
            {t('harness.command.editor.rawToggle', { defaultValue: 'Raw' })}
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
          </div>
        )}

        {!isLoading && data && mode === 'form' && (
          <>
            <fieldset disabled={isReadOnly} className="flex flex-col gap-3 text-sm">
              <legend className="font-semibold text-gray-800 dark:text-gray-100">
                {t('harness.command.editor.frontmatterTitle', { defaultValue: 'Frontmatter' })}
              </legend>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {t('harness.command.editor.descriptionLabel', { defaultValue: 'Description' })}
                </span>
                <input
                  type="text"
                  value={descriptionDraft}
                  onChange={(e) => {
                    setDescriptionDraft(e.target.value);
                    scheduleFormSave();
                  }}
                  data-testid="cmd-frontmatter-description"
                  className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800"
                />
                {descriptionDraft.length > DESCRIPTION_MAX && (
                  <span data-testid="cmd-description-too-long" className="text-xs text-amber-700 dark:text-amber-300">
                    {t('harness.command.editor.descriptionTooLong', {
                      defaultValue: 'Description longer than 256 characters may be truncated in the palette preview.',
                    })}
                  </span>
                )}
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {t('harness.command.editor.argumentHintLabel', { defaultValue: 'Argument hint' })}
                </span>
                <input
                  type="text"
                  value={argHintDraft}
                  onChange={(e) => handleArgHintChange(e.target.value)}
                  placeholder="[arg1] [arg2]"
                  data-testid="cmd-frontmatter-argument-hint"
                  aria-invalid={argHintCheck.status === 'invalid' ? 'true' : 'false'}
                  className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800 font-mono text-xs"
                />
                {argHintCheck.status === 'invalid' && (
                  <span data-testid="cmd-argument-hint-invalid" className="text-xs text-red-600 dark:text-red-400">
                    {t('harness.command.editor.argumentHint.invalidPlaceholder', {
                      defaultValue: 'Use [name] placeholder format only — unbalanced brackets detected.',
                    })}
                  </span>
                )}
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {t('harness.command.editor.allowedToolsLabel', { defaultValue: 'Allowed tools' })}
                </span>
                <textarea
                  value={allowedToolsDraft}
                  onChange={(e) => {
                    setAllowedToolsDraft(e.target.value);
                    scheduleFormSave();
                  }}
                  rows={2}
                  placeholder="Read, Edit, Bash(git:*)"
                  data-testid="cmd-frontmatter-allowed-tools"
                  className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800 font-mono text-xs"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {t('harness.command.editor.modelLabel', { defaultValue: 'Model' })}
                </span>
                <select
                  value={modelDraft}
                  onChange={(e) => {
                    setModelDraft(e.target.value as HarnessCommandModel | '');
                    scheduleFormSave();
                  }}
                  data-testid="cmd-frontmatter-model"
                  className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800"
                >
                  <option value="">—</option>
                  <option value="inherit">inherit</option>
                  <option value="sonnet">sonnet</option>
                  <option value="opus">opus</option>
                  <option value="haiku">haiku</option>
                </select>
              </label>
            </fieldset>

            {consistencyWarnings.length > 0 && (
              <div role="status" data-testid="cmd-consistency-warnings" className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                <ul className="list-disc ml-4">
                  {consistencyWarnings.map((w) => (
                    <li key={w} data-warning={w}>
                      {t(`harness.command.editor.warnings.${w}`, {
                        defaultValue:
                          w === 'argumentsWithoutHint'
                            ? 'This command uses $1 / $ARGUMENTS but argument-hint is unset.'
                            : w === 'bashWithoutAllowedTool'
                              ? 'This command uses !`...` shell execution but allowed-tools does not include Bash.'
                              : '${CLAUDE_PLUGIN_ROOT} only resolves in plugin bundles.',
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {t('harness.command.editor.bodyTitle', { defaultValue: 'Body (markdown)' })}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={expandBody}
                    aria-label={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
                    title={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
                    data-testid="cmd-body-expand"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <Maximize2 className="w-3 h-3" />
                    {t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTokenGuide((v) => !v)}
                    aria-expanded={showTokenGuide}
                    aria-controls="cmd-token-guide-drawer"
                    data-testid="cmd-token-guide-toggle"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded text-gray-600 hover:text-blue-700 dark:text-gray-300 dark:hover:text-blue-300"
                    title={t('harness.command.editor.tokenGuide.title', {
                      defaultValue: 'Dynamic substitution tokens',
                    })}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>
                      {t('harness.command.editor.tokenGuide.title', {
                        defaultValue: 'Dynamic substitution tokens',
                      })}
                    </span>
                  </button>
                </div>
              </div>
              {showTokenGuide && (
                <div
                  id="cmd-token-guide-drawer"
                  data-testid="cmd-token-guide-drawer"
                  role="region"
                  aria-label={t('harness.command.editor.tokenGuide.title', {
                    defaultValue: 'Dynamic substitution tokens',
                  })}
                  className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/40 px-3 py-2 text-xs text-gray-800 dark:text-gray-100"
                >
                  <ul className="space-y-1">
                    <li>
                      <code className="cm-cmd-token cm-cmd-token-args font-mono">$1, $2</code>
                      <span className="ml-1 text-gray-700 dark:text-gray-300">
                        — {t('harness.command.editor.tokenGuide.positionalArgs', {
                          defaultValue: 'first/second positional argument from the slash command',
                        })}
                      </span>
                    </li>
                    <li>
                      <code className="cm-cmd-token cm-cmd-token-argumentsAll font-mono">$ARGUMENTS</code>
                      <span className="ml-1 text-gray-700 dark:text-gray-300">
                        — {t('harness.command.editor.tokenGuide.argumentsAll', {
                          defaultValue: 'full argument string passed to the command',
                        })}
                      </span>
                    </li>
                    <li>
                      <code className="cm-cmd-token cm-cmd-token-fileRefs font-mono">@path/to/file</code>
                      <span className="ml-1 text-gray-700 dark:text-gray-300">
                        — {t('harness.command.editor.tokenGuide.fileRefs', {
                          defaultValue: 'inserts file contents at runtime',
                        })}
                      </span>
                    </li>
                    <li>
                      <code className="cm-cmd-token cm-cmd-token-bashExec font-mono">!`command`</code>
                      <span className="ml-1 text-gray-700 dark:text-gray-300">
                        — {t('harness.command.editor.tokenGuide.bashExec', {
                          defaultValue: 'executes a shell command and inserts the output',
                        })}
                      </span>
                    </li>
                    <li>
                      <code className="cm-cmd-token cm-cmd-token-pluginRoot font-mono">{'${CLAUDE_PLUGIN_ROOT}'}</code>
                      <span className="ml-1 text-gray-700 dark:text-gray-300">
                        — {t('harness.command.editor.tokenGuide.pluginRoot', {
                          defaultValue: 'plugin bundle root (plugin commands only)',
                        })}
                      </span>
                    </li>
                  </ul>
                  <a
                    href="https://docs.claude.com/en/docs/claude-code/slash-commands"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-blue-700 dark:text-blue-300 underline"
                  >
                    {t('harness.command.editor.tokenGuide.docsLink', {
                      defaultValue: 'Official documentation',
                    })}
                  </a>
                </div>
              )}
              <div
                data-testid="cmd-body-tokens"
                data-uses-args={tokenClasses.args ? 'true' : 'false'}
                data-uses-arguments-all={tokenClasses.argumentsAll ? 'true' : 'false'}
                data-uses-file-refs={tokenClasses.fileRefs ? 'true' : 'false'}
                data-uses-bash-exec={tokenClasses.bashExec ? 'true' : 'false'}
                data-uses-plugin-root={tokenClasses.pluginRoot ? 'true' : 'false'}
                className="rounded border border-gray-300 dark:border-gray-700 overflow-hidden"
              >
                <Suspense fallback={<div className="p-3 text-xs text-gray-500">Loading editor…</div>}>
                  <LazyCodeMirror
                    value={bodyDraft}
                    onChange={(next) => {
                      setBodyDraft(next);
                      scheduleBodySave(next);
                    }}
                    extensions={bodyExtensions ?? []}
                    editable={!isReadOnly}
                    height="240px"
                    basicSetup={{ lineNumbers: false }}
                  />
                </Suspense>
              </div>
            </div>
          </>
        )}

        {!isLoading && data && mode === 'raw' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={expandRaw}
                aria-label={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
                title={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
                data-testid="cmd-raw-expand"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <Maximize2 className="w-3 h-3" />
                {t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
              </button>
            </div>
            <div className="rounded border border-gray-300 dark:border-gray-700 overflow-hidden">
              <Suspense fallback={<div className="p-3 text-xs text-gray-500">Loading editor…</div>}>
                <LazyCodeMirror
                  value={rawDraft}
                  onChange={(next) => {
                    setRawDraft(next);
                    scheduleRawSave(next);
                  }}
                  extensions={bodyExtensions ?? []}
                  editable={!isReadOnly}
                  height="360px"
                  basicSetup={{ lineNumbers: true }}
                  data-testid="cmd-raw-editor"
                />
              </Suspense>
            </div>
          </div>
        )}

        {!isReadOnly && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleDelete}
              className="px-2 py-1 text-xs rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              {t('harness.command.editor.delete.label', { defaultValue: 'Delete command' })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
