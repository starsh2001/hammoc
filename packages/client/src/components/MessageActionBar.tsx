/**
 * MessageActionBar - Action buttons displayed at the bottom of each message
 * [Source: Story 25.1 - Task 1, 2]
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check } from 'lucide-react';
import { debugLogger } from '../utils/debugLogger';

interface MessageActionBarProps {
  role: 'user' | 'assistant';
  content: string;
  isLastAssistant?: boolean;
  disabled?: boolean;
  onCopy?: (content: string) => void;
}

export function MessageActionBar({
  role,
  content,
  disabled = false,
  onCopy,
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

  const buttonBase = `inline-flex items-center justify-center p-0.5 rounded transition-colors ${
    isUser
      ? 'hover:bg-blue-200/50 dark:hover:bg-blue-500/30 text-gray-400 dark:text-blue-300/50 hover:text-gray-700 dark:hover:text-white'
      : 'hover:bg-gray-200/50 dark:hover:bg-[#2d3a4a] text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
  }`;

  return (
    <div
      className="flex items-center gap-0.5 justify-end"
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
    </div>
  );
}
