/**
 * Story 28.3: MCP server editor modal.
 *
 * Two-mode editor: a Form view that exposes type-aware fields (stdio:
 * command/args; sse/http/ws: url; http: headers; all: env) and a Raw view that
 * dumps the `mcpServers.<name>` object as pretty JSON. Saves run on a 300ms
 * debounce and surface STALE_WRITE conflicts via a banner that reloads the
 * latest disk contents.
 *
 * Plugin sources are read-only (the toggle is hidden by the panel; the form
 * inputs disable). Raw-mode parse failures lock the user inside Raw until the
 * JSON parses again — exactly the SkillEditor pattern.
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X, Eye, EyeOff } from 'lucide-react';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import type {
  HarnessExternalChangeEvent,
  HarnessMcpCard,
  HarnessMcpReadResponse,
  HarnessMcpServerConfig,
  HarnessMcpServerType,
  HarnessMcpSource,
} from '@hammoc/shared';
import { useTheme } from '../../../hooks/useTheme';
import { ApiError } from '../../../services/api/client';
import { readMcp, updateMcp } from '../../../services/api/harnessMcpsApi';
import { useHarnessMcpStore } from '../../../stores/harnessMcpStore';
import { useSecretOnSharedDialogStore } from '../../../stores/secretOnSharedDialogStore';
import { getSocket } from '../../../services/socket';
import {
  getActionLabelKey,
  routeToLocal,
  appendGitignorePattern,
  REQUIRED_LOCAL_PATTERN,
} from '../../../services/secretOnSharedRouter';

const LazyCodeMirror = lazy(() => import('@uiw/react-codemirror'));
const lazyJsonExt = (): Promise<Extension> =>
  import('@codemirror/lang-json').then((m) => m.json());

interface Props {
  card: HarnessMcpCard;
  projectSlug: string;
  onClose(): void;
}

type EditorMode = 'form' | 'raw';

interface SaveState {
  isSaving: boolean;
  mtime: string;
  staleBanner: boolean;
  /**
   * Story 28.3 AC5: 외부 변경 감지(또는 STALE_WRITE) 시 디스크에서 다시 읽은 내용.
   * 사용자가 staleBanner 의 "Reload" 버튼을 누르면 이 값이 폼/Raw draft 로 적용된다.
   * "Overwrite" 버튼을 누르면 현재 draft 가 expectedMtime 없이 강제 저장된다.
   */
  freshFromDisk: HarnessMcpReadResponse | null;
}

const DEBOUNCE_MS = 300;

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
}

const ENV_REF_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/;
const PLAIN_SECRET_LEN = 32;

export function McpEditor({ card, projectSlug, onClose }: Props) {
  const { t } = useTranslation('settings');
  const { resolvedTheme } = useTheme();
  const reload = useHarnessMcpStore((s) => s.load);

  const [selectedSource, setSelectedSource] = useState<HarnessMcpSource>(
    () => card.sources.find((s) => s.scope === card.activeScope) ?? card.sources[0],
  );
  const [data, setData] = useState<HarnessMcpReadResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('form');
  const [save, setSave] = useState<SaveState>({
    isSaving: false,
    mtime: '',
    staleBanner: false,
    freshFromDisk: null,
  });

  const isReadOnly = selectedSource.scope === 'plugin';

  // Story 30.7 (Task D.1-D.4): inline alert state for the
  // `.gitignore` pattern-missing flow. When set, the user sees a confirm/
  // cancel prompt; confirming appends `**/.claude/**/*.local.*` and retries
  // the sibling save. Cancel surfaces the fallback-hint and aborts.
  const [gitignorePrompt, setGitignorePrompt] = useState<
    | null
    | {
        siblingRelativePath: string;
        retry: () => Promise<void>;
      }
  >(null);

  const [typeDraft, setTypeDraft] = useState<HarnessMcpServerType>('stdio');
  const [commandDraft, setCommandDraft] = useState('');
  const [argsDraft, setArgsDraft] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const [headersDraft, setHeadersDraft] = useState<Record<string, string>>({});
  const [envDraft, setEnvDraft] = useState<Record<string, string>>({});
  const [rawDraft, setRawDraft] = useState('');
  const [rawParseError, setRawParseError] = useState(false);
  const [maskedFields, setMaskedFields] = useState<Set<string>>(new Set());
  const [pendingTypeChange, setPendingTypeChange] = useState<HarnessMcpServerType | null>(null);
  const [jsonExt, setJsonExt] = useState<Extension | null>(null);

  // Lazy-load the json grammar once.
  useEffect(() => {
    let alive = true;
    void lazyJsonExt().then((ext) => {
      if (alive) setJsonExt(ext);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Fetch entry whenever the user picks a different source.
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    readMcp(card.name, {
      scope: selectedSource.scope,
      projectSlug: selectedSource.projectSlug ?? projectSlug,
      pluginKey: selectedSource.pluginKey,
      fileKind: selectedSource.sourceFileKind,
    })
      .then((res) => {
        setData(res);
        const cfg = res.config;
        setTypeDraft(cfg.type ?? 'stdio');
        setCommandDraft(cfg.command ?? '');
        setArgsDraft((cfg.args ?? []).join('\n'));
        setUrlDraft(cfg.url ?? '');
        setHeadersDraft({ ...(cfg.headers ?? {}) });
        setEnvDraft({ ...(cfg.env ?? {}) });
        setRawDraft(res.raw);
        setSave({ isSaving: false, mtime: res.mtime, staleBanner: false, freshFromDisk: null });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : (err as Error).message))
      .finally(() => setIsLoading(false));
  }, [card.name, projectSlug, selectedSource]);

  const buildConfig = useCallback((): HarnessMcpServerConfig => {
    const cfg: HarnessMcpServerConfig = {};
    if (typeDraft !== 'stdio') cfg.type = typeDraft;
    if (typeDraft === 'stdio') {
      if (commandDraft.trim()) cfg.command = commandDraft;
      const args = argsDraft.split(/\r?\n/).map((s) => s).filter((s) => s.trim() !== '');
      if (args.length > 0) cfg.args = args;
    } else {
      if (urlDraft.trim()) cfg.url = urlDraft;
      if (typeDraft === 'http' && Object.keys(headersDraft).length > 0) {
        cfg.headers = { ...headersDraft };
      }
    }
    if (Object.keys(envDraft).length > 0) cfg.env = { ...envDraft };
    return cfg;
  }, [typeDraft, commandDraft, argsDraft, urlDraft, headersDraft, envDraft]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Story 30.7 (Task C.4): when the server hard-blocks the save with
  // `HARNESS_SECRET_ON_SHARED`, open the cross-panel dialog with the mcp
  // domain's label + a real routing callback. The routing call invokes
  // `secretOnSharedRouter.routeToLocal('mcp', …)` which performs a
  // share-scope pre-check and dispatches the sibling-save via the
  // `{scope:'local'}` body branch on the existing update route.
  // - gitignorePatternMissing → opens the inline gitignore-append prompt
  //   below; the prompt's "Confirm" retries the same routing call.
  // - apiError → surfaces a network-style toast.
  // The `onMarkNotSecret` callback just closes the dialog — re-saving will
  // re-trigger the block (per-save opt-out is the original intent).
  const performMoveToLocal = useCallback(
    async (cfgForRoute: HarnessMcpServerConfig): Promise<void> => {
      if (selectedSource.scope !== 'project') {
        // User scope (`~/.claude`) is not git-tracked, so the server's
        // share-scope guard never fires here — reaching this branch would
        // be a server-side bug, not a UX path we need to explain. Just
        // close the dialog silently to avoid a confusing toast.
        useSecretOnSharedDialogStore.getState().close();
        return;
      }
      const result = await routeToLocal({
        domain: 'mcp',
        projectSlug: selectedSource.projectSlug ?? projectSlug,
        card: { name: card.name, expectedMtime: save.mtime },
        payload: { mcpConfig: cfgForRoute },
      });
      if (result.ok) {
        void reload(projectSlug);
        return;
      }
      if (result.reason === 'gitignorePatternMissing') {
        setGitignorePrompt({
          siblingRelativePath: result.siblingRelativePath,
          retry: () => performMoveToLocal(cfgForRoute),
        });
        return;
      }
      setError(t('harness.tools.secretOnShared.routing.apiErrorToast'));
    },
    [card.name, projectSlug, reload, save.mtime, selectedSource.projectSlug, selectedSource.scope, t],
  );

  const handleSecretOnSharedError = useCallback((err: unknown, cfgForRoute: HarnessMcpServerConfig): boolean => {
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
    const fileName = selectedSource.sourceFileKind === 'mcp.json'
      ? '.mcp.json'
      : '.claude/settings.json';
    const fallbackPath = selectedSource.scope === 'project'
      ? fileName
      : `~/${fileName}`;
    useSecretOnSharedDialogStore.getState().open({
      origin: 'mcp',
      targetPath: details.relativePath ?? fallbackPath,
      secretLocations: locations,
      actionLabelKey: getActionLabelKey('mcp'),
      onMoveToLocal: () => {
        void performMoveToLocal(cfgForRoute);
      },
      onMarkNotSecret: () => {
        useSecretOnSharedDialogStore.getState().close();
      },
    });
    return true;
  }, [performMoveToLocal, selectedSource.scope, selectedSource.sourceFileKind]);

  const scheduleFormSave = useCallback(
    (cfg: HarnessMcpServerConfig) => {
      if (isReadOnly) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        // Validate at the boundary to keep the inline error consistent with the
        // save attempt — the server applies the same checks via Zod.
        const type = cfg.type ?? 'stdio';
        if (type === 'stdio' && !cfg.command) return;
        if (type !== 'stdio' && !cfg.url) return;
        setSave((s) => ({ ...s, isSaving: true, staleBanner: false }));
        try {
          const res = await updateMcp(
            card.name,
            {
              scope: selectedSource.scope as 'project' | 'user',
              projectSlug: selectedSource.projectSlug ?? projectSlug,
            },
            { config: cfg, expectedMtime: save.mtime },
          );
          setSave({ isSaving: false, mtime: res.mtime, staleBanner: false, freshFromDisk: null });
          void reload(projectSlug);
        } catch (err) {
          setSave((s) => ({ ...s, isSaving: false }));
          if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
            // Disk has been updated under us. Fetch the fresh content but
            // **do not** auto-apply it to drafts or auto-bump save.mtime —
            // the user must explicitly pick Reload (overwrite their drafts
            // with disk) or Overwrite (force-save their drafts over disk).
            const fresh = await readMcp(card.name, {
              scope: selectedSource.scope,
              projectSlug: selectedSource.projectSlug ?? projectSlug,
              pluginKey: selectedSource.pluginKey,
              fileKind: selectedSource.sourceFileKind,
            });
            setSave((s) => ({ ...s, staleBanner: true, freshFromDisk: fresh }));
          } else if (!handleSecretOnSharedError(err, cfg)) {
            setError(err instanceof ApiError ? err.message : (err as Error).message);
          }
        }
      }, DEBOUNCE_MS);
    },
    [card.name, handleSecretOnSharedError, isReadOnly, projectSlug, reload, save.mtime, selectedSource],
  );

  const scheduleRawSave = useCallback(
    (next: string) => {
      if (isReadOnly) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          JSON.parse(next);
          setRawParseError(false);
        } catch {
          setRawParseError(true);
          return;
        }
        setSave((s) => ({ ...s, isSaving: true, staleBanner: false }));
        try {
          const res = await updateMcp(
            card.name,
            {
              scope: selectedSource.scope as 'project' | 'user',
              projectSlug: selectedSource.projectSlug ?? projectSlug,
            },
            { raw: next, expectedMtime: save.mtime },
          );
          setSave({ isSaving: false, mtime: res.mtime, staleBanner: false, freshFromDisk: null });
          void reload(projectSlug);
        } catch (err) {
          setSave((s) => ({ ...s, isSaving: false }));
          if (err instanceof ApiError && err.code === 'HARNESS_PARSE_ERROR') {
            setRawParseError(true);
            return;
          }
          if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
            // See scheduleFormSave: stash the fresh disk content so the
            // staleBanner can offer Reload / Overwrite — do not silently
            // bump save.mtime.
            const fresh = await readMcp(card.name, {
              scope: selectedSource.scope,
              projectSlug: selectedSource.projectSlug ?? projectSlug,
              pluginKey: selectedSource.pluginKey,
              fileKind: selectedSource.sourceFileKind,
            });
            setSave((s) => ({ ...s, staleBanner: true, freshFromDisk: fresh }));
          } else {
            // Raw mode: parse the JSON back to a config so the router can
            // forward it via the {scope:'local'} sibling-save path. If the
            // parse fails (the user just typed garbage), fall back to the
            // generic error toast.
            let rawCfg: HarnessMcpServerConfig | null = null;
            try {
              rawCfg = JSON.parse(next) as HarnessMcpServerConfig;
            } catch {
              rawCfg = null;
            }
            if (rawCfg && handleSecretOnSharedError(err, rawCfg)) {
              return;
            }
            setError(err instanceof ApiError ? err.message : (err as Error).message);
          }
        }
      }, DEBOUNCE_MS);
    },
    [card.name, handleSecretOnSharedError, isReadOnly, projectSlug, reload, save.mtime, selectedSource],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  // Subscribe to external-change events so disk edits made while the editor
  // is open surface the reload/overwrite choice immediately, not just on
  // the next save attempt. Plugin sources never fire watcher events so we
  // skip the wiring there.
  useEffect(() => {
    if (isReadOnly) return;
    const socket = getSocket();
    const targetBasename = basename(selectedSource.absoluteFile);
    const handler = (payload: HarnessExternalChangeEvent) => {
      if (payload.scope !== selectedSource.scope) return;
      if (basename(payload.path) !== targetBasename) return;
      // Refetch and surface the staleBanner only when the on-disk mtime has
      // actually moved — avoids a no-op banner when the watcher event was
      // raised by our own save (writeFileNoOp flips the suppress window but
      // can race on slow filesystems).
      void readMcp(card.name, {
        scope: selectedSource.scope,
        projectSlug: selectedSource.projectSlug ?? projectSlug,
        pluginKey: selectedSource.pluginKey,
        fileKind: selectedSource.sourceFileKind,
      })
        .then((fresh) => {
          setSave((s) => {
            if (!s.mtime || fresh.mtime === s.mtime) return s;
            return { ...s, staleBanner: true, freshFromDisk: fresh };
          });
        })
        .catch(() => {
          // Silent — a missing file mid-flight just means the next save
          // will take the create path.
        });
    };
    socket.on('harness:external-change', handler);
    return () => {
      socket.off('harness:external-change', handler);
    };
  }, [card.name, isReadOnly, projectSlug, selectedSource]);

  const applyReloadFromDisk = useCallback(() => {
    const fresh = save.freshFromDisk;
    if (!fresh) return;
    setData(fresh);
    const cfg = fresh.config;
    setTypeDraft(cfg.type ?? 'stdio');
    setCommandDraft(cfg.command ?? '');
    setArgsDraft((cfg.args ?? []).join('\n'));
    setUrlDraft(cfg.url ?? '');
    setHeadersDraft({ ...(cfg.headers ?? {}) });
    setEnvDraft({ ...(cfg.env ?? {}) });
    setRawDraft(fresh.raw);
    setRawParseError(false);
    setSave({ isSaving: false, mtime: fresh.mtime, staleBanner: false, freshFromDisk: null });
  }, [save.freshFromDisk]);

  const commitOverwrite = useCallback(async () => {
    if (isReadOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSave((s) => ({ ...s, isSaving: true }));
    try {
      const body = mode === 'raw'
        ? { raw: rawDraft }
        : { config: buildConfig() };
      // No expectedMtime → server skips the STALE_WRITE check and our
      // drafts win over whatever showed up on disk.
      const res = await updateMcp(
        card.name,
        {
          scope: selectedSource.scope as 'project' | 'user',
          projectSlug: selectedSource.projectSlug ?? projectSlug,
        },
        body,
      );
      setSave({ isSaving: false, mtime: res.mtime, staleBanner: false, freshFromDisk: null });
      void reload(projectSlug);
    } catch (err) {
      setSave((s) => ({ ...s, isSaving: false }));
      let cfgForRoute: HarnessMcpServerConfig | null = null;
      if (mode === 'raw') {
        try {
          cfgForRoute = JSON.parse(rawDraft) as HarnessMcpServerConfig;
        } catch {
          cfgForRoute = null;
        }
      } else {
        cfgForRoute = buildConfig();
      }
      if (!cfgForRoute || !handleSecretOnSharedError(err, cfgForRoute)) {
        setError(err instanceof ApiError ? err.message : (err as Error).message);
      }
    }
  }, [
    buildConfig,
    card.name,
    handleSecretOnSharedError,
    isReadOnly,
    mode,
    projectSlug,
    rawDraft,
    reload,
    selectedSource,
  ]);

  // Type switching warns when changing would discard fields.
  const handleTypeRequest = (next: HarnessMcpServerType) => {
    if (next === typeDraft) return;
    const cur = typeDraft;
    const losingStdio = cur === 'stdio' && next !== 'stdio' && (commandDraft || argsDraft.trim());
    const losingNetwork = cur !== 'stdio' && next === 'stdio' && urlDraft;
    const losingHeaders = cur === 'http' && next !== 'http' && Object.keys(headersDraft).length > 0;
    if (losingStdio || losingNetwork || losingHeaders) {
      setPendingTypeChange(next);
      return;
    }
    applyTypeChange(next);
  };

  const applyTypeChange = (next: HarnessMcpServerType) => {
    if (next === 'stdio') {
      setUrlDraft('');
      setHeadersDraft({});
    }
    if (next !== 'stdio') {
      setCommandDraft('');
      setArgsDraft('');
    }
    if (next !== 'http') {
      setHeadersDraft({});
    }
    setTypeDraft(next);
    setPendingTypeChange(null);
    setTimeout(() => {
      const cfg: HarnessMcpServerConfig = {
        ...(next !== 'stdio' ? { type: next } : {}),
        ...(next === 'stdio' ? {} : { url: urlDraft }),
      };
      if (Object.keys(envDraft).length > 0) cfg.env = { ...envDraft };
      scheduleFormSave(cfg);
    }, 0);
  };

  // Form validation
  const commandInvalid = typeDraft === 'stdio' && commandDraft.trim() === '';
  const urlInvalid = typeDraft !== 'stdio' && urlDraft.trim() === '';

  const codeMirrorTheme = resolvedTheme === 'dark' ? oneDark : 'light';
  const codeMirrorExtensions: Extension[] = [EditorView.lineWrapping];
  if (jsonExt) codeMirrorExtensions.push(jsonExt);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-editor-title"
        className="bg-white dark:bg-[#263240] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col mx-4 ring-1 ring-gray-200 dark:ring-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#3a4d5e]/50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2
              id="mcp-editor-title"
              className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate"
            >
              {card.name}
            </h2>
            {card.sources.length > 1 && (
              <select
                value={`${selectedSource.scope}#${selectedSource.pluginKey ?? ''}`}
                onChange={(e) => {
                  const [scope, pluginKey] = e.target.value.split('#');
                  const next = card.sources.find(
                    (s) => s.scope === scope && (s.pluginKey ?? '') === pluginKey,
                  );
                  if (next) setSelectedSource(next);
                }}
                className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
              >
                {card.sources.map((src) => (
                  <option
                    key={`${src.scope}#${src.pluginKey ?? ''}`}
                    value={`${src.scope}#${src.pluginKey ?? ''}`}
                  >
                    {`${t(`harness.mcp.scopeBadge.${src.scope}`)}${
                      src.pluginKey ? ` (${src.pluginKey})` : ''
                    }`}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle
              mode={mode}
              onChange={(next) => setMode(next)}
              disabled={rawParseError}
              t={t}
            />
            <button
              type="button"
              aria-label={t('harness.mcp.editor.close', { defaultValue: 'Close' })}
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-4">
          {save.staleBanner && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
            >
              <p>{t('harness.mcp.editor.staleBanner')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={applyReloadFromDisk}
                  disabled={!save.freshFromDisk || save.isSaving}
                  className="inline-flex items-center rounded bg-amber-600 hover:bg-amber-700 px-2 py-1 text-white text-[11px] font-medium disabled:opacity-50"
                >
                  {t('harness.mcp.editor.staleReload', { defaultValue: 'Reload from disk' })}
                </button>
                <button
                  type="button"
                  onClick={() => void commitOverwrite()}
                  disabled={save.isSaving}
                  className="inline-flex items-center rounded border border-amber-600 text-amber-800 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-800/40 px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                >
                  {t('harness.mcp.editor.staleOverwrite', { defaultValue: 'Overwrite disk version' })}
                </button>
              </div>
            </div>
          )}
          {rawParseError && (
            <div
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-800 dark:text-red-200"
            >
              {t('harness.mcp.editor.rawParseError')}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-800 dark:text-red-200"
            >
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
                      await appendGitignorePattern(
                        selectedSource.projectSlug ?? projectSlug,
                        REQUIRED_LOCAL_PATTERN,
                      );
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
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('harness.mcp.editor.loading', { defaultValue: 'Loading…' })}
            </div>
          )}

          {!isLoading && data && mode === 'form' && (
            <section className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                  {t('harness.mcp.editor.type')}
                </label>
                <select
                  value={typeDraft}
                  disabled={isReadOnly}
                  onChange={(e) => handleTypeRequest(e.target.value as HarnessMcpServerType)}
                  className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-mono disabled:opacity-60"
                >
                  <option value="stdio">stdio</option>
                  <option value="sse">sse</option>
                  <option value="http">http</option>
                  <option value="ws">ws</option>
                </select>
              </div>

              {typeDraft === 'stdio' && (
                <>
                  <div>
                    <label
                      htmlFor="mcp-command"
                      className="block text-xs text-gray-600 dark:text-gray-300 mb-1"
                    >
                      {t('harness.mcp.editor.command')}
                    </label>
                    <input
                      id="mcp-command"
                      type="text"
                      value={commandDraft}
                      disabled={isReadOnly}
                      onChange={(e) => {
                        setCommandDraft(e.target.value);
                        scheduleFormSave({
                          ...buildConfig(),
                          command: e.target.value,
                        });
                      }}
                      aria-invalid={commandInvalid}
                      className={`w-full px-2 py-1 rounded border bg-white dark:bg-gray-900 text-sm font-mono ${
                        commandInvalid ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
                      } disabled:opacity-60`}
                    />
                    {commandInvalid && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {t('harness.mcp.editor.required.command')}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="mcp-args"
                      className="block text-xs text-gray-600 dark:text-gray-300 mb-1"
                    >
                      {t('harness.mcp.editor.args')}
                    </label>
                    <textarea
                      id="mcp-args"
                      rows={3}
                      value={argsDraft}
                      disabled={isReadOnly}
                      onChange={(e) => {
                        setArgsDraft(e.target.value);
                        const args = e.target.value
                          .split(/\r?\n/)
                          .filter((s) => s.trim() !== '');
                        scheduleFormSave({ ...buildConfig(), args });
                      }}
                      className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-mono disabled:opacity-60"
                    />
                  </div>
                </>
              )}

              {typeDraft !== 'stdio' && (
                <>
                  <div>
                    <label
                      htmlFor="mcp-url"
                      className="block text-xs text-gray-600 dark:text-gray-300 mb-1"
                    >
                      {t('harness.mcp.editor.url')}
                    </label>
                    <input
                      id="mcp-url"
                      type="text"
                      value={urlDraft}
                      disabled={isReadOnly}
                      onChange={(e) => {
                        setUrlDraft(e.target.value);
                        scheduleFormSave({ ...buildConfig(), url: e.target.value });
                      }}
                      aria-invalid={urlInvalid}
                      className={`w-full px-2 py-1 rounded border bg-white dark:bg-gray-900 text-sm font-mono ${
                        urlInvalid ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
                      } disabled:opacity-60`}
                    />
                    {urlInvalid && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {t('harness.mcp.editor.required.url', { type: typeDraft })}
                      </p>
                    )}
                  </div>
                </>
              )}

              {typeDraft === 'http' && (
                <KeyValueRows
                  label={t('harness.mcp.editor.headers')}
                  rows={headersDraft}
                  onChange={(next) => {
                    setHeadersDraft(next);
                    scheduleFormSave({ ...buildConfig(), headers: next });
                  }}
                  masked={maskedFields}
                  onToggleMask={(k) => {
                    setMaskedFields((prev) => {
                      const set = new Set(prev);
                      const id = `headers.${k}`;
                      if (set.has(id)) set.delete(id);
                      else set.add(id);
                      return set;
                    });
                  }}
                  prefix="headers"
                  isReadOnly={isReadOnly}
                  t={t}
                />
              )}

              <KeyValueRows
                label={t('harness.mcp.editor.env')}
                rows={envDraft}
                onChange={(next) => {
                  setEnvDraft(next);
                  scheduleFormSave({ ...buildConfig(), env: next });
                }}
                masked={maskedFields}
                onToggleMask={(k) => {
                  setMaskedFields((prev) => {
                    const set = new Set(prev);
                    const id = `env.${k}`;
                    if (set.has(id)) set.delete(id);
                    else set.add(id);
                    return set;
                  });
                }}
                prefix="env"
                isReadOnly={isReadOnly}
                t={t}
              />
            </section>
          )}

          {!isLoading && data && mode === 'raw' && (
            <section className="space-y-2">
              <div className="border border-gray-200 dark:border-gray-700 rounded min-h-[400px]">
                <Suspense fallback={<EditorFallback t={t} />}>
                  <LazyCodeMirror
                    value={rawDraft}
                    extensions={codeMirrorExtensions}
                    theme={codeMirrorTheme}
                    readOnly={isReadOnly}
                    height="400px"
                    onChange={(value: string) => {
                      setRawDraft(value);
                      scheduleRawSave(value);
                    }}
                    basicSetup={{ lineNumbers: true, foldGutter: false, tabSize: 2 }}
                  />
                </Suspense>
              </div>
            </section>
          )}
        </div>

        {pendingTypeChange && (
          <TypeChangeConfirm
            from={typeDraft}
            to={pendingTypeChange}
            onCancel={() => setPendingTypeChange(null)}
            onConfirm={() => applyTypeChange(pendingTypeChange)}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

function EditorFallback({ t }: { t: (key: string, opts?: Record<string, unknown>) => string }) {
  return (
    <div className="flex items-center justify-center h-[200px] text-sm text-gray-500 dark:text-gray-400">
      <Loader2 className="w-4 h-4 animate-spin mr-2" />
      {t('harness.mcp.editor.loadingEditor', { defaultValue: 'Loading editor…' })}
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
  disabled,
  t,
}: {
  mode: EditorMode;
  onChange(next: EditorMode): void;
  disabled: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => onChange('form')}
        disabled={disabled}
        title={disabled ? t('harness.mcp.editor.rawParseError') : undefined}
        className={
          'px-2 py-1 ' + (mode === 'form'
            ? 'bg-blue-600 text-white'
            : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800') + (disabled ? ' opacity-50 cursor-not-allowed' : '')
        }
      >
        {t('harness.mcp.editor.modeForm', { defaultValue: 'Form' })}
      </button>
      <button
        type="button"
        onClick={() => onChange('raw')}
        className={
          'px-2 py-1 ' + (mode === 'raw'
            ? 'bg-blue-600 text-white'
            : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800')
        }
      >
        {t('harness.mcp.editor.modeRaw', { defaultValue: 'Raw' })}
      </button>
    </div>
  );
}

function TypeChangeConfirm({
  from,
  to,
  onCancel,
  onConfirm,
  t,
}: {
  from: HarnessMcpServerType;
  to: HarnessMcpServerType;
  onCancel(): void;
  onConfirm(): void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-[#263240] rounded-xl shadow-xl max-w-md w-full mx-4 ring-1 ring-gray-200 dark:ring-gray-700 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {t('harness.mcp.editor.typeChange.title')}
        </h3>
        <p className="text-xs text-gray-700 dark:text-gray-200 mb-4">
          {t('harness.mcp.editor.typeChange.intro', { from, to })}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('harness.mcp.editor.typeChange.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white"
          >
            {t('harness.mcp.editor.typeChange.submit', { defaultValue: 'Continue' })}
          </button>
        </div>
      </div>
    </div>
  );
}

interface KeyValueRowsProps {
  label: string;
  rows: Record<string, string>;
  onChange(next: Record<string, string>): void;
  masked: Set<string>;
  onToggleMask(key: string): void;
  prefix: string;
  isReadOnly: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function KeyValueRows({
  label,
  rows,
  onChange,
  masked,
  onToggleMask,
  prefix,
  isReadOnly,
  t,
}: KeyValueRowsProps) {
  const entries = Object.entries(rows);
  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');

  const updateValue = (key: string, value: string) => {
    onChange({ ...rows, [key]: value });
  };
  const removeKey = (key: string) => {
    const next = { ...rows };
    delete next[key];
    onChange(next);
  };
  const addRow = () => {
    if (!draftKey.trim()) return;
    if (rows[draftKey] !== undefined) return;
    onChange({ ...rows, [draftKey]: draftValue });
    setDraftKey('');
    setDraftValue('');
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</h4>
      <div className="space-y-1">
        {entries.map(([k, v]) => {
          const id = `${prefix}.${k}`;
          const isMasked = masked.has(id);
          const isEnvRef = ENV_REF_RE.test(v);
          const isLikelySecret = !isEnvRef && v.length >= PLAIN_SECRET_LEN;
          return (
            <div key={k} className="flex items-center gap-1">
              <input
                type="text"
                value={k}
                disabled
                className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-xs font-mono w-1/3 disabled:opacity-100"
              />
              <input
                type={isMasked ? 'password' : 'text'}
                value={v}
                disabled={isReadOnly}
                onChange={(e) => updateValue(k, e.target.value)}
                className="flex-1 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-mono disabled:opacity-60"
              />
              <button
                type="button"
                aria-label={t('harness.mcp.editor.maskToggle', { defaultValue: 'Show / hide value' })}
                onClick={() => onToggleMask(k)}
                className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {isMasked ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => removeKey(k)}
                  className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
                  aria-label={t('harness.mcp.editor.removeRow', { defaultValue: 'Remove row' })}
                >
                  ×
                </button>
              )}
              {isEnvRef && (
                <span className="text-[10px] text-blue-600 dark:text-blue-400" title={t('harness.mcp.secret.envRefMarker') as string}>
                  ${'{}'}
                </span>
              )}
              {isLikelySecret && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400" title={t('harness.mcp.secret.marker') as string}>
                  ●
                </span>
              )}
            </div>
          );
        })}
      </div>
      {!isReadOnly && (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            placeholder={t(`harness.mcp.editor.${prefix}Key`, { defaultValue: 'Key' }) as string}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-mono w-1/3"
          />
          <input
            type="text"
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            placeholder={t(`harness.mcp.editor.${prefix}Value`, { defaultValue: 'Value' }) as string}
            className="flex-1 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-mono"
          />
          <button
            type="button"
            onClick={addRow}
            className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {t('harness.mcp.editor.addRow', { defaultValue: '+ Add' })}
          </button>
        </div>
      )}
    </div>
  );
}
