/**
 * QueueRunnerPanel - Queue execution progress panel with item status
 * [Source: Story 15.3 - Task 5]
 */

import { useRef, useEffect } from 'react';
import {
  CheckCircle,
  PlayCircle,
  PauseCircle,
  XCircle,
  Clock,
  Loader2,
  Play,
  Pause,
  Square,
} from 'lucide-react';
import type { QueueItem } from '@bmad-studio/shared';

interface QueueRunnerPanelProps {
  items: QueueItem[];
  currentIndex: number;
  completedItems: Set<number>;
  isRunning: boolean;
  isPaused: boolean;
  pauseReason: string | undefined;
  errorItem: { index: number; error: string } | null;
  onPause: () => void;
  onResume: () => void;
  onAbort: () => void;
}

function getItemSummary(item: QueueItem): string {
  if (item.isBreakpoint) return `일시정지${item.prompt ? `: ${item.prompt}` : ''}`;
  if (item.isNewSession && item.prompt) return `[새 세션] ${item.prompt.slice(0, 80)}`;
  if (item.isNewSession) return '새 세션 시작'; // defensive fallback
  if (item.saveSessionName) return `세션 저장: ${item.saveSessionName}`;
  if (item.loadSessionName) return `세션 로드: ${item.loadSessionName}`;
  if (item.modelName && item.prompt) return `[모델: ${item.modelName}] ${item.prompt.slice(0, 60)}`;
  if (item.modelName) return `모델 변경: ${item.modelName}`; // defensive fallback
  if (item.delayMs) return `대기: ${item.delayMs}ms`;
  return item.prompt.slice(0, 80) + (item.prompt.length > 80 ? '...' : '');
}

type ItemStatus = 'error' | 'running' | 'paused' | 'completed' | 'pending';

function getItemStatus(
  index: number,
  currentIndex: number,
  isRunning: boolean,
  isPaused: boolean,
  completedItems: Set<number>,
  errorItem: { index: number; error: string } | null,
): ItemStatus {
  if (errorItem?.index === index) return 'error';
  if (index === currentIndex && isRunning && !isPaused) return 'running';
  if (index === currentIndex && isPaused) return 'paused';
  if (completedItems.has(index) || index < currentIndex) return 'completed';
  return 'pending';
}

function ItemStatusIcon({ status }: { status: ItemStatus }) {
  switch (status) {
    case 'error':
      return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    case 'running':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />;
    case 'paused':
      return <PauseCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
    case 'pending':
      return <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />;
  }
}

export function QueueRunnerPanel({
  items,
  currentIndex,
  completedItems,
  isRunning,
  isPaused,
  pauseReason,
  errorItem,
  onPause,
  onResume,
  onAbort,
}: QueueRunnerPanelProps) {
  const currentItemRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current item
  useEffect(() => {
    currentItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentIndex]);

  const completedCount = completedItems.size;
  const total = items.length;
  const percentage = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  // Determine overall status
  const isCompleted = !isRunning && !isPaused && completedCount > 0 && !errorItem;
  const hasError = !!errorItem;

  // Progress bar color
  let barColor = 'bg-blue-500';
  if (isPaused) barColor = 'bg-amber-500';
  if (isCompleted) barColor = 'bg-green-500';
  if (hasError) barColor = 'bg-red-500';

  const handleAbort = () => {
    if (window.confirm('큐 실행을 중단하시겠습니까?')) {
      onAbort();
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
      {/* Header with status and controls */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-sm font-medium">
          {isRunning && !isPaused && (
            <>
              <PlayCircle className="w-4 h-4 text-blue-500" />
              <span className="text-blue-600 dark:text-blue-400">실행 중...</span>
            </>
          )}
          {isPaused && (
            <>
              <PauseCircle className="w-4 h-4 text-amber-500" />
              <span className="text-amber-600 dark:text-amber-400">일시정지됨</span>
            </>
          )}
          {isCompleted && (
            <>
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-green-600 dark:text-green-400">완료 ({completedCount}개 아이템 실행됨)</span>
            </>
          )}
          {hasError && (
            <>
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-red-600 dark:text-red-400">오류 발생</span>
            </>
          )}
          {!isRunning && !isPaused && !isCompleted && !hasError && (
            <span className="text-gray-500">대기 중</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isRunning && !isPaused && (
            <button
              onClick={onPause}
              aria-label="일시정지"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md
                bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400
                hover:bg-amber-200 dark:hover:bg-amber-900/50
                min-w-[44px] min-h-[44px]"
            >
              <Pause className="w-3 h-3" />
              <span>일시정지</span>
            </button>
          )}
          {isPaused && (
            <>
              <button
                onClick={onResume}
                aria-label="재개"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md
                  bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400
                  hover:bg-blue-200 dark:hover:bg-blue-900/50
                  min-w-[44px] min-h-[44px]"
              >
                <Play className="w-3 h-3" />
                <span>재개</span>
              </button>
              <button
                onClick={handleAbort}
                aria-label="중단"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md
                  bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400
                  hover:bg-red-200 dark:hover:bg-red-900/50
                  min-w-[44px] min-h-[44px]"
              >
                <Square className="w-3 h-3" />
                <span>중단</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>진행: {completedCount} / {total}</span>
          <span>{percentage}%</span>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Pause reason banner */}
      {isPaused && pauseReason && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm border-b border-amber-200 dark:border-amber-800">
          사유: {pauseReason}
        </div>
      )}

      {/* Error banner */}
      {errorItem && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm border-b border-red-200 dark:border-red-800">
          오류: {errorItem.error}
        </div>
      )}

      {/* Item list */}
      <div className="max-h-[300px] overflow-y-auto">
        {items.map((item, index) => {
          const status = getItemStatus(index, currentIndex, isRunning, isPaused, completedItems, errorItem);
          const isCurrent = index === currentIndex && (isRunning || isPaused);

          return (
            <div
              key={index}
              ref={isCurrent ? currentItemRef : undefined}
              className={`flex items-center gap-2 px-4 py-2 text-sm border-b border-gray-100 dark:border-gray-700/50 last:border-b-0
                ${isCurrent ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                ${status === 'error' ? 'bg-red-50 dark:bg-red-900/10' : ''}
              `}
            >
              <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">{index + 1}</span>
              <ItemStatusIcon status={status} />
              <span
                className={`truncate ${status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}
              >
                {getItemSummary(item)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
