/**
 * StreamingMessage - Component for displaying streaming assistant responses
 * [Source: Story 4.5 - Task 6, Story 25.1 - Task 4]
 *
 * Features:
 * - MessageBubble-like styling for assistant messages
 * - Streaming indicator at the bottom
 * - Markdown rendering with streaming optimization
 * - Action bar hidden during streaming, visible when complete
 */

import { useTranslation } from 'react-i18next';
import { Bot } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MessageActionBar } from './MessageActionBar';

interface StreamingMessageProps {
  /** Current streaming content */
  content: string;
  /** Whether streaming is complete */
  isComplete?: boolean;
  /** Callback when message is copied */
  onCopy?: (content: string) => void;
}

export function StreamingMessage({
  content,
  isComplete = false,
  onCopy,
}: StreamingMessageProps) {
  const { t } = useTranslation('chat');

  return (
    <div
      className="flex justify-start"
      role="listitem"
      aria-label={t('streamingMessage.ariaLabel')}
    >
      <div className="relative group max-w-[90%] md:max-w-[80%] bg-gray-50 dark:bg-[#263240] text-gray-900 dark:text-white rounded-r-lg rounded-tl-lg border border-gray-300 dark:border-[#3a4d5e] p-3 shadow-sm">
        {/* Claude icon and name */}
        <div className="flex items-center gap-2 mb-2 text-sm text-gray-500 dark:text-gray-300">
          <Bot className="w-4 h-4" aria-hidden="true" />
          <span>{t('streamingMessage.assistantName')}</span>
        </div>

        {/* Streaming markdown content */}
        <MarkdownRenderer content={content} isStreaming={!isComplete} />

        {/* Action bar — hidden during streaming */}
        {isComplete && (
          <MessageActionBar
            role="assistant"
            content={content}
            onCopy={onCopy}
          />
        )}
      </div>
    </div>
  );
}
