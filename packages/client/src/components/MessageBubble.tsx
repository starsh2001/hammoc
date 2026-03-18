/**
 * MessageBubble - Component for displaying user/assistant messages
 * [Source: Story 3.5 - Task 6, Story 4.3 - Task 1, Story 4.4 - Task 4]
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { HistoryMessage } from '@hammoc/shared';
import { formatRelativeTime } from '../utils/formatters';
import { Bot, Copy, Check } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { debugLogger } from '../utils/debugLogger';

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
  const { t } = useTranslation('chat');
  const [isHovered, setIsHovered] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const isUser = message.type === 'user';
  const formattedTime = formatRelativeTime(message.timestamp);

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(message.content);
      } else {
        // Fallback for non-secure contexts
        const textarea = document.createElement('textarea');
        textarea.value = message.content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      onCopy?.(message.content);
    } catch (err) {
      debugLogger.error('Failed to copy', { error: err instanceof Error ? err.message : String(err) });
      // Brief visual feedback on failure
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1000);
    }
  }, [message.content, onCopy]);

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      role="listitem"
      aria-label={t('messageBubble.ariaLabel', { role: t(isUser ? 'messageBubble.userRole' : 'messageBubble.assistantRole'), time: formattedTime })}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`relative group max-w-[90%] md:max-w-[80%] ${
          isUser
            ? 'bg-blue-100 dark:bg-blue-600 text-gray-900 dark:text-white rounded-l-lg rounded-tr-lg'
            : 'bg-gray-50 dark:bg-[#263240] text-gray-900 dark:text-white rounded-r-lg rounded-tl-lg border border-gray-200 dark:border-[#253040]'
        } p-3 shadow-sm`}
      >
        {/* Icon for assistant */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-2 text-sm text-gray-500 dark:text-gray-300">
            <Bot className="w-4 h-4" aria-hidden="true" />
            <span>{t('messageBubble.assistantName')}</span>
          </div>
        )}

        {/* Attached images (user messages only) */}
        {isUser && message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.images.map((img, idx) =>
              img.data ? (
                <img
                  key={`${message.id}-img-${idx}`}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt={img.name || t('messageBubble.image', { index: idx + 1 })}
                  className="max-w-[200px] max-h-[150px] rounded object-cover cursor-pointer hover:opacity-90"
                  onClick={() => window.open(`data:${img.mimeType};base64,${img.data}`, '_blank')}
                />
              ) : (
                <div
                  key={`${message.id}-img-${idx}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 dark:bg-gray-600 rounded text-xs text-gray-500 dark:text-gray-300"
                >
                  <span>📎</span>
                  <span>{t('messageBubble.imageAttached')}</span>
                </div>
              )
            )}
          </div>
        )}

        {/* Message content - plain text for user, markdown for assistant */}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          message.content && <MarkdownRenderer content={message.content} isStreaming={isStreaming} />
        )}

        {/* Timestamp */}
        <div
          className={`mt-2 text-xs transition-opacity duration-200 ${
            isUser ? 'text-gray-600 dark:text-blue-200' : 'text-gray-400 dark:text-gray-400'
          } ${timestampMode === 'hover' ? (isHovered ? 'opacity-100' : 'opacity-0') : 'opacity-100'}`}
        >
          {formattedTime}
        </div>

        {/* Copy button - visible on hover */}
        <button
          onClick={handleCopy}
          aria-label={isCopied ? t('messageBubble.copiedLabel') : t('messageBubble.copyLabel')}
          title={isCopied ? t('messageBubble.copiedTitle') : t('messageBubble.copyTitle')}
          className={`absolute top-2 right-2 z-10 p-1.5 flex items-center justify-center rounded transition-opacity duration-200 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          } ${
            isUser
              ? 'bg-blue-200 hover:bg-blue-300 text-gray-700 dark:bg-blue-500 dark:hover:bg-blue-400 dark:text-white'
              : 'bg-gray-100 dark:bg-[#253040] hover:bg-gray-200 dark:hover:bg-[#2d3a4a] text-gray-600 dark:text-gray-200'
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
