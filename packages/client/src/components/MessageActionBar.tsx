/**
 * MessageActionBar - Action buttons displayed at the bottom of each message
 * [Source: Story 25.1 - Task 1, 2, Story 25.4 - Task 2]
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, RotateCcw, RefreshCw } from 'lucide-react';
import { debugLogger } from '../utils/debugLogger';

interface MessageActionBarProps {
  role: 'user' | 'assistant';
  content: string;
  messageId?: string;
  messageText?: string;
  isLastAssistant?: boolean;
  isRewinding?: boolean;
  disabled?: boolean;
  onCopy?: (content: string) => void;
  onRewind?: (messageId: string, messageText: string) => void;
  onRegenerate?: () => void;
}

export function MessageActionBar({
  role,
  content,
  messageId,
  messageText,
  isLastAssistant = false,
  isRewinding = false,
  disabled = false,
  onCopy,
  onRewind,
  onRegenerate,
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

  const handleRewind = useCallback(() => {
    if (messageId && onRewind) {
      onRewind(messageId, messageText ?? content);
    }
  }, [messageId, messageText, content, onRewind]);

  const handleRegenerate = useCallback(() => {
    onRegenerate?.();
  }, [onRegenerate]);

  if (disabled) return null;

  const isUser = role === 'user';

  const buttonBase = `inline-flex items-center justify-center p-0.5 rounded transition-colors ${
    isUser
      ? 'hover:bg-blue-200/50 dark:hover:bg-blue-500/30 text-gray-400 dark:text-blue-200/60 hover:text-gray-600 dark:hover:text-blue-200'
      : 'hover:bg-gray-200/50 dark:hover:bg-[#2d3a4a] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
  }`;

  const disabledButton = 'opacity-40 cursor-not-allowed';

  return (
    <div
      className="flex items-center gap-0.5 justify-end"
      data-testid="message-action-bar"
    >
      {/* Rewind button — active for both user and assistant messages */}
      {onRewind && messageId && (
        <button
          onClick={handleRewind}
          disabled={isRewinding}
          className={`${buttonBase} ${isRewinding ? disabledButton : ''}`}
          title={t('messageActionBar.rewind')}
          aria-label={t('messageActionBar.rewindAriaLabel')}
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
        </button>
      )}

      {/* Regenerate button — only for last assistant message */}
      {isLastAssistant && onRegenerate && (
        <button
          onClick={handleRegenerate}
          disabled={isRewinding}
          className={`${buttonBase} ${isRewinding ? disabledButton : ''}`}
          title={t('messageActionBar.regenerate')}
          aria-label={t('messageActionBar.regenerateAriaLabel')}
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
        </button>
      )}

      {/* Copy button */}
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
    </div>
  );
}
