/**
 * Story 29.2: Snippet body editor — modal overlay over `SnippetPanel`.
 *
 * Form-style layout (no Raw toggle — snippets are free markdown without
 * frontmatter, so there's nothing to split):
 *   - Read-only name + scope badge in the header (rename via copy + delete)
 *   - CodeMirror markdown editor for the body, with the
 *     `snippetTokenHighlight` extension decorating `%name%`, `{argN}`, and
 *     `{context}` tokens
 *   - Inline self/cycle reference warning (heuristic only — no save block)
 *   - 300ms debounce auto-save (matches Epic 28 / Story 29.1 pattern)
 *
 * Bundled snippets render in read-only mode — the editor is shown but `save()`
 * is gated server-side as well.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Maximize2, X } from 'lucide-react';
import type { Extension } from '@codemirror/state';
import type { SnippetCard } from '@hammoc/shared';
import { useSnippetStore } from '../../../stores/snippetStore';
import { useTextExpansionStore } from '../../../stores/textExpansionStore';
import { SystemBadge } from './SystemBadge';
import { ScopePill } from './snippetShared';

const LazyCodeMirror = lazy(() => import('@uiw/react-codemirror'));
const lazyBodyExtensions = (): Promise<Extension[]> =>
  Promise.all([
    import('@codemirror/lang-markdown').then((m) => m.markdown()),
    import('./snippetTokenHighlight').then((m) => m.snippetTokenHighlightExtension),
  ]);

interface Props {
  card: SnippetCard;
  projectSlug: string;
  workingDirectory?: string;
  onClose(): void;
}

const DEBOUNCE_MS = 300;

const SELF_REF_RE = /%([a-zA-Z0-9._-]+)%/g;

export function SnippetEditor({ card, projectSlug, workingDirectory, onClose }: Props) {
  const { t } = useTranslation('settings');
  const open = useSnippetStore((s) => s.open);
  const closeActive = useSnippetStore((s) => s.closeActive);
  const setActiveDraft = useSnippetStore((s) => s.setActiveDraft);
  const save = useSnippetStore((s) => s.save);
  const remove = useSnippetStore((s) => s.remove);
  const forceOverwriteNext = useSnippetStore((s) => s.forceOverwriteNext);
  const active = useSnippetStore((s) => s.active);
  const isOpening = useSnippetStore((s) => s.isOpening);
  const cards = useSnippetStore((s) => s.cards);
  const saveAcked = useSnippetStore((s) => s.saveAcked);
  const error = useSnippetStore((s) => s.error);

  const [bodyExtensions, setBodyExtensions] = useState<Extension[] | null>(null);
  const [staleBanner, setStaleBanner] = useState<{ currentMtime: string } | null>(null);

  const isReadOnly = card.scope === 'bundled';

  useEffect(() => {
    let alive = true;
    void lazyBodyExtensions().then((exts) => {
      if (alive) setBodyExtensions(exts);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Open the snippet whenever the card identity changes.
  useEffect(() => {
    void open({
      scope: card.scope,
      name: card.name,
      projectSlug: card.scope === 'project' ? projectSlug : undefined,
    });
    return () => closeActive();
  }, [card.scope, card.name, projectSlug, open, closeActive]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback(() => {
    if (isReadOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const result = await save(workingDirectory);
      if (!result.ok) {
        if (result.error.code === 'HARNESS_STALE_WRITE') {
          const currentMtime =
            (result.error.details as { currentMtime?: string } | undefined)?.currentMtime ?? '';
          setStaleBanner({ currentMtime });
        }
      }
    }, DEBOUNCE_MS);
  }, [isReadOnly, save, workingDirectory]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const handleBodyChange = (next: string) => {
    setActiveDraft(next);
    scheduleSave();
  };

  // Keep the expansion overlay in sync if the host draft is mutated externally
  // (stale reload, scope change). The overlay's own `setContent` already calls
  // back into `handleBodyChange`, so the loop is idempotent.
  const expansionIsOpen = useTextExpansionStore((s) => s.isOpen);
  useEffect(() => {
    if (!expansionIsOpen) return;
    useTextExpansionStore.setState({ content: active?.draft ?? '' });
  }, [active?.draft, expansionIsOpen]);

  // Close any expansion this editor opened when the snippet modal unmounts.
  useEffect(() => {
    return () => {
      if (useTextExpansionStore.getState().isOpen) {
        useTextExpansionStore.getState().close();
      }
    };
  }, []);

  const openExpansion = () => {
    if (!active) return;
    useTextExpansionStore.getState().open({
      label: `${card.name} — ${t('harness.snippets.editor.bodyLabel', { defaultValue: 'Body (markdown)' })}`,
      content: active.draft,
      onChange: handleBodyChange,
      isMarkdown: true,
      readOnly: isReadOnly,
      projectSlug: card.scope === 'project' ? projectSlug : null,
    });
  };

  const handleOverwrite = async () => {
    if (!staleBanner) return;
    forceOverwriteNext(staleBanner.currentMtime);
    setStaleBanner(null);
    await save(workingDirectory);
  };

  const handleReload = async () => {
    setStaleBanner(null);
    await open({
      scope: card.scope,
      name: card.name,
      projectSlug: card.scope === 'project' ? projectSlug : undefined,
    });
  };

  const handleDelete = async () => {
    if (isReadOnly) return;
    if (
      !window.confirm(
        t('harness.snippets.editor.delete.confirm', {
          name: card.name,
          defaultValue: `Delete snippet "${card.name}"?`,
        }),
      )
    ) {
      return;
    }
    try {
      await remove({
        scope: card.scope as 'project' | 'user',
        projectSlug: card.scope === 'project' ? projectSlug : undefined,
        name: card.name,
        expectedMtime: active?.mtime,
        workingDirectory,
      });
      onClose();
    } catch {
      // Error already surfaced in store.
    }
  };

  // Heuristic self/cycle reference detection (AC1.b).
  const cycleWarning = useMemo<string | null>(() => {
    if (!active) return null;
    const refs = new Set<string>();
    for (const m of active.draft.matchAll(SELF_REF_RE)) refs.add(m[1]);
    if (refs.has(card.name)) {
      return t('harness.snippets.editor.warnings.selfRef', {
        name: card.name,
        defaultValue: `This snippet references itself (%${card.name}%) — runtime expansion will loop.`,
      });
    }
    // 1-depth cycle: any referenced snippet's body contains %card.name%.
    for (const refName of refs) {
      const refCard = cards.find((c) => c.name === refName);
      if (!refCard?.preview) continue;
      // Preview is only the first line, so cycle detection is best-effort.
      if (refCard.preview.includes(`%${card.name}%`)) {
        return t('harness.snippets.editor.warnings.cycleRef', {
          name: card.name,
          ref: refName,
          defaultValue: `Cycle: %${card.name}% references %${refName}% which references back.`,
        });
      }
    }
    return null;
  }, [active, card.name, cards, t]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('harness.snippets.editor.title', { defaultValue: 'Edit snippet' })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      data-testid="snippet-editor"
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-lg bg-white dark:bg-gray-900 p-5 shadow-lg flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <SystemBadge variant="hammoc" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 font-mono truncate">
              {card.name}
            </h2>
            <ScopePill scope={card.scope} />
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
            {t('harness.snippets.editor.bundledReadOnly', {
              defaultValue:
                'This is a bundled snippet — clone it to project or global scope to customize.',
            })}
          </div>
        )}

        {staleBanner && (
          <div
            role="alert"
            data-testid="snippet-stale-banner"
            className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 flex items-center justify-between gap-2"
          >
            <span>
              {t('harness.snippets.editor.staleBanner', {
                defaultValue: 'This snippet was changed externally — your save was rejected.',
              })}
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={handleReload} className="underline">
                {t('harness.snippets.editor.staleReload', { defaultValue: 'Reload' })}
              </button>
              <button type="button" onClick={handleOverwrite} className="underline">
                {t('harness.snippets.editor.staleOverwrite', { defaultValue: 'Overwrite' })}
              </button>
            </span>
          </div>
        )}

        {cycleWarning && (
          <div
            role="status"
            data-testid="snippet-cycle-warning"
            className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
          >
            {cycleWarning}
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-3 py-2 text-xs text-red-900 dark:text-red-100">
            {error.message}
          </div>
        )}

        {saveAcked && (
          <div
            role="status"
            data-testid="snippet-saved-toast"
            className="rounded-md border border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30 px-3 py-2 text-xs text-blue-900 dark:text-blue-100"
          >
            {t('harness.snippets.editor.savedToast', {
              defaultValue: 'Saved. Available via %name% in your next chat message.',
            })}
          </div>
        )}

        {isOpening && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
          </div>
        )}

        {!isOpening && active && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {t('harness.snippets.editor.bodyLabel', { defaultValue: 'Body (markdown)' })}
              </h3>
              <button
                type="button"
                onClick={openExpansion}
                aria-label={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
                title={t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
                data-testid="snippet-body-expand"
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <Maximize2 className="w-3 h-3" />
                {t('editor.expand', { ns: 'common', defaultValue: 'Expand' })}
              </button>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {t('harness.snippets.editor.bodyHint', {
                defaultValue:
                  'Use %name% to reference other snippets, {arg1}/{arg2}/… for positional arguments, and {context} for the trailing context block.',
              })}
            </p>
            <div
              data-testid="snippet-body-editor"
              className="rounded border border-gray-300 dark:border-gray-700 overflow-hidden"
            >
              <Suspense fallback={<div className="p-3 text-xs text-gray-500">Loading editor…</div>}>
                <LazyCodeMirror
                  value={active.draft}
                  onChange={handleBodyChange}
                  extensions={bodyExtensions ?? []}
                  editable={!isReadOnly}
                  height="320px"
                  basicSetup={{ lineNumbers: false }}
                />
              </Suspense>
            </div>
            <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 truncate">
              {active.absolutePath}
            </p>
          </div>
        )}

        {!isReadOnly && active && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleDelete}
              data-testid="snippet-delete"
              className="px-2 py-1 text-xs rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              {t('harness.snippets.editor.delete.label', { defaultValue: 'Delete snippet' })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

