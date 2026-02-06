/**
 * DiffViewer Component
 * Story 6.1: Diff Viewer Component
 *
 * Displays file changes using Monaco Editor's DiffEditor
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type * as monacoEditor from 'monaco-editor';
import { FileText, X, Loader2, AlertCircle, Columns2, Rows2, ChevronUp, ChevronDown } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useDiffLayout } from '../hooks/useDiffLayout';

// File extension to Monaco language mapping
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.html': 'html',
  '.css': 'css',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

/**
 * Get Monaco language from file path
 */
export function getLanguageFromPath(filePath: string): string {
  const lastDotIndex = filePath.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return 'plaintext';
  }
  const ext = filePath.slice(lastDotIndex);
  return EXTENSION_TO_LANGUAGE[ext] ?? 'plaintext';
}

export interface DiffViewerProps {
  /** Original file path (required) */
  filePath: string;
  /** Content before changes (required) */
  original: string;
  /** Content after changes (required) */
  modified: string;
  /** Layout mode @default 'side-by-side' */
  layout?: 'side-by-side' | 'inline';
  /** Enable responsive layout via useDiffLayout hook @default true */
  responsiveLayout?: boolean;
  /** Read-only mode @default true */
  readOnly?: boolean;
  /** Fullscreen mode @default false */
  fullscreen?: boolean;
  /** Close callback @default undefined */
  onClose?: () => void;
  /** Test-only: Force error state for testing */
  _testForceError?: boolean;
}

interface DiffViewerState {
  isLoading: boolean;
  error: Error | null;
  currentDiffIndex: number;
  totalDiffs: number;
  addedLines: number;
  removedLines: number;
}

const DEFAULT_PROPS = {
  layout: 'side-by-side' as const,
  readOnly: true,
  fullscreen: false,
};

export function DiffViewer({
  filePath,
  original,
  modified,
  layout = DEFAULT_PROPS.layout,
  responsiveLayout = true,
  readOnly = DEFAULT_PROPS.readOnly,
  fullscreen = DEFAULT_PROPS.fullscreen,
  onClose,
  _testForceError = false,
}: DiffViewerProps) {
  const { theme } = useTheme();
  const diffLayoutHook = useDiffLayout();
  const effectiveLayout = responsiveLayout ? diffLayoutHook.layout : layout;
  const [state, setState] = useState<DiffViewerState>({
    isLoading: true,
    error: null,
    currentDiffIndex: -1,
    totalDiffs: 0,
    addedLines: 0,
    removedLines: 0,
  });
  const editorRef = useRef<monacoEditor.editor.IStandaloneDiffEditor | null>(null);
  const diffDisposableRef = useRef<monacoEditor.IDisposable | null>(null);
  const [wrapPulse, setWrapPulse] = useState(false);

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs';
  const language = getLanguageFromPath(filePath);

  // Handle Monaco Editor mount
  const handleEditorDidMount = useCallback(
    (editor: monacoEditor.editor.IStandaloneDiffEditor) => {
      editorRef.current = editor;

      const updateDiffInfo = () => {
        const changes = editor.getLineChanges();
        if (!changes) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: null,
            totalDiffs: 0,
            addedLines: 0,
            removedLines: 0,
            currentDiffIndex: -1,
          }));
          return;
        }

        let added = 0;
        let removed = 0;
        for (const change of changes) {
          if (change.modifiedEndLineNumber >= change.modifiedStartLineNumber) {
            added += change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;
          }
          if (change.originalEndLineNumber >= change.originalStartLineNumber) {
            removed += change.originalEndLineNumber - change.originalStartLineNumber + 1;
          }
        }

        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: null,
          totalDiffs: changes.length,
          addedLines: added,
          removedLines: removed,
          currentDiffIndex: -1,
        }));
      };

      diffDisposableRef.current = editor.onDidUpdateDiff(updateDiffInfo);
      updateDiffInfo();
    },
    []
  );

  // Cleanup editor instance and diff listener on unmount
  useEffect(() => {
    return () => {
      diffDisposableRef.current?.dispose();
      editorRef.current = null;
    };
  }, []);

  // Navigate to next/previous change
  const goToChange = useCallback(
    (direction: 'next' | 'previous') => {
      const changes = editorRef.current?.getLineChanges();
      if (!changes || changes.length === 0) return;

      setState((prev) => {
        let newIndex: number;
        let isWrapping = false;

        if (prev.currentDiffIndex === -1) {
          newIndex = direction === 'next' ? 0 : changes.length - 1;
        } else if (direction === 'next') {
          newIndex = (prev.currentDiffIndex + 1) % changes.length;
          isWrapping = prev.currentDiffIndex === changes.length - 1;
        } else {
          newIndex = (prev.currentDiffIndex - 1 + changes.length) % changes.length;
          isWrapping = prev.currentDiffIndex === 0;
        }

        const change = changes[newIndex];
        const targetLine =
          change.modifiedStartLineNumber > 0
            ? change.modifiedStartLineNumber
            : change.originalStartLineNumber;
        editorRef.current?.getModifiedEditor().revealLineInCenter(targetLine);

        if (isWrapping) {
          setWrapPulse(true);
          setTimeout(() => setWrapPulse(false), 150);
        }

        return { ...prev, currentDiffIndex: newIndex };
      });
    },
    []
  );

  // Handle Monaco Editor error (via loader API)
  const handleRetry = useCallback(() => {
    setState({
      isLoading: true,
      error: null,
      currentDiffIndex: -1,
      totalDiffs: 0,
      addedLines: 0,
      removedLines: 0,
    });
  }, []);

  // Handle Escape key for fullscreen mode
  useEffect(() => {
    if (!fullscreen || !onClose) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fullscreen, onClose]);

  // Handle F7 / Shift+F7 keyboard shortcuts for diff navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F7') {
        e.preventDefault();
        if (e.shiftKey) {
          goToChange('previous');
        } else {
          goToChange('next');
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goToChange]);

  // Test-only: Force error state
  useEffect(() => {
    if (_testForceError) {
      setState((prev) => ({ ...prev, isLoading: false, error: new Error('Test error') }));
    }
  }, [_testForceError]);

  // Error UI
  if (state.error) {
    return (
      <div
        className="flex flex-col items-center justify-center p-8 text-center"
        role="region"
        aria-label={`Diff viewer for ${filePath}`}
      >
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" aria-hidden="true" />
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Failed to load diff viewer.</p>
        <button
          onClick={handleRetry}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="Retry loading diff viewer"
        >
          Retry
        </button>
      </div>
    );
  }

  // Wrapper classes for fullscreen mode
  const wrapperClasses = fullscreen
    ? 'fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900'
    : 'flex flex-col h-full';

  // Overlay for fullscreen mode
  const overlay = fullscreen ? (
    <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} aria-hidden="true" />
  ) : null;

  return (
    <>
      {overlay}
      <div
        className={wrapperClasses}
        role="region"
        aria-label={`Diff viewer for ${filePath}`}
      >
        {/* File Header */}
        <header
          className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
          role="heading"
          aria-level={3}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            <span className="text-sm font-mono text-gray-700 dark:text-gray-300">{filePath}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Change Summary */}
            <span className="text-xs whitespace-nowrap" data-testid="change-summary">
              <span className="text-green-600 dark:text-green-400">+{state.addedLines}</span>
              {' / '}
              <span className="text-red-600 dark:text-red-400">-{state.removedLines}</span>
            </span>
            {/* Navigation Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToChange('previous')}
                disabled={state.totalDiffs === 0}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Go to previous change"
              >
                <ChevronUp className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
              </button>
              <span
                className={`text-xs font-mono text-gray-600 dark:text-gray-400 min-w-[2.5rem] text-center${wrapPulse ? ' animate-pulse' : ''}`}
                aria-live="polite"
                data-testid="position-indicator"
              >
                {state.currentDiffIndex === -1
                  ? `\u2014/${state.totalDiffs}`
                  : `${state.currentDiffIndex + 1}/${state.totalDiffs}`}
              </span>
              <button
                onClick={() => goToChange('next')}
                disabled={state.totalDiffs === 0}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Go to next change"
              >
                <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {responsiveLayout && (
              <button
                onClick={() =>
                  diffLayoutHook.setLayout(
                    effectiveLayout === 'side-by-side' ? 'inline' : 'side-by-side'
                  )
                }
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={
                  effectiveLayout === 'side-by-side'
                    ? 'Switch to inline layout'
                    : 'Switch to side-by-side layout'
                }
                title={
                  effectiveLayout === 'side-by-side'
                    ? 'Switch to inline layout'
                    : 'Switch to side-by-side layout'
                }
              >
                {effectiveLayout === 'side-by-side' ? (
                  <Columns2 className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                ) : (
                  <Rows2 className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                )}
              </button>
            )}
            {fullscreen && onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Close diff viewer"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
              </button>
            )}
          </div>
        </header>

        {/* Monaco DiffEditor Container */}
        <div className="flex-1 relative" tabIndex={-1}>
          {/* Loading Spinner */}
          {state.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-10">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" aria-hidden="true" />
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                Loading diff viewer...
              </span>
            </div>
          )}

          <DiffEditor
            original={original}
            modified={modified}
            language={language}
            theme={monacoTheme}
            onMount={handleEditorDidMount}
            options={{
              readOnly: readOnly,
              originalEditable: false,
              renderSideBySide: effectiveLayout === 'side-by-side',
              renderIndicators: true,
              ignoreTrimWhitespace: false,
              lineNumbers: 'on',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              hideUnchangedRegions: { enabled: true },
            }}
          />
        </div>
      </div>
    </>
  );
}

export default DiffViewer;
