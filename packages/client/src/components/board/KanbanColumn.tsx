/**
 * KanbanColumn - Single kanban column with header and card list
 * [Source: Story 21.2 - Task 7, Story 21.3 - Task 6]
 */

import { useRef, useEffect, useCallback } from 'react';
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
  onCreateNextStory,
  onRequestQAReview,
  onIssueStatusChange,
  onCommitAndComplete,
  onCardClick,
}: KanbanColumnProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Stop wheel propagation so the board's non-passive handler never fires on scrollable columns
  const handleWheel = useCallback((e: WheelEvent) => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight) {
      e.stopPropagation();
    }
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: true });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

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
      <div ref={listRef} className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 space-y-2 overscroll-contain">
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
            onCreateNextStory={onCreateNextStory}
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
