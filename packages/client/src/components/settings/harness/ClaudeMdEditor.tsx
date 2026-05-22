/**
 * Story 29.1: Single-column markdown editor for one CLAUDE.md scope.
 *
 * Renders one of:
 *   - empty-state CTA when the file does not exist on disk (AC4)
 *   - lazy CodeMirror markdown editor with 300ms debounced auto-save (AC1)
 *   - stale banner with reload/overwrite buttons when an external change
 *     was detected (AC2)
 *
 * The frontmatter / Raw toggle / scope filter from Epic 28 is intentionally
 * ABSENT — CLAUDE.md is a free-form markdown body with no structured layer.
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Maximize2, Plus } from 'lucide-react';
import type { Extension } from '@codemirror/state';
import type { HarnessScope } from '@hammoc/shared';
import { useClaudeMdStore } from '../../../stores/claudeMdStore';
import { useTextExpansionStore } from '../../../stores/textExpansionStore';

const LazyCodeMirror = lazy(() => import('@uiw/react-codemirror'));
const lazyMarkdownExtensions = (): Promise<Extension[]> =>
  Promise.all([import('@codemirror/lang-markdown').then((m) => m.markdown())]);

const DEBOUNCE_MS = 300;

interface Props {
  scope: HarnessScope;
  projectSlug?: string;
  /** Rendered above the editor — supplies the column heading + scope badge. */
  headerSlot: React.ReactNode;
  /**
   * Test-only override that disables the debounced auto-save scheduler so
   * unit tests can assert on `setDraft` without timer wrangling. Production
   * callers omit this.
   */
  disableAutoSave?: boolean;
}

export function ClaudeMdEditor({ scope, projectSlug, headerSlot, disableAutoSave }: Props) {
  const { t } = useTranslation('settings');
  const column = useClaudeMdStore((s) => s[scope]);
  const setDraft = useClaudeMdStore((s) => s.setDraft);
  const save = useClaudeMdStore((s) => s.save);
  const create = useClaudeMdStore((s) => s.create);
  const applyReload = useClaudeMdStore((s) => s.applyReload);
  const applyOverwrite = useClaudeMdStore((s) => s.applyOverwrite);

  const [extensions, setExtensions] = useState<Extension[] | null>(null);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void lazyMarkdownExtensions().then((exts) => {
      if (alive) setExtensions(exts);
    });
    return () => {
      alive = false;
    };
  }, []);

  const scheduleSave = useCallback(() => {
    if (disableAutoSave) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void save(scope, projectSlug);
    }, DEBOUNCE_MS);
  }, [disableAutoSave, projectSlug, save, scope]);

  const handleChange = useCallback(
    (next: string) => {
      setDraft(scope, next);
      scheduleSave();
    },
    [scheduleSave, scope, setDraft],
  );

  // Mirror the host draft into the expansion overlay so external mutations
  // (stale reload, scope swap) don't get clobbered by stale text the user
  // typed into the expanded editor.
  const expansionIsOpen = useTextExpansionStore((s) => s.isOpen);
  useEffect(() => {
    if (!expansionIsOpen) return;
    useTextExpansionStore.setState({ content: column.content });
  }, [column.content, expansionIsOpen]);

  // Close any expansion this column opened when it unmounts (e.g. parent
  // panel switches scopes or closes).
  useEffect(() => {
    return () => {
      if (useTextExpansionStore.getState().isOpen) {
        useTextExpansionStore.getState().close();
      }
    };
  }, []);

  const openExpansion = () => {
    useTextExpansionStore.getState().open({
      label: `CLAUDE.md — ${scope === 'project' ? 'project' : 'user'}`,
      content: column.content,
      onChange: handleChange,
      isMarkdown: true,
      projectSlug: scope === 'project' ? projectSlug ?? null : null,
    });
  };

  const handleCreate = async () => {
    setShowCreateConfirm(false);
    await create(scope, projectSlug);
  };

  const dataTestidPrefix = `claude-md-${scope}`;

  return (
    <div
      data-testid={`${dataTestidPrefix}-column`}
      className="flex flex-col gap-2 min-w-0 flex-1"
    >
      {headerSlot}

      {column.staleBanner && (
        <div
          role="alert"
          data-testid={`${dataTestidPrefix}-stale-banner`}
          className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 flex items-start justify-between gap-2"
        >
          <span className="flex-1">
            {t('harness.claudeMd.staleBanner.message', {
              defaultValue:
                'This file changed externally. Reload from disk (your edits will be lost) or overwrite to keep your edits?',
            })}
          </span>
          <span className="flex flex-col sm:flex-row gap-1.5 shrink-0">
            <button
              type="button"
              data-testid={`${dataTestidPrefix}-stale-reload`}
              onClick={() => applyReload(scope)}
              className="underline text-amber-900 dark:text-amber-100"
            >
              {t('harness.claudeMd.staleBanner.reload', { defaultValue: 'Reload' })}
            </button>
            <button
              type="button"
              data-testid={`${dataTestidPrefix}-stale-overwrite`}
              onClick={() => void applyOverwrite(scope, projectSlug)}
              className="underline text-amber-900 dark:text-amber-100"
            >
              {t('harness.claudeMd.staleBanner.overwrite', { defaultValue: 'Overwrite' })}
            </button>
          </span>
        </div>
      )}

      {column.error && (
        <div
          role="alert"
          data-testid={`${dataTestidPrefix}-error`}
          className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-900 dark:text-red-100"
        >
          {column.error.message}
        </div>
      )}

      {column.saveAcked && (
        <div
          role="status"
          data-testid={`${dataTestidPrefix}-saved-toast`}
          className="rounded-md border border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30 px-3 py-1.5 text-xs text-blue-900 dark:text-blue-100"
        >
          {t('harness.claudeMd.savedToast', { defaultValue: 'Saved.' })}
        </div>
      )}

      {column.isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      )}

      {!column.isLoading && !column.exists && !column.error && (
        <div
          data-testid={`${dataTestidPrefix}-empty`}
          className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-700 dark:text-gray-200 flex flex-col gap-3 items-center"
        >
          <p className="font-medium">
            {t('harness.claudeMd.empty.title', {
              defaultValue: 'No CLAUDE.md exists yet at this location.',
            })}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {scope === 'project'
              ? t('harness.claudeMd.empty.projectHint', {
                  defaultValue:
                    'Project CLAUDE.md is included in every Claude Code session for this project.',
                })
              : t('harness.claudeMd.empty.userHint', {
                  defaultValue:
                    'Global CLAUDE.md is included in every Claude Code session across all projects.',
                })}
          </p>
          <button
            type="button"
            data-testid="claude-md-create-cta"
            onClick={() => setShowCreateConfirm(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('harness.claudeMd.create.cta', { defaultValue: 'Create CLAUDE.md' })}
          </button>
        </div>
      )}

      {!column.isLoading && column.exists && (
        <>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={openExpansion}
              aria-label={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
              title={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
              data-testid={`${dataTestidPrefix}-expand`}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Maximize2 className="w-3 h-3" />
              {t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
            </button>
          </div>
          <div
            data-testid={`${dataTestidPrefix}-editor`}
            className="rounded border border-gray-300 dark:border-gray-700 overflow-hidden [&_.cm-scroller]:!overflow-auto"
          >
            <Suspense fallback={<div className="p-3 text-xs text-gray-500">Loading editor…</div>}>
              <LazyCodeMirror
                value={column.content}
                onChange={handleChange}
                extensions={extensions ?? []}
                height="360px"
                basicSetup={{ lineNumbers: false }}
              />
            </Suspense>
          </div>
        </>
      )}

      {showCreateConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="claude-md-create-confirm"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCreateConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white dark:bg-gray-900 p-5 shadow-lg flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('harness.claudeMd.create.confirmTitle', {
                defaultValue: 'Create empty CLAUDE.md?',
              })}
            </h2>
            <p className="text-xs text-gray-700 dark:text-gray-300">
              {t('harness.claudeMd.create.confirmBody', {
                defaultValue:
                  'An empty CLAUDE.md will be created at this location. You can fill it in afterwards.',
              })}
            </p>
            {column.absolutePath && (
              <div
                data-testid={`${dataTestidPrefix}-create-confirm-path`}
                className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-2 py-1.5 text-[11px] font-mono text-gray-700 dark:text-gray-200 break-all"
              >
                <span className="text-[10px] uppercase tracking-wider text-gray-500 mr-1">
                  {t('harness.claudeMd.create.pathLabel', { defaultValue: 'Location' })}
                </span>
                {column.absolutePath}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateConfirm(false)}
                className="px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {t('harness.claudeMd.create.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                type="button"
                data-testid="claude-md-create-confirm-submit"
                onClick={handleCreate}
                className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                {t('harness.claudeMd.create.submit', { defaultValue: 'Create' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
