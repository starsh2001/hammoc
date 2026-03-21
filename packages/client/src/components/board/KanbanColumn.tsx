/**
 * KanbanColumn - Single kanban column with header and card list
 * [Source: Story 21.2 - Task 7, Story 21.3 - Task 6]
 */

import type { BoardItem, BoardColumnConfig } from '@hammoc/shared';
import { BoardCard } from './BoardCard';
import type { CardActionCallbacks } from './BoardCard';

interface KanbanColumnProps extends CardActionCallbacks {
  columnConfig: BoardColumnConfig;
  items: BoardItem[];
  style?: React.CSSProperties;
}

export function KanbanColumn({
  columnConfig,
  items,
  style,
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
  onRequestQAReview,
  onIssueStatusChange,
  onCommitAndComplete,
  onCardClick,
}: KanbanColumnProps) {
  return (
    <div
      className={`flex flex-col h-full min-h-0 bg-gray-50 dark:bg-[#1c2129] rounded-lg border-t-2 ${columnConfig.colorClass}`}
      style={style}
    >
      {/* Column header */}
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {columnConfig.label}
        </span>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-[#253040] px-1.5 py-0.5 rounded-full" data-testid={`column-count-${columnConfig.id}`}>
          {items.length}
        </span>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 space-y-2">
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
            onValidateAndFixAction={onValidateAndFixAction}
            onValidateOnlyAction={onValidateOnlyAction}
            onViewEpicStories={onViewEpicStories}
            onRequestQAReview={onRequestQAReview}
            onIssueStatusChange={onIssueStatusChange}
            onCommitAndComplete={onCommitAndComplete}
            onCardClick={onCardClick}
          />
        ))}
      </div>
    </div>
  );
}
