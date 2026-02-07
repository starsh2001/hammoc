/**
 * ToolCard - Unified tool call card for both streaming and history
 * Renders identical UI regardless of data source (StreamingSegment or HistoryMessage).
 * [Source: Story 3.5/4.8 refactor - Unified tool card]
 */

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, ChevronRight, ChevronDown, Loader2, Files } from 'lucide-react';
import { ToolPathDisplay } from './ToolPathDisplay';
import { DiffViewer } from './DiffViewer';
import { ToolResultRenderer } from './ToolResultRenderer';
import { getToolIcon, getToolDisplayName, getToolDisplayInfo, formatDuration } from '../utils/toolUtils';

export interface ToolCardProps {
  toolName: string;
  toolInput?: Record<string, unknown>;
  status: 'pending' | 'completed' | 'error' | 'denied';
  /** Real-time timer start (ms timestamp, streaming pending only) */
  startedAt?: number;
  /** Final duration in ms (streaming completed) */
  duration?: number;
  /** Tool output text */
  output?: string;
  /** Merged result output for collapsible display (Bash/Grep history) */
  resultOutput?: string;
  /** Whether the denial was user-initiated (vs tool failure) */
  isUserDenied?: boolean;
}

/** Real-time elapsed timer for pending tool calls */
function ToolTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto" aria-label={`실행 시간: ${formatDuration(elapsed)}`}>
      {formatDuration(elapsed)}
    </span>
  );
}

/** Collapsible tool result section */
function CollapsibleResult({ toolName, toolInput, result }: { toolName: string; toolInput?: Record<string, unknown>; result: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 border-t border-gray-200 dark:border-gray-600 pt-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
        <span>결과 보기</span>
      </button>
      {expanded && (
        <div className="mt-1">
          <ToolResultRenderer toolName={toolName} toolInput={toolInput} result={result} />
        </div>
      )}
    </div>
  );
}

/** Extract diff data from Edit/Write tool input */
function extractDiffData(toolName: string, toolInput?: Record<string, unknown>) {
  const filePath = typeof toolInput?.file_path === 'string' ? toolInput.file_path : '';
  if (toolName === 'Edit') {
    const original = typeof toolInput?.old_string === 'string' ? toolInput.old_string : '';
    const modified = typeof toolInput?.new_string === 'string' ? toolInput.new_string : '';
    return { filePath, original, modified };
  }
  // Write
  const modified = typeof toolInput?.content === 'string' ? toolInput.content : '';
  return { filePath, original: '', modified };
}

/** Compute approximate line changes */
function computeLineChanges(original: string, modified: string): { added: number; removed: number } {
  const countLines = (s: string) => (s ? s.split('\n').length : 0);
  return {
    added: countLines(modified),
    removed: countLines(original),
  };
}

export function ToolCard({
  toolName,
  toolInput,
  status,
  startedAt,
  duration,
  output,
  resultOutput,
  isUserDenied,
}: ToolCardProps) {
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [isPathExpanded, setIsPathExpanded] = useState(false);

  const toolDisplayName = getToolDisplayName(toolName);
  const displayInfo = getToolDisplayInfo(toolName, toolInput);
  const ToolIcon = getToolIcon(toolName);

  const isEditWrite = toolName === 'Edit' || toolName === 'Write';
  const diffData = isEditWrite ? extractDiffData(toolName, toolInput) : null;
  const lineChanges = diffData ? computeLineChanges(diffData.original, diffData.modified) : null;

  const isDenied = status === 'denied';
  const isError = status === 'error';
  const isPending = status === 'pending';
  const isCompleted = status === 'completed';

  // TodoWrite checklist
  const todos = toolName === 'TodoWrite' && Array.isArray(toolInput?.todos)
    ? (toolInput!.todos as Array<{ content: string; status: string }>)
    : null;

  // Collapsible result: for completed tools except Edit/Write/TodoWrite
  const showCollapsibleResult = isCompleted && output && !isEditWrite && toolName !== 'TodoWrite';

  // Bash/Grep result output (from history merged result)
  const showResultOutput = (toolName === 'Grep' || toolName === 'Bash') && resultOutput;

  // Bash additionalParams for ToolPathDisplay (streaming completed)
  const bashAdditionalParams = toolName === 'Bash' && isCompleted && output
    ? [{ label: 'OUT', value: output }]
    : undefined;

  return (
    <>
      <div
        className="flex justify-start"
        role="listitem"
        aria-label={
          isDenied
            ? `도구 거절됨: ${toolDisplayName}`
            : isError
              ? `도구 실패: ${toolDisplayName}`
              : isPending
                ? `도구 실행 중: ${toolDisplayName}`
                : `도구 완료: ${toolDisplayName}`
        }
      >
        <div className={`max-w-[80%] bg-gray-100 dark:bg-gray-800 rounded-lg p-3 border ${
          isDenied || isError ? 'border-red-200 dark:border-red-800' : 'border-gray-200 dark:border-gray-700'
        }`}>
          {/* Header: icon + name + status + duration */}
          <div className="flex items-center gap-2">
            <ToolIcon className="w-4 h-4 text-blue-500" aria-hidden="true" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {toolDisplayName}
            </span>
            {isDenied ? (
              <>
                <XCircle className="w-4 h-4 text-red-500" aria-hidden="true" />
                <span className="text-xs text-red-500 dark:text-red-400">
                  {isUserDenied ? '거절됨' : '실패'}
                </span>
              </>
            ) : isError ? (
              <XCircle className="w-4 h-4 text-red-500" aria-hidden="true" />
            ) : isPending ? (
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-500" aria-hidden="true" />
            )}
            {/* Duration display */}
            {!isPending && duration != null && (
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto" aria-label={`실행 시간: ${formatDuration(duration)}`}>
                {formatDuration(duration)}
              </span>
            )}
            {isPending && startedAt != null && (
              <ToolTimer startedAt={startedAt} />
            )}
          </div>

          {/* Path display for non-Edit/Write tools */}
          {displayInfo && !isEditWrite && (
            <ToolPathDisplay
              displayInfo={displayInfo}
              toolName={toolName}
              toolInput={toolInput}
              additionalParams={bashAdditionalParams}
            />
          )}

          {/* Edit/Write: collapsible file path + diff button */}
          {isEditWrite && diffData && lineChanges && (
            <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPathExpanded(!isPathExpanded)}
                className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors text-left"
                aria-expanded={isPathExpanded}
                aria-label={isPathExpanded ? '접기' : '전체 경로 보기'}
              >
                {isPathExpanded ? (
                  <ChevronDown className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronRight className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                )}
                <span className={isPathExpanded ? 'break-all' : 'truncate'}>
                  {isPathExpanded ? diffData.filePath : diffData.filePath.split(/[/\\]/).pop() || diffData.filePath}
                </span>
              </button>
              <button
                onClick={() => setShowDiffViewer(true)}
                className="group flex items-center gap-0.5 whitespace-nowrap hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                aria-label="Diff 보기"
                title="클릭하여 Diff 보기"
              >
                <span className="text-green-600 dark:text-green-400">+{lineChanges.added}</span>
                <span className="text-gray-400">/</span>
                <span className="text-red-600 dark:text-red-400">-{lineChanges.removed}</span>
                <Files className="w-3.5 h-3.5 ml-1.5 text-blue-500 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 group-hover:scale-110 transition-all" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* TodoWrite checklist */}
          {todos && todos.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
              {todos.map((todo, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="flex-shrink-0 mt-0.5">
                    {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '▸' : '○'}
                  </span>
                  <span className={todo.status === 'completed' ? 'line-through opacity-60' : ''}>
                    {todo.content}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Collapsible result (streaming completed) */}
          {showCollapsibleResult && (
            <CollapsibleResult toolName={toolName} toolInput={toolInput} result={output!} />
          )}

          {/* Collapsible result output (history Bash/Grep) */}
          {showResultOutput && (
            <CollapsibleResult toolName={toolName} toolInput={toolInput} result={resultOutput!} />
          )}

          {/* Error display */}
          {isError && (
            <div className="mt-2 text-xs text-red-500 border-t border-gray-200 dark:border-gray-600 pt-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
              {output ? output.slice(0, 500) : '알 수 없는 오류'}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen DiffViewer for Edit/Write */}
      {showDiffViewer && diffData && (
        <DiffViewer
          filePath={diffData.filePath}
          original={diffData.original}
          modified={diffData.modified}
          fullscreen={true}
          responsiveLayout={true}
          onClose={() => setShowDiffViewer(false)}
          readOnly={true}
        />
      )}
    </>
  );
}
