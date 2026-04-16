/**
 * BoardCard - Board item card with type badge and progress bar
 * [Source: Story 21.2 - Task 6, Story 21.3 - Task 2]
 */

import { useTranslation } from 'react-i18next';
import type { BoardItem } from '@hammoc/shared';
import { CardContextMenu } from './CardContextMenu';
import { resolveBadge } from './constants';

export interface CardActionCallbacks {
  onQuickFix?: (item: BoardItem) => void;
  onPromote?: (item: BoardItem, targetType: 'story' | 'epic') => void;
  onEdit?: (item: BoardItem) => void;
  onClose?: (item: BoardItem) => void;
  onReopen?: (item: BoardItem) => void;
  onDelete?: (item: BoardItem) => void;
  onWorkflowAction?: (item: BoardItem) => void;
  onValidateAndFixAction?: (item: BoardItem) => void;
  onValidateOnlyAction?: (item: BoardItem) => void;
  onViewEpicStories?: (item: BoardItem) => void;
  onCreateNextStory?: (item: BoardItem) => void;
  onRequestQAReview?: (item: BoardItem) => void;
  onIssueStatusChange?: (item: BoardItem, status: string) => void;
  onCommitAndComplete?: (item: BoardItem) => void;
  onCardClick?: (item: BoardItem) => void;
}

interface BoardCardProps extends CardActionCallbacks {
  item: BoardItem;
}

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  issue: {
    label: '[I]',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  story: {
    label: '[S]',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  epic: {
    label: '[E]',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  },
};


const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-gray-100 text-gray-800 dark:bg-[#253040] dark:text-gray-200',
};

export function BoardCard({
  item,
  onQuickFix,
  onPromote,
  onEdit,
  onClose,
  onReopen,
  onDelete,
  onWorkflowAction,
  onValidateAndFixAction,
  onValidateOnlyAction,
  onViewEpicStories,
  onCreateNextStory,
  onRequestQAReview,
  onIssueStatusChange,
  onCommitAndComplete,
  onCardClick,
}: BoardCardProps) {
  const { t: _t } = useTranslation('board');
  const typeBadge = TYPE_BADGE[item.type];
  const badge = resolveBadge(item);
  const isClickable = item.type === 'issue' || item.type === 'epic' || (item.type === 'story' && !!item.filePath);

  return (
    <div
      className={`p-3 min-w-0 bg-white dark:bg-[#263240] border border-gray-300 dark:border-[#3a4d5e] rounded-lg shadow-sm relative ${
        isClickable
          ? 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all'
          : 'cursor-default'
      }`}
      onClick={isClickable ? () => onCardClick?.(item) : undefined}
    >
      {/* Header: type badge + title + context menu */}
      <div className="flex items-start gap-2">
        {typeBadge && (
          <span
            className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${typeBadge.className}`}
          >
            {typeBadge.label}
          </span>
        )}
        <span className="text-sm font-medium text-gray-900 dark:text-white leading-tight flex-1">
          {(item.type === 'story' || item.type === 'epic') && (
            <span className="text-gray-500 dark:text-gray-300 mr-1.5 font-mono">
              {item.type === 'epic'
                ? `Epic ${item.epicNumber ?? item.id.replace(/^epic-/, '')}`
                : item.id.replace(/^story-/, '')}
            </span>
          )}
          {item.type === 'epic' && /^Epic\s+\d+$/.test(item.title)
            ? null
            : item.title}
        </span>
        <CardContextMenu
          item={item}
          onQuickFix={onQuickFix}
          onPromote={onPromote}
          onEdit={onEdit}
          onClose={onClose}
          onReopen={onReopen}
          onDelete={onDelete}
          onWorkflowAction={onWorkflowAction}
          onValidateAndFixAction={onValidateAndFixAction}
          onValidateOnlyAction={onValidateOnlyAction}
          onViewEpicStories={onViewEpicStories}
          onCreateNextStory={onCreateNextStory}
          onRequestQAReview={onRequestQAReview}
          onIssueStatusChange={onIssueStatusChange}
          onCommitAndComplete={onCommitAndComplete}
        />
      </div>

      {/* Issue: description preview + severity */}
      {item.type === 'issue' && (
        <div className="mt-2 space-y-1.5">
          {item.description && (
            <p className="text-xs text-gray-500 dark:text-gray-300 truncate">
              {item.description}
            </p>
          )}
          <div className="flex items-center gap-1.5">
            {item.severity && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${SEVERITY_BADGE[item.severity]}`}
              >
                {item.severity}
              </span>
            )}
            {item.issueType && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {item.issueType}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Story: epic number */}
      {item.type === 'story' && item.epicNumber != null && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-300">
          Epic #{item.epicNumber}
        </p>
      )}

      {/* Epic: story progress bar */}
      {item.type === 'epic' && item.storyProgress && (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-[#253040] rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{
                  width: item.storyProgress.total > 0
                    ? `${(item.storyProgress.done / item.storyProgress.total) * 100}%`
                    : '0%',
                }}
              />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-300 whitespace-nowrap">
              {item.storyProgress.done}/{item.storyProgress.total}
            </span>
          </div>
        </div>
      )}

      {/* Resolved badge */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${badge.colorClass}`}>
          {badge.label}
        </span>
      </div>
    </div>
  );
}
