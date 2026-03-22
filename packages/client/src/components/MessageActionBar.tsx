/**
 * MessageActionBar - Action buttons displayed at the bottom of each message
 * [Source: Story 25.1 - Task 1, 2, Story 25.2 - Task 4]
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, RotateCcw, RefreshCw, Share2 } from 'lucide-react';
import { debugLogger } from '../utils/debugLogger';

interface MessageActionBarProps {
  role: 'user' | 'assistant';
  content: string;
  isLastAssistant?: boolean;
  disabled?: boolean;
  onCopy?: (content: string) => void;
  messageId?: string;
  messageIndex?: number;
  totalMessages?: number;
  onRewind?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  isStreaming?: boolean;
}

export function MessageActionBar({
  role,
  content,
  isLastAssistant = false,
  disabled = false,
  onCopy,
  messageId,
  onRewind,
  onRegenerate,
  isStreaming = false,
}: MessageActionBarProps) {
  const { t } = useTranslation('chat');
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(async () => {
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
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1000);
    }
  }, [content, onCopy]);

  if (disabled) return null;

  const isUser = role === 'user';
  const isAssistant = role === 'assistant';

  const buttonBase = `inline-flex items-center justify-center p-0.5 rounded transition-colors ${
    isUser
      ? 'hover:bg-blue-200/50 dark:hover:bg-blue-500/30 text-gray-400 dark:text-blue-200/60 hover:text-gray-600 dark:hover:text-blue-200'
      : 'hover:bg-gray-200/50 dark:hover:bg-[#2d3a4a] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
  }`;

  const disabledClass = 'opacity-50 cursor-not-allowed pointer-events-none';

  return (
    <div
      className={`flex items-center gap-0.5 ${isUser ? 'justify-end' : 'justify-start'}`}
      data-testid="message-action-bar"
    >
      {/* Copy button — functional */}
      <button
        onClick={handleCopy}
        className={buttonBase}
        title={isCopied ? t('messageActionBar.copied') : t('messageActionBar.copy')}
        aria-label={isCopied ? t('messageActionBar.copiedAriaLabel') : t('messageActionBar.copyAriaLabel')}
      >
        {isCopied ? (
          <Check className="w-3 h-3" aria-hidden="true" />
        ) : (
          <Copy className="w-3 h-3" aria-hidden="true" />
        )}
      </button>

      {/* Rewind button — assistant only */}
      {isAssistant && (
        <button
          onClick={() => messageId && onRewind?.(messageId)}
          className={`${buttonBase} ${isStreaming ? disabledClass : ''}`}
          title={t('messageActionBar.rewind')}
          aria-label={t('messageActionBar.rewindAriaLabel')}
          disabled={isStreaming}
          data-testid="rewind-button"
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
        </button>
      )}

      {/* Regenerate button — assistant only, last assistant message only */}
      {isAssistant && (
        <button
          onClick={() => messageId && onRegenerate?.(messageId)}
          className={`${buttonBase} ${!isLastAssistant || isStreaming ? disabledClass : ''}`}
          title={t('messageActionBar.regenerate')}
          aria-label={t('messageActionBar.regenerateAriaLabel')}
          disabled={!isLastAssistant || isStreaming}
          data-testid="regenerate-button"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
        </button>
      )}

      {/* Share button — assistant only, placeholder for Story 25.3 */}
      {isAssistant && (
        <button
          className={`${buttonBase} ${disabledClass}`}
          title={t('messageActionBar.share')}
          aria-label={t('messageActionBar.shareAriaLabel')}
          disabled
          data-testid="share-button"
        >
          <Share2 className="w-3 h-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
