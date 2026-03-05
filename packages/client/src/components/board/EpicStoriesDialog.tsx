/**
 * EpicStoriesDialog - Read-only dialog showing epic's child stories
 * [Source: Story 21.3 - Task 4]
 */

import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { BoardItem } from '@bmad-studio/shared';
import { STATUS_LABEL, STATUS_BADGE_COLOR } from './constants';

interface EpicStoriesDialogProps {
  open: boolean;
  epic: BoardItem | null;
  stories: BoardItem[];
  onClose: () => void;
}

export function EpicStoriesDialog({ open, epic, stories, onClose }: EpicStoriesDialogProps) {
  const { t } = useTranslation('board');
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleClose]);

  if (!open || !epic) return null;

  // Calculate progress
  let doneCount: number;
  let totalCount: number;
  if (epic.storyProgress) {
    doneCount = epic.storyProgress.done;
    totalCount = epic.storyProgress.total;
  } else {
    totalCount = stories.length;
    doneCount = stories.filter((s) => s.status === 'Done').length;
  }
  const progressPercent = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('epic.subStories')}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white truncate pr-2">
            <span className="text-gray-500 dark:text-gray-400 font-mono mr-1.5">
              Epic {epic.epicNumber ?? epic.id.replace(/^epic-/, '')}
            </span>
            {!/^Epic\s+\d+$/.test(epic.title) && epic.title}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors flex-shrink-0"
            aria-label={t('common:button.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('epic.progress')}</span>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {doneCount}/{totalCount} ({Math.round(progressPercent)}%)
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Stories list */}
        <div className="p-4 max-h-80 overflow-y-auto">
          {stories.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
              {t('epic.noSubStories')}
            </p>
          ) : (
            <ul className="space-y-2">
              {stories.map((story) => (
                <li
                  key={story.id}
                  className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {story.id.replace(/^story-/, '')}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-white truncate">
                      {story.title}
                    </span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${STATUS_BADGE_COLOR[story.status] || ''}`}
                  >
                    {STATUS_LABEL[story.status] || story.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
