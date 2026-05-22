/**
 * Story 28.2: Skill editor modal.
 *
 * Combines: a frontmatter form (name / description / version), a CodeMirror
 * markdown body editor with a preview toggle, a "Raw edit" toggle that opens
 * the entire SKILL.md in a single editor instance, and a bundle resource
 * tree (references / examples / scripts / assets) where text files open in
 * inline CodeMirror editors.
 *
 * Save behavior is debounce-driven (300ms) — the editor owns its draft state
 * locally, calls the harness skill API directly, and only refreshes the store
 * (`useHarnessSkillStore.load`) after the response lands so the panel sees
 * the new mtime.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Maximize2, X, Eye, Pencil } from 'lucide-react';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import type {
  HarnessSkillBundleEntry,
  HarnessSkillCard,
  HarnessSkillReadResponse,
  HarnessSkillSource,
  HarnessSkillSourceScope,
} from '@hammoc/shared';
import { useTheme } from '../../../hooks/useTheme';
import { ApiError } from '../../../services/api/client';
import {
  readBundleFile,
  readSkill,
  updateSkill,
  writeBundleFile,
} from '../../../services/api/harnessSkillsApi';
import { useHarnessSkillStore } from '../../../stores/harnessSkillStore';
import { useTextExpansionStore } from '../../../stores/textExpansionStore';
import { MarkdownRenderer } from '../../MarkdownRenderer';

const LazyCodeMirror = lazy(() => import('@uiw/react-codemirror'));
const lazyMarkdownExt = (): Promise<Extension> =>
  import('@codemirror/lang-markdown').then((m) => m.markdown());

interface Props {
  card: HarnessSkillCard;
  projectSlug: string;
  onClose(): void;
}

type EditorMode = 'form' | 'raw';

interface SaveState {
  isSaving: boolean;
  /** Latest server-acknowledged mtime — drives the next expectedMtime. */
  mtime: string;
  staleBanner: boolean;
}

const DEBOUNCE_MS = 300;

export function SkillEditor({ card, projectSlug, onClose }: Props) {
  const { t } = useTranslation('settings');
  const { resolvedTheme } = useTheme();
  const reload = useHarnessSkillStore((s) => s.load);

  // The user can pick any source from the dropdown; the active one starts
  // selected. Switching sources reloads the read response.
  const [selectedSource, setSelectedSource] = useState<HarnessSkillSource>(
    () => card.sources.find((s) => s.scope === card.activeScope) ?? card.sources[0],
  );
  const [data, setData] = useState<HarnessSkillReadResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('form');
  const [showPreview, setShowPreview] = useState(false);
  const [save, setSave] = useState<SaveState>({ isSaving: false, mtime: '', staleBanner: false });
  const [markdownExt, setMarkdownExt] = useState<Extension | null>(null);

  const isReadOnly = selectedSource.scope === 'plugin';

  // Local drafts — diverge from `data` between the user's edit and the
  // post-save reload.
  const [nameDraft, setNameDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [versionDraft, setVersionDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');
  const [rawDraft, setRawDraft] = useState('');
  const [rawParseError, setRawParseError] = useState(false);

  // Bundle file panel state: which file is open, its content, and dirty mtime.
  const [openBundle, setOpenBundle] = useState<HarnessSkillBundleEntry | null>(null);
  const [bundleContent, setBundleContent] = useState<string>('');
  const [bundleMtime, setBundleMtime] = useState<string>('');
  const [bundleSaveState, setBundleSaveState] = useState<SaveState>({
    isSaving: false,
    mtime: '',
    staleBanner: false,
  });
  const [bundleIsBinary, setBundleIsBinary] = useState(false);

  // Load the markdown extension lazily once.
  useEffect(() => {
    let alive = true;
    void lazyMarkdownExt().then((ext) => {
      if (alive) setMarkdownExt(ext);
    });
    return () => { alive = false; };
  }, []);

  // Fetch SKILL.md whenever the user picks a different source.
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setOpenBundle(null);
    readSkill(card.name, {
      scope: selectedSource.scope,
      projectSlug: selectedSource.projectSlug ?? projectSlug,
      pluginKey: selectedSource.pluginKey,
    })
      .then((res) => {
        setData(res);
        setNameDraft(res.frontmatter.name);
        setDescDraft(res.frontmatter.description);
        setVersionDraft(res.frontmatter.version ?? '');
        setBodyDraft(res.body);
        setRawDraft(res.raw);
        setSave({ isSaving: false, mtime: res.skillMdMtime, staleBanner: false });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : (err as Error).message))
      .finally(() => setIsLoading(false));
  }, [card.name, projectSlug, selectedSource]);

  // Debounced save — frontmatter / body changes (form mode).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleFormSave = useCallback(
    (next: { name: string; description: string; version: string; body: string }) => {
      if (isReadOnly) return;
      if (!data) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (!next.name.trim() || !next.description.trim()) return;
        setSave((s) => ({ ...s, isSaving: true, staleBanner: false }));
        try {
          const res = await updateSkill(
            card.name,
            { scope: selectedSource.scope as 'project' | 'user', projectSlug: selectedSource.projectSlug ?? projectSlug },
            {
              frontmatter: {
                name: next.name,
                description: next.description,
                version: next.version,
              },
              body: next.body,
              expectedMtime: save.mtime,
            },
          );
          setSave({ isSaving: false, mtime: res.mtime, staleBanner: false });
          // Refresh the store so the panel sees the new mtime/labels.
          void reload(projectSlug);
        } catch (err) {
          setSave((s) => ({ ...s, isSaving: false }));
          if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
            setSave((s) => ({ ...s, staleBanner: true }));
            // pull fresh data so the editor matches disk
            const fresh = await readSkill(card.name, {
              scope: selectedSource.scope,
              projectSlug: selectedSource.projectSlug ?? projectSlug,
              pluginKey: selectedSource.pluginKey,
            });
            setData(fresh);
            setNameDraft(fresh.frontmatter.name);
            setDescDraft(fresh.frontmatter.description);
            setVersionDraft(fresh.frontmatter.version ?? '');
            setBodyDraft(fresh.body);
            setRawDraft(fresh.raw);
            setSave((s) => ({ ...s, mtime: fresh.skillMdMtime }));
          } else {
            setError(err instanceof ApiError ? err.message : (err as Error).message);
          }
        }
      }, DEBOUNCE_MS);
    },
    [card.name, data, isReadOnly, projectSlug, reload, save.mtime, selectedSource],
  );

  const scheduleRawSave = useCallback(
    (next: string) => {
      if (isReadOnly) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        // Local frontmatter sniff so we surface a parse error without a round-trip.
        const opener = /^---\r?\n/;
        const closer = /\n---\r?\n/;
        const valid = opener.test(next) && closer.test(next.replace(opener, ''));
        if (!valid) {
          setRawParseError(true);
          return;
        }
        setRawParseError(false);
        setSave((s) => ({ ...s, isSaving: true, staleBanner: false }));
        try {
          const res = await updateSkill(
            card.name,
            { scope: selectedSource.scope as 'project' | 'user', projectSlug: selectedSource.projectSlug ?? projectSlug },
            { raw: next, expectedMtime: save.mtime },
          );
          setSave({ isSaving: false, mtime: res.mtime, staleBanner: false });
          void reload(projectSlug);
        } catch (err) {
          setSave((s) => ({ ...s, isSaving: false }));
          if (err instanceof ApiError && err.code === 'HARNESS_PARSE_ERROR') {
            setRawParseError(true);
            return;
          }
          if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
            setSave((s) => ({ ...s, staleBanner: true }));
          } else {
            setError(err instanceof ApiError ? err.message : (err as Error).message);
          }
        }
      }, DEBOUNCE_MS);
    },
    [card.name, isReadOnly, projectSlug, reload, save.mtime, selectedSource],
  );

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  // Close any expansion overlay opened from this editor when the modal
  // unmounts (e.g. close button or backdrop click).
  useEffect(() => {
    return () => {
      if (useTextExpansionStore.getState().isOpen) {
        useTextExpansionStore.getState().close();
      }
    };
  }, []);

  const expandBody = () => {
    useTextExpansionStore.getState().open({
      label: `${card.name} — ${t('harness.skill.editor.body.title', { defaultValue: 'Body' })}`,
      content: bodyDraft,
      isMarkdown: true,
      readOnly: isReadOnly,
      projectSlug: selectedSource.scope === 'project' ? projectSlug : null,
      basePath: selectedSource.absoluteRoot,
      onChange: (value) => {
        setBodyDraft(value);
        scheduleFormSave({ name: nameDraft, description: descDraft, version: versionDraft, body: value });
      },
    });
  };

  const expandRaw = () => {
    useTextExpansionStore.getState().open({
      label: `${card.name} — ${t('harness.skill.editor.raw.title', { defaultValue: 'Raw' })}`,
      content: rawDraft,
      isMarkdown: true,
      readOnly: isReadOnly,
      projectSlug: selectedSource.scope === 'project' ? projectSlug : null,
      basePath: selectedSource.absoluteRoot,
      onChange: (value) => {
        setRawDraft(value);
        scheduleRawSave(value);
      },
    });
  };

  const expandBundle = () => {
    if (!openBundle || bundleIsBinary) return;
    useTextExpansionStore.getState().open({
      label: `${card.name} — ${openBundle.relativePath}`,
      content: bundleContent,
      isMarkdown: openBundle.relativePath.toLowerCase().endsWith('.md'),
      readOnly: isReadOnly,
      projectSlug: selectedSource.scope === 'project' ? projectSlug : null,
      basePath: selectedSource.absoluteRoot,
      onChange: (value) => {
        setBundleContent(value);
        scheduleBundleSave(value);
      },
    });
  };

  // Sync drafts between form and raw modes when the user toggles. Without this
  // each side keeps its own copy and the inactive mode shows stale text — e.g.
  // edits in Form would not appear in Raw, and saving from Raw would clobber
  // the Form edits. Form→Raw synthesizes a fresh raw block from the form
  // drafts; Raw→Form parses the raw text back into the three known fields.
  const handleModeChange = useCallback((next: EditorMode) => {
    if (mode === next) return;
    if (mode === 'form' && next === 'raw') {
      setRawDraft(synthRaw(nameDraft, descDraft, versionDraft, bodyDraft));
    } else if (mode === 'raw' && next === 'form') {
      const parsed = parseRawForm(rawDraft);
      if (parsed) {
        if (parsed.name !== undefined) setNameDraft(parsed.name);
        if (parsed.description !== undefined) setDescDraft(parsed.description);
        setVersionDraft(parsed.version ?? '');
        setBodyDraft(parsed.body);
      }
    }
    setMode(next);
  }, [mode, nameDraft, descDraft, versionDraft, bodyDraft, rawDraft]);

  // Bundle file open / save -----------------------------------------------
  const handleOpenBundle = async (entry: HarnessSkillBundleEntry) => {
    if (entry.isBinary) {
      setOpenBundle(entry);
      setBundleContent('');
      setBundleMtime('');
      setBundleIsBinary(true);
      return;
    }
    setOpenBundle(entry);
    setBundleIsBinary(false);
    try {
      const res = await readBundleFile(card.name, entry.relativePath, {
        scope: selectedSource.scope,
        projectSlug: selectedSource.projectSlug ?? projectSlug,
        pluginKey: selectedSource.pluginKey,
      });
      setBundleContent(res.content ?? '');
      setBundleMtime(res.mtime);
      setBundleSaveState({ isSaving: false, mtime: res.mtime, staleBanner: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const bundleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleBundleSave = useCallback(
    (next: string) => {
      if (isReadOnly) return;
      if (!openBundle || bundleIsBinary) return;
      if (bundleTimer.current) clearTimeout(bundleTimer.current);
      bundleTimer.current = setTimeout(async () => {
        setBundleSaveState((s) => ({ ...s, isSaving: true, staleBanner: false }));
        try {
          const res = await writeBundleFile(
            card.name,
            openBundle.relativePath,
            { scope: selectedSource.scope as 'project' | 'user', projectSlug: selectedSource.projectSlug ?? projectSlug },
            { content: next, expectedMtime: bundleMtime },
          );
          setBundleSaveState({ isSaving: false, mtime: res.mtime, staleBanner: false });
          setBundleMtime(res.mtime);
        } catch (err) {
          setBundleSaveState((s) => ({ ...s, isSaving: false }));
          if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
            setBundleSaveState((s) => ({ ...s, staleBanner: true }));
          } else {
            setError(err instanceof ApiError ? err.message : (err as Error).message);
          }
        }
      }, DEBOUNCE_MS);
    },
    [bundleIsBinary, bundleMtime, card.name, isReadOnly, openBundle, projectSlug, selectedSource],
  );

  // Form validation
  const nameInvalid = nameDraft.trim() === '';
  const descInvalid = descDraft.trim() === '';

  const codeMirrorTheme = resolvedTheme === 'dark' ? oneDark : 'light';

  const codeMirrorExtensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [EditorView.lineWrapping];
    if (markdownExt) exts.push(markdownExt);
    return exts;
  }, [markdownExt]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-editor-title"
        className="bg-white dark:bg-[#263240] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col mx-4 ring-1 ring-gray-200 dark:ring-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#3a4d5e]/50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 id="skill-editor-title" className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
              {card.name}
            </h2>
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
                <option key={`${src.scope}#${src.pluginKey ?? ''}`} value={`${src.scope}#${src.pluginKey ?? ''}`}>
                  {`${labelForScope(src.scope, t)}${src.pluginKey ? ` (${src.pluginKey})` : ''}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle
              mode={mode}
              onChange={handleModeChange}
              disabled={rawParseError}
              t={t}
            />
            <button
              type="button"
              aria-label={t('harness.skill.editor.close', { defaultValue: 'Close' })}
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-4">
          {save.staleBanner && (
            <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              {t('harness.skill.editor.staleBanner')}
            </div>
          )}
          {rawParseError && (
            <div role="alert" className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-800 dark:text-red-200">
              {t('harness.skill.editor.rawParseError')}
            </div>
          )}
          {error && (
            <div role="alert" className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-800 dark:text-red-200">
              {error}
            </div>
          )}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('harness.skill.editor.loading', { defaultValue: 'Loading…' })}
            </div>
          )}

          {!isLoading && data && mode === 'form' && (
            <>
              {/* Frontmatter form */}
              <section className="space-y-3">
                <h3 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t('harness.skill.editor.frontmatter.title')}
                </h3>
                <div>
                  <label htmlFor="skill-fm-name" className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                    {t('harness.skill.editor.frontmatter.name')}
                  </label>
                  <input
                    id="skill-fm-name"
                    type="text"
                    value={nameDraft}
                    disabled={isReadOnly}
                    onChange={(e) => {
                      setNameDraft(e.target.value);
                      scheduleFormSave({ name: e.target.value, description: descDraft, version: versionDraft, body: bodyDraft });
                    }}
                    aria-invalid={nameInvalid}
                    className={`w-full px-2 py-1 rounded border bg-white dark:bg-gray-900 text-sm ${
                      nameInvalid ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
                    } disabled:opacity-60`}
                  />
                  {nameInvalid && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {t('harness.skill.editor.required.name')}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="skill-fm-description" className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                    {t('harness.skill.editor.frontmatter.description')}
                  </label>
                  <textarea
                    id="skill-fm-description"
                    value={descDraft}
                    rows={3}
                    disabled={isReadOnly}
                    onChange={(e) => {
                      setDescDraft(e.target.value);
                      scheduleFormSave({ name: nameDraft, description: e.target.value, version: versionDraft, body: bodyDraft });
                    }}
                    aria-invalid={descInvalid}
                    className={`w-full px-2 py-1 rounded border bg-white dark:bg-gray-900 text-sm font-mono ${
                      descInvalid ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
                    } disabled:opacity-60`}
                  />
                  {descInvalid && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {t('harness.skill.editor.required.description')}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="skill-fm-version" className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                    {t('harness.skill.editor.frontmatter.version')}
                  </label>
                  <input
                    id="skill-fm-version"
                    type="text"
                    value={versionDraft}
                    disabled={isReadOnly}
                    onChange={(e) => {
                      setVersionDraft(e.target.value);
                      scheduleFormSave({ name: nameDraft, description: descDraft, version: e.target.value, body: bodyDraft });
                    }}
                    className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-mono disabled:opacity-60"
                    placeholder={t('harness.skill.editor.frontmatter.versionPlaceholder', { defaultValue: '0.1.0' })}
                  />
                </div>
              </section>

              {/* Body editor / preview */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t('harness.skill.editor.body.title')}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={expandBody}
                      aria-label={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
                      title={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
                      data-testid="skill-body-expand"
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <Maximize2 className="w-3 h-3" />
                      {t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPreview((p) => !p)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                      aria-pressed={showPreview}
                    >
                      {showPreview ? <Pencil className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showPreview
                        ? t('harness.skill.editor.body.editLabel', { defaultValue: 'Edit' })
                        : t('harness.skill.editor.body.previewLabel', { defaultValue: 'Preview' })}
                    </button>
                  </div>
                </div>
                <div className="border border-gray-200 dark:border-gray-700 rounded min-h-[200px]">
                  {showPreview ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none p-3">
                      <MarkdownRenderer
                        content={bodyDraft}
                        projectSlug={selectedSource.scope === 'project' ? projectSlug : null}
                        basePath={selectedSource.absoluteRoot}
                      />
                    </div>
                  ) : (
                    <Suspense fallback={<EditorFallback t={t} />}>
                      <LazyCodeMirror
                        value={bodyDraft}
                        extensions={codeMirrorExtensions}
                        theme={codeMirrorTheme}
                        readOnly={isReadOnly}
                        height="300px"
                        onChange={(value: string) => {
                          setBodyDraft(value);
                          scheduleFormSave({ name: nameDraft, description: descDraft, version: versionDraft, body: value });
                        }}
                        basicSetup={{ lineNumbers: true, foldGutter: false, tabSize: 2 }}
                      />
                    </Suspense>
                  )}
                </div>
                {save.isSaving && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('harness.skill.editor.saving', { defaultValue: 'Saving…' })}
                  </p>
                )}
              </section>

              {/* Bundle file tree */}
              <BundleSection
                entries={data.bundleEntries}
                truncatedAtDepth={data.truncatedAtDepth}
                openBundle={openBundle}
                bundleContent={bundleContent}
                bundleIsBinary={bundleIsBinary}
                bundleSaveState={bundleSaveState}
                isReadOnly={isReadOnly}
                codeMirrorExtensions={codeMirrorExtensions}
                codeMirrorTheme={codeMirrorTheme}
                onOpen={handleOpenBundle}
                onChange={(value) => {
                  setBundleContent(value);
                  scheduleBundleSave(value);
                }}
                onExpand={expandBundle}
                t={t}
              />
            </>
          )}

          {!isLoading && data && mode === 'raw' && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t('harness.skill.editor.raw.title')}
                </h3>
                <button
                  type="button"
                  onClick={expandRaw}
                  aria-label={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
                  title={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
                  data-testid="skill-raw-expand"
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Maximize2 className="w-3 h-3" />
                  {t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
                </button>
              </div>
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
      </div>
    </div>
  );
}

function EditorFallback({ t }: { t: (key: string, opts?: Record<string, unknown>) => string }) {
  return (
    <div className="flex items-center justify-center h-[200px] text-sm text-gray-500 dark:text-gray-400">
      <Loader2 className="w-4 h-4 animate-spin mr-2" />
      {t('harness.skill.editor.loadingEditor', { defaultValue: 'Loading editor…' })}
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
  // AC2: when the raw frontmatter is broken (`disabled === true`), neither
  // direction is allowed — Form because returning would silently lose the user's
  // pending raw edits, Raw because it's already the active mode and disabling
  // it makes the constraint visually consistent.
  return (
    <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => onChange('form')}
        disabled={disabled}
        title={disabled ? t('harness.skill.editor.rawParseError') : undefined}
        className={
          'px-2 py-1 ' + (mode === 'form'
            ? 'bg-blue-600 text-white'
            : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800') + (disabled ? ' opacity-50 cursor-not-allowed' : '')
        }
      >
        {t('harness.skill.editor.modeForm', { defaultValue: 'Form' })}
      </button>
      <button
        type="button"
        onClick={() => onChange('raw')}
        disabled={disabled}
        title={disabled ? t('harness.skill.editor.rawParseError') : undefined}
        className={
          'px-2 py-1 ' + (mode === 'raw'
            ? 'bg-blue-600 text-white'
            : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800') + (disabled ? ' opacity-50 cursor-not-allowed' : '')
        }
      >
        {t('harness.skill.editor.modeRaw', { defaultValue: 'Raw' })}
      </button>
    </div>
  );
}

function labelForScope(
  scope: HarnessSkillSourceScope,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  return t(`harness.skill.scopeBadge.${scope}`);
}

/**
 * Wrap a YAML scalar in single quotes when it contains characters that would
 * otherwise change the parser's interpretation (control chars, fence markers,
 * leading/trailing whitespace, etc.). Used by the local form↔raw sync so
 * `synthRaw` always produces a well-formed YAML frontmatter block.
 *
 * The server keeps round-trip preservation when the user saves from form
 * mode; this helper is only relevant for the in-memory raw text shown after
 * a mode toggle.
 */
function yamlScalar(value: string): string {
  if (
    value === ''
    || /[\n\r#:'"|>%@&*!,[\]{}]/.test(value)
    || /^\s|\s$/.test(value)
  ) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return value;
}

function synthRaw(name: string, description: string, version: string, body: string): string {
  let fm = `name: ${yamlScalar(name)}\ndescription: ${yamlScalar(description)}\n`;
  if (version.trim() !== '') {
    fm += `version: ${yamlScalar(version)}\n`;
  }
  return `---\n${fm}---\n${body}`;
}

/**
 * Parse the three known scalar fields out of a SKILL.md raw block. Returns
 * null when the text doesn't have a `---` fence pair. Multi-line strings,
 * anchors, or other YAML constructs are intentionally ignored — the form only
 * edits these three scalars, so anything more complex is the user's signal to
 * stay in Raw mode.
 */
function parseRawForm(
  raw: string,
): { name?: string; description?: string; version?: string; body: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) return null;
  const fmText = match[1];
  const body = match[2];
  const result: { name?: string; description?: string; version?: string; body: string } = { body };
  for (const line of fmText.split(/\r?\n/)) {
    const m = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replace(/''/g, "'");
    } else if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (m[1] === 'name') result.name = value;
    if (m[1] === 'description') result.description = value;
    if (m[1] === 'version') result.version = value;
  }
  return result;
}

function BundleSection({
  entries,
  truncatedAtDepth,
  openBundle,
  bundleContent,
  bundleIsBinary,
  bundleSaveState,
  isReadOnly,
  codeMirrorExtensions,
  codeMirrorTheme,
  onOpen,
  onChange,
  onExpand,
  t,
}: {
  entries: HarnessSkillBundleEntry[];
  truncatedAtDepth: boolean;
  openBundle: HarnessSkillBundleEntry | null;
  bundleContent: string;
  bundleIsBinary: boolean;
  bundleSaveState: SaveState;
  isReadOnly: boolean;
  codeMirrorExtensions: Extension[];
  codeMirrorTheme: 'light' | typeof oneDark;
  onOpen(entry: HarnessSkillBundleEntry): void;
  onChange(value: string): void;
  onExpand(): void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (entries.length === 0 && !truncatedAtDepth) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {t('harness.skill.bundle.title', { defaultValue: 'Bundle resources' })}
      </h3>
      {truncatedAtDepth && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t('harness.skill.bundle.truncatedAtDepth', {
            defaultValue: 'Bundle tree was truncated at the depth limit.',
          })}
        </p>
      )}
      <ul className="text-sm divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded">
        {entries.map((entry) => {
          const isOpen = openBundle?.relativePath === entry.relativePath;
          return (
            <li key={entry.relativePath}>
              <button
                type="button"
                disabled={entry.isBinary}
                onClick={() => onOpen(entry)}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                  isOpen ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                } ${entry.isBinary ? 'cursor-not-allowed text-gray-500' : ''}`}
              >
                <span className="font-mono truncate">{entry.relativePath}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {entry.isBinary
                    ? t('harness.skill.bundle.binaryReadOnly')
                    : entry.isTruncated
                      ? t('harness.skill.bundle.truncated')
                      : `${entry.size} B`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {openBundle && !bundleIsBinary && (
        <>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onExpand}
              aria-label={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
              title={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
              data-testid="skill-bundle-expand"
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Maximize2 className="w-3 h-3" />
              {t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
            </button>
          </div>
          <div className="border border-gray-200 dark:border-gray-700 rounded min-h-[200px]">
            <Suspense fallback={<EditorFallback t={t} />}>
              <LazyCodeMirror
                value={bundleContent}
                extensions={codeMirrorExtensions}
                theme={codeMirrorTheme}
                readOnly={isReadOnly}
                height="200px"
                onChange={(value: string) => onChange(value)}
                basicSetup={{ lineNumbers: true, foldGutter: false, tabSize: 2 }}
              />
            </Suspense>
          </div>
        </>
      )}
      {openBundle && bundleIsBinary && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('harness.skill.bundle.binaryReadOnly')}
        </p>
      )}
      {bundleSaveState.staleBanner && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {t('harness.skill.editor.staleBanner')}
        </div>
      )}
    </section>
  );
}
