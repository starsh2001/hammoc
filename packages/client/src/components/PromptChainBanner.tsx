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
import { X, Link2, ChevronDown, ChevronUp } from 'lucide-react';

export interface PromptChainBannerProps {
  /** Pending prompts to be sent after current streaming completes */
  pendingPrompts: string[];
  /** Cancel all pending prompts */
  onCancel: () => void;
  /** Remove a single prompt by index */
  onRemove?: (index: number) => void;
}

/** Shorten command for display (e.g., "/BMad:tasks:create-next-story" → "create-next-story") */
function shortLabel(prompt: string): string {
  return prompt.includes(':') ? (prompt.split(':').pop() ?? prompt) : prompt;
}

export function PromptChainBanner({ pendingPrompts, onCancel, onRemove }: PromptChainBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (pendingPrompts.length === 0) return null;

  const nextPrompt = pendingPrompts[0];
  const hasMultiple = pendingPrompts.length > 1;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`프롬프트 체인: 다음 명령 대기 중 — ${nextPrompt}`}
      data-testid="prompt-chain-banner"
      className="content-container banner-full-mobile sticky top-0 z-[9] transition-all duration-300
                 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-200 dark:border-violet-800/50"
    >
      {/* Collapsed header row */}
      <div className="px-4 py-2 flex items-center gap-2">
        {/* Icon */}
        <Link2
          size={14}
          className="text-violet-500 dark:text-violet-400 flex-shrink-0"
          aria-hidden="true"
        />

        {/* Label */}
        <span className="text-xs font-medium text-violet-700 dark:text-violet-300 flex items-center gap-1.5 min-w-0">
          <span className="flex-shrink-0">다음</span>
          <span className="truncate text-violet-600/70 dark:text-violet-400/70 font-mono">
            {shortLabel(nextPrompt)}
          </span>
          {hasMultiple && !expanded && (
            <span className="flex-shrink-0 text-violet-500/60 dark:text-violet-400/50">
              +{pendingPrompts.length - 1}
            </span>
          )}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Expand/Collapse toggle — only when 2+ prompts */}
        {hasMultiple && (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors
                       text-violet-400 dark:text-violet-500 hover:text-violet-600 dark:hover:text-violet-300
                       cursor-pointer flex-shrink-0"
            aria-label={expanded ? '체인 목록 접기' : '체인 목록 펼치기'}
            title={expanded ? '접기' : '펼치기'}
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
          aria-label="대기 중인 프롬프트 전체 취소"
          title="전체 취소"
        >
          <X size={14} />
        </button>
      </div>

      {/* Expanded list */}
      {expanded && hasMultiple && (
        <ul className="px-4 pb-2 flex flex-col gap-1">
          {pendingPrompts.map((prompt, index) => (
            <li
              key={`${index}-${prompt}`}
              className="group flex items-center gap-2 px-2 py-1 rounded
                         hover:bg-violet-100/60 dark:hover:bg-violet-900/30 transition-colors"
            >
              {/* Order number */}
              <span className="text-[10px] font-bold text-violet-400 dark:text-violet-500 w-4 text-right flex-shrink-0">
                {index + 1}
              </span>

              {/* Prompt text */}
              <span className="text-xs text-violet-700 dark:text-violet-300 font-mono truncate min-w-0">
                {shortLabel(prompt)}
              </span>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Individual remove — visible on hover */}
              {onRemove && (
                <button
                  onClick={() => onRemove(index)}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity
                             text-violet-400 dark:text-violet-500 hover:text-red-500 dark:hover:text-red-400
                             hover:bg-violet-100 dark:hover:bg-violet-900/40 cursor-pointer flex-shrink-0"
                  aria-label={`${index + 1}번 프롬프트 제거`}
                  title="제거"
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
