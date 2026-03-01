/**
 * KanbanBoard - Desktop kanban view with horizontal scrolling columns
 * [Source: Story 21.2 - Task 8]
 */

import type { BoardItem, BoardItemStatus } from '@bmad-studio/shared';
import { KanbanColumn } from './KanbanColumn';
import { BOARD_COLUMNS } from './constants';

interface KanbanBoardProps {
  itemsByStatus: Record<BoardItemStatus, BoardItem[]>;
}

export function KanbanBoard({ itemsByStatus }: KanbanBoardProps) {
  return (
    <div className="flex gap-4 overflow-x-auto h-full pb-2">
      {BOARD_COLUMNS.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          items={itemsByStatus[status] || []}
        />
      ))}
    </div>
  );
}
