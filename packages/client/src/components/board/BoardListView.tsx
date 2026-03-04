/**
 * BoardListView - Accordion list view for desktop and mobile
 * [Source: Story 21.2 - Task 9, Story 21.3 - Task 6]
 */

import { useState, useEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import type { BoardItem, BoardConfig } from '@bmad-studio/shared';
import { BoardCard } from './BoardCard';
import type { CardActionCallbacks } from './BoardCard';

interface BoardListViewProps extends CardActionCallbacks {
  itemsByColumn: Record<string, BoardItem[]>;
  boardConfig: BoardConfig;
  isMobile?: boolean;
}

function getInitialExpanded(isMobile: boolean, config: BoardConfig): Set<string> {
  const allIds = new Set(config.columns.map((c) => c.id));
  if (isMobile) {
    // Collapse the last column on mobile
    const lastId = config.columns[config.columns.length - 1]?.id;
    if (lastId) allIds.delete(lastId);
  }
  return allIds;
}

export function BoardListView({
  itemsByColumn,
  boardConfig,
  isMobile = false,
  onQuickFix,
  onPromote,
  onEdit,
  onClose,
  onReopen,
  onDelete,
  onWorkflowAction,
  onViewEpicStories,
  onNormalizeStatus,
  onCardClick,
}: BoardListViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => getInitialExpanded(isMobile, boardConfig),
  );

  // Stable key for column identity to detect config changes
  const columnKey = useMemo(
    () => boardConfig.columns.map((c) => c.id).join(','),
    [boardConfig.columns],
  );

  // Reconcile expanded state when columns change
  useEffect(() => {
    setExpandedGroups(getInitialExpanded(isMobile, boardConfig));
  }, [columnKey, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (columnId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  };

  const visibleColumns = boardConfig.columns.filter(
    (col) => (itemsByColumn[col.id]?.length ?? 0) > 0,
  );

  return (
    <div className="space-y-2 overflow-y-auto h-full">
      {visibleColumns.map((col) => {
        const items = itemsByColumn[col.id] || [];
        const isExpanded = expandedGroups.has(col.id);

        return (
          <div
            key={col.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
          >
            {/* Accordion header */}
            <button
              onClick={() => toggleGroup(col.id)}
              aria-expanded={isExpanded}
              className="w-full px-4 py-2.5 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChevronDown
                  className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                    isExpanded ? '' : '-rotate-90'
                  }`}
                />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {col.label}
                </span>
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full" data-testid={`column-count-${col.id}`}>
                  {items.length}
                </span>
              </div>
            </button>

            {/* Accordion body */}
            {isExpanded && (
              <div className="p-2 space-y-2">
                {items.map((item) => (
                  <BoardCard
                    key={item.id}
                    item={item}
                    onQuickFix={onQuickFix}
                    onPromote={onPromote}
                    onEdit={onEdit}
                    onClose={onClose}
                    onReopen={onReopen}
                    onDelete={onDelete}
                    onWorkflowAction={onWorkflowAction}
                    onViewEpicStories={onViewEpicStories}
                    onNormalizeStatus={onNormalizeStatus}
                    onCardClick={onCardClick}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
