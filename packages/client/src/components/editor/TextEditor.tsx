/**
 * TextEditor Component
 * Fullscreen overlay text editor for file editing
 * [Source: Story 11.3 - Task 3]
 */

import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { FileText, X, Loader2, Eye, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { useFileStore } from '../../stores/fileStore';
import { usePanelStore } from '../../stores/panelStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useOverlayBackHandler } from '../../hooks/useOverlayBackHandler';
import { useTheme } from '../../hooks/useTheme';
import { ConfirmModal } from '../ConfirmModal';
import { MarkdownPreview } from './MarkdownPreview';
import { getLanguageExtension, isMarkdownPath } from '../../utils/languageDetect';

const LazyCodeMirror = lazy(() => import('@uiw/react-codemirror'));

export function TextEditor() {
  const {
    openFile,
    content,
    isDirty,
    isLoading,
    isSaving,
    isTruncated,
    error,
    isMarkdownPreview,
    saveFile,
    closeEditor,
    setContent,
    resetError,
    openFileInEditor,
    toggleMarkdownPreview,
    pendingNavigation,
    confirmPendingNavigation,
    cancelPendingNavigation,
  } = useFileStore();

  const { t } = useTranslation('common');
  const [showConfirm, setShowConfirm] = useState(false);
  const editorRef = useRef<EditorView | null>(null);
  const lastFileRef = useRef<{ projectSlug: string; path: string } | null>(null);

  const { resolvedTheme } = useTheme();

  // Adjust editor position when quick panel is open as sidebar
  const isMobile = useIsMobile();
  const activePanel = usePanelStore((s) => s.activePanel);
  const panelWidth = usePanelStore((s) => s.panelWidth);
  const panelSide = usePanelStore((s) => s.panelSide);
  const MIN_CONTENT_WIDTH = 480;
  const [windowWidth, setWindowWidth] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const panelOverlay = isMobile || (activePanel !== null && windowWidth - panelWidth < MIN_CONTENT_WIDTH);
  const editorInset = !panelOverlay && activePanel ? panelWidth : 0;

  const isMarkdownFile = openFile ? isMarkdownPath(openFile.path) : false;

  const extensions = useMemo(() => {
    const exts: Extension[] = [
      EditorView.lineWrapping,
    ];
    if (openFile) {
      const lang = getLanguageExtension(openFile.path);
      if (lang) exts.push(lang);
    }
    if (isTruncated) {
      exts.push(EditorView.editable.of(false));
    }
    return exts;
  }, [openFile, isTruncated]);

  const handleSave = useCallback(async () => {
    if (!isDirty || isSaving) return;
    const success = await saveFile();
    if (success) {
      toast.success(t('editor.fileSaved'));
    } else {
      toast.error(t('editor.fileSaveFailed'));
    }
  }, [isDirty, isSaving, saveFile]);

  const handleClose = useCallback(() => {
    if (pendingNavigation) {
      cancelPendingNavigation();
    }
    if (isDirty) {
      setShowConfirm(true);
    } else {
      closeEditor();
    }
  }, [isDirty, closeEditor, pendingNavigation, cancelPendingNavigation]);

  // Track last opened file for reopen via forward navigation
  useEffect(() => {
    if (openFile) {
      lastFileRef.current = { ...openFile };
    }
  }, [openFile]);

  const handleReopen = useCallback(() => {
    if (lastFileRef.current) {
      openFileInEditor(lastFileRef.current.projectSlug, lastFileRef.current.path);
    }
  }, [openFileInEditor]);

  // Close/reopen overlay on browser back/forward navigation
  useOverlayBackHandler(!!openFile, handleClose, handleReopen);

  // Ctrl+S / Cmd+S save and Escape close
  useEffect(() => {
    if (!openFile) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }
      if (e.key === 'Escape') {
        // Prevent QuickPanel (and other document-level listeners) from also closing
        e.stopImmediatePropagation();
        // Pending navigation ConfirmModal is open — let it handle its own Escape
        if (pendingNavigation) return;
        if (showConfirm) {
          setShowConfirm(false);
          return;
        }
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openFile, handleSave, handleClose, showConfirm, pendingNavigation]);

  // Body scroll lock
  useEffect(() => {
    if (!openFile) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [openFile]);

  // Restore editor focus when switching from preview to edit mode
  useEffect(() => {
    if (!isMarkdownPreview && isMarkdownFile) {
      editorRef.current?.focus();
    }
  }, [isMarkdownPreview, isMarkdownFile]);

  // Scroll to target line when editor is created
  const handleEditorCreated = useCallback((view: EditorView) => {
    editorRef.current = view;
    const line = useFileStore.getState().targetLine;
    if (!line) return;
    // Wait a frame for CodeMirror to finish layout
    requestAnimationFrame(() => {
      try {
        const clampedLine = Math.min(line, view.state.doc.lines);
        const docLine = view.state.doc.line(clampedLine);
        view.dispatch({
          selection: { anchor: docLine.from },
          effects: EditorView.scrollIntoView(docLine.from, { y: 'start', yMargin: 8 }),
        });
      } catch {
        // Line number out of range — ignore
      }
      useFileStore.setState({ targetLine: null });
    });
  }, []);

  if (!openFile) return null;

  const filePath = openFile.path;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[55] transition-[left,right] duration-300 ease-in-out"
        style={panelSide === 'right' ? { right: editorInset } : { left: editorInset }}
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
      />

      {/* Editor Panel */}
      <div
        className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-[#1c2129] transition-[left,right] duration-300 ease-in-out"
        style={panelSide === 'right' ? { right: editorInset } : { left: editorInset }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-300 dark:border-[#3a4d5e] bg-gray-50 dark:bg-[#263240]">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-300" />
            <span className="truncate text-sm font-mono text-gray-700 dark:text-gray-200">
              {filePath}
            </span>
            {isDirty && (
              <span className="text-xs font-bold text-amber-500 shrink-0">M</span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            {isMarkdownFile && (
              <button
                onClick={toggleMarkdownPreview}
                className="flex items-center gap-1 px-3 py-1 text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-[#253040] hover:bg-gray-200 dark:hover:bg-[#2d3a4a] rounded transition-colors"
                title={isMarkdownPreview ? t('editor.editMode') : t('editor.previewLabel')}
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
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              title={t('editor.saveShortcut')}
              className="px-3 py-1 text-sm font-medium whitespace-nowrap text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? t('editor.saving') : t('editor.save')}
            </button>
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300"
              aria-label={t('editor.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Editor Body */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-300">
              {t('editor.loadingFile')}
            </span>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-red-500">
            <p>{error}</p>
            <button
              onClick={() => {
                resetError();
                openFileInEditor(openFile.projectSlug, openFile.path);
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              {t('button.retry')}
            </button>
          </div>
        ) : (
          <>
            {isTruncated && (
              <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs border-b border-amber-200 dark:border-amber-800">
                {t('editor.fileTruncated')}
              </div>
            )}
            {isMarkdownPreview && isMarkdownFile ? (
              <MarkdownPreview content={content} />
            ) : (
              <div
                className="flex-1 min-h-0 [&_.cm-editor]:h-full [&_.cm-scroller]:!overflow-auto"
                aria-label={`Editing ${filePath}`}
              >
                <Suspense fallback={
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-300">
                      {t('editor.loadingEditor')}
                    </span>
                  </div>
                }>
                  <LazyCodeMirror
                    value={content}
                    extensions={extensions}
                    theme={resolvedTheme === 'dark' ? oneDark : 'light'}
                    onChange={(value: string) => setContent(value)}
                    onCreateEditor={handleEditorCreated}
                    height="100%"
                    style={{ height: '100%' }}
                    basicSetup={{
                      lineNumbers: true,
                      highlightActiveLine: true,
                      tabSize: 2,
                      foldGutter: false,
                    }}
                    readOnly={isTruncated}
                  />
                </Suspense>
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirm Dialog */}
      <ConfirmModal
        isOpen={showConfirm}
        title={t('editor.unsavedTitle')}
        message={t('editor.unsavedCloseMessage')}
        confirmText={t('editor.closeWithoutSaving')}
        cancelText={t('button.cancel')}
        variant="danger"
        onConfirm={() => {
          closeEditor();
          setShowConfirm(false);
        }}
        onCancel={() => setShowConfirm(false)}
      />

      {/* Pending Navigation Confirm Dialog */}
      <ConfirmModal
        isOpen={!!pendingNavigation}
        title={t('editor.unsavedTitle')}
        message={t('editor.unsavedOpenMessage', { path: pendingNavigation?.path ?? '' })}
        confirmText={t('editor.openWithoutSaving')}
        cancelText={t('button.cancel')}
        variant="danger"
        onConfirm={confirmPendingNavigation}
        onCancel={cancelPendingNavigation}
      />
    </>
  );
}
