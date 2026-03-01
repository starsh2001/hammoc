/**
 * BoardCard - Board item card with type badge and progress bar
 * [Source: Story 21.2 - Task 6]
 */

import type { BoardItem } from '@bmad-studio/shared';

interface BoardCardProps {
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
  low: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

export function BoardCard({ item }: BoardCardProps) {
  const typeBadge = TYPE_BADGE[item.type];

  return (
    <div className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm cursor-default">
      {/* Header: type badge + title */}
      <div className="flex items-start gap-2">
        {typeBadge && (
          <span
            className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${typeBadge.className}`}
          >
            {typeBadge.label}
          </span>
        )}
        <span className="text-sm font-medium text-gray-900 dark:text-white leading-tight">
          {item.title}
        </span>
      </div>

      {/* Issue: description preview + severity */}
      {item.type === 'issue' && (
        <div className="mt-2 space-y-1.5">
          {item.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
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
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {item.issueType}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Story: epic number */}
      {item.type === 'story' && item.epicNumber != null && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Epic #{item.epicNumber}
        </p>
      )}

      {/* Epic: story progress bar */}
      {item.type === 'epic' && item.storyProgress && (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{
                  width: item.storyProgress.total > 0
                    ? `${(item.storyProgress.done / item.storyProgress.total) * 100}%`
                    : '0%',
                }}
              />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {item.storyProgress.done}/{item.storyProgress.total}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
