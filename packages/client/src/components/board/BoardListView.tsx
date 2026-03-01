/**
 * BoardListView - Accordion list view for desktop and mobile
 * [Source: Story 21.2 - Task 9]
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { BoardItem, BoardItemStatus } from '@bmad-studio/shared';
import { BoardCard } from './BoardCard';
import { BOARD_COLUMNS, STATUS_LABEL } from './constants';

interface BoardListViewProps {
  itemsByStatus: Record<BoardItemStatus, BoardItem[]>;
  isMobile?: boolean;
}

const DEFAULT_COLLAPSED_MOBILE: Set<BoardItemStatus> = new Set(['Done', 'Closed']);

function getInitialExpanded(isMobile: boolean): Set<BoardItemStatus> {
  if (isMobile) {
    return new Set(BOARD_COLUMNS.filter((s) => !DEFAULT_COLLAPSED_MOBILE.has(s)));
  }
  return new Set(BOARD_COLUMNS);
}

export function BoardListView({ itemsByStatus, isMobile = false }: BoardListViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<BoardItemStatus>>(
    () => getInitialExpanded(isMobile),
  );

  const toggleGroup = (status: BoardItemStatus) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const visibleColumns = BOARD_COLUMNS.filter(
    (status) => (itemsByStatus[status]?.length ?? 0) > 0,
  );

  return (
    <div className="space-y-2 overflow-y-auto h-full">
      {visibleColumns.map((status) => {
        const items = itemsByStatus[status];
        const isExpanded = expandedGroups.has(status);

        return (
          <div
            key={status}
            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
          >
            {/* Accordion header */}
            <button
              onClick={() => toggleGroup(status)}
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
                  {STATUS_LABEL[status]}
                </span>
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                  {items.length}
                </span>
              </div>
            </button>

            {/* Accordion body */}
            {isExpanded && (
              <div className="p-2 space-y-2">
                {items.map((item) => (
                  <BoardCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
