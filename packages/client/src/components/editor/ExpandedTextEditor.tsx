/**
 * In-memory cousin of `TextEditor` used to expand a harness workbench body
 * field into the same fullscreen overlay the user knows from the file editor.
 *
 * The host panel owns the draft state and the auto-save — this overlay only
 * mirrors a text buffer through `useTextExpansionStore`. Every keystroke is
 * forwarded back to the host via the store's `onChange`, which keeps the
 * panel's own debounce save scheduler authoritative. There is no Save button,
 * no mtime tracking, and no external-change banner.
 *
 * Layered above the harness panel modals (z-50) and the file TextEditor
 * (z-60) so it can be opened from inside either one.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { Maximize2, X, Loader2, Eye, Pencil } from 'lucide-react';

import { useTextExpansionStore } from '../../stores/textExpansionStore';
import { usePanelStore } from '../../stores/panelStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTheme } from '../../hooks/useTheme';
import { MarkdownRenderer } from '../MarkdownRenderer';

const LazyCodeMirror = lazy(() => import('@uiw/react-codemirror'));
const lazyMarkdownExt = (): Promise<Extension> =>
  import('@codemirror/lang-markdown').then((m) => m.markdown());

const MIN_CONTENT_WIDTH = 480;

export function ExpandedTextEditor() {
  const {
    isOpen,
    label,
    content,
    isMarkdown,
    readOnly,
    isMarkdownPreview,
    projectSlug,
    basePath,
    setContent,
    toggleMarkdownPreview,
    close,
  } = useTextExpansionStore();

  const { t } = useTranslation('common');
  const { resolvedTheme } = useTheme();

  const isMobile = useIsMobile();
  const activePanel = usePanelStore((s) => s.activePanel);
  const panelWidth = usePanelStore((s) => s.panelWidth);
  const panelSide = usePanelStore((s) => s.panelSide);

  const [windowWidth, setWindowWidth] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth : 1024),
  );
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const panelOverlay = isMobile || (activePanel !== null && windowWidth - panelWidth < MIN_CONTENT_WIDTH);
  const editorInset = !panelOverlay && activePanel ? panelWidth : 0;

  const [markdownExt, setMarkdownExt] = useState<Extension | null>(null);
  useEffect(() => {
    if (!isMarkdown) return;
    let alive = true;
    void lazyMarkdownExt().then((ext) => {
      if (alive) setMarkdownExt(ext);
    });
    return () => {
      alive = false;
    };
  }, [isMarkdown]);

  const extensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [EditorView.lineWrapping];
    if (isMarkdown && markdownExt) exts.push(markdownExt);
    if (readOnly) exts.push(EditorView.editable.of(false));
    return exts;
  }, [isMarkdown, markdownExt, readOnly]);

  // Esc closes the overlay. stopImmediatePropagation prevents the underlying
  // harness modal (which also listens for Esc) from closing at the same time.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    close();
  }, [close]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[65] transition-[left,right] duration-300 ease-in-out"
        style={panelSide === 'right' ? { right: editorInset } : { left: editorInset }}
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
      />

      <div
        className="fixed inset-0 z-[70] flex flex-col bg-white dark:bg-[#1c2129] transition-[left,right] duration-300 ease-in-out"
        style={panelSide === 'right' ? { right: editorInset } : { left: editorInset }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid="expanded-text-editor"
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-300 dark:border-[#3a4d5e] bg-gray-50 dark:bg-[#263240]">
          <div className="flex items-center gap-2 min-w-0">
            <Maximize2 className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-300" />
            <span className="truncate text-sm font-mono text-gray-700 dark:text-gray-200">
              {label}
            </span>
            {readOnly && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0">
                {t('editor.readOnly', { defaultValue: 'read-only' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            {isMarkdown && (
              <button
                type="button"
                onClick={toggleMarkdownPreview}
                className="flex items-center gap-1 px-3 py-1 text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-[#253040] hover:bg-gray-200 dark:hover:bg-[#2d3a4a] rounded transition-colors"
                aria-pressed={isMarkdownPreview}
                aria-label={isMarkdownPreview ? t('editor.editMode') : t('editor.previewLabel')}
              >
                {isMarkdownPreview ? (
                  <>
                    <Pencil className="w-4 h-4" />
                    <span>{t('editor.editLabel')}</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    <span>{t('editor.previewLabel')}</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300"
              aria-label={t('editor.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isMarkdown && isMarkdownPreview ? (
          <div className="flex-1 overflow-y-auto p-4 bg-white dark:bg-[#1c2129]">
            <div className="max-w-4xl mx-auto">
              <MarkdownRenderer content={content} projectSlug={projectSlug} basePath={basePath} />
            </div>
          </div>
        ) : (
          <div
            className="flex-1 min-h-0 [&_.cm-editor]:h-full [&_.cm-scroller]:!overflow-auto"
            aria-label={label}
          >
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  <span className="ml-2 text-sm text-gray-500 dark:text-gray-300">
                    {t('editor.loadingEditor')}
                  </span>
                </div>
              }
            >
              <LazyCodeMirror
                value={content}
                extensions={extensions}
                theme={resolvedTheme === 'dark' ? oneDark : 'light'}
                onChange={(value: string) => setContent(value)}
                height="100%"
                style={{ height: '100%' }}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLine: true,
                  tabSize: 2,
                  foldGutter: false,
                }}
                readOnly={readOnly}
              />
            </Suspense>
          </div>
        )}
      </div>
    </>
  );
}
