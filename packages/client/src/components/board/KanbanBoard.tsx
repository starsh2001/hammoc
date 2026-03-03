/**
 * KanbanBoard - Desktop kanban view with horizontal scrolling columns
 * [Source: Story 21.2 - Task 8, Story 21.3 - Task 6]
 */

import type { BoardItem, BoardConfig } from '@bmad-studio/shared';
import type { CardActionCallbacks } from './BoardCard';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps extends CardActionCallbacks {
  itemsByColumn: Record<string, BoardItem[]>;
  boardConfig: BoardConfig;
}

export function KanbanBoard({
  itemsByColumn,
  boardConfig,
  onQuickFix,
  onPromote,
  onEdit,
  onClose,
  onWorkflowAction,
  onViewEpicStories,
}: KanbanBoardProps) {
  return (
    <div className="flex gap-4 overflow-x-auto h-full pb-2">
      {boardConfig.columns.map((col) => (
        <KanbanColumn
          key={col.id}
          columnConfig={col}
          items={itemsByColumn[col.id] || []}
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
