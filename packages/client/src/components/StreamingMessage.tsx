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
import { Bot, Copy, Check } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { StreamingIndicator } from './StreamingIndicator';

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
  const [isHovered, setIsHovered] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!isComplete) return; // Prevent copying during streaming
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      onCopy?.(content);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [content, isComplete, onCopy]);

  return (
    <div
      className="flex justify-start"
      role="listitem"
      aria-label="Claude 응답 중"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative group max-w-[90%] md:max-w-[80%] bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-r-lg rounded-tl-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
        {/* Claude icon and name */}
        <div className="flex items-center gap-2 mb-2 text-sm text-gray-500 dark:text-gray-400">
          <Bot className="w-4 h-4" aria-hidden="true" />
          <span>Claude</span>
        </div>

        {/* Streaming markdown content */}
        <MarkdownRenderer content={content} isStreaming={!isComplete} />

        {/* Streaming indicator - shown while streaming */}
        {!isComplete && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <StreamingIndicator />
          </div>
        )}

        {/* Copy button - only visible and enabled when complete */}
        {isComplete && (
          <button
            onClick={handleCopy}
            aria-label={isCopied ? '복사됨' : '메시지 복사'}
            title={isCopied ? '복사됨!' : '클립보드에 복사'}
            className={`absolute top-2 right-2 min-w-[48px] min-h-[48px] p-3 flex items-center justify-center rounded transition-opacity duration-200 ${
              isHovered ? 'opacity-100' : 'opacity-0'
            } bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
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
