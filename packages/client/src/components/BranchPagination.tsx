import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface BranchPaginationProps {
  messageId: string;
  total: number;
  current: number;
  onNavigate: (messageId: string, direction: 'prev' | 'next') => void;
}

export function BranchPagination({ messageId, total, current, onNavigate }: BranchPaginationProps) {
  const { t } = useTranslation('chat');

  // Don't render for single branch (AC 6)
  if (total <= 1) return null;

  const isFirst = current === 0;
  const isLast = current === total - 1;

  const handlePrev = useCallback(() => {
    if (!isFirst) onNavigate(messageId, 'prev');
  }, [messageId, isFirst, onNavigate]);

  const handleNext = useCallback(() => {
    if (!isLast) onNavigate(messageId, 'next');
  }, [messageId, isLast, onNavigate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && !isFirst) {
        e.preventDefault();
        onNavigate(messageId, 'prev');
      } else if (e.key === 'ArrowRight' && !isLast) {
        e.preventDefault();
        onNavigate(messageId, 'next');
      }
    },
    [messageId, isFirst, isLast, onNavigate],
  );

  return (
    <div
      className="flex items-center justify-center gap-1 py-1"
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        tabIndex={0}
        disabled={isFirst}
        onClick={handlePrev}
        aria-label={t('branch.prev')}
        className="p-0.5 rounded text-zinc-500 dark:text-zinc-400
                   hover:text-zinc-700 dark:hover:text-zinc-200
                   disabled:opacity-30 disabled:cursor-not-allowed
                   focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <ChevronLeft size={14} />
      </button>

      <span
        role="status"
        aria-live="polite"
        aria-label={t('branch.indicator', { current: current + 1, total })}
        className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums min-w-[3ch] text-center
                   transition-opacity duration-150"
      >
        {current + 1} / {total}
      </span>

      <button
        type="button"
        tabIndex={0}
        disabled={isLast}
        onClick={handleNext}
        aria-label={t('branch.next')}
        className="p-0.5 rounded text-zinc-500 dark:text-zinc-400
                   hover:text-zinc-700 dark:hover:text-zinc-200
                   disabled:opacity-30 disabled:cursor-not-allowed
                   focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
