/**
 * StreamingMessage - Component for displaying streaming assistant responses
 * [Source: Story 4.5 - Task 6]
 *
 * Features:
 * - MessageBubble-like styling for assistant messages
 * - Streaming indicator at the bottom
 * - Markdown rendering with streaming optimization
 * - Copy button disabled during streaming
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Copy, Check } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { debugLogger } from '../utils/debugLogger';

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
  const [isHovered, setIsHovered] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!isComplete) return; // Prevent copying during streaming
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(content);
      } else {
        // Fallback for non-secure contexts
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      onCopy?.(content);
    } catch (err) {
      debugLogger.error('Failed to copy', { error: err instanceof Error ? err.message : String(err) });
      // Brief visual feedback on failure
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1000);
    }
  }, [content, isComplete, onCopy]);

  return (
    <div
      className="flex justify-start"
      role="listitem"
      aria-label={t('streamingMessage.ariaLabel')}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative group max-w-[90%] md:max-w-[80%] bg-gray-50 dark:bg-[#263240] text-gray-900 dark:text-white rounded-r-lg rounded-tl-lg border border-gray-200 dark:border-[#253040] p-3 shadow-sm">
        {/* Claude icon and name */}
        <div className="flex items-center gap-2 mb-2 text-sm text-gray-500 dark:text-gray-300">
          <Bot className="w-4 h-4" aria-hidden="true" />
          <span>{t('streamingMessage.assistantName')}</span>
        </div>

        {/* Streaming markdown content */}
        <MarkdownRenderer content={content} isStreaming={!isComplete} />

        {/* Copy button - only visible and enabled when complete */}
        {isComplete && (
          <button
            onClick={handleCopy}
            aria-label={isCopied ? t('streamingMessage.copiedLabel') : t('streamingMessage.copyLabel')}
            title={isCopied ? t('streamingMessage.copiedTitle') : t('streamingMessage.copyTitle')}
            className={`absolute top-2 right-2 z-10 p-1.5 flex items-center justify-center rounded transition-opacity duration-200 ${
              isHovered ? 'opacity-100' : 'opacity-0'
            } bg-gray-100 dark:bg-[#253040] hover:bg-gray-200 dark:hover:bg-[#2d3a4a] text-gray-600 dark:text-gray-200`}
          >
            {isCopied ? (
              <Check className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Copy className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
