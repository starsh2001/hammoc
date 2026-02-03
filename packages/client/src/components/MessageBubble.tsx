/**
 * MessageBubble - Component for displaying user/assistant messages
 * [Source: Story 3.5 - Task 6, Story 4.3 - Task 1, Story 4.4 - Task 4]
 */

import { useState, useCallback } from 'react';
import type { HistoryMessage } from '@bmad-studio/shared';
import { formatRelativeTime } from '../utils/formatters';
import { Bot, Copy, Check } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MessageBubbleProps {
  /** Message data */
  message: HistoryMessage;
  /** Whether message is currently streaming - prepared for Story 4.5 */
  isStreaming?: boolean;
  /** Callback when message is copied */
  onCopy?: (content: string) => void;
  /** Timestamp display mode - 'always' (default) or 'hover' */
  timestampMode?: 'always' | 'hover';
}

export function MessageBubble({
  message,
  isStreaming = false,
  onCopy,
  timestampMode = 'always',
}: MessageBubbleProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const isUser = message.type === 'user';
  const formattedTime = formatRelativeTime(message.timestamp);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      onCopy?.(message.content);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [message.content, onCopy]);

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      role="listitem"
      aria-label={`${isUser ? '내' : 'Claude'} 메시지, ${formattedTime}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`relative group max-w-[90%] md:max-w-[80%] ${
          isUser
            ? 'bg-blue-600 text-white rounded-l-lg rounded-tr-lg'
            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-r-lg rounded-tl-lg border border-gray-200 dark:border-gray-700'
        } p-3 shadow-sm`}
      >
        {/* Icon for assistant */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-2 text-sm text-gray-500 dark:text-gray-400">
            <Bot className="w-4 h-4" aria-hidden="true" />
            <span>Claude</span>
          </div>
        )}

        {/* Message content - plain text for user, markdown for assistant */}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content} isStreaming={isStreaming} />
        )}

        {/* Timestamp */}
        <div
          className={`mt-2 text-xs transition-opacity duration-200 ${
            isUser ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'
          } ${timestampMode === 'hover' ? (isHovered ? 'opacity-100' : 'opacity-0') : 'opacity-100'}`}
        >
          {formattedTime}
        </div>

        {/* Copy button - visible on hover */}
        <button
          onClick={handleCopy}
          aria-label={isCopied ? '복사됨' : '메시지 복사'}
          title={isCopied ? '복사됨!' : '클립보드에 복사'}
          className={`absolute top-2 right-2 min-w-[48px] min-h-[48px] p-3 flex items-center justify-center rounded transition-opacity duration-200 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          } ${
            isUser
              ? 'bg-blue-500 hover:bg-blue-400 text-white'
              : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'
          }`}
        >
          {isCopied ? (
            <Check className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Copy className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
