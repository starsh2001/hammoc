/**
 * ToolPathDisplay - Collapsible path display for tool calls
 * Shows filename by default, expands to full path on click
 * For Glob/Grep: shows extra params (path) when expanded
 * [Source: Story 4.5 - Mobile UX improvement]
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { getToolExtraParams } from '../utils/toolUtils';

interface ToolPathDisplayProps {
  /** Full path or command string */
  displayInfo: string;
  /** Tool name to determine display behavior */
  toolName?: string;
  /** Tool input for extra params display (Glob/Grep) */
  toolInput?: Record<string, unknown>;
  /** Additional params to show when expanded (e.g., Bash output) */
  additionalParams?: { label: string; value: string }[];
}

/**
 * Extract filename from a full path
 * Handles both Windows (backslash) and Unix (forward slash) paths
 */
function extractFileName(fullPath: string): string {
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
 */
const SHOW_FULL_BY_DEFAULT = ['Glob', 'Grep', 'Bash'];

export function ToolPathDisplay({ displayInfo, toolName, toolInput, additionalParams }: ToolPathDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  const showFullByDefault = toolName && SHOW_FULL_BY_DEFAULT.includes(toolName);
  const isPathType = isPath(displayInfo);

  // Extra params for Glob/Grep/Bash/Task (e.g., path, command, agent)
  const computedParams = toolName && toolInput ? getToolExtraParams(toolName, toolInput) : null;
  const allParams = [...(computedParams || []), ...(additionalParams || [])];
  const extraParams = allParams.length > 0 ? allParams : null;

  const collapsedText = showFullByDefault
    ? displayInfo
    : isPathType
      ? extractFileName(displayInfo)
      : displayInfo;

  useEffect(() => {
    const el = textRef.current;
    if (el && !isExpanded) {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    }
  }, [collapsedText, isExpanded]);

  // For Glob/Grep/Bash that aren't truncated AND have no extra params, just show text
  if (showFullByDefault && !isTruncated && !isExpanded && !extraParams) {
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
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden="true" />
        )}
        <span
          ref={!showFullByDefault || isExpanded ? undefined : textRef}
          className={isExpanded ? 'break-all whitespace-pre-wrap' : 'truncate'}
        >
          {isExpanded ? displayInfo : collapsedText}
        </span>
      </button>
      {isExpanded && extraParams && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 pl-4">
          {extraParams.map((p) => (
            <div key={p.label} className="break-all whitespace-pre-wrap">
              <span className="font-medium">{p.label}:</span> {p.value}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
