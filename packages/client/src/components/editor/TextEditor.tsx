/**
 * TextEditor Component
 * Fullscreen overlay text editor for file editing
 * [Source: Story 11.3 - Task 3]
 */

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import type * as monacoEditor from 'monaco-editor';
import { FileText, X, Loader2, Eye, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { useFileStore } from '../../stores/fileStore';
import { useTheme } from '../../hooks/useTheme';
import { ConfirmModal } from '../ConfirmModal';
import { MarkdownPreview } from './MarkdownPreview';

const LazyEditor = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({
    default: mod.Editor,
  }))
);

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
    language,
    saveFile,
    closeEditor,
    setContent,
    resetError,
    openFileInEditor,
    toggleMarkdownPreview,
  } = useFileStore();

  const [showConfirm, setShowConfirm] = useState(false);
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);

  const { theme } = useTheme();
  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs';

  const isMarkdownFile = openFile ? openFile.path.toLowerCase().endsWith('.md') : false;

  const handleSave = useCallback(async () => {
    if (!isDirty || isSaving) return;
    const success = await saveFile();
    if (success) {
      toast.success('파일이 저장되었습니다.');
    } else {
      toast.error('파일 저장에 실패했습니다.');
    }
  }, [isDirty, isSaving, saveFile]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      closeEditor();
    }
  }, [isDirty, closeEditor]);

  const handleEditorDidMount = useCallback(
    (editor: monacoEditor.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      editor.focus();
    },
    []
  );

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
        if (showConfirm) {
          setShowConfirm(false);
          return;
        }
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openFile, handleSave, handleClose, showConfirm]);

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

  if (!openFile) return null;

  const filePath = openFile.path;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={handleClose} />

      {/* Editor Panel */}
      <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400" />
            <span className="truncate text-sm font-mono text-gray-700 dark:text-gray-300">
              {filePath}
            </span>
            {isDirty && (
              <span className="text-xs text-amber-500 shrink-0">Modified</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isMarkdownFile && (
              <button
                onClick={toggleMarkdownPreview}
                className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                title={isMarkdownPreview ? 'Switch to edit mode' : 'Switch to preview mode'}
                aria-label={isMarkdownPreview ? 'Switch to edit mode' : 'Switch to preview mode'}
              >
                {isMarkdownPreview ? (
                  <>
                    <Pencil className="w-4 h-4" />
                    <span>Edit</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    <span>Preview</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              title="Ctrl+S"
              className="px-3 py-1 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              aria-label="Close editor"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Editor Body */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              Loading file...
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
              다시 시도
            </button>
          </div>
        ) : (
          <>
            {isTruncated && (
              <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs border-b border-amber-200 dark:border-amber-800">
                이 파일은 크기 제한(1MB)을 초과하여 일부만 표시됩니다. 저장 시
                표시된 내용만 저장됩니다.
              </div>
            )}
            {isMarkdownPreview && isMarkdownFile ? (
              <MarkdownPreview content={content} />
            ) : (
              <div className="flex-1 relative" aria-label={`Editing ${filePath}`}>
                <Suspense fallback={
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                      Loading editor...
                    </span>
                  </div>
                }>
                  <LazyEditor
                    value={content}
                    language={language}
                    theme={monacoTheme}
                    onChange={(value) => setContent(value ?? '')}
                    onMount={handleEditorDidMount}
                    options={{
                      readOnly: isTruncated,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      lineNumbers: 'on',
                      renderLineHighlight: 'line',
                      fontSize: 14,
                      automaticLayout: true,
                      tabSize: 2,
                      insertSpaces: true,
                      padding: { top: 16 },
                    }}
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
        title="저장하지 않은 변경 사항"
        message="저장하지 않은 변경 사항이 있습니다. 닫으시겠습니까?"
        confirmText="저장하지 않고 닫기"
        cancelText="취소"
        variant="danger"
        onConfirm={() => {
          closeEditor();
          setShowConfirm(false);
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
