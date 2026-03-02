/**
 * KanbanBoard - Desktop kanban view with horizontal scrolling columns
 * [Source: Story 21.2 - Task 8, Story 21.3 - Task 6]
 */

import type { BoardItem, BoardItemStatus } from '@bmad-studio/shared';
import type { CardActionCallbacks } from './BoardCard';
import { KanbanColumn } from './KanbanColumn';
import { BOARD_COLUMNS } from './constants';

interface KanbanBoardProps extends CardActionCallbacks {
  itemsByStatus: Record<BoardItemStatus, BoardItem[]>;
}

export function KanbanBoard({
  itemsByStatus,
  onQuickFix,
  onPromote,
  onEdit,
  onClose,
  onWorkflowAction,
  onViewEpicStories,
}: KanbanBoardProps) {
  return (
    <div className="flex gap-4 overflow-x-auto h-full pb-2">
      {BOARD_COLUMNS.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          items={itemsByStatus[status] || []}
          onQuickFix={onQuickFix}
          onPromote={onPromote}
          onEdit={onEdit}
          onClose={onClose}
          onWorkflowAction={onWorkflowAction}
          onViewEpicStories={onViewEpicStories}
        />
      ))}
    </div>
  );
}
