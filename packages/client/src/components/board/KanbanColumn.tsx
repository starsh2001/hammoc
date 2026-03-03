/**
 * KanbanColumn - Single kanban column with header and card list
 * [Source: Story 21.2 - Task 7, Story 21.3 - Task 6]
 */

import type { BoardItem, BoardColumnConfig } from '@bmad-studio/shared';
import { BoardCard } from './BoardCard';
import type { CardActionCallbacks } from './BoardCard';

interface KanbanColumnProps extends CardActionCallbacks {
  columnConfig: BoardColumnConfig;
  items: BoardItem[];
}

export function KanbanColumn({
  columnConfig,
  items,
  onQuickFix,
  onPromote,
  onEdit,
  onClose,
  onDelete,
  onWorkflowAction,
  onViewEpicStories,
}: KanbanColumnProps) {
  return (
    <div
      className={`min-w-[280px] w-[280px] flex flex-col bg-gray-50 dark:bg-gray-900 rounded-lg border-t-2 ${columnConfig.colorClass}`}
    >
      {/* Column header */}
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {columnConfig.label}
        </span>
        <span className="text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
        {items.map((item) => (
          <BoardCard
            key={item.id}
            item={item}
            onQuickFix={onQuickFix}
            onPromote={onPromote}
            onEdit={onEdit}
            onClose={onClose}
            onDelete={onDelete}
            onWorkflowAction={onWorkflowAction}
            onViewEpicStories={onViewEpicStories}
          />
        ))}
      </div>
    </div>
  );
}
