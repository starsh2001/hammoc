/**
 * QueueRunnerPanel - Queue execution progress panel with item status,
 * session links, item deletion, inline add form, and drag-and-drop reorder.
 * [Source: Story 15.3 - Task 5]
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  ExternalLink,
  Trash2,
  Plus,
  GripVertical,
  RotateCcw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import type { QueueItem } from '@hammoc/shared';

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
  /** Project slug for session link */
  projectSlug?: string;
  /** Active session ID for navigation link */
  activeSessionId?: string | null;
  /** When true, panel takes full available height with fixed header */
  fullHeight?: boolean;
  /** Session ID per completed item for navigation links */
  itemSessionIds?: Map<number, string>;
  /** Remove a pending item at given index */
  onRemoveItem?: (itemIndex: number) => void;
  /** Add a new item (raw script line) */
  onAddItem?: (rawLine: string) => void;
  /** Reorder pending items (provide new index order) */
  onReorderItems?: (newOrder: number[]) => void;
  /** Dismiss completed/errored state and return to editor */
  onDismiss?: () => void;
  /** True while waiting for server to confirm a reorder (disables drag) */
  isReordering?: boolean;
}

function getItemSummary(item: QueueItem, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (item.isBreakpoint) return `${t('queue.itemSummary.pause')}${item.prompt ? `: ${item.prompt}` : ''}`;
  if (item.isNewSession && item.prompt) return `${t('queue.itemSummary.newSession')} ${item.prompt.slice(0, 80)}`;
  if (item.isNewSession) return t('queue.itemSummary.newSessionStart');
  if (item.saveSessionName) return `${t('queue.itemSummary.saveSession')} ${item.saveSessionName}`;
  if (item.loadSessionName) return `${t('queue.itemSummary.loadSession')} ${item.loadSessionName}`;
  if (item.modelName && item.prompt) return `${t('queue.itemSummary.modelPrefix')} ${item.modelName}] ${item.prompt.slice(0, 60)}`;
  if (item.modelName) return `${t('queue.itemSummary.modelChange')} ${item.modelName}`;
  if (item.delayMs) return `${t('queue.itemSummary.wait')} ${item.delayMs}ms`;
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
  projectSlug,
  activeSessionId,
  fullHeight = false,
  itemSessionIds,
  onRemoveItem,
  onAddItem,
  onReorderItems,
  onDismiss,
  isReordering = false,
}: QueueRunnerPanelProps) {
  const { t } = useTranslation('common');
  const currentItemRef = useRef<HTMLDivElement>(null);
  const [newItemText, setNewItemText] = useState('');

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
    if (window.confirm(t('queue.confirmAbort'))) {
      onAbort();
    }
  };

  const handleAddItem = useCallback(() => {
    if (newItemText.trim() && onAddItem) {
      onAddItem(newItemText.trim());
      setNewItemText('');
    }
  }, [newItemText, onAddItem]);

  // Determine the start index of pending items (for DnD boundary)
  const pendingStart = isPaused ? currentIndex : currentIndex + 1;

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination || !onReorderItems) return;
    const srcIdx = result.source.index;
    const dstIdx = result.destination.index;
    if (srcIdx === dstIdx) return;

    // Build the current pending indices
    const pendingIndices = Array.from(
      { length: items.length - pendingStart },
      (_, i) => pendingStart + i,
    );

    // Reorder within pending indices
    const [moved] = pendingIndices.splice(srcIdx, 1);
    pendingIndices.splice(dstIdx, 0, moved);

    onReorderItems(pendingIndices);
  }, [items.length, pendingStart, onReorderItems]);

  // Split items into non-draggable (completed/running) and draggable (pending)
  const fixedItems = items.slice(0, pendingStart);
  const pendingItems = items.slice(pendingStart);
  const canDrag = !!onReorderItems && (isRunning || isPaused) && !isReordering;

  return (
    <div className={`border border-gray-200 dark:border-[#253040] rounded-lg bg-white dark:bg-[#263240] overflow-hidden
      ${fullHeight ? 'flex flex-col flex-1 min-h-0' : ''}`}>
      {/* Header with status and controls */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#253040] flex-shrink-0">
        <div className="flex items-center gap-2 text-sm font-medium min-w-0">
          {isRunning && !isPaused && (
            <>
              <PlayCircle className="w-4 h-4 text-blue-500" />
              <span className="text-blue-600 dark:text-blue-400">{t('queue.statusRunning')}</span>
            </>
          )}
          {isPaused && (
            <>
              <PauseCircle className="w-4 h-4 text-amber-500" />
              <span className="text-amber-600 dark:text-amber-400">{t('queue.statusPaused')}</span>
            </>
          )}
          {isCompleted && (
            <>
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-green-600 dark:text-green-400">{t('queue.statusComplete', { count: completedCount })}</span>
            </>
          )}
          {hasError && !isRunning && !isPaused && (
            <>
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-red-600 dark:text-red-400">{t('queue.statusError')}</span>
            </>
          )}
          {!isRunning && !isPaused && !isCompleted && !hasError && (
            <span className="text-gray-500">{t('queue.statusWaiting')}</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Session link */}
          {projectSlug && activeSessionId && (isRunning || isPaused) && (
            <Link
              to={`/project/${projectSlug}/session/${activeSessionId}`}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t('queue.goToSession')}
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
          {isRunning && !isPaused && (
            <button
              onClick={onPause}
              aria-label={t('queue.pause')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md
                bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400
                hover:bg-amber-200 dark:hover:bg-amber-900/50
                min-w-[44px] min-h-[44px]"
            >
              <Pause className="w-3 h-3" />
              <span>{t('queue.pause')}</span>
            </button>
          )}
          {isPaused && (
            <>
              <button
                onClick={onResume}
                aria-label={t('queue.resume')}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md
                  bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400
                  hover:bg-blue-200 dark:hover:bg-blue-900/50
                  min-w-[44px] min-h-[44px]"
              >
                <Play className="w-3 h-3" />
                <span>{t('queue.resume')}</span>
              </button>
              <button
                onClick={handleAbort}
                aria-label={t('queue.abort')}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md
                  bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400
                  hover:bg-red-200 dark:hover:bg-red-900/50
                  min-w-[44px] min-h-[44px]"
              >
                <Square className="w-3 h-3" />
                <span>{t('queue.abort')}</span>
              </button>
            </>
          )}
          {/* Dismiss button — return to editor after completion/error */}
          {onDismiss && !isRunning && !isPaused && (isCompleted || hasError) && (
            <button
              onClick={onDismiss}
              aria-label={t('queue.backToEditor')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md
                bg-gray-100 dark:bg-[#253040] text-gray-700 dark:text-gray-200
                hover:bg-gray-200 dark:hover:bg-[#2d3a4a]
                min-w-[44px] min-h-[44px]"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('queue.backToEditor')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-[#253040] flex-shrink-0">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-300 mb-1">
          <span>{t('queue.progress', { current: completedCount, total })}</span>
          <span>{percentage}%</span>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-[#253040] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Pause reason banner */}
      {isPaused && pauseReason && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm border-b border-amber-200 dark:border-amber-800 flex-shrink-0">
          {t('queue.pauseReason', { reason: pauseReason })}
        </div>
      )}

      {/* Error banner */}
      {errorItem && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm border-b border-red-200 dark:border-red-800 flex-shrink-0">
          {t('queue.errorMessage', { error: errorItem.error })}
        </div>
      )}

      {/* Item list */}
      <div className={fullHeight ? 'flex-1 overflow-y-auto min-h-0' : 'max-h-[300px] overflow-y-auto'}>
        {/* Fixed items (completed/running/paused — not draggable) */}
        {fixedItems.map((item, index) => {
          const status = getItemStatus(index, currentIndex, isRunning, isPaused, completedItems, errorItem);
          const isCurrent = index === currentIndex && (isRunning || isPaused);
          const itemSessionId = itemSessionIds?.get(index);

          return (
            <div
              key={index}
              ref={isCurrent ? currentItemRef : undefined}
              className={`flex items-center gap-2 px-4 py-2 text-sm border-b border-gray-100 dark:border-[#253040]/50
                ${isCurrent ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                ${status === 'error' ? 'bg-red-50 dark:bg-red-900/10' : ''}
              `}
            >
              <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">{index + 1}</span>
              <ItemStatusIcon status={status} />
              <span
                className={`truncate flex-1 ${status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-200'}`}
              >
                {getItemSummary(item, t)}
              </span>
              {/* Session link for completed and current items */}
              {(status === 'completed' || status === 'running' || status === 'paused') && itemSessionId && projectSlug && (
                <Link
                  to={`/project/${projectSlug}/session/${itemSessionId}`}
                  className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 flex-shrink-0 p-0.5"
                  title={t('queue.goToSession')}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          );
        })}

        {/* Pending items (draggable) */}
        {canDrag ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="queue-pending">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  {pendingItems.map((item, dragIndex) => {
                    const globalIndex = pendingStart + dragIndex;
                    const status = getItemStatus(globalIndex, currentIndex, isRunning, isPaused, completedItems, errorItem);

                    return (
                      <Draggable key={`item-${globalIndex}`} draggableId={`item-${globalIndex}`} index={dragIndex}>
                        {(dragProvided, snapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`flex items-center gap-2 px-4 py-2 text-sm border-b border-gray-100 dark:border-[#253040]/50
                              ${snapshot.isDragging ? 'bg-blue-50 dark:bg-blue-900/20 shadow-md rounded' : ''}
                            `}
                          >
                            {/* Drag handle */}
                            <span {...dragProvided.dragHandleProps} className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none">
                              <GripVertical className="w-3.5 h-3.5 text-gray-400" />
                            </span>
                            <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">{globalIndex + 1}</span>
                            <ItemStatusIcon status={status} />
                            <span className="truncate flex-1 text-gray-700 dark:text-gray-200">
                              {getItemSummary(item, t)}
                            </span>
                            {/* Delete button for pending items */}
                            {onRemoveItem && (
                              <button
                                onClick={() => onRemoveItem(globalIndex)}
                                className="text-gray-400 hover:text-red-500 flex-shrink-0 p-0.5"
                                title={t('queue.deleteItem')}
                                aria-label={t('queue.deleteItemAria', { index: globalIndex + 1 })}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        ) : (
          // Non-draggable fallback (when queue is not active)
          pendingItems.map((item, idx) => {
            const globalIndex = pendingStart + idx;
            const status = getItemStatus(globalIndex, currentIndex, isRunning, isPaused, completedItems, errorItem);

            return (
              <div
                key={globalIndex}
                className="flex items-center gap-2 px-4 py-2 text-sm border-b border-gray-100 dark:border-[#253040]/50 last:border-b-0"
              >
                <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">{globalIndex + 1}</span>
                <ItemStatusIcon status={status} />
                <span className="truncate flex-1 text-gray-700 dark:text-gray-200">
                  {getItemSummary(item, t)}
                </span>
              </div>
            );
          })
        )}

        {/* Add new item form */}
        {onAddItem && (isRunning || isPaused) && (
          <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-200 dark:border-[#253040]">
            <input
              type="text"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddItem();
                }
              }}
              placeholder={t('queue.addItemPlaceholder')}
              className="flex-1 text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-[#2d3a4a]
                bg-white dark:bg-[#253040] text-gray-700 dark:text-gray-200
                placeholder:text-gray-400 dark:placeholder:text-gray-500
                focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleAddItem}
              disabled={!newItemText.trim()}
              aria-label={t('queue.addItem')}
              className="inline-flex items-center justify-center w-8 h-8 rounded
                bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400
                hover:bg-blue-200 dark:hover:bg-blue-900/50
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
