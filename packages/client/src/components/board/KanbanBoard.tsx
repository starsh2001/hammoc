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
  visibleColumns?: number;
}

export function KanbanBoard({
  itemsByColumn,
  boardConfig,
  visibleColumns,
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
}: KanbanBoardProps) {
  const totalColumns = boardConfig.columns.length;
  const effectiveVisible = visibleColumns ? Math.min(visibleColumns, totalColumns) : totalColumns;
  const columnStyle = {
    flex: 'none',
    width: `calc((100% - ${(effectiveVisible - 1) * 8}px) / ${effectiveVisible})`,
  };

  return (
    <div className="flex gap-2 overflow-x-auto h-full pb-2">
      {boardConfig.columns.map((col) => (
        <KanbanColumn
          key={col.id}
          columnConfig={col}
          items={itemsByColumn[col.id] || []}
          style={columnStyle}
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
  );
}
