/**
 * PermissionCard - Permission card for Edit/Write tool results
 * [Source: Story 6.5 - Tasks 1-5]
 *
 * Displays a summary card with file header, change stats, approve/reject buttons,
 * and fullscreen DiffViewer integration (Progressive Disclosure).
 */

import { useState } from 'react';
import { FileText, Maximize2, Check, X, CheckCircle, XCircle } from 'lucide-react';
import { DiffViewer } from './DiffViewer';

interface PermissionCardProps {
  /** Tool name ('Edit' or 'Write') */
  toolName: string;
  /** Tool input data containing file_path, old_string/new_string or content */
  toolInput?: Record<string, unknown>;
  /** Change intent description from message content */
  summary?: string;
  /** Tool execution status */
  status?: 'pending' | 'completed' | 'error';
  /** Approve callback (wired in Story 7.x) */
  onApprove?: () => void;
  /** Reject callback (wired in Story 7.x) */
  onReject?: () => void;
}

/**
 * Extract diff data from tool input based on tool type
 */
function extractDiffData(toolName: string, toolInput?: Record<string, unknown>) {
  const filePath = typeof toolInput?.file_path === 'string' ? toolInput.file_path : '';
  if (toolName === 'Edit') {
    const original = typeof toolInput?.old_string === 'string' ? toolInput.old_string : '';
    const modified = typeof toolInput?.new_string === 'string' ? toolInput.new_string : '';
    return { filePath, original, modified };
  }
  // Write
  const modified = typeof toolInput?.content === 'string' ? toolInput.content : '';
  return { filePath, original: '', modified };
}

/**
 * Compute approximate line changes from original/modified strings
 */
function computeLineChanges(original: string, modified: string): { added: number; removed: number } {
  const countLines = (s: string) => (s ? s.split('\n').length : 0);
  return {
    added: countLines(modified),
    removed: countLines(original),
  };
}

export function PermissionCard({
  toolName,
  toolInput,
  summary,
  status,
  onApprove,
  onReject,
}: PermissionCardProps) {
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const { filePath, original, modified } = extractDiffData(toolName, toolInput);
  const { added, removed } = computeLineChanges(original, modified);

  // Short filename for display, full path for tooltip
  const shortName = filePath ? filePath.split('/').pop() || filePath : '';

  // Default summary when not provided
  const displaySummary = summary || (toolName === 'Edit' ? `파일 수정: ${filePath}` : `파일 생성: ${filePath}`);

  const isDisabled = status === 'completed' || status === 'error';

  return (
    <>
      <div
        className="max-w-[80%] rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm bg-gray-50 dark:bg-gray-800"
        data-testid="permission-card"
      >
        {/* File Header - clickable to open fullscreen DiffViewer */}
        <button
          onClick={() => setShowDiffViewer(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-t-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          aria-label={`파일 변경사항 보기: ${filePath}`}
        >
          <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" aria-hidden="true" />
          <span
            className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate"
            title={filePath}
          >
            {shortName}
          </span>
          <span
            className="text-xs whitespace-nowrap ml-auto"
            title="블록 기준 근사치입니다. 탭하여 정확한 Diff를 확인하세요"
          >
            <span className="text-green-600 dark:text-green-400">+{added}</span>
            <span className="text-gray-400 mx-0.5">/</span>
            <span className="text-red-600 dark:text-red-400">-{removed}</span>
          </span>
          <Maximize2 className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" aria-hidden="true" />
        </button>

        {/* Summary */}
        <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {displaySummary}
          </p>
        </div>

        {/* Approve / Reject Buttons */}
        <div className="flex justify-end gap-2 px-3 py-2 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => onApprove?.()}
            disabled={isDisabled}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border
              bg-green-50 hover:bg-green-100 text-green-700 border-green-200
              dark:bg-green-900/20 dark:hover:bg-green-900/40 dark:text-green-400 dark:border-green-800
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="변경사항 승인"
          >
            {status === 'completed' ? (
              <CheckCircle className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Check className="w-4 h-4" aria-hidden="true" />
            )}
            승인
          </button>
          <button
            onClick={() => onReject?.()}
            disabled={isDisabled}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border
              bg-red-50 hover:bg-red-100 text-red-700 border-red-200
              dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 dark:border-red-800
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="변경사항 거절"
          >
            {status === 'error' ? (
              <XCircle className="w-4 h-4" aria-hidden="true" />
            ) : (
              <X className="w-4 h-4" aria-hidden="true" />
            )}
            거절
          </button>
        </div>
      </div>

      {/* Fullscreen DiffViewer (Progressive Disclosure) */}
      {showDiffViewer && (
        <DiffViewer
          filePath={filePath}
          original={original}
          modified={modified}
          fullscreen={true}
          responsiveLayout={true}
          onClose={() => setShowDiffViewer(false)}
          readOnly={true}
        />
      )}
    </>
  );
}
