/**
 * MobileKanbanBoard - Mobile kanban with swipe navigation and indicator dots
 * [Source: Story 21.2 - Task 10, Story 21.3 - Task 6]
 */

import { useState, useRef } from 'react';
import type { BoardItem, BoardConfig } from '@bmad-studio/shared';
import { BoardCard } from './BoardCard';
import type { CardActionCallbacks } from './BoardCard';

interface MobileKanbanBoardProps extends CardActionCallbacks {
  itemsByColumn: Record<string, BoardItem[]>;
  boardConfig: BoardConfig;
}

const SWIPE_THRESHOLD = 50;

export function MobileKanbanBoard({
  itemsByColumn,
  boardConfig,
  onQuickFix,
  onPromote,
  onEdit,
  onClose,
  onWorkflowAction,
  onViewEpicStories,
}: MobileKanbanBoardProps) {
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchDeltaX = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const columns = boardConfig.columns;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchDeltaX.current = 0;
    isHorizontalSwipe.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // Determine swipe direction on first significant move
    if (isHorizontalSwipe.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      isHorizontalSwipe.current = Math.abs(dx) > Math.abs(dy);
    }

    if (isHorizontalSwipe.current) {
      e.preventDefault();
      touchDeltaX.current = dx;
    }
  };

  const handleTouchEnd = () => {
    if (Math.abs(touchDeltaX.current) > SWIPE_THRESHOLD) {
      if (touchDeltaX.current < 0 && activeColumnIndex < columns.length - 1) {
        setActiveColumnIndex((prev) => prev + 1);
      } else if (touchDeltaX.current > 0 && activeColumnIndex > 0) {
        setActiveColumnIndex((prev) => prev - 1);
      }
    }
    touchDeltaX.current = 0;
    isHorizontalSwipe.current = null;
  };

  const activeColumn = columns[activeColumnIndex];
  const activeItems = activeColumn ? (itemsByColumn[activeColumn.id] || []) : [];

  return (
    <div className="h-full flex flex-col">
      {/* Column content area */}
      <div
        className="flex-1 overflow-y-auto"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Column header */}
        <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {activeColumn?.label ?? ''}
          </span>
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
            {activeItems.length}
          </span>
        </div>

        {/* Cards */}
        <div className="p-3 space-y-2">
          {activeItems.map((item) => (
            <BoardCard
              key={item.id}
              item={item}
              onQuickFix={onQuickFix}
              onPromote={onPromote}
              onEdit={onEdit}
              onClose={onClose}
              onWorkflowAction={onWorkflowAction}
              onViewEpicStories={onViewEpicStories}
            />
          ))}
          {activeItems.length === 0 && (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
              항목 없음
            </p>
          )}
        </div>
      </div>

      {/* Indicator dots */}
      <div className="flex justify-center gap-2 py-3 flex-shrink-0 border-t border-gray-200 dark:border-gray-700">
        {columns.map((col, index) => (
          <button
            key={col.id}
            onClick={() => setActiveColumnIndex(index)}
            className={`w-2 h-2 rounded-full transition-colors ${
              index === activeColumnIndex
                ? 'bg-blue-500'
                : 'bg-gray-300 dark:bg-gray-600'
            }`}
            aria-label={`${col.label} 칼럼으로 이동`}
          />
        ))}
      </div>
    </div>
  );
}
