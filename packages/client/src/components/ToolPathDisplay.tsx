/**
 * ToolPathDisplay - Collapsible path display for tool calls
 * Shows filename by default, expands to full path on click
 * [Source: Story 4.5 - Mobile UX improvement]
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface ToolPathDisplayProps {
  /** Full path or command string */
  displayInfo: string;
  /** Tool name to determine display behavior */
  toolName?: string;
}

/**
 * Extract filename from a full path
 * Handles both Windows (backslash) and Unix (forward slash) paths
 */
function extractFileName(fullPath: string): string {
  // Handle both Windows and Unix paths
  const parts = fullPath.split(/[/\\]/);
  return parts[parts.length - 1] || fullPath;
}

/**
 * Check if the display info looks like a path (contains slashes)
 */
function isPath(displayInfo: string): boolean {
  return displayInfo.includes('/') || displayInfo.includes('\\');
}

/**
 * Tools that should show full content by default (truncated if needed)
 * These typically use patterns or commands where the full text is important
 */
const SHOW_FULL_BY_DEFAULT = ['Glob', 'Grep', 'Bash'];

export function ToolPathDisplay({ displayInfo, toolName }: ToolPathDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  const showFullByDefault = toolName && SHOW_FULL_BY_DEFAULT.includes(toolName);
  const isPathType = isPath(displayInfo);

  // For tools like Glob/Grep/Bash, show full content; for Read/Edit, show filename
  const collapsedText = showFullByDefault
    ? displayInfo
    : isPathType
      ? extractFileName(displayInfo)
      : displayInfo;

  // Check if text is truncated
  useEffect(() => {
    const el = textRef.current;
    if (el && !isExpanded) {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    }
  }, [collapsedText, isExpanded]);

  // If showing full by default and not truncated, no need for expand button
  const needsExpandButton = !showFullByDefault || isTruncated || isExpanded;

  // For Glob/Grep/Bash that aren't truncated, just show text without button
  if (showFullByDefault && !isTruncated && !isExpanded) {
    return (
      <div className="mt-1">
        <span
          ref={textRef}
          className="text-xs text-gray-500 dark:text-gray-400 truncate block"
        >
          {displayInfo}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-start gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors text-left max-w-full"
        aria-expanded={isExpanded}
        aria-label={isExpanded ? '접기' : '전체 내용 보기'}
      >
        {needsExpandButton && (
          isExpanded ? (
            <ChevronDown className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden="true" />
          )
        )}
        <span
          ref={!showFullByDefault || isExpanded ? undefined : textRef}
          className={isExpanded ? 'break-all whitespace-pre-wrap' : 'truncate'}
        >
          {isExpanded ? displayInfo : collapsedText}
        </span>
      </button>
    </div>
  );
}
