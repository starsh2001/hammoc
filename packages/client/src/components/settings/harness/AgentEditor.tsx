/**
 * Story 28.6: Sub-agent editor.
 *
 * Two modes:
 *   - Form: separate inputs for the 4 required + 1 optional frontmatter
 *     fields (name read-only / description / model / color / tools 3-state) +
 *     a CodeMirror markdown editor for the body. The `<example>` template
 *     button (AC4) inserts a skeleton at the cursor; an `<example>` highlight
 *     ViewPlugin (AC2.b) decorates blocks in the body editor.
 *   - Raw: a single CodeMirror buffer with frontmatter + body. Frontmatter
 *     parse errors surface a banner that disables the toggle back to Form
 *     until the user fixes the YAML.
 *
 * STALE_WRITE handling mirrors the 28.5 CommandEditor reload/overwrite banner.
 * After a successful save the user sees a toast — "Saved. Available via Task
 * tool from your next message." (AC3.b).
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import type { Extension } from '@codemirror/state';
import type {
  HarnessAgentCard,
  HarnessAgentColor,
  HarnessAgentFrontmatter,
  HarnessAgentModel,
  HarnessAgentReadResponse,
  HarnessAgentToolsState,
} from '@hammoc/shared';
import { ApiError } from '../../../services/api/client';
import {
  deleteAgent,
  readAgent,
  updateAgent,
} from '../../../services/api/harnessAgentsApi';
import { useHarnessAgentStore } from '../../../stores/harnessAgentStore';
import { getSocket } from '../../../services/socket';

const LazyCodeMirror = lazy(() => import('@uiw/react-codemirror'));
const lazyBodyExtensions = (): Promise<Extension[]> =>
  Promise.all([
    import('@codemirror/lang-markdown').then((m) => m.markdown()),
    import('./agentExampleHighlight').then((m) => m.agentExampleHighlightExtension),
  ]);

interface Props {
  card: HarnessAgentCard;
  projectSlug: string;
  onClose(): void;
}

type EditorMode = 'form' | 'raw';

const DEBOUNCE_MS = 300;
const NO_EXAMPLE_DEBOUNCE_MS = 100;

const COLORS: HarnessAgentColor[] = ['blue', 'cyan', 'green', 'yellow', 'magenta', 'red'];
const COLOR_HEX: Record<HarnessAgentColor, string> = {
  blue: '#3b82f6',
  cyan: '#06b6d4',
  green: '#22c55e',
  yellow: '#eab308',
  magenta: '#d946ef',
  red: '#ef4444',
};

const MODELS: HarnessAgentModel[] = ['inherit', 'sonnet', 'opus', 'haiku'];

/** Tools that the harness exposes via Task tool — used as autocomplete hints. */
const TOOL_SUGGESTIONS = [
  'Read',
  'Edit',
  'Write',
  'Glob',
  'Grep',
  'Bash',
  'WebSearch',
  'WebFetch',
  'TodoWrite',
];

const EXAMPLE_TEMPLATE = `<example>
context: <어떤 상황에서 이 에이전트가 호출되어야 하는지 한 줄>
user: "<사용자 발화 예시>"
assistant: "<이 에이전트가 처리하는 응답의 첫 마디 + Task tool 호출 의도>"
commentary: <자동 선택 트리거링 품질을 위한 짧은 설명>
</example>`;

const EXAMPLE_BLOCK_RE = /<example[\s>][\s\S]*?<\/example>/i;

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
}

export function AgentEditor({ card, projectSlug, onClose }: Props) {
  const { t } = useTranslation('settings');
  const reload = useHarnessAgentStore((s) => s.load);

  const [data, setData] = useState<HarnessAgentReadResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('form');
  const [mtime, setMtime] = useState<string>(card.mtime);
  const [staleBanner, setStaleBanner] = useState(false);
  const [freshFromDisk, setFreshFromDisk] = useState<HarnessAgentReadResponse | null>(null);
  const [bodyExtensions, setBodyExtensions] = useState<Extension[] | null>(null);
  const [rawParseError, setRawParseError] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [exampleInsertedToast, setExampleInsertedToast] = useState(false);
  const [hasExampleNow, setHasExampleNow] = useState(true);

  // Form drafts
  const [descriptionDraft, setDescriptionDraft] = useState<string>('');
  const [modelDraft, setModelDraft] = useState<HarnessAgentModel>('inherit');
  const [colorDraft, setColorDraft] = useState<HarnessAgentColor>('blue');
  const [toolsStateDraft, setToolsStateDraft] = useState<HarnessAgentToolsState>('omitted');
  const [toolsDraft, setToolsDraft] = useState<string[]>([]);
  const [bodyDraft, setBodyDraft] = useState<string>('');
  const [rawDraft, setRawDraft] = useState<string>('');

  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

  const isReadOnly = card.scope === 'plugin';

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
    readAgent(card)
      .then((res) => {
        setData(res);
        setMtime(res.mtime);
        setDescriptionDraft(res.frontmatter.description);
        setModelDraft(res.frontmatter.model);
        setColorDraft(res.frontmatter.color);
        setToolsStateDraft(res.toolsState);
        setToolsDraft(res.frontmatter.tools ?? []);
        setBodyDraft(res.body);
        setRawDraft(res.raw);
        setHasExampleNow(res.hasExampleBlock);
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
      readAgent(card)
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

  // AC4.c friendly warning — debounced check for `<example>` matches in body.
  useEffect(() => {
    const timer = setTimeout(() => {
      setHasExampleNow(EXAMPLE_BLOCK_RE.test(bodyDraft));
    }, NO_EXAMPLE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [bodyDraft]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildFrontmatter = useCallback((): HarnessAgentFrontmatter => {
    const fm: HarnessAgentFrontmatter = {
      name: card.name,
      description: descriptionDraft,
      model: modelDraft,
      color: colorDraft,
    };
    if (toolsStateDraft === 'populated') {
      fm.tools = toolsDraft;
    } else if (toolsStateDraft === 'empty') {
      fm.tools = [];
    }
    return fm;
  }, [card.name, descriptionDraft, modelDraft, colorDraft, toolsStateDraft, toolsDraft]);

  const flushSave = useCallback(
    async (payload:
      | { kind: 'frontmatter'; frontmatter: HarnessAgentFrontmatter; toolsState: HarnessAgentToolsState }
      | { kind: 'body'; body: string }
      | { kind: 'raw'; raw: string }) => {
      if (isReadOnly) return;
      try {
        const res = await updateAgent(card, {
          ...(payload.kind === 'frontmatter'
            ? { frontmatter: payload.frontmatter, toolsState: payload.toolsState }
            : {}),
          ...(payload.kind === 'body' ? { body: payload.body } : {}),
          ...(payload.kind === 'raw' ? { raw: payload.raw } : {}),
          expectedMtime: mtime,
        });
        setMtime(res.mtime);
        setStaleBanner(false);
        setFreshFromDisk(null);
        setError(null);
        setSavedToast(true);
        setTimeout(() => setSavedToast(false), 2500);
        void reload(projectSlug);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
          const fresh = await readAgent(card).catch(() => null);
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
        setError(err instanceof ApiError ? err.message : (err as Error).message);
      }
    },
    [card, isReadOnly, mtime, projectSlug, reload],
  );

  const scheduleFormSave = useCallback(() => {
    if (isReadOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushSave({
        kind: 'frontmatter',
        frontmatter: buildFrontmatter(),
        toolsState: toolsStateDraft,
      });
    }, DEBOUNCE_MS);
  }, [buildFrontmatter, flushSave, isReadOnly, toolsStateDraft]);

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

  const handleInsertExample = () => {
    const ta = descriptionRef.current;
    let next = descriptionDraft;
    if (ta) {
      const cursor = ta.selectionStart ?? descriptionDraft.length;
      const before = descriptionDraft.slice(0, cursor);
      const after = descriptionDraft.slice(cursor);
      const sep = before.length > 0 && !before.endsWith('\n') ? '\n\n' : '';
      next = `${before}${sep}${EXAMPLE_TEMPLATE}\n\n${after}`;
    } else {
      next = `${descriptionDraft ? `${descriptionDraft}\n\n` : ''}${EXAMPLE_TEMPLATE}\n`;
    }
    setDescriptionDraft(next);
    setExampleInsertedToast(true);
    setTimeout(() => setExampleInsertedToast(false), 2000);
    scheduleFormSave();
  };

  const handleReload = () => {
    if (!freshFromDisk) return;
    setData(freshFromDisk);
    setMtime(freshFromDisk.mtime);
    setDescriptionDraft(freshFromDisk.frontmatter.description);
    setModelDraft(freshFromDisk.frontmatter.model);
    setColorDraft(freshFromDisk.frontmatter.color);
    setToolsStateDraft(freshFromDisk.toolsState);
    setToolsDraft(freshFromDisk.frontmatter.tools ?? []);
    setBodyDraft(freshFromDisk.body);
    setRawDraft(freshFromDisk.raw);
    setStaleBanner(false);
    setFreshFromDisk(null);
  };

  const handleOverwrite = async () => {
    if (isReadOnly) return;
    try {
      const res = await updateAgent(card, {
        ...(mode === 'raw'
          ? { raw: rawDraft }
          : { frontmatter: buildFrontmatter(), toolsState: toolsStateDraft }),
      });
      setMtime(res.mtime);
      setStaleBanner(false);
      setFreshFromDisk(null);
      void reload(projectSlug);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (isReadOnly) return;
    if (
      !window.confirm(
        t('harness.agent.editor.delete.confirm', {
          name: card.name,
          scope: card.scope,
          defaultValue: `Delete ${card.name} from ${card.scope}?`,
        }),
      )
    ) {
      return;
    }
    try {
      await deleteAgent({
        scope: card.scope as 'project' | 'user',
        projectSlug: card.projectSlug,
        name: card.name,
        expectedMtime: mtime,
      });
      await reload(projectSlug);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const handleAddTool = () => {
    setToolsDraft((prev) => [...prev, '']);
    setToolsStateDraft('populated');
    scheduleFormSave();
  };
  const handleUpdateTool = (idx: number, value: string) => {
    setToolsDraft((prev) => prev.map((t, i) => (i === idx ? value : t)));
    scheduleFormSave();
  };
  const handleRemoveTool = (idx: number) => {
    setToolsDraft((prev) => prev.filter((_, i) => i !== idx));
    scheduleFormSave();
  };

  const showNoExampleWarning = useMemo(() => !hasExampleNow, [hasExampleNow]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('harness.agent.editor.frontmatterTitle', {
        defaultValue: 'Edit sub-agent',
      })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-lg bg-white dark:bg-gray-900 p-5 shadow-lg flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-label={t('harness.agent.editor.colorPicker.label', {
                defaultValue: 'Agent color',
              })}
              className="inline-block w-3.5 h-3.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: COLOR_HEX[colorDraft] }}
            />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 font-mono truncate">
              {card.name}
            </h2>
            <span
              className={
                'inline-flex rounded px-1.5 py-0.5 text-xs font-medium ' +
                (card.scope === 'project'
                  ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200'
                  : card.scope === 'user'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200'
                    : 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200')
              }
            >
              {card.scope === 'plugin'
                ? t('harness.agent.scopeBadge.pluginWithKey', {
                    key: card.pluginKey,
                    defaultValue: `Plugin: ${card.pluginKey}`,
                  })
                : t(`harness.agent.scopeBadge.${card.scope}`, {
                    defaultValue: card.scope === 'project' ? 'Project' : 'Global',
                  })}
            </span>
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

        {isReadOnly && (
          <div role="alert" className="rounded-md border border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-900/30 px-3 py-2 text-xs text-purple-900 dark:text-purple-100">
            {t('harness.agent.banner.pluginReadOnly', {
              defaultValue:
                'This is a plugin-provided agent — use Override-clone to customize.',
            })}
          </div>
        )}

        {staleBanner && (
          <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 flex items-center justify-between gap-2">
            <span>
              {t('harness.agent.editor.staleBanner', {
                defaultValue:
                  'This agent was changed externally — your save was rejected.',
              })}
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={handleReload} className="underline">
                {t('harness.agent.editor.staleReload', { defaultValue: 'Reload' })}
              </button>
              <button type="button" onClick={handleOverwrite} className="underline">
                {t('harness.agent.editor.staleOverwrite', { defaultValue: 'Overwrite' })}
              </button>
            </span>
          </div>
        )}

        {rawParseError && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-900 dark:text-red-100">
            {t('harness.agent.editor.rawParseError', {
              defaultValue:
                'Frontmatter cannot be parsed — fix the YAML to return to Form mode.',
            })}
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-900 dark:text-red-100">
            {error}
          </div>
        )}

        {savedToast && (
          <div role="status" data-testid="agent-saved-toast" className="rounded-md border border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30 px-3 py-2 text-xs text-blue-900 dark:text-blue-100">
            {t('harness.agent.banner.appliesNextMessage', {
              defaultValue:
                'Saved. Available via Task tool from your next message.',
            })}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMode('form')}
            disabled={rawParseError}
            data-testid="agent-mode-form"
            className={`px-2 py-1 rounded-md ${mode === 'form' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200' : 'text-gray-600'}`}
          >
            Form
          </button>
          <button
            type="button"
            onClick={() => setMode('raw')}
            data-testid="agent-mode-raw"
            className={`px-2 py-1 rounded-md ${mode === 'raw' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200' : 'text-gray-600'}`}
          >
            {t('harness.agent.editor.rawToggle', { defaultValue: 'Raw' })}
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
                {t('harness.agent.editor.frontmatterTitle', {
                  defaultValue: 'Frontmatter',
                })}
              </legend>
              {/* name — read-only on edit (AC2.a) */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {t('harness.agent.editor.nameLabel', { defaultValue: 'Name' })}
                </span>
                <input
                  type="text"
                  value={card.name}
                  disabled
                  data-testid="agent-frontmatter-name"
                  className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-gray-100 dark:bg-gray-800 font-mono text-xs cursor-not-allowed"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t('harness.agent.editor.nameReadOnlyHint', {
                    defaultValue:
                      'Renaming requires copy + delete. Open the source via the ⋮ menu.',
                  })}
                </span>
              </label>
              {/* description */}
              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    {t('harness.agent.editor.descriptionLabel', {
                      defaultValue: 'Description',
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={handleInsertExample}
                    data-testid="agent-insert-example"
                    className="text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                  >
                    {t('harness.agent.editor.exampleTemplate.button', {
                      defaultValue: '+ Add example',
                    })}
                  </button>
                </div>
                <textarea
                  ref={descriptionRef}
                  value={descriptionDraft}
                  onChange={(e) => {
                    setDescriptionDraft(e.target.value);
                    scheduleFormSave();
                  }}
                  rows={4}
                  data-testid="agent-frontmatter-description"
                  className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800 text-xs font-mono"
                />
                {descriptionDraft.length === 0 && (
                  <span data-testid="agent-description-required" className="text-xs text-red-600 dark:text-red-400">
                    {t('harness.agent.editor.description.required', {
                      defaultValue: 'Description is required.',
                    })}
                  </span>
                )}
                {exampleInsertedToast && (
                  <span data-testid="agent-example-inserted-toast" className="text-xs text-blue-600 dark:text-blue-300">
                    {t('harness.agent.editor.exampleTemplate.inserted', {
                      defaultValue: 'Example template inserted at cursor.',
                    })}
                  </span>
                )}
              </label>
              {/* model */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {t('harness.agent.editor.modelLabel', { defaultValue: 'Model' })}
                </span>
                <select
                  value={modelDraft}
                  onChange={(e) => {
                    setModelDraft(e.target.value as HarnessAgentModel);
                    scheduleFormSave();
                  }}
                  data-testid="agent-frontmatter-model"
                  className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 bg-white dark:bg-gray-800"
                >
                  {MODELS.map((m) => (
                    <option key={m} value={m}>
                      {t(`harness.agent.editor.modelOptions.${m}`, { defaultValue: m })}
                    </option>
                  ))}
                </select>
              </label>
              {/* color picker */}
              <fieldset className="flex flex-col gap-1">
                <legend className="text-xs text-gray-700 dark:text-gray-300">
                  {t('harness.agent.editor.colorLabel', { defaultValue: 'Color' })}
                </legend>
                <div
                  role="radiogroup"
                  aria-label={t('harness.agent.editor.colorPicker.label', {
                    defaultValue: 'Choose agent card color',
                  })}
                  data-testid="agent-color-picker"
                  className="flex items-center gap-1.5"
                >
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={colorDraft === c}
                      data-color={c}
                      data-testid={`agent-color-${c}`}
                      title={t(`harness.agent.color.${c}`, { defaultValue: c })}
                      onClick={() => {
                        setColorDraft(c);
                        scheduleFormSave();
                      }}
                      className={
                        'w-7 h-7 rounded-full border-2 transition-transform ' +
                        (colorDraft === c
                          ? 'border-gray-900 dark:border-gray-100 scale-110'
                          : 'border-transparent hover:scale-105')
                      }
                      style={{ backgroundColor: COLOR_HEX[c] }}
                    />
                  ))}
                </div>
              </fieldset>
              {/* tools 3-state */}
              <fieldset className="flex flex-col gap-1">
                <legend className="text-xs text-gray-700 dark:text-gray-300">
                  {t('harness.agent.editor.toolsRadio.label', {
                    defaultValue: 'Tool access',
                  })}
                </legend>
                <div role="radiogroup" data-testid="agent-tools-radio" className="flex flex-col gap-1.5 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="agent-tools-state"
                      value="omitted"
                      checked={toolsStateDraft === 'omitted'}
                      onChange={() => {
                        setToolsStateDraft('omitted');
                        scheduleFormSave();
                      }}
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
                      name="agent-tools-state"
                      value="empty"
                      checked={toolsStateDraft === 'empty'}
                      onChange={() => {
                        setToolsStateDraft('empty');
                        scheduleFormSave();
                      }}
                    />
                    <span>
                      {t('harness.agent.editor.toolsRadio.empty', {
                        defaultValue: 'Disabled (empty array)',
                      })}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="agent-tools-state"
                      value="populated"
                      checked={toolsStateDraft === 'populated'}
                      onChange={() => {
                        setToolsStateDraft('populated');
                        scheduleFormSave();
                      }}
                    />
                    <span>
                      {t('harness.agent.editor.toolsRadio.populated', {
                        defaultValue: 'Custom allow-list',
                      })}
                    </span>
                  </label>
                </div>
                {toolsStateDraft === 'empty' && (
                  <span data-testid="agent-tools-empty-warning" className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    {t('harness.agent.editor.toolsRadio.emptyWarning', {
                      defaultValue:
                        'This option creates an agent with no tool access — was that intentional?',
                    })}
                  </span>
                )}
                {toolsStateDraft === 'populated' && (
                  <div className="flex flex-col gap-1 mt-2">
                    {toolsDraft.map((tool, idx) => (
                      <div key={`tool-${idx}`} className="flex items-center gap-2">
                        <input
                          type="text"
                          list="agent-tool-suggestions"
                          value={tool}
                          data-testid={`agent-tool-input-${idx}`}
                          onChange={(e) => handleUpdateTool(idx, e.target.value)}
                          className="flex-1 rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs font-mono bg-white dark:bg-gray-800"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveTool(idx)}
                          aria-label={t('harness.agent.editor.toolsRadio.removeTool', {
                            tool,
                            defaultValue: `Remove ${tool}`,
                          })}
                          className="text-xs text-red-600 dark:text-red-400 hover:underline"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddTool}
                      data-testid="agent-add-tool"
                      className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 self-start hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      {t('harness.agent.editor.toolsRadio.addTool', {
                        defaultValue: 'Add tool',
                      })}
                    </button>
                    <datalist id="agent-tool-suggestions">
                      {TOOL_SUGGESTIONS.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>
                )}
              </fieldset>
            </fieldset>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {t('harness.agent.editor.bodyTitle', {
                  defaultValue: 'System prompt (markdown)',
                })}
              </h3>
              {showNoExampleWarning && (
                <div role="status" data-testid="agent-no-example-warning" className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                  {t('harness.agent.editor.warnings.noExampleBlock', {
                    defaultValue:
                      'This agent has no <example> blocks — auto-selection quality may suffer. Use the + Add example button to insert a template.',
                  })}
                </div>
              )}
              <div
                data-testid="agent-body-editor"
                data-has-example={hasExampleNow ? 'true' : 'false'}
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
                data-testid="agent-raw-editor"
              />
            </Suspense>
          </div>
        )}

        {!isReadOnly && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleDelete}
              className="px-2 py-1 text-xs rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              {t('harness.agent.editor.delete.label', {
                defaultValue: 'Delete agent',
              })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
