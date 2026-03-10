/**
 * GitFileList - File group list component for Git staging area
 * [Source: Story 16.3 - Task 4]
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Minus, ChevronDown, ChevronRight } from 'lucide-react';
import type { GitFileStatus } from '@hammoc/shared';

interface GitFileListProps {
  title: string;
  files: GitFileStatus[] | string[];
  type: 'staged' | 'unstaged' | 'untracked';
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onStageFile?: (path: string) => void;
  onUnstageFile?: (path: string) => void;
  onFileClick: (path: string, staged: boolean) => void;
  isLoading?: boolean;
}

function getStatusIndicator(type: 'staged' | 'unstaged' | 'untracked', file: GitFileStatus | string): { label: string; color: string } {
  if (type === 'untracked') {
    return { label: '?', color: 'text-gray-500 dark:text-gray-300' };
  }

  const fileStatus = file as GitFileStatus;
  const indicator = type === 'staged' ? fileStatus.index : fileStatus.working_dir;

  switch (indicator) {
    case 'M':
      return { label: 'M', color: type === 'staged' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400' };
    case 'D':
      return { label: 'D', color: 'text-red-600 dark:text-red-400' };
    case 'A':
      return { label: 'A', color: 'text-green-600 dark:text-green-400' };
    case 'R':
      return { label: 'R', color: 'text-blue-600 dark:text-blue-400' };
    default:
      return { label: indicator || '?', color: 'text-gray-500 dark:text-gray-300' };
  }
}

function getFilePath(file: GitFileStatus | string): string {
  return typeof file === 'string' ? file : file.path;
}

export function GitFileList({
  title,
  files,
  type,
  onStageAll,
  onUnstageAll,
  onStageFile,
  onUnstageFile,
  onFileClick,
  isLoading = false,
}: GitFileListProps) {
  const { t } = useTranslation('common');
  const [collapsed, setCollapsed] = useState(false);

  if (files.length === 0) return null;

  const staged = type === 'staged';

  return (
    <div className="border border-gray-200 dark:border-[#253040] rounded-lg overflow-hidden">
      {/* Group header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-[#263240]/50 hover:bg-gray-100 dark:hover:bg-[#263240] text-left"
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
        )}
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1">
          {title}
        </span>
        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-200 dark:bg-[#253040] text-gray-600 dark:text-gray-300">
          {files.length}
        </span>
        {/* Group action button */}
        {staged && onUnstageAll && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onUnstageAll(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onUnstageAll(); } }}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1"
            title={t('git.unstageAll')}
          >
            <Minus className="w-3.5 h-3.5 inline" /> {t('git.all')}
          </span>
        )}
        {!staged && onStageAll && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onStageAll(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onStageAll(); } }}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1"
            title={t('git.stageAll')}
          >
            <Plus className="w-3.5 h-3.5 inline" /> {t('git.all')}
          </span>
        )}
      </button>

      {/* File list */}
      {!collapsed && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {files.map((file) => {
            const path = getFilePath(file);
            const { label, color } = getStatusIndicator(type, file);

            return (
              <li
                key={path}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-[#263240]/30 group"
              >
                {/* Status indicator */}
                <span className={`w-4 text-center text-xs font-mono font-bold ${color}`}>
                  {label}
                </span>

                {/* File path (clickable) */}
                <button
                  type="button"
                  onClick={() => onFileClick(path, staged)}
                  className="flex-1 text-left text-sm font-mono text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                  disabled={isLoading}
                >
                  {path}
                </button>

                {/* Per-file stage/unstage button */}
                {staged && onUnstageFile && (
                  <button
                    type="button"
                    onClick={() => onUnstageFile(path)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    title={t('git.unstage')}
                    disabled={isLoading}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                )}
                {!staged && onStageFile && (
                  <button
                    type="button"
                    onClick={() => onStageFile(path)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    title={t('git.stage')}
                    disabled={isLoading}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
