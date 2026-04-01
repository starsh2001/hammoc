/**
 * MessageActionBar - Action buttons displayed at the bottom of each message
 * [Source: Story 25.1 - Task 1, 2]
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, Pencil, Undo2, Loader2, Sparkles, X, GitFork } from 'lucide-react';
import { debugLogger } from '../utils/debugLogger';

interface MessageActionBarProps {
  role: 'user' | 'assistant';
  content: string;
  isLastAssistant?: boolean;
  disabled?: boolean;
  onCopy?: (content: string) => void;
  onEdit?: () => void;
  isOptimistic?: boolean;
  onRewind?: () => void;
  isRewinding?: boolean;
  onSummarize?: () => void;
  isSummarizing?: boolean;
  onFork?: () => void;
  /** When true, edit/rewind/summarize buttons are disabled (but still visible) */
  actionsLocked?: boolean;
}

export function MessageActionBar({
  role,
  content,
  disabled = false,
  onCopy,
  onEdit,
  isOptimistic = false,
  onRewind,
  isRewinding = false,
  onSummarize,
  isSummarizing = false,
  onFork,
  actionsLocked = false,
}: MessageActionBarProps) {
  const { t } = useTranslation('chat');
  const [isCopied, setIsCopied] = useState(false);
  const [isSummarizeHovered, setIsSummarizeHovered] = useState(false);

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

  const isUser = role === 'user';
  const showEditButton = isUser && !isOptimistic && !!onEdit;
  const showRewindButton = isUser && !isOptimistic;
  const showSummarizeButton = isUser && !isOptimistic && !!onSummarize;
  const showForkButton = !isUser && !isOptimistic && !!onFork;

  const buttonBase = `inline-flex items-center justify-center p-0.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
    isUser
      ? 'hover:bg-blue-200/50 dark:hover:bg-blue-500/30 text-gray-400 dark:text-blue-300/50 hover:text-gray-700 dark:hover:text-white'
      : 'hover:bg-gray-200/50 dark:hover:bg-[#2d3a4a] text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
  }`;

  return (
    <div
      className="flex items-center gap-0.5 justify-end"
      data-testid="message-action-bar"
    >
      {/* Edit button — user messages only, hidden during streaming or optimistic */}
      {showEditButton && (
        <button
          onClick={onEdit}
          className={buttonBase}
          title={t('messageActionBar.edit')}
          aria-label={t('messageActionBar.edit')}
          disabled={disabled || actionsLocked}
        >
          <Pencil className="w-3 h-3" aria-hidden="true" />
        </button>
      )}

      {/* Summarize button — user messages only, hidden for optimistic */}
      {showSummarizeButton && (
        <button
          onClick={onSummarize}
          className={buttonBase}
          title={isSummarizing ? t('summarize.generating') : t('summarize.button')}
          aria-label={isSummarizing ? t('summarize.generating') : t('summarize.button')}
          disabled={(disabled && !isSummarizing) || (actionsLocked && !isSummarizing)}
          onMouseEnter={() => setIsSummarizeHovered(true)}
          onMouseLeave={() => setIsSummarizeHovered(false)}
        >
          {isSummarizing ? (
            isSummarizeHovered ? (
              <X className="w-3 h-3" aria-hidden="true" />
            ) : (
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            )
          ) : (
            <Sparkles className="w-3 h-3" aria-hidden="true" />
          )}
        </button>
      )}

      {/* Rewind button — user messages only, hidden for optimistic */}
      {showRewindButton && onRewind && (
        <button
          onClick={onRewind}
          className={buttonBase}
          title={t('rewind.button')}
          aria-label={t('rewind.button')}
          disabled={disabled || isRewinding || actionsLocked}
        >
          {isRewinding ? (
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
          ) : (
            <Undo2 className="w-3 h-3" aria-hidden="true" />
          )}
        </button>
      )}

      {/* Fork button — assistant messages only, hidden for optimistic and old branch */}
      {showForkButton && (
        <button
          onClick={onFork}
          className={buttonBase}
          title={t('fork.tooltip')}
          aria-label={t('fork.tooltip')}
          disabled={disabled || actionsLocked}
        >
          <GitFork className="w-3 h-3" aria-hidden="true" />
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
