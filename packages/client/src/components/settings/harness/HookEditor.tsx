/**
 * Story 28.4: Hook editor modal.
 *
 * Two-mode editor:
 *   - Form: 9-event dropdown + matcher (regex live-validated) + type radio
 *           (`command` | `prompt` — prompt may be disabled by spike result) +
 *           multi-line body + timeout. PreToolUse + command shows an extra
 *           collapsible "decision builder" panel that emits a single
 *           `echo '{"hookSpecificOutput":...}'` snippet.
 *   - Raw : single hook entry + parent matcher group, JSON-encoded.
 *
 * 300ms debounced auto-save with STALE_WRITE reload/overwrite resolution. New
 * hooks (no card yet) use the manual "Save" button via createHook; existing
 * hooks auto-save through updateHook.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type {
  HarnessExternalChangeEvent,
  HarnessHookCard,
  HarnessHookConfig,
  HarnessHookEvent,
  HarnessHookSourceLocation,
  HarnessHookType,
  HarnessHookUpdateRequest,
} from '@hammoc/shared';
import { HARNESS_HOOK_EVENTS } from '@hammoc/shared';
import { ApiError } from '../../../services/api/client';
import {
  createHook,
  readHook,
  updateHook,
} from '../../../services/api/harnessHooksApi';
import { useHarnessHookStore } from '../../../stores/harnessHookStore';
import { useSecretOnSharedDialogStore } from '../../../stores/secretOnSharedDialogStore';
import {
  getActionLabelKey,
  routeToLocal,
  appendGitignorePattern,
  REQUIRED_LOCAL_PATTERN,
} from '../../../services/secretOnSharedRouter';
import { getSocket } from '../../../services/socket';

interface ExistingProps {
  card: HarnessHookCard;
  createForEvent?: never;
  projectSlug: string;
  onClose(): void;
}

interface CreateProps {
  card?: never;
  createForEvent: HarnessHookEvent;
  projectSlug: string;
  onClose(): void;
}

type Props = ExistingProps | CreateProps;

const DEBOUNCE_MS = 300;
const MATCHER_DEBOUNCE_MS = 100;

const PRE_TOOL_USE_TEMPLATES = {
  allow: `echo '{"hookSpecificOutput":{"permissionDecision":"allow"}}'`,
  deny: `echo '{"hookSpecificOutput":{"permissionDecision":"deny","systemMessage":"reason"}}'`,
  ask: `echo '{"hookSpecificOutput":{"permissionDecision":"ask"}}'`,
};

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
}

export function HookEditor(props: Props) {
  const { t } = useTranslation('settings');
  const reload = useHarnessHookStore((s) => s.load);
  const promptTypeSupport = useHarnessHookStore((s) => s.promptTypeSupport);

  const isCreateMode = !props.card;
  const card = props.card;

  const [event, setEvent] = useState<HarnessHookEvent>(
    isCreateMode ? props.createForEvent : card!.event,
  );
  const [matcher, setMatcher] = useState<string>(card?.matcher ?? '');
  const [type, setType] = useState<HarnessHookType>(card?.config.type ?? 'command');
  const [bodyDraft, setBodyDraft] = useState<string>(
    card?.config.command ?? card?.config.prompt ?? '',
  );
  const [timeoutDraft, setTimeoutDraft] = useState<string>(
    card?.config.timeout !== undefined ? String(card.config.timeout) : '',
  );

  const [matcherError, setMatcherError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);

  const [mode, setMode] = useState<'form' | 'raw'>('form');
  const [rawDraft, setRawDraft] = useState<string>('');
  const [rawParseError, setRawParseError] = useState(false);

  const [mtime, setMtime] = useState<string>(card?.mtime ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Story 30.7 (Task D.1-D.4): see McpEditor for prompt contract.
  const [gitignorePrompt, setGitignorePrompt] = useState<
    | null
    | { siblingRelativePath: string; retry: () => Promise<void> }
  >(null);
  const [staleBanner, setStaleBanner] = useState(false);
  const [freshFromDisk, setFreshFromDisk] = useState<{
    matcher?: string;
    config: HarnessHookConfig;
    mtime: string;
  } | null>(null);

  const [splitFromGroup, setSplitFromGroup] = useState(false);
  const [siblingsBanner, setSiblingsBanner] = useState<number | null>(null);

  const [decisionPanelOpen, setDecisionPanelOpen] = useState(false);
  const [decisionMode, setDecisionMode] = useState<'allow' | 'deny' | 'ask'>('allow');
  const [decisionSystemMessage, setDecisionSystemMessage] = useState('');
  const [decisionUpdatedInput, setDecisionUpdatedInput] = useState('');
  const [decisionUpdatedInputError, setDecisionUpdatedInputError] = useState<string | null>(null);
  const [decisionInsertMode, setDecisionInsertMode] = useState<'prepend' | 'replace'>('prepend');

  const [siblingCount, setSiblingCount] = useState<number>(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matcherDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isReadOnly = card?.scope === 'plugin';

  // --- Initial load (existing card) ----------------------------------------

  useEffect(() => {
    if (isCreateMode || !card) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await readHook(card);
        if (cancelled) return;
        setMatcher(res.matcher ?? '');
        setType(res.config.type);
        setBodyDraft(res.config.command ?? res.config.prompt ?? '');
        setTimeoutDraft(res.config.timeout !== undefined ? String(res.config.timeout) : '');
        setMtime(res.mtime);
        setRawDraft(res.raw);
      } catch (err) {
        // 404 — card was deleted externally. Surface the error and bail out.
        setSaveError(err instanceof ApiError ? err.message : (err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [card, isCreateMode]);

  // --- Sibling count discovery (existing card, edit mode) ------------------
  // Pulled from the store's cardsByEvent — count cards in the same matcher
  // group (same scope + projectSlug + groupIndex) excluding ourselves.
  const cardsForEvent = useHarnessHookStore((s) => s.cardsByEvent[event] ?? []);
  useEffect(() => {
    if (isCreateMode || !card) return;
    const siblings = cardsForEvent.filter(
      (c) =>
        c.scope === card.scope &&
        (c.projectSlug ?? '') === (card.projectSlug ?? '') &&
        c.groupIndex === card.groupIndex &&
        !(c.hookIndex === card.hookIndex && c.disabledByBackup === card.disabledByBackup),
    ).length;
    setSiblingCount(siblings);
  }, [cardsForEvent, card, isCreateMode]);

  // --- Matcher live validation --------------------------------------------

  const validateMatcher = useCallback((value: string) => {
    if (value === '') {
      setMatcherError(null);
      return true;
    }
    try {
      // eslint-disable-next-line no-new
      new RegExp(value);
      setMatcherError(null);
      return true;
    } catch {
      setMatcherError(t('harness.hook.editor.matcher.invalidRegex'));
      return false;
    }
  }, [t]);

  useEffect(() => {
    if (matcherDebounceRef.current) clearTimeout(matcherDebounceRef.current);
    matcherDebounceRef.current = setTimeout(() => {
      validateMatcher(matcher);
    }, MATCHER_DEBOUNCE_MS);
    return () => {
      if (matcherDebounceRef.current) clearTimeout(matcherDebounceRef.current);
    };
  }, [matcher, validateMatcher]);

  // --- Body validation -----------------------------------------------------

  useEffect(() => {
    if (!bodyDraft) {
      setBodyError(
        type === 'command'
          ? t('harness.hook.editor.required.command')
          : t('harness.hook.editor.required.prompt'),
      );
    } else {
      setBodyError(null);
    }
  }, [bodyDraft, type, t]);

  // --- Auto-save (existing card) -------------------------------------------

  // Story 30.7 (Task C.3): when the server hard-blocks a save with
  // `HARNESS_SECRET_ON_SHARED`, open the cross-panel dialog with the hook
  // domain's label + a real sibling-save routing callback. The callback
  // hits `PUT /api/harness/hooks/<event>/0/0?scope=project&projectSlug=…`
  // with `{scope:'local'}` body which writes the hook into
  // `.claude/settings.local.json`. NOTE (S1): this editor uses
  // `setSaveError` (not `setError`) — the polled grep in Task F.5 must
  // OR-match both names so the fallback removal verification finds the
  // patched call site here.
  const handleSecretOnSharedError = useCallback(
    (err: unknown, hookConfig: HarnessHookConfig | null): boolean => {
      if (!(err instanceof ApiError) || err.code !== 'HARNESS_SECRET_ON_SHARED') {
        return false;
      }
      const details = (err.details ?? {}) as {
        relativePath?: string;
        lines?: number[];
        paths?: string[];
      };
      const locations = [
        ...(details.lines?.map((n) => `line ${n}`) ?? []),
        ...(details.paths ?? []),
      ];
      const fallbackPath = card
        ? card.scope === 'project'
          ? '.claude/settings.json'
          : '~/.claude/settings.json'
        : isCreateMode
          ? '.claude/settings.json'
          : '.claude/settings.json';
      const performMoveToLocal = async (): Promise<void> => {
        // user-scope writes never trigger the share-scope guard, and
        // missing card/config indicates a server-side bug — close
        // silently to avoid confusing fallback noise.
        if (!card || card.scope !== 'project' || !hookConfig) {
          useSecretOnSharedDialogStore.getState().close();
          return;
        }
        const result = await routeToLocal({
          domain: 'hook',
          projectSlug: props.projectSlug,
          card: { hookEvent: card.event, matcher, expectedMtime: mtime },
          payload: { hookConfig },
        });
        if (result.ok) {
          void reload(props.projectSlug);
          return;
        }
        if (result.reason === 'gitignorePatternMissing') {
          setGitignorePrompt({
            siblingRelativePath: result.siblingRelativePath,
            retry: performMoveToLocal,
          });
          return;
        }
        setSaveError(t('harness.tools.secretOnShared.routing.apiErrorToast'));
      };
      useSecretOnSharedDialogStore.getState().open({
        origin: 'hook',
        targetPath: details.relativePath ?? fallbackPath,
        secretLocations: locations,
        actionLabelKey: getActionLabelKey('hook'),
        onMoveToLocal: () => {
          void performMoveToLocal();
        },
        onMarkNotSecret: () => {
          useSecretOnSharedDialogStore.getState().close();
        },
      });
      return true;
    },
    [card, isCreateMode, matcher, mtime, props.projectSlug, t],
  );

  const buildConfigFromDraft = useCallback((): HarnessHookConfig | null => {
    if (!bodyDraft) return null;
    const config: HarnessHookConfig = { type };
    if (type === 'command') config.command = bodyDraft;
    else config.prompt = bodyDraft;
    if (timeoutDraft.trim() !== '') {
      const n = Number.parseInt(timeoutDraft, 10);
      if (Number.isFinite(n) && n >= 0) config.timeout = n;
    }
    return config;
  }, [type, bodyDraft, timeoutDraft]);

  const saveConfig = useCallback(
    async (next: HarnessHookConfig) => {
      if (!card || isReadOnly) return;
      const loc: HarnessHookSourceLocation = card;
      try {
        setIsSaving(true);
        setSaveError(null);
        const res = await updateHook(loc, { config: next, expectedMtime: mtime });
        setMtime(res.mtime);
        setStaleBanner(false);
        setFreshFromDisk(null);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
          await loadFreshFromDisk();
        } else if (!handleSecretOnSharedError(err, next)) {
          setSaveError(err instanceof ApiError ? err.message : (err as Error).message);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [card, handleSecretOnSharedError, isReadOnly, mtime],
  );

  const saveMatcher = useCallback(
    async (next: string | null) => {
      if (!card || isReadOnly) return;
      const loc: HarnessHookSourceLocation = card;
      try {
        setIsSaving(true);
        setSaveError(null);
        const body: HarnessHookUpdateRequest = {
          matcher: next,
          expectedMtime: mtime,
          ...(splitFromGroup ? { splitFromGroup: true } : {}),
        };
        const res = await updateHook(loc, body);
        setMtime(res.mtime);
        setStaleBanner(false);
        setFreshFromDisk(null);
        if (typeof res.affectedSiblings === 'number') {
          setSiblingsBanner(res.affectedSiblings);
        } else {
          setSiblingsBanner(null);
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
          await loadFreshFromDisk();
        } else if (!handleSecretOnSharedError(err, buildConfigFromDraft())) {
          setSaveError(err instanceof ApiError ? err.message : (err as Error).message);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [card, handleSecretOnSharedError, isReadOnly, mtime, splitFromGroup, buildConfigFromDraft],
  );

  const saveRaw = useCallback(
    async (next: string) => {
      if (!card || isReadOnly) return;
      const loc: HarnessHookSourceLocation = card;
      try {
        setIsSaving(true);
        setSaveError(null);
        const res = await updateHook(loc, { raw: next, expectedMtime: mtime });
        setMtime(res.mtime);
        setStaleBanner(false);
        setFreshFromDisk(null);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
          await loadFreshFromDisk();
        } else {
          // Raw mode: parse the JSON to extract the inner hook config so
          // the router can re-submit it via the {scope:'local'} sibling
          // save. If parse fails, fall back to the generic error.
          let rawCfg: HarnessHookConfig | null = null;
          try {
            const parsed = JSON.parse(next) as { hooks?: HarnessHookConfig[] };
            if (Array.isArray(parsed.hooks) && parsed.hooks[0]) {
              rawCfg = parsed.hooks[0];
            }
          } catch {
            rawCfg = null;
          }
          if (!handleSecretOnSharedError(err, rawCfg)) {
            setSaveError(err instanceof ApiError ? err.message : (err as Error).message);
          }
        }
      } finally {
        setIsSaving(false);
      }
    },
    [card, handleSecretOnSharedError, isReadOnly, mtime],
  );

  const loadFreshFromDisk = useCallback(async () => {
    if (!card) return;
    try {
      const res = await readHook(card);
      setFreshFromDisk({ matcher: res.matcher, config: res.config, mtime: res.mtime });
      setStaleBanner(true);
    } catch {
      // ignore — the panel will eventually reload the card list
    }
  }, [card]);

  // Schedule debounced save when body/timeout/type change.
  useEffect(() => {
    if (isCreateMode || isReadOnly) return;
    if (mode !== 'form') return;
    if (matcherError) return;
    const cfg = buildConfigFromDraft();
    if (!cfg) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void saveConfig(cfg);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyDraft, timeoutDraft, type, mode]);

  // --- External change subscription ---------------------------------------

  useEffect(() => {
    if (isCreateMode || !card) return;
    const socket = getSocket();
    const handler = (payload: HarnessExternalChangeEvent) => {
      if (payload.scope !== card.scope) return;
      if (basename(payload.path).toLowerCase() !== basename(card.absoluteFile).toLowerCase()) {
        return;
      }
      if (payload.mtime && payload.mtime !== mtime) {
        void loadFreshFromDisk();
      }
    };
    socket.on('harness:external-change', handler);
    return () => {
      socket.off('harness:external-change', handler);
    };
  }, [card, isCreateMode, mtime, loadFreshFromDisk]);

  // --- ESC close ----------------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [props]);

  // --- Manual create (create mode) ----------------------------------------

  const handleCreate = useCallback(async () => {
    if (!isCreateMode) return;
    if (matcherError) return;
    const cfg = buildConfigFromDraft();
    if (!cfg) return;
    try {
      setIsSaving(true);
      setSaveError(null);
      const res = await createHook({
        scope: 'project',
        projectSlug: props.projectSlug,
        event,
        matcher: matcher || undefined,
        config: cfg,
      });
      // Refresh the panel list and close.
      void reload(props.projectSlug);
      props.onClose();
      void res; // res unused but documents the contract
    } catch (err) {
      if (!handleSecretOnSharedError(err, cfg)) {
        setSaveError(err instanceof ApiError ? err.message : (err as Error).message);
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    isCreateMode,
    matcherError,
    buildConfigFromDraft,
    handleSecretOnSharedError,
    props,
    event,
    matcher,
    reload,
  ]);

  // --- Stale banner actions -----------------------------------------------

  const handleReloadFromDisk = () => {
    if (!freshFromDisk) return;
    setMatcher(freshFromDisk.matcher ?? '');
    setType(freshFromDisk.config.type);
    setBodyDraft(freshFromDisk.config.command ?? freshFromDisk.config.prompt ?? '');
    setTimeoutDraft(
      freshFromDisk.config.timeout !== undefined ? String(freshFromDisk.config.timeout) : '',
    );
    setMtime(freshFromDisk.mtime);
    setStaleBanner(false);
    setFreshFromDisk(null);
  };

  const handleOverwriteDisk = async () => {
    if (!card || isReadOnly) return;
    const cfg = buildConfigFromDraft();
    if (!cfg) return;
    try {
      setIsSaving(true);
      setSaveError(null);
      // expectedMtime omitted → force overwrite
      const res = await updateHook(card, { config: cfg });
      setMtime(res.mtime);
      setStaleBanner(false);
      setFreshFromDisk(null);
    } catch (err) {
      if (!handleSecretOnSharedError(err, cfg)) {
        setSaveError(err instanceof ApiError ? err.message : (err as Error).message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Decision builder helpers -------------------------------------------

  const validateUpdatedInput = useCallback((value: string): boolean => {
    if (value.trim() === '') {
      setDecisionUpdatedInputError(null);
      return true;
    }
    try {
      JSON.parse(value);
      setDecisionUpdatedInputError(null);
      return true;
    } catch {
      setDecisionUpdatedInputError(t('harness.hook.editor.decisionForm.updatedInputInvalid'));
      return false;
    }
  }, [t]);

  const generateDecisionSnippet = useCallback(() => {
    const ok = validateUpdatedInput(decisionUpdatedInput);
    if (!ok) return;
    const payload: Record<string, unknown> = { permissionDecision: decisionMode };
    if (decisionSystemMessage.trim() !== '') {
      payload.systemMessage = decisionSystemMessage.trim();
    }
    if (decisionMode === 'allow' && decisionUpdatedInput.trim() !== '') {
      try {
        payload.updatedInput = JSON.parse(decisionUpdatedInput);
      } catch {
        return;
      }
    }
    const json = JSON.stringify({ hookSpecificOutput: payload });
    const snippet = `echo '${json}'`;
    if (decisionInsertMode === 'replace' || bodyDraft.trim() === '') {
      setBodyDraft(snippet);
    } else {
      setBodyDraft(`${snippet}\n${bodyDraft}`);
    }
    setDecisionPanelOpen(false);
  }, [
    validateUpdatedInput,
    decisionMode,
    decisionSystemMessage,
    decisionUpdatedInput,
    decisionInsertMode,
    bodyDraft,
  ]);

  const handleQuickTemplate = (key: 'allow' | 'deny' | 'ask') => {
    const snippet = PRE_TOOL_USE_TEMPLATES[key];
    setBodyDraft(bodyDraft.trim() === '' ? snippet : `${snippet}\n${bodyDraft}`);
  };

  // --- Render --------------------------------------------------------------

  const matcherIsIgnored = !(event === 'PreToolUse' || event === 'PostToolUse');
  const isPromptDisabled = promptTypeSupport === 'unsupported';
  const showSiblingRadio = !isCreateMode && siblingCount >= 1;
  const showDecisionPanel = mode === 'form' && type === 'command' && event === 'PreToolUse';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hook-editor-title"
        className="bg-white dark:bg-[#263240] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col mx-4 ring-1 ring-gray-200 dark:ring-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#3a4d5e]/50">
          <h2
            id="hook-editor-title"
            className="text-base font-semibold text-gray-900 dark:text-gray-100"
          >
            {isCreateMode
              ? t('harness.hook.editor.createTitle', {
                  event,
                  defaultValue: `New ${event} hook`,
                })
              : t('harness.hook.editor.editTitle', {
                  event: card!.event,
                  defaultValue: `Edit ${card!.event} hook`,
                })}
          </h2>
          <div className="flex items-center gap-2">
            {!isCreateMode && (
              <div className="inline-flex rounded border border-gray-300 dark:border-gray-600 text-xs">
                <button
                  type="button"
                  className={`px-2 py-1 ${
                    mode === 'form'
                      ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                  onClick={() => setMode('form')}
                  disabled={mode === 'raw' && rawParseError}
                >
                  {t('harness.hook.editor.modeForm', { defaultValue: 'Form' })}
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 ${
                    mode === 'raw'
                      ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                  onClick={() => setMode('raw')}
                >
                  {t('harness.hook.editor.modeRaw', { defaultValue: 'Raw' })}
                </button>
              </div>
            )}
            <button
              type="button"
              aria-label={t('harness.hook.editor.close', { defaultValue: 'Close' })}
              onClick={props.onClose}
              className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {staleBanner && (
            <div
              role="alert"
              className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
            >
              <p className="font-medium">{t('harness.hook.editor.staleBanner')}</p>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={handleReloadFromDisk}
                  className="px-2.5 py-1 text-xs rounded-md bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {t('harness.hook.editor.staleReload')}
                </button>
                <button
                  type="button"
                  onClick={handleOverwriteDisk}
                  className="px-2.5 py-1 text-xs rounded-md border border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-800/50"
                >
                  {t('harness.hook.editor.staleOverwrite')}
                </button>
              </div>
            </div>
          )}

          {saveError && (
            <div
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-sm text-red-800 dark:text-red-200"
            >
              {saveError}
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
                    setSaveError(
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
                      await appendGitignorePattern(props.projectSlug, REQUIRED_LOCAL_PATTERN);
                      await retry();
                    } catch (err) {
                      setSaveError(err instanceof ApiError ? err.message : (err as Error).message);
                    }
                  }}
                  className="px-2 py-1 text-xs rounded-md bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {t('harness.tools.shareBadge.gitignorePatternMissing.confirmCta')}
                </button>
              </div>
            </div>
          )}

          {siblingsBanner !== null && (
            <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/30 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
              {t('harness.hook.editor.matcher.sharedWithSiblings', {
                count: siblingsBanner,
                defaultValue: `This matcher is shared with ${siblingsBanner} other hook(s) in the same group.`,
              })}
            </div>
          )}

          {mode === 'form' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('harness.hook.editor.event', { defaultValue: 'Event' })}
                </label>
                <select
                  value={event}
                  onChange={(e) => setEvent(e.target.value as HarnessHookEvent)}
                  disabled={isReadOnly || !isCreateMode}
                  className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-mono"
                >
                  {HARNESS_HOOK_EVENTS.map((ev) => (
                    <option key={ev} value={ev}>
                      {t(`harness.hook.events.${ev}`, { defaultValue: ev })}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('harness.hook.editor.matcherLabel', { defaultValue: 'Matcher' })}
                </label>
                <input
                  type="text"
                  value={matcher}
                  onChange={(e) => setMatcher(e.target.value)}
                  disabled={isReadOnly}
                  placeholder={
                    matcherIsIgnored
                      ? t('harness.hook.editor.matcher.ignoredOnEvent', {
                          event,
                          defaultValue: `${event} ignores matcher`,
                        })
                      : 'Write|Edit|Bash'
                  }
                  className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-mono"
                  aria-invalid={!!matcherError}
                />
                {matcherError && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{matcherError}</p>
                )}
                {!matcherError && matcherIsIgnored && matcher.trim() === '' && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('harness.hook.editor.matcher.ignoredOnEvent', {
                      event,
                      defaultValue: `${event} ignores matcher`,
                    })}
                  </p>
                )}
                {!matcherError && !matcherIsIgnored && matcher.trim() === '' && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('harness.hook.editor.matcher.matchAllHint', {
                      defaultValue: '(Empty matcher = match all calls.)',
                    })}
                  </p>
                )}
                {showSiblingRadio && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {t('harness.hook.editor.matcher.applyOption.title', {
                        defaultValue: 'Apply matcher change to:',
                      })}
                    </p>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="apply-option"
                        checked={!splitFromGroup}
                        onChange={() => setSplitFromGroup(false)}
                      />
                      <span>
                        {t('harness.hook.editor.matcher.applyOption.sharedWithSiblings', {
                          count: siblingCount,
                        })}
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="apply-option"
                        checked={splitFromGroup}
                        onChange={() => setSplitFromGroup(true)}
                      />
                      <span>
                        {t('harness.hook.editor.matcher.applyOption.splitFromGroup', {
                          defaultValue: 'Only this hook (extract into its own group)',
                        })}
                      </span>
                    </label>
                  </div>
                )}
                {!isCreateMode && card && !isReadOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      if (matcherError) return;
                      void saveMatcher(matcher === '' ? null : matcher);
                    }}
                    className="mt-2 px-2.5 py-1 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {t('harness.hook.editor.matcher.saveButton', { defaultValue: 'Save matcher' })}
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('harness.hook.editor.type', { defaultValue: 'Type' })}
                </label>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="hook-type"
                      checked={type === 'command'}
                      onChange={() => setType('command')}
                      disabled={isReadOnly}
                    />
                    <span>{t('harness.hook.type.command')}</span>
                  </label>
                  <label
                    className={`inline-flex items-center gap-2 ${
                      isPromptDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                    title={
                      isPromptDisabled
                        ? t('harness.hook.editor.promptTypeUnsupported', {
                            defaultValue: 'This CLI version does not support prompt-type hooks.',
                          })
                        : undefined
                    }
                  >
                    <input
                      type="radio"
                      name="hook-type"
                      checked={type === 'prompt'}
                      onChange={() => setType('prompt')}
                      disabled={isReadOnly || isPromptDisabled}
                    />
                    <span>{t('harness.hook.type.prompt')}</span>
                  </label>
                </div>
                {type === 'prompt' && (
                  <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">
                    {t('harness.hook.banner.promptCost')}
                  </p>
                )}
              </div>

              {showDecisionPanel && (
                <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm font-medium text-blue-800 dark:text-blue-200 flex items-center justify-between"
                    onClick={() => setDecisionPanelOpen((v) => !v)}
                  >
                    <span>
                      {t('harness.hook.editor.decisionForm.title', {
                        defaultValue: 'PreToolUse decision builder',
                      })}
                    </span>
                    <span>{decisionPanelOpen ? '−' : '+'}</span>
                  </button>
                  {!decisionPanelOpen && (
                    <p className="px-3 pb-2 text-xs text-blue-700 dark:text-blue-300">
                      {t('harness.hook.editor.decisionForm.collapsedHint', {
                        defaultValue:
                          'Build a permissionDecision JSON via form, or use a quick template below.',
                      })}
                    </p>
                  )}
                  {decisionPanelOpen && (
                    <div className="px-3 pb-3 space-y-3 text-sm">
                      <div>
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {t('harness.hook.editor.decisionForm.decisionLabel')}
                        </p>
                        <div className="flex items-center gap-3 text-xs">
                          {(['allow', 'deny', 'ask'] as const).map((d) => (
                            <label
                              key={d}
                              className="inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <input
                                type="radio"
                                name="decision"
                                checked={decisionMode === d}
                                onChange={() => setDecisionMode(d)}
                              />
                              <span>{t(`harness.hook.editor.decisionForm.decision${d.charAt(0).toUpperCase()}${d.slice(1)}`)}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {t('harness.hook.editor.decisionForm.systemMessageLabel')}
                        </label>
                        <textarea
                          rows={2}
                          value={decisionSystemMessage}
                          onChange={(e) => setDecisionSystemMessage(e.target.value)}
                          placeholder={t(
                            'harness.hook.editor.decisionForm.systemMessagePlaceholder',
                            { defaultValue: 'Reason for deny / ask. Leave empty to omit.' },
                          )}
                          className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-mono"
                        />
                      </div>

                      {decisionMode === 'allow' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('harness.hook.editor.decisionForm.updatedInputLabel')}
                          </label>
                          <textarea
                            rows={3}
                            value={decisionUpdatedInput}
                            onChange={(e) => {
                              setDecisionUpdatedInput(e.target.value);
                              validateUpdatedInput(e.target.value);
                            }}
                            placeholder={t('harness.hook.editor.decisionForm.updatedInputPlaceholder')}
                            className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-mono"
                            aria-invalid={!!decisionUpdatedInputError}
                          />
                          {decisionUpdatedInputError && (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                              {decisionUpdatedInputError}
                            </p>
                          )}
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {t('harness.hook.editor.decisionForm.insertModeLabel', {
                            defaultValue: 'Insert mode',
                          })}
                        </p>
                        <div className="flex items-center gap-3 text-xs">
                          {(['prepend', 'replace'] as const).map((m) => (
                            <label
                              key={m}
                              className="inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <input
                                type="radio"
                                name="insert-mode"
                                checked={decisionInsertMode === m}
                                onChange={() => setDecisionInsertMode(m)}
                              />
                              <span>
                                {t(
                                  `harness.hook.editor.decisionForm.insertMode${m.charAt(0).toUpperCase()}${m.slice(1)}`,
                                )}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={generateDecisionSnippet}
                        disabled={!!decisionUpdatedInputError}
                        className="px-3 py-1 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                      >
                        {t('harness.hook.editor.decisionForm.generateButton', {
                          defaultValue: 'Generate shell snippet from form',
                        })}
                      </button>
                    </div>
                  )}

                  <div className="px-3 pb-3 text-xs">
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('harness.hook.editor.decisionTemplate.label', {
                        defaultValue: 'Quick templates',
                      })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(['allow', 'deny', 'ask'] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => handleQuickTemplate(k)}
                          className="px-2 py-0.5 rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-blue-900/20 text-blue-700 dark:text-blue-200"
                        >
                          {t(`harness.hook.editor.decisionTemplate.${k}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {type === 'command'
                    ? t('harness.hook.editor.command', { defaultValue: 'Command' })
                    : t('harness.hook.editor.prompt', { defaultValue: 'Prompt' })}
                </label>
                <textarea
                  rows={6}
                  value={bodyDraft}
                  onChange={(e) => setBodyDraft(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-mono"
                  aria-invalid={!!bodyError}
                />
                {bodyError && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{bodyError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('harness.hook.editor.timeout', { defaultValue: 'Timeout (seconds)' })}
                </label>
                <input
                  type="number"
                  min={0}
                  value={timeoutDraft}
                  onChange={(e) => setTimeoutDraft(e.target.value)}
                  disabled={isReadOnly}
                  className="w-32 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-mono"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('harness.hook.editor.timeoutHint', {
                    defaultValue: '0 or empty = use Claude Code default.',
                  })}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {rawParseError && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t('harness.hook.editor.rawParseError')}
                </p>
              )}
              <textarea
                rows={20}
                value={rawDraft}
                onChange={(e) => {
                  setRawDraft(e.target.value);
                  try {
                    JSON.parse(e.target.value);
                    setRawParseError(false);
                  } catch {
                    setRawParseError(true);
                  }
                }}
                disabled={isReadOnly}
                className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-mono"
              />
              {!isCreateMode && card && !isReadOnly && (
                <button
                  type="button"
                  onClick={() => {
                    if (rawParseError) return;
                    void saveRaw(rawDraft);
                  }}
                  disabled={rawParseError}
                  className="px-2.5 py-1 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  {t('harness.hook.editor.rawSaveButton', { defaultValue: 'Save raw JSON' })}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-[#3a4d5e]/50">
          {isSaving && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t('harness.hook.editor.saving', { defaultValue: 'Saving…' })}
            </span>
          )}
          {isCreateMode && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={!!matcherError || !!bodyError || isSaving}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              {t('harness.hook.editor.create', { defaultValue: 'Create hook' })}
            </button>
          )}
          <button
            type="button"
            onClick={props.onClose}
            className="px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('harness.hook.editor.close', { defaultValue: 'Close' })}
          </button>
        </div>
      </div>
    </div>
  );
}
