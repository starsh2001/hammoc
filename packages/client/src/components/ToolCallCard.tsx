/**
 * ToolCallCard - Component for displaying tool_use/tool_result messages
 * [Source: Story 3.5 - Task 6]
 */

import { useState } from 'react';
import type { HistoryMessage } from '@bmad-studio/shared';
import { CheckCircle, XCircle, ChevronRight, ChevronDown, Files } from 'lucide-react';
import { ToolPathDisplay } from './ToolPathDisplay';
import { DiffViewer } from './DiffViewer';
import { getToolIcon, getToolDisplayName } from '../utils/toolUtils';
import { ToolDetailToggle } from './ToolDetailToggle';

interface ToolCallCardProps {
  message: HistoryMessage;
}

/**
 * Extract display info from tool input based on tool type
 * file_path: Read/Write, path: Grep, pattern: Glob, command: Bash
 */
function extractDisplayInfo(toolInput?: Record<string, unknown>): string | null {
  if (!toolInput) return null;
  const rawInfo = toolInput.file_path || toolInput.path || toolInput.pattern || toolInput.command;
  return typeof rawInfo === 'string' ? rawInfo : null;
}

/**
 * Extract diff data from Edit/Write tool input
 */
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

/**
 * Compute approximate line changes from original/modified strings
 */
function computeLineChanges(original: string, modified: string): { added: number; removed: number } {
  const countLines = (s: string) => (s ? s.split('\n').length : 0);
  return {
    added: countLines(modified),
    removed: countLines(original),
  };
}

/** Todo item from TodoWrite input */
interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

/**
 * Extract todo items from TodoWrite tool input
 */
function extractTodos(toolInput?: Record<string, unknown>): TodoItem[] | null {
  if (!toolInput?.todos || !Array.isArray(toolInput.todos)) return null;
  return toolInput.todos as TodoItem[];
}

export function ToolCallCard({ message }: ToolCallCardProps) {
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const isToolUse = message.type === 'tool_use';
  const isSuccess = message.toolResult?.success !== false;
  const displayInfo = isToolUse ? extractDisplayInfo(message.toolInput) : null;

  const toolDisplayName = getToolDisplayName(message.toolName ?? '');
  const todos = message.toolName === 'TodoWrite' ? extractTodos(message.toolInput) : null;

  // Edit/Write tool - same card format with diff button
  const isEditWrite = message.toolName === 'Edit' || message.toolName === 'Write';
  const diffData = isEditWrite ? extractDiffData(message.toolName!, message.toolInput) : null;
  const lineChanges = diffData ? computeLineChanges(diffData.original, diffData.modified) : null;

  const ToolIcon = getToolIcon(message.toolName ?? '');

  // For tool_use, show compact card matching streaming style
  if (isToolUse) {
    return (
      <>
        <div
          className="flex justify-start"
          role="listitem"
          aria-label={`도구 완료: ${toolDisplayName}`}
        >
          <div className="max-w-[80%] bg-gray-100 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <ToolIcon className="w-4 h-4 text-blue-500" aria-hidden="true" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {toolDisplayName}
              </span>
              <CheckCircle className="w-4 h-4 text-green-500" aria-hidden="true" />
            </div>
            {displayInfo && !isEditWrite && <ToolPathDisplay displayInfo={displayInfo} toolName={message.toolName} />}
            {/* Generic tool detail expand/collapse (Read, Glob, Grep) */}
            <ToolDetailToggle toolName={message.toolName ?? ''} input={message.toolInput} toolCallId={message.id} />
            {/* Edit/Write: collapsible file path with line changes */}
            {isEditWrite && diffData && lineChanges && (
              <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors text-left"
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? '접기' : '전체 경로 보기'}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                  )}
                  <span className={isExpanded ? 'break-all' : 'truncate'}>
                    {isExpanded ? diffData.filePath : diffData.filePath.split(/[/\\]/).pop() || diffData.filePath}
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

  // For tool_result, show error state only (success results are implicit)
  if (!isSuccess) {
    return (
      <div
        className="flex justify-start"
        role="listitem"
        aria-label={`도구 결과: 실패`}
      >
        <div className="max-w-[80%] bg-gray-100 dark:bg-gray-800 rounded-lg p-3 border border-red-200 dark:border-red-700">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" aria-hidden="true" />
            <span className="text-sm font-medium text-red-600 dark:text-red-400">
              도구 실패
            </span>
          </div>
          {message.toolResult?.error && (
            <div className="mt-1 text-xs text-red-500 dark:text-red-400 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
              {message.toolResult.error.slice(0, 500)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Success tool_result - don't render (already shown via tool_use card)
  return null;
}
