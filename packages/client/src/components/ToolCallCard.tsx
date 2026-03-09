/**
 * ToolCallCard - History adapter for ToolCard
 * Converts HistoryMessage to unified ToolCard props.
 * [Source: Story 3.5 - Task 6, refactored to use ToolCard]
 */

import type { HistoryMessage } from '@hammoc/shared';
import { useTranslation } from 'react-i18next';
import { XCircle } from 'lucide-react';
import { ToolCard } from './ToolCard';
import { ToolResultRenderer } from './ToolResultRenderer';

interface ToolCallCardProps {
  message: HistoryMessage;
  /** Optional result output for merged display (e.g., Bash IN/OUT in one card) */
  resultOutput?: string;
}

export function ToolCallCard({ message, resultOutput }: ToolCallCardProps) {
  const { t } = useTranslation('chat');
  const isToolUse = message.type === 'tool_use';
  const isSuccess = message.toolResult?.success !== false;

  // For tool_use, delegate to unified ToolCard
  if (isToolUse) {
    const failed = message.toolResult?.success === false;
    const errorMessage = failed ? (message.toolResult?.error ?? '') : '';
    const isUserDenied = failed && /denied|거절/i.test(errorMessage);

    return (
      <ToolCard
        toolName={message.toolName ?? ''}
        toolInput={message.toolInput}
        status={failed ? (isUserDenied ? 'denied' : 'error') : 'completed'}
        resultOutput={resultOutput}
        output={failed && !isUserDenied ? errorMessage : undefined}
        isUserDenied={isUserDenied}
      />
    );
  }

  // For tool_result, show error state only (success results are implicit)
  if (!isSuccess) {
    return (
      <div
        className="flex justify-start"
        role="listitem"
        aria-label={t('tool.resultFailed')}
      >
        <div className="max-w-[80%] bg-gray-100 dark:bg-gray-800 rounded-lg p-3 border border-red-200 dark:border-red-700">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" aria-hidden="true" />
            <span className="text-sm font-medium text-red-600 dark:text-red-400">
              {t('tool.toolFailed')}
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

  // Edit/Write/TodoWrite/AskUserQuestion: already shown via tool_use card — skip
  const SKIP_RESULT_TOOLS = ['Read', 'Edit', 'Write', 'TodoWrite', 'AskUserQuestion'];
  if (SKIP_RESULT_TOOLS.includes(message.toolName ?? '')) {
    return null;
  }

  // Bash/Glob/Grep: render result
  return <ToolResultRenderer toolName={message.toolName ?? ''} toolInput={message.toolInput} result={message.toolResult?.output} />;
}
