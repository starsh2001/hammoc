/**
 * ToolPathDisplay - Collapsible path display for tool calls
 * Shows filename by default, expands to full path on click
 * For Glob/Grep: shows extra params (path) when expanded
 * Clicking filename opens file in the editor panel
 * [Source: Story 4.5 - Mobile UX improvement]
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { getToolExtraParams } from '../utils/toolUtils';
import { useFileStore } from '../stores/fileStore';
import { usePanelStore } from '../stores/panelStore';
import { useProjectStore } from '../stores/projectStore';

/**
 * Convert an absolute file path to a project-relative path.
 */
function toRelativePath(absolutePath: string, projectRoot: string): string {
  if (!projectRoot) return absolutePath;
  const normAbs = absolutePath.replace(/\\/g, '/');
  const normRoot = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  if (normAbs.startsWith(normRoot + '/')) {
    return normAbs.slice(normRoot.length + 1);
  }
  return absolutePath;
}

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

/** Tools that have a file_path in their input */
const FILE_PATH_TOOLS = ['Read', 'Edit', 'Write'];

/**
 * Tools that should show full content by default (truncated if needed)
 */
const SHOW_FULL_BY_DEFAULT = ['Glob', 'Grep', 'Bash'];

export function ToolPathDisplay({ displayInfo, toolName, toolInput, additionalParams }: ToolPathDisplayProps) {
  const { t } = useTranslation('chat');
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  const showFullByDefault = toolName && SHOW_FULL_BY_DEFAULT.includes(toolName);
  const isPathType = isPath(displayInfo);

  // Determine if this tool has a file path that can be opened in editor
  const filePath = toolInput && typeof toolInput.file_path === 'string' ? toolInput.file_path : null;
  const canOpenFile = !!filePath && !!projectSlug;

  const projectRoot = useProjectStore((s) => {
    const proj = s.projects.find((p) => p.projectSlug === projectSlug);
    return proj?.originalPath || '';
  });

  const handleOpenFile = useCallback(() => {
    if (!filePath || !projectSlug) return;
    const relativePath = toRelativePath(filePath, projectRoot);
    useFileStore.getState().openFileInEditor(projectSlug, relativePath);
    usePanelStore.getState().openPanel('files');
  }, [filePath, projectSlug, projectRoot]);

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
          className="text-xs text-gray-500 dark:text-gray-300 truncate block"
        >
          {displayInfo}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-1">
      <div className="flex items-start gap-1 max-w-full">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-start gap-1 text-xs text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-left min-w-0"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? t('tool.collapseContent') : t('tool.expandContent')}
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
        {canOpenFile && (
          <button
            type="button"
            onClick={handleOpenFile}
            className="flex-shrink-0 mt-0.5 p-0.5 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors rounded hover:bg-gray-100 dark:hover:bg-[#253040]"
            aria-label={t('tool.openInEditor', { defaultValue: 'Open in editor' })}
            title={t('tool.openInEditor', { defaultValue: 'Open in editor' })}
          >
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </div>
      {isExpanded && extraParams && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-300 pl-4">
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
