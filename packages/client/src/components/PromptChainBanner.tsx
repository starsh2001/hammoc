/**
 * PromptChainBanner - Shows pending prompts queued for sequential execution.
 *
 * Displayed as a thin sticky banner below ChatHeader when a prompt chain
 * is active (e.g., agent activation followed by a task command).
 * Uses violet color scheme to distinguish from queue runner (indigo).
 *
 * Collapsed: shows first prompt + "+N" count + expand chevron.
 * Expanded: shows all prompts with individual remove buttons on hover.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Link2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import type { PromptChainItem } from '@hammoc/shared';

export interface PromptChainBannerProps {
  /** Pending prompts to be sent after current streaming completes */
  pendingPrompts: PromptChainItem[];
  /** Cancel all pending prompts */
  onCancel: () => void;
  /** Remove a single prompt by id */
  onRemove?: (id: string) => void;
}

/** Shorten command for display (e.g., "/BMad:tasks:create-next-story" → "create-next-story") */
function shortLabel(prompt: string): string {
  return prompt.includes(':') ? (prompt.split(':').pop() ?? prompt) : prompt;
}

export function PromptChainBanner({ pendingPrompts, onCancel, onRemove }: PromptChainBannerProps) {
  const { t } = useTranslation('chat');
  const [expanded, setExpanded] = useState(false);

  // Only show items that are pending or sending
  const activeItems = pendingPrompts.filter((item) => item.status === 'pending' || item.status === 'sending');
  if (activeItems.length === 0) return null;

  const nextItem = activeItems[0];
  const hasMultiple = activeItems.length > 1;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t('chain.waitingAria', { prompt: nextItem.content })}
      data-testid="prompt-chain-banner"
      className="content-container banner-full-mobile sticky top-0 z-[9] transition-all duration-300
                 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-200 dark:border-violet-800/50
                 overflow-x-hidden"
    >
      {/* Collapsed header row */}
      <div className="px-4 py-2 flex items-center gap-2 min-w-0">
        {/* Icon — spinner when sending */}
        {nextItem.status === 'sending' ? (
          <Loader2
            size={14}
            className="text-violet-500 dark:text-violet-400 flex-shrink-0 animate-spin"
            aria-hidden="true"
          />
        ) : (
          <Link2
            size={14}
            className="text-violet-500 dark:text-violet-400 flex-shrink-0"
            aria-hidden="true"
          />
        )}

        {/* Label */}
        <span className="text-xs font-medium text-violet-700 dark:text-violet-300 flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          <span className="flex-shrink-0">{t('chain.next')}</span>
          <span className="truncate text-violet-600/70 dark:text-violet-400/70 font-mono">
            {shortLabel(nextItem.content)}
          </span>
          {hasMultiple && !expanded && (
            <span className="flex-shrink-0 text-violet-500/60 dark:text-violet-400/50">
              +{activeItems.length - 1}
            </span>
          )}
        </span>

        {/* Expand/Collapse toggle — only when 2+ prompts */}
        {hasMultiple && (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors
                       text-violet-400 dark:text-violet-500 hover:text-violet-600 dark:hover:text-violet-300
                       cursor-pointer flex-shrink-0"
            aria-label={expanded ? t('chain.collapseList') : t('chain.expandList')}
            title={expanded ? t('chain.collapseList') : t('chain.expandList')}
          >
            {expanded
              ? <ChevronUp size={14} aria-hidden="true" />
              : <ChevronDown size={14} aria-hidden="true" />}
          </button>
        )}

        {/* Cancel all button */}
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors
                     text-violet-400 dark:text-violet-500 hover:text-violet-600 dark:hover:text-violet-300
                     cursor-pointer flex-shrink-0"
          aria-label={t('chain.cancelAll')}
          title={t('chain.cancelAllTitle')}
        >
          <X size={14} />
        </button>
      </div>

      {/* Expanded list */}
      {expanded && hasMultiple && (
        <ul className="px-4 pb-2 flex flex-col gap-1 min-w-0">
          {activeItems.map((item, index) => (
            <li
              key={item.id}
              className="group flex items-center gap-2 px-2 py-1 rounded min-w-0
                         hover:bg-violet-100/60 dark:hover:bg-violet-900/30 transition-colors"
            >
              {/* Status indicator */}
              {item.status === 'sending' ? (
                <Loader2
                  size={10}
                  className="text-violet-500 dark:text-violet-400 flex-shrink-0 animate-spin w-4 text-center"
                  aria-hidden="true"
                />
              ) : (
                <span className="text-[10px] font-bold text-violet-400 dark:text-violet-500 w-4 text-right flex-shrink-0">
                  {index + 1}
                </span>
              )}

              {/* Prompt text */}
              <span className="text-xs text-violet-700 dark:text-violet-300 font-mono truncate min-w-0 flex-1">
                {shortLabel(item.content)}
              </span>

              {/* Individual remove — visible on hover */}
              {onRemove && (
                <button
                  onClick={() => onRemove(item.id)}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity
                             text-violet-400 dark:text-violet-500 hover:text-red-500 dark:hover:text-red-400
                             hover:bg-violet-100 dark:hover:bg-violet-900/40 cursor-pointer flex-shrink-0"
                  aria-label={t('chain.removePrompt', { index: index + 1 })}
                  title={t('chain.removeTitle')}
                >
                  <X size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
