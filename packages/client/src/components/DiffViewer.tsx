/**
 * DiffViewer Component
 * Story 6.1: Diff Viewer Component
 *
 * Displays file changes using CodeMirror 6 MergeView (side-by-side)
 * or unifiedMergeView (inline)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { MergeView, unifiedMergeView, getChunks } from '@codemirror/merge';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { FileText, X, Loader2, AlertCircle, AlertTriangle, Columns2, Rows2, ChevronUp, ChevronDown } from 'lucide-react';

import { useTheme } from '../hooks/useTheme';
import { useDiffLayout } from '../hooks/useDiffLayout';
import { useOverlayBackHandler } from '../hooks/useOverlayBackHandler';
import { usePanelStore } from '../stores/panelStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { getLanguageExtension } from '../utils/languageDetect';

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
  /** Reopen callback for browser forward navigation */
  onReopen?: () => void;
  /** Test-only: Force error state for testing */
  _testForceError?: boolean;
}

const LARGE_FILE_THRESHOLD = 5000;

function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').length;
}

interface DiffViewerState {
  isLoading: boolean;
  error: Error | null;
  currentDiffIndex: number;
  totalDiffs: number;
  addedLines: number;
  removedLines: number;
  largeFileAccepted: boolean;
}

// Abstraction over MergeView (side-by-side) and EditorView+unifiedMergeView (inline)
interface DiffHandle {
  destroy(): void;
  getChunkCount(): number;
  scrollToChunk(index: number): void;
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
  onReopen,
  _testForceError = false,
}: DiffViewerProps) {
  const { theme } = useTheme();
  const diffLayoutHook = useDiffLayout();

  // Adjust fullscreen position when quick panel is open as sidebar
  const isMobileViewport = useIsMobile();
  const activePanel = usePanelStore((s) => s.activePanel);
  const panelWidth = usePanelStore((s) => s.panelWidth);
  const MIN_CONTENT_WIDTH = 480;
  const [windowWidth, setWindowWidth] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const panelOverlay = isMobileViewport || (activePanel !== null && windowWidth - panelWidth < MIN_CONTENT_WIDTH);
  const editorRight = fullscreen && !panelOverlay && activePanel ? panelWidth : 0;
  const effectiveLayout = responsiveLayout ? diffLayoutHook.layout : layout;

  // Close/reopen overlay on browser back/forward navigation (fullscreen only)
  const noop = useCallback(() => {}, []);
  useOverlayBackHandler(fullscreen && !!onClose, onClose ?? noop, onReopen);

  const [state, setState] = useState<DiffViewerState>({
    isLoading: true,
    error: null,
    currentDiffIndex: -1,
    totalDiffs: 0,
    addedLines: 0,
    removedLines: 0,
    largeFileAccepted: false,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const diffHandleRef = useRef<DiffHandle | null>(null);

  // Build base CodeMirror extensions
  const buildBaseExtensions = useCallback((isDark: boolean) => {
    const exts: import('@codemirror/state').Extension[] = [
      EditorView.lineWrapping,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];
    const lang = getLanguageExtension(filePath);
    if (lang) exts.push(lang);
    if (isDark) exts.push(oneDark);
    return exts;
  }, [filePath]);

  // Create/recreate diff view
  useEffect(() => {
    if (!containerRef.current) return;
    if (state.error || _testForceError) return;

    const isLargeFile = Math.max(countLines(original), countLines(modified)) >= LARGE_FILE_THRESHOLD;
    if (isLargeFile && !state.largeFileAccepted) return;

    // Clear previous content
    containerRef.current.innerHTML = '';

    const isDark = theme === 'dark';
    const baseExts = buildBaseExtensions(isDark);

    // Diff highlight color themes
    // The merge module draws underlines via `background: linear-gradient(...)`,
    // so we must override the `background` shorthand (not just backgroundColor).
    // Side-by-side: left (a) = deleted (red), right (b) = added (green)
    const deletedSideTheme = EditorView.theme({
      '.cm-changedLine': {
        backgroundColor: isDark ? '#3f1d1d' : '#fca5a5',
      },
      '.cm-changedText, .cm-changedText span': {
        background: isDark ? '#7f2020 !important' : '#f87171 !important',
        color: isDark ? '#fef2f2 !important' : '#450a0a !important',
      },
    });
    const addedSideTheme = EditorView.theme({
      '.cm-changedLine': {
        backgroundColor: isDark ? '#16a34a' : '#86efac',
      },
      '.cm-changedText, .cm-changedText span': {
        background: isDark ? '#2a9d56 !important' : '#4ade80 !important',
        color: isDark ? '#f0fdf4 !important' : '#052e16 !important',
      },
    });
    // Inline/unified: added lines = green, deleted chunks = red
    const unifiedDiffTheme = EditorView.theme({
      '.cm-changedLine': {
        backgroundColor: isDark ? '#16a34a' : '#86efac',
      },
      '.cm-changedText, .cm-changedText span': {
        background: isDark ? '#2a9d56 !important' : '#4ade80 !important',
        color: isDark ? '#f0fdf4 !important' : '#052e16 !important',
      },
      '.cm-deletedChunk .cm-deletedText, .cm-deletedChunk .cm-deletedText span': {
        background: isDark ? '#7f2020 !important' : '#f87171 !important',
        color: isDark ? '#fef2f2 !important' : '#450a0a !important',
      },
      '.cm-deletedChunk': {
        backgroundColor: isDark ? '#3f1d1d' : '#fecaca',
      },
    });

    try {
      let handle: DiffHandle;
      let totalDiffs = 0;
      let added = 0;
      let removed = 0;

      if (effectiveLayout === 'side-by-side') {
        // Side-by-side: use MergeView (two editors)
        const view = new MergeView({
          parent: containerRef.current,
          a: { doc: original, extensions: [...baseExts, deletedSideTheme] },
          b: { doc: modified, extensions: [...baseExts, addedSideTheme] },
          orientation: 'a-b',
          collapseUnchanged: { margin: 3 },
          highlightChanges: true,
          gutter: true,
        });

        const chunks = view.chunks;
        totalDiffs = chunks.length;
        for (const chunk of chunks) {
          const aDoc = view.a.state.doc;
          const bDoc = view.b.state.doc;
          if (chunk.endA > chunk.fromA) {
            const fromLine = aDoc.lineAt(chunk.fromA).number;
            const toLine = aDoc.lineAt(Math.min(chunk.endA - 1, aDoc.length - 1)).number;
            removed += toLine - fromLine + 1;
          }
          if (chunk.endB > chunk.fromB) {
            const fromLine = bDoc.lineAt(chunk.fromB).number;
            const toLine = bDoc.lineAt(Math.min(chunk.endB - 1, bDoc.length - 1)).number;
            added += toLine - fromLine + 1;
          }
        }

        handle = {
          destroy: () => view.destroy(),
          getChunkCount: () => view.chunks.length,
          scrollToChunk: (index: number) => {
            const c = view.chunks[index];
            if (!c) return;
            view.b.dispatch({
              effects: EditorView.scrollIntoView(c.fromB, { y: 'center' }),
            });
            view.b.focus();
          },
        };
      } else {
        // Inline: use unifiedMergeView (single editor with original as extension)
        const unifiedExts = unifiedMergeView({
          original,
          highlightChanges: true,
          gutter: true,
          syntaxHighlightDeletions: true,
          mergeControls: false,
          collapseUnchanged: { margin: 3 },
        });

        const editorView = new EditorView({
          doc: modified,
          extensions: [...baseExts, ...unifiedExts, unifiedDiffTheme],
          parent: containerRef.current,
        });

        // Get chunks via getChunks helper
        const chunkInfo = getChunks(editorView.state);
        if (chunkInfo) {
          totalDiffs = chunkInfo.chunks.length;
          for (const chunk of chunkInfo.chunks) {
            const doc = editorView.state.doc;
            if (chunk.endA > chunk.fromA) {
              // Deleted lines count - use character positions as rough line estimates
              // In unified view, fromA/toA are positions in the original document
              removed += Math.max(1, Math.round((chunk.endA - chunk.fromA) / 40));
            }
            if (chunk.endB > chunk.fromB) {
              const fromLine = doc.lineAt(chunk.fromB).number;
              const toLine = doc.lineAt(Math.min(chunk.endB - 1, doc.length - 1)).number;
              added += toLine - fromLine + 1;
            }
          }
        }

        handle = {
          destroy: () => editorView.destroy(),
          getChunkCount: () => {
            const info = getChunks(editorView.state);
            return info ? info.chunks.length : 0;
          },
          scrollToChunk: (index: number) => {
            const info = getChunks(editorView.state);
            if (!info) return;
            const c = info.chunks[index];
            if (!c) return;
            editorView.dispatch({
              effects: EditorView.scrollIntoView(c.fromB, { y: 'center' }),
            });
            editorView.focus();
          },
        };
      }

      diffHandleRef.current = handle;

      setState(prev => ({
        ...prev,
        isLoading: false,
        totalDiffs,
        addedLines: added,
        removedLines: removed,
        currentDiffIndex: -1,
      }));

      return () => {
        handle.destroy();
        diffHandleRef.current = null;
      };
    } catch (err) {
      setState(prev => ({ ...prev, isLoading: false, error: err as Error }));
    }
  }, [original, modified, theme, effectiveLayout, buildBaseExtensions, state.largeFileAccepted, state.error, _testForceError]);

  // Navigate to next/previous change
  const goToChange = useCallback(
    (direction: 'next' | 'previous') => {
      const handle = diffHandleRef.current;
      if (!handle) return;
      const count = handle.getChunkCount();
      if (count === 0) return;

      const currentIndex = state.currentDiffIndex;
      let newIndex: number;

      if (currentIndex === -1) {
        newIndex = direction === 'next' ? 0 : count - 1;
      } else if (direction === 'next') {
        newIndex = (currentIndex + 1) % count;
      } else {
        newIndex = (currentIndex - 1 + count) % count;
      }

      handle.scrollToChunk(newIndex);
      setState(prev => ({ ...prev, currentDiffIndex: newIndex }));
    },
    [state.currentDiffIndex]
  );

  // Handle retry
  const handleRetry = useCallback(() => {
    setState({
      isLoading: true,
      error: null,
      currentDiffIndex: -1,
      totalDiffs: 0,
      addedLines: 0,
      removedLines: 0,
      largeFileAccepted: false,
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
        e.stopPropagation();
        if (e.shiftKey) {
          goToChange('previous');
        } else {
          goToChange('next');
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [goToChange]);

  // Test-only: Force error state
  useEffect(() => {
    if (_testForceError) {
      setState(prev => ({ ...prev, isLoading: false, error: new Error('Test error') }));
    }
  }, [_testForceError]);

  const maxLines = Math.max(countLines(original), countLines(modified));
  const isLargeFile = maxLines >= LARGE_FILE_THRESHOLD;

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
    ? 'fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900 transition-[right] duration-300 ease-in-out'
    : 'flex flex-col h-full';
  const wrapperStyle = fullscreen && editorRight ? { right: editorRight } : undefined;

  // Overlay for fullscreen mode
  const overlay = fullscreen ? (
    <div
      className="fixed inset-0 bg-black/50 z-40 transition-[right] duration-300 ease-in-out"
      style={editorRight ? { right: editorRight } : undefined}
      onClick={onClose}
      aria-hidden="true"
    />
  ) : null;

  return (
    <>
      {overlay}
      <div
        className={wrapperClasses}
        style={wrapperStyle}
        role="region"
        aria-label={`Diff viewer for ${filePath}`}
      >
        {/* File Header */}
        <header
          className="flex flex-wrap items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
          role="heading"
          aria-level={3}
        >
          {/* File path - shrinks on mobile */}
          <div className="flex items-center gap-2 min-w-0 flex-shrink">
            <FileText className="w-4 h-4 flex-shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            <span className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">{filePath}</span>
          </div>
          {/* Controls - always visible */}
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            {/* Change Summary */}
            <span className="text-xs whitespace-nowrap" data-testid="change-summary">
              <span className="text-green-600 dark:text-green-400">+{state.addedLines}</span>
              {' / '}
              <span className="text-red-600 dark:text-red-400">-{state.removedLines}</span>
            </span>
            {/* Navigation Controls */}
            <button
              onClick={() => goToChange('previous')}
              disabled={state.totalDiffs === 0}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Go to previous change"
            >
              <ChevronUp className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            </button>
            <span
              className="text-xs font-mono text-gray-600 dark:text-gray-400 min-w-[2.5rem] text-center"
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
            {/* Layout Toggle */}
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
            {/* Close Button */}
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

        {/* Diff Container */}
        <div className="flex-1 relative min-h-0 overflow-hidden" tabIndex={-1}>
          {/* Loading Spinner */}
          {state.isLoading && (!isLargeFile || state.largeFileAccepted) && (
            <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-10">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" aria-hidden="true" />
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                Loading diff viewer...
              </span>
            </div>
          )}

          {/* Large file warning gate */}
          {isLargeFile && !state.largeFileAccepted ? (
            <div className="flex flex-col items-center justify-center p-8 text-center" role="alert">
              <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                대용량 파일 ({maxLines.toLocaleString()}줄)
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                이 파일은 매우 큽니다. 로드 시 브라우저 성능에 영향을 줄 수 있습니다.
              </p>
              <button
                onClick={() => setState(prev => ({ ...prev, largeFileAccepted: true }))}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="대용량 파일 Diff 전체 로드"
              >
                전체 로드
              </button>
            </div>
          ) : (
            <>
              <style>{`
                .cm-merge-b .cm-changedLine,
                .cm-inlineChangedLine {
                  background-color: ${theme === 'dark' ? '#1a4d2e' : '#86efac'} !important;
                }
                .cm-merge-a .cm-changedLine,
                .cm-deletedChunk {
                  background-color: ${theme === 'dark' ? '#3f1d1d' : '#fecaca'} !important;
                }
              `}</style>
              <div
                ref={containerRef}
                className="h-full [&_.cm-mergeView]:h-full [&_.cm-mergeViewEditor]:overflow-auto [&_.cm-editor]:h-full [&_.cm-scroller]:!overflow-auto"
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default DiffViewer;
