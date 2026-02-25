/**
 * QueueEditor - Queue script editor with syntax highlighting and execution control
 * [Source: Story 15.3 - Task 4]
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Upload, FileText, AlertTriangle, Loader2, WrapText } from 'lucide-react';
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
  const isExecutionActive = runner.isRunning || runner.isPaused
    || runner.completedItems.size > 0 || !!runner.errorItem;

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
    <div className="flex flex-col h-full">
      {/* Toolbar — matches sessions page style */}
      <div className="sticky top-0 z-[5] bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 py-2">
          <div />

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.qlaude-queue,*"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex items-center gap-1">
            {/* Run button */}
            <button
              onClick={handleRun}
              disabled={!canRun}
              aria-label="실행"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-blue-100 dark:bg-blue-600 text-blue-700 dark:text-white
                hover:bg-blue-200 dark:hover:bg-blue-500
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {runner.isStarting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>시작 중...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>실행</span>
                </>
              )}
            </button>

            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

            <button
              onClick={handleFileLoad}
              disabled={isLocked}
              aria-label="파일 로드"
              title="파일 로드"
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg
                hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setTemplateDialogOpen(true)}
              disabled={isLocked}
              aria-label="템플릿으로 생성"
              title="템플릿"
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg
                hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

            <button
              onClick={() => setIsAutoWrap((prev) => !prev)}
              aria-label="Toggle wrap mode"
              aria-pressed={isAutoWrap}
              title={isAutoWrap ? 'Wrap' : 'No wrap'}
              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors
                ${isAutoWrap
                  ? 'bg-blue-100 dark:bg-blue-600 text-blue-700 dark:text-white'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
            >
              <WrapText className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className={`flex flex-col flex-1 p-4 gap-3 ${isExecutionActive ? '' : 'overflow-auto'}`}>
      {/* Editor area — hidden during execution */}
      {!isExecutionActive && (
      <div
        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-1 min-h-[200px]"
        style={{ overflow: 'auto', position: 'relative' }}
      >
        {/* Empty state overlay */}
        {!script && !isLocked && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 pointer-events-none"
          >
            <FileText className="w-10 h-10 text-gray-400 dark:text-gray-600" />
            <div className="text-center px-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">큐 스크립트를 작성하세요</p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mb-3">메시지를 한 줄씩 입력하면 순서대로 전송됩니다</p>
              <div className="inline-grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-left text-xs font-mono">
                <span className="text-purple-600 dark:text-purple-400">@new</span>
                <span className="text-gray-500 dark:text-gray-500">새 세션 시작</span>
                <span className="text-purple-600 dark:text-purple-400">@save <span className="text-teal-600 dark:text-emerald-400">name</span></span>
                <span className="text-gray-500 dark:text-gray-500">세션 저장</span>
                <span className="text-purple-600 dark:text-purple-400">@load <span className="text-teal-600 dark:text-emerald-400">name</span></span>
                <span className="text-gray-500 dark:text-gray-500">저장된 세션 불러오기</span>
                <span className="text-purple-600 dark:text-purple-400">@pause <span className="text-teal-600 dark:text-emerald-400">[reason]</span></span>
                <span className="text-gray-500 dark:text-gray-500">실행 일시정지</span>
                <span className="text-purple-600 dark:text-purple-400">@model <span className="text-teal-600 dark:text-emerald-400">name</span></span>
                <span className="text-gray-500 dark:text-gray-500">모델 변경</span>
                <span className="text-purple-600 dark:text-purple-400">@delay <span className="text-teal-600 dark:text-emerald-400">ms</span></span>
                <span className="text-gray-500 dark:text-gray-500">대기 시간 (밀리초)</span>
                <span><span className="text-blue-700 dark:text-blue-400">@(</span> <span className="text-gray-400 dark:text-gray-600">…</span> <span className="text-blue-700 dark:text-blue-400">@)</span></span>
                <span className="text-gray-500 dark:text-gray-500">여러 줄 프롬프트</span>
                <span className="text-gray-500 dark:text-gray-500">#</span>
                <span className="text-gray-500 dark:text-gray-500">주석 (무시됨)</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-600 mt-1">클릭하여 편집 시작 · 파일 로드 또는 템플릿 사용 가능</p>
          </div>
        )}

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
              outline: 'none',
            }}
          />
        </div>
      </div>
      )}

      {/* Validation warnings — hidden during execution */}
      {!isExecutionActive && warnings.length > 0 && (
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

      {/* Runner panel — full height when execution active */}
      {parsedItems.length > 0 && isExecutionActive && (
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
          projectSlug={projectSlug}
          activeSessionId={runner.lockedSessionId}
          fullHeight
          itemSessionIds={runner.itemSessionIds}
          onRemoveItem={runner.removeItem}
          onAddItem={runner.addItem}
          onReorderItems={runner.reorderItems}
        />
      )}

      {/* Standalone error banner — shown when error persists but parsedItems are empty (e.g. script cleared/page reopened) */}
      {parsedItems.length === 0 && runner.errorItem && !runner.isRunning && (
        <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-md
          bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
          role="alert"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">
            이전 큐 실행 오류 (아이템 {runner.errorItem.index + 1}): {runner.errorItem.error}
          </span>
        </div>
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
    </div>
  );
}
