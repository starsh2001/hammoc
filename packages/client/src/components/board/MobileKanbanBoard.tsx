/**
 * MobileKanbanBoard - Mobile kanban with swipe navigation and indicator dots
 * [Source: Story 21.2 - Task 10, Story 21.3 - Task 6]
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { BoardItem, BoardConfig } from '@hammoc/shared';
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
  onReopen,
  onDelete,
  onWorkflowAction,
  onValidateAndFixAction,
  onValidateOnlyAction,
  onViewEpicStories,

  onCardClick,
}: MobileKanbanBoardProps) {
  const { t } = useTranslation('board');
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const columns = boardConfig.columns;

  // Clamp active index when column count changes
  useEffect(() => {
    if (columns.length > 0) {
      setActiveColumnIndex((prev) => Math.min(prev, columns.length - 1));
    }
  }, [columns.length]);

  const goToColumn = useCallback((index: number) => {
    setIsTransitioning(true);
    setDragOffset(0);
    setActiveColumnIndex(index);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Cancel any in-progress transition so the user can immediately swipe again
    if (isTransitioning) {
      setIsTransitioning(false);
    }
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
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
      // Apply rubber-band resistance at edges
      const atStart = activeColumnIndex === 0 && dx > 0;
      const atEnd = activeColumnIndex === columns.length - 1 && dx < 0;
      setDragOffset(atStart || atEnd ? dx * 0.3 : dx);
    }
  };

  const handleTouchEnd = () => {
    if (isHorizontalSwipe.current === null) {
      // No horizontal swipe detected
      return;
    }

    const dx = dragOffset;
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0 && activeColumnIndex < columns.length - 1) {
        goToColumn(activeColumnIndex + 1);
      } else if (dx > 0 && activeColumnIndex > 0) {
        goToColumn(activeColumnIndex - 1);
      } else {
        // Snap back (edge rubber-band)
        setIsTransitioning(true);
        setDragOffset(0);
      }
    } else {
      // Didn't meet threshold — snap back
      setIsTransitioning(true);
      setDragOffset(0);
    }
    isHorizontalSwipe.current = null;
  };

  const handleTransitionEnd = () => {
    setIsTransitioning(false);
  };

  // Compute the horizontal translate for the carousel strip
  const containerWidth = containerRef.current?.clientWidth ?? 0;
  const translateX = -(activeColumnIndex * containerWidth) + dragOffset;

  return (
    <div className="h-full flex flex-col">
      {/* Carousel viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Sliding strip containing all columns */}
        <div
          className="flex h-full"
          style={{
            transform: `translateX(${translateX}px)`,
            transition: isTransitioning ? 'transform 300ms ease-out' : 'none',
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          {columns.map((col) => {
            const items = itemsByColumn[col.id] || [];
            return (
              <div
                key={col.id}
                className="flex-shrink-0 h-full overflow-y-auto"
                style={{ width: containerWidth || '100%' }}
              >
                {/* Column header */}
                <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-[#253040]">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {col.label}
                  </span>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-[#253040] px-1.5 py-0.5 rounded-full">
                    {items.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="p-3 space-y-2">
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

                      onCardClick={onCardClick}
                    />
                  ))}
                  {items.length === 0 && (
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
                      {t('empty.items')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Indicator dots */}
      <div className="flex justify-center gap-2 py-3 flex-shrink-0 border-t border-gray-200 dark:border-[#253040]">
        {columns.map((col, index) => (
          <button
            key={col.id}
            onClick={() => goToColumn(index)}
            className={`w-2 h-2 rounded-full transition-colors ${
              index === activeColumnIndex
                ? 'bg-blue-500'
                : 'bg-gray-300 dark:bg-gray-600'
            }`}
            aria-label={t('mobileKanban.goToColumn', { column: col.label })}
          />
        ))}
      </div>
    </div>
  );
}
