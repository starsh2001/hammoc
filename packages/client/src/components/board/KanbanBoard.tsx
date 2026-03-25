/**
 * KanbanBoard - Desktop kanban view with horizontal scrolling columns
 * [Source: Story 21.2 - Task 8, Story 21.3 - Task 6]
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import type { BoardItem, BoardConfig } from '@hammoc/shared';
import type { CardActionCallbacks } from './BoardCard';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps extends CardActionCallbacks {
  itemsByColumn: Record<string, BoardItem[]>;
  boardConfig: BoardConfig;
  visibleColumns?: number;
}

/** Pixel amount of the next column to "peek" into view */
const PEEK_WIDTH = 48;

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
  onValidateAndFixAction,
  onValidateOnlyAction,
  onViewEpicStories,
  onCreateNextStory,
  onRequestQAReview,
  onIssueStatusChange,
  onCommitAndComplete,
  onCardClick,
}: KanbanBoardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const totalColumns = boardConfig.columns.length;
  const effectiveVisible = visibleColumns ? Math.min(visibleColumns, totalColumns) : totalColumns;
  const hasOverflow = totalColumns > effectiveVisible;

  // Subtract peek width so the next hidden column peeks into view
  const peekOffset = hasOverflow ? PEEK_WIDTH : 0;
  const columnStyle = {
    flex: 'none',
    width: `calc((100% - ${(effectiveVisible - 1) * 8}px - ${peekOffset}px) / ${effectiveVisible})`,
  };

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const tolerance = 2;
    setCanScrollLeft(el.scrollLeft > tolerance);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - tolerance);
  }, []);

  // Convert vertical wheel scroll to horizontal scroll
  // Scrollable columns stop propagation via their own passive listener, so this only fires
  // for non-scrollable columns and empty board areas — no performance penalty on column scroll.
  const handleWheel = useCallback((e: WheelEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    el.addEventListener('wheel', handleWheel, { passive: false });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      el.removeEventListener('wheel', handleWheel);
      ro.disconnect();
    };
  }, [updateScrollState, handleWheel, totalColumns, effectiveVisible]);

  return (
    <div className="relative h-full">
      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto h-full pb-2"
      >
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

      {/* Fade-out gradient overlays */}
      {canScrollLeft && (
        <div className="absolute inset-y-0 left-0 w-8 pointer-events-none bg-gradient-to-r from-white dark:from-gray-800 to-transparent" />
      )}
      {canScrollRight && (
        <div className="absolute inset-y-0 right-0 w-8 pointer-events-none bg-gradient-to-l from-white dark:from-gray-800 to-transparent" />
      )}
    </div>
  );
}
