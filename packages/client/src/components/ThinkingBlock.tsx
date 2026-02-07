/**
 * ThinkingBlock - Collapsible display for Claude's thinking process
 * Story 7.4: Thinking Message Display - Task 1
 *
 * Features:
 * - Collapsed by default with Brain icon + "Thinking" text
 * - Toggle to expand/collapse with smooth CSS transition
 * - Expanded content with distinct styling (purple border + background)
 * - Markdown rendering via MarkdownRenderer
 * - Max height with scroll for long thinking content
 * - Full accessibility (aria-expanded, aria-controls, button element)
 */

import { useState, useId } from 'react';
import { Brain, ChevronRight, ChevronDown } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ThinkingBlockProps {
  /** Thinking content (markdown string) */
  content: string;
  /** Whether to start in expanded state */
  defaultExpanded?: boolean;
}

export function ThinkingBlock({ content, defaultExpanded = false }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const contentId = useId();

  const toggle = () => setIsExpanded((prev) => !prev);

  return (
    <div
      className={
        isExpanded
          ? 'border-l-2 border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-900/10 rounded-r pl-3 py-2'
          : ''
      }
    >
      <button
        onClick={toggle}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className={`flex items-center gap-2 cursor-pointer rounded py-1 px-2
                   text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800`}
      >
        <Brain className={`w-4 h-4 ${isExpanded ? 'text-purple-500' : ''}`} aria-hidden="true" />
        <span className={`text-xs ${isExpanded ? 'text-purple-600 dark:text-purple-400' : ''}`}>Thinking</span>
        {isExpanded
          ? <ChevronDown className="w-3 h-3" aria-hidden="true" />
          : <ChevronRight className="w-3 h-3" aria-hidden="true" />
        }
      </button>
      <div
        id={contentId}
        role={isExpanded ? 'region' : undefined}
        aria-label={isExpanded ? 'Thinking content' : undefined}
        className={`transition-all duration-200 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-96 overflow-y-auto opacity-100 mt-2' : 'max-h-0 opacity-0'
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
