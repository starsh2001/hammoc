/**
 * QueueEditor - Queue script editor with syntax highlighting and execution control
 * [Source: Story 15.3 - Task 4]
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Upload, FileText, AlertTriangle, Loader2 } from 'lucide-react';
import { useQueueStore } from '../../stores/queueStore';
import { useQueueRunner } from '../../hooks/useQueueRunner';
import { QueueRunnerPanel } from './QueueRunnerPanel';
import { QueueTemplateDialog } from './QueueTemplateDialog';
import { highlightScript } from './queueHighlight';
import { readQueueWrapMode, writeQueueWrapMode } from './wrapMode';

/** Shared text styles for pre + textarea overlay alignment */
const sharedTextStyle: React.CSSProperties = {
  margin: 0,
  border: 0,
  padding: '16px',
  boxSizing: 'border-box',
  fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
  fontSize: '14px',
  fontStyle: 'normal',
  fontVariantLigatures: 'normal',
  fontWeight: 'normal',
  letterSpacing: 'normal',
  lineHeight: '21px',
  tabSize: 2,
  textIndent: '0px',
  textRendering: 'auto',
  textTransform: 'none',
  overflow: 'hidden',
};

interface QueueEditorProps {
  projectSlug: string;
}

export function QueueEditor({ projectSlug }: QueueEditorProps) {
  const {
    script,
    parsedItems,
    warnings,
    setScript,
    parseScript,
  } = useQueueStore();

  const runner = useQueueRunner(projectSlug);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [isAutoWrap, setIsAutoWrap] = useState(() => readQueueWrapMode(true));

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLocked = runner.isRunning || runner.isStarting;

  // File load handler
  const handleFileLoad = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // File size limit: 1MB
    if (file.size > 1_048_576) {
      alert('파일 크기가 1MB를 초과합니다');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content === 'string') {
        setScript(content);
      }
    };
    reader.readAsText(file);

    // Reset file input so same file can be re-selected
    e.target.value = '';
  }, [setScript]);

  // Run button handler
  const handleRun = useCallback(() => {
    parseScript();
    const { parsedItems: items } = useQueueStore.getState();
    if (items.length === 0) return;
    runner.start(items);
  }, [parseScript, runner]);

  // Keyboard shortcut: Ctrl+Enter to run
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isLocked && parsedItems.length > 0) {
        handleRun();
      }
    }
  }, [isLocked, parsedItems.length, handleRun]);

  // Parse on initial mount if script exists
  useEffect(() => {
    if (script) {
      parseScript();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist wrap mode preference so QueueEditor and QueueTemplateDialog stay in sync
  useEffect(() => {
    writeQueueWrapMode(isAutoWrap);
  }, [isAutoWrap]);

  const highlightedHtml = highlightScript(script);
  const canRun = !isLocked && parsedItems.length > 0;

  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-auto">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleFileLoad}
          disabled={isLocked}
          aria-label="파일 로드"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg
            bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300
            hover:bg-gray-200 dark:hover:bg-gray-600
            disabled:opacity-50 disabled:cursor-not-allowed
            min-w-[44px] min-h-[44px]"
        >
          <Upload className="w-4 h-4" />
          <span className="hidden sm:inline">파일 로드</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.qlaude-queue,*"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          onClick={() => setTemplateDialogOpen(true)}
          disabled={isLocked}
          aria-label="템플릿으로 생성"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg
            bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300
            hover:bg-gray-200 dark:hover:bg-gray-600
            disabled:opacity-50 disabled:cursor-not-allowed
            min-w-[44px] min-h-[44px]"
        >
          <FileText className="w-4 h-4" />
          <span className="hidden sm:inline">템플릿으로 생성</span>
        </button>

        <button
          onClick={() => setIsAutoWrap((prev) => !prev)}
          aria-label="Toggle wrap mode"
          aria-pressed={isAutoWrap}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg
            min-w-[44px] min-h-[44px]
            ${isAutoWrap
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
        >
          <span>{isAutoWrap ? 'Auto wrap' : 'No wrap'}</span>
        </button>

        <div className="flex-1" />

        {/* Run button — only shown when queue is idle */}
        <button
          onClick={handleRun}
          disabled={!canRun}
          aria-label="실행"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
            bg-blue-600 text-white hover:bg-blue-700
            disabled:opacity-50 disabled:cursor-not-allowed
            min-w-[44px] min-h-[44px]"
        >
          {runner.isStarting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>시작 중...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              <span>실행</span>
            </>
          )}
        </button>
      </div>

      {/* Editor area — two-wrapper overlay pattern.
          Outer div: fixed height + overflow:auto (scrolls).
          Inner div: position:relative, no overflow (sizes to pre content).
          Pre: normal flow (determines inner div height).
          Textarea: absolute inset:0 (matches inner div = pre size, scrolls with it). */}
      <div
        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-900 h-[200px] md:h-[300px]"
        style={{ overflow: 'auto' }}
      >
        <div style={{ position: 'relative', minHeight: '100%' }}>
          <pre
            aria-hidden="true"
            style={{
              ...sharedTextStyle,
              whiteSpace: isAutoWrap ? 'pre-wrap' : 'pre',
              overflowWrap: isAutoWrap ? 'anywhere' : 'normal',
              pointerEvents: 'none',
            }}
            dangerouslySetInnerHTML={{ __html: highlightedHtml + '\n' }}
          />
          <textarea
            ref={textareaRef}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            onKeyDown={handleKeyDown}
            wrap={isAutoWrap ? 'soft' : 'off'}
            readOnly={isLocked}
            placeholder="큐 스크립트를 입력하세요... (예: @new, @save, @pause, #주석)"
            aria-label="큐 스크립트 에디터"
            aria-describedby={warnings.length > 0 ? 'queue-warnings' : undefined}
            className="queue-editor-textarea"
            spellCheck={false}
            style={{
              ...sharedTextStyle,
              whiteSpace: isAutoWrap ? 'pre-wrap' : 'pre',
              overflowWrap: isAutoWrap ? 'anywhere' : 'normal',
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              resize: 'none',
              background: 'none',
              WebkitTextFillColor: 'transparent',
              caretColor: '#e5e7eb',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Validation warnings */}
      {warnings.length > 0 && (
        <div id="queue-warnings" className="flex flex-col gap-1" role="alert">
          {warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md
                bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Line {w.line}: {w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Runner panel */}
      {parsedItems.length > 0 && (runner.isRunning || runner.isPaused || runner.completedItems.size > 0 || runner.errorItem) && (
        <QueueRunnerPanel
          items={parsedItems}
          currentIndex={runner.progress.current}
          completedItems={runner.completedItems}
          isRunning={runner.isRunning}
          isPaused={runner.isPaused}
          pauseReason={runner.pauseReason}
          errorItem={runner.errorItem}
          onPause={runner.pause}
          onResume={runner.resume}
          onAbort={runner.abort}
        />
      )}

      {/* Template dialog */}
      <QueueTemplateDialog
        projectSlug={projectSlug}
        open={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
        onGenerate={(generatedScript) => {
          setScript(generatedScript);
          setTemplateDialogOpen(false);
        }}
      />
    </div>
  );
}
