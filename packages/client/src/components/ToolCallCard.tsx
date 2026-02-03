/**
 * ToolCallCard - Component for displaying tool_use/tool_result messages
 * [Source: Story 3.5 - Task 6]
 */

import type { HistoryMessage } from '@bmad-studio/shared';
import { CheckCircle, XCircle, Wrench } from 'lucide-react';
import { ToolPathDisplay } from './ToolPathDisplay';

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

export function ToolCallCard({ message }: ToolCallCardProps) {
  const isToolUse = message.type === 'tool_use';
  const isSuccess = message.toolResult?.success !== false;
  const displayInfo = isToolUse ? extractDisplayInfo(message.toolInput) : null;

  // For tool_use, show compact card matching streaming style
  if (isToolUse) {
    return (
      <div
        className="flex justify-start"
        role="listitem"
        aria-label={`도구 완료: ${message.toolName}`}
      >
        <div className="max-w-[80%] bg-gray-100 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-blue-500" aria-hidden="true" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {message.toolName}
            </span>
            <CheckCircle className="w-4 h-4 text-green-500" aria-hidden="true" />
          </div>
          {displayInfo && <ToolPathDisplay displayInfo={displayInfo} toolName={message.toolName} />}
        </div>
      </div>
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
