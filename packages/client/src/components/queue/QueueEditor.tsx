/**
 * QueueEditor - Queue script editor with syntax highlighting and execution control
 * [Source: Story 15.3 - Task 4]
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, Square, Upload, FileText, AlertTriangle, Loader2 } from 'lucide-react';
import { useQueueStore } from '../../stores/queueStore';
import { useQueueRunner } from '../../hooks/useQueueRunner';
import { QueueRunnerPanel } from './QueueRunnerPanel';
import { QueueTemplateDialog } from './QueueTemplateDialog';
import { highlightScript } from './queueHighlight';

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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLocked = runner.isRunning || runner.isStarting;

  // Sync scroll between textarea and pre
  const handleScroll = useCallback(() => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

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

        <div className="flex-1" />

        {!runner.isRunning && !runner.isPaused && (
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
        )}

        {runner.isRunning && !runner.isPaused && (
          <button
            onClick={runner.pause}
            aria-label="일시정지"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
              bg-amber-600 text-white hover:bg-amber-700
              min-w-[44px] min-h-[44px]"
          >
            <Pause className="w-4 h-4" />
            <span>일시정지</span>
          </button>
        )}

        {runner.isPaused && (
          <>
            <button
              onClick={runner.resume}
              aria-label="재개"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
                bg-blue-600 text-white hover:bg-blue-700
                min-w-[44px] min-h-[44px]"
            >
              <Play className="w-4 h-4" />
              <span>재개</span>
            </button>
            <button
              onClick={runner.abort}
              aria-label="중단"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
                bg-red-600 text-white hover:bg-red-700
                min-w-[44px] min-h-[44px]"
            >
              <Square className="w-4 h-4" />
              <span>중단</span>
            </button>
          </>
        )}
      </div>

      {/* Editor area */}
      <div className="relative border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-900 overflow-hidden min-h-[200px] md:min-h-[300px]"
      >
        <pre
          ref={preRef}
          className="absolute inset-0 pointer-events-none z-0 overflow-auto m-0"
          style={{
            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
            fontSize: '14px',
            lineHeight: '1.5',
            padding: '16px',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            tabSize: 2,
          }}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlightedHtml + '\n' }}
        />
        <textarea
          ref={textareaRef}
          value={script}
          onChange={(e) => setScript(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          readOnly={isLocked}
          placeholder="큐 스크립트를 입력하세요... (예: @new, @save, @pause, #주석)"
          aria-label="큐 스크립트 에디터"
          aria-describedby={warnings.length > 0 ? 'queue-warnings' : undefined}
          className="relative z-10 w-full h-full bg-transparent resize-none outline-none m-0 min-h-[200px] md:min-h-[300px]"
          style={{
            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
            fontSize: '14px',
            lineHeight: '1.5',
            padding: '16px',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            tabSize: 2,
            color: 'transparent',
            caretColor: '#e5e7eb',
          }}
          spellCheck={false}
        />
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
