/**
 * ThinkingBlock - Collapsible display for Claude's thinking process
 * Story 7.4: Thinking Message Display - Task 1
 *
 * Features:
 * - Collapsed by default; toggling one block toggles ALL blocks globally
 * - Global state persists as the default for new blocks
 * - Expanded content with distinct styling (purple border + background)
 * - Markdown rendering via MarkdownRenderer
 * - Max height with scroll for long thinking content
 * - Full accessibility (aria-expanded, aria-controls, button element)
 */

import { useId, useRef, useCallback } from 'react';
import { Brain, ChevronRight, ChevronDown } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useChatStore } from '../stores/chatStore';

interface ThinkingBlockProps {
  /** Thinking content (markdown string) */
  content: string;
  /** Whether thinking is still streaming */
  isStreaming?: boolean;
}

export function ThinkingBlock({ content, isStreaming = false }: ThinkingBlockProps) {
  const isExpanded = useChatStore((s) => s.thinkingExpanded);
  const toggleThinkingExpanded = useChatStore((s) => s.toggleThinkingExpanded);
  const contentId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = useCallback(() => {
    // Record the clicked button's viewport position before toggle
    const topBefore = buttonRef.current?.getBoundingClientRect().top ?? 0;
    toggleThinkingExpanded();
    // After re-render, adjust scroll so the clicked button stays in place
    requestAnimationFrame(() => {
      if (!buttonRef.current) return;
      const topAfter = buttonRef.current.getBoundingClientRect().top;
      const delta = topAfter - topBefore;
      if (delta !== 0) {
        // Find the nearest scrollable ancestor
        const scrollParent = buttonRef.current.closest('[class*="overflow-y"]') ?? window;
        if (scrollParent instanceof Window) {
          scrollParent.scrollBy(0, delta);
        } else {
          scrollParent.scrollTop += delta;
        }
      }
    });
  }, [toggleThinkingExpanded]);

  return (
    <div
      className={
        isExpanded
          ? 'border-l-2 border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-900/10 rounded-r pl-3 py-2'
          : ''
      }
    >
      <button
        ref={buttonRef}
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className={`flex items-center gap-2 cursor-pointer rounded py-1 px-2
                   text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800`}
      >
        <Brain className={`w-4 h-4 ${isExpanded ? 'text-purple-500' : ''}`} aria-hidden="true" />
        <span className={`text-xs ${isExpanded ? 'text-purple-600 dark:text-purple-400' : ''}`}>{isStreaming ? 'Thinking...' : 'Thinking'}</span>
        {isExpanded
          ? <ChevronDown className="w-3 h-3" aria-hidden="true" />
          : <ChevronRight className="w-3 h-3" aria-hidden="true" />
        }
      </button>
      <div
        id={contentId}
        role={isExpanded ? 'region' : undefined}
        aria-label={isExpanded ? 'Thinking content' : undefined}
        className={`overflow-hidden ${
          isExpanded ? 'max-h-96 overflow-y-auto mt-2' : 'max-h-0'
        }`}
      >
        {isExpanded && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <MarkdownRenderer content={content} />
          </div>
        )}
      </div>
    </div>
  );
}
