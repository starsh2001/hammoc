/**
 * useQueueRunner - WebSocket integration hook for queue execution control
 * [Source: Story 15.3 - Task 3]
 */

import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import type { QueueItem, QueueProgressEvent, QueueItemCompleteEvent, QueueErrorEvent, QueueItemsUpdatedEvent } from '@hammoc/shared';
import { getSocket } from '../services/socket';
import { useQueueStore } from '../stores/queueStore';
import { useChatStore } from '../stores/chatStore';
import { queueApi } from '../services/api/queue';

export interface UseQueueRunnerReturn {
  // State (from queueStore)
  isRunning: boolean;
  isPaused: boolean;
  isPauseRequested: boolean;
  isWaitingForInput: boolean;
  isStarting: boolean;
  /** Server-persisted: queue finished successfully */
  isCompleted: boolean;
  progress: { current: number; total: number };
  lockedSessionId: string | null;
  pauseReason: string | undefined;
  completedItems: Set<number>;
  errorItem: { index: number; error: string } | null;
  itemSessionIds: Map<number, string>;

  // Control functions
  start: (items: QueueItem[], sessionId?: string) => void;
  pause: () => void;
  cancelPause: () => void;
  resume: () => void;
  abort: () => void;
  removeItem: (itemIndex: number) => void;
  addItem: (rawLine: string) => void;
  reorderItems: (newOrder: number[]) => void;
  replaceItems: (items: QueueItem[]) => void;
  editStart: () => void;
  editEnd: () => void;
  dismiss: () => Promise<void>;
}

export function useQueueRunner(projectSlug: string): UseQueueRunnerReturn {
  const { t } = useTranslation('common');
  // Subscribe only to state values we expose (not script/parsedItems/warnings)
  const {
    isRunning,
    isPaused,
    isPauseRequested,
    isWaitingForInput,
    isStarting,
    isCompleted,
    currentIndex,
    totalItems,
    lockedSessionId,
    pauseReason,
    completedItems,
    errorItem,
    itemSessionIds,
  } = useQueueStore(useShallow((s) => ({
    isRunning: s.isRunning,
    isPaused: s.isPaused,
    isPauseRequested: s.isPauseRequested,
    isWaitingForInput: s.isWaitingForInput,
    isStarting: s.isStarting,
    isCompleted: s.isCompleted,
    currentIndex: s.currentIndex,
    totalItems: s.totalItems,
    lockedSessionId: s.lockedSessionId,
    pauseReason: s.pauseReason,
    completedItems: s.completedItems,
    errorItem: s.errorItem,
    itemSessionIds: s.itemSessionIds,
  })));

  // WebSocket setup and teardown
  useEffect(() => {
    const socket = getSocket();
    // Actions are stable refs — access via getState() to avoid unnecessary effect re-runs
    const { handleProgress, handleItemComplete, handleError, handleItemsUpdated, handleEditState, syncFromStatus } = useQueueStore.getState();

    // Join project room
    socket.emit('project:join', projectSlug);

    // Register listeners
    const onProgress = (data: QueueProgressEvent) => handleProgress(data);
    const onItemComplete = (data: QueueItemCompleteEvent) => handleItemComplete(data);
    const onError = (data: QueueErrorEvent) => handleError(data);
    const onItemsUpdated = (data: QueueItemsUpdatedEvent) => handleItemsUpdated(data);
    const onEditState = (data: { isEditing: boolean }) => handleEditState(data);

    socket.on('queue:progress', onProgress);
    socket.on('queue:itemComplete', onItemComplete);
    socket.on('queue:error', onError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('queue:itemsUpdated' as any, onItemsUpdated);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('queue:editState' as any, onEditState);

    // Initial status fetch
    queueApi.getStatus(projectSlug)
      .then((state) => {
        syncFromStatus(state);
      })
      .catch(() => {
        // 404 or error = queue not started, use default state
      });

    return () => {
      socket.off('queue:progress', onProgress);
      socket.off('queue:itemComplete', onItemComplete);
      socket.off('queue:error', onError);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.off('queue:itemsUpdated' as any, onItemsUpdated);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.off('queue:editState' as any, onEditState);
      // Release edit lock if we were editing
      if (useQueueStore.getState().isEditingPaused) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        socket.emit('queue:editEnd' as any, { projectSlug });
      }
      socket.emit('project:leave', projectSlug);
      // Clear stale queue state when leaving project
      useQueueStore.getState().reset();
    };
  }, [projectSlug]);

  const start = useCallback((items: QueueItem[], sessionId?: string) => {
    const socket = getSocket();
    const permissionMode = useChatStore.getState().permissionMode;
    useQueueStore.getState().setStarting(true);
    socket.emit('queue:start', { items, sessionId, projectSlug, permissionMode });
  }, [projectSlug]);

  const pause = useCallback(() => {
    const socket = getSocket();
    socket.emit('queue:pause', { projectSlug });
  }, [projectSlug]);

  const cancelPause = useCallback(() => {
    const socket = getSocket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.emit('queue:cancelPause' as any, { projectSlug });
  }, [projectSlug]);

  const resume = useCallback(() => {
    const socket = getSocket();
    socket.emit('queue:resume', { projectSlug });
  }, [projectSlug]);

  const abort = useCallback(() => {
    const socket = getSocket();
    socket.emit('queue:abort', { projectSlug });
    useQueueStore.getState().reset();
  }, [projectSlug]);

  const dismiss = useCallback(async () => {
    try {
      await queueApi.dismiss(projectSlug);
      useQueueStore.getState().reset();
    } catch {
      toast.error(t('queue.dismissFailed'));
    }
  }, [projectSlug, t]);

  const removeItem = useCallback((itemIndex: number) => {
    const socket = getSocket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.emit('queue:removeItem' as any, { projectSlug, itemIndex });
  }, [projectSlug]);

  const addItem = useCallback((rawLine: string) => {
    const socket = getSocket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.emit('queue:addItem' as any, { projectSlug, rawLine });
  }, [projectSlug]);

  const replaceItems = useCallback((items: QueueItem[]) => {
    const socket = getSocket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.emit('queue:replaceItems' as any, { projectSlug, items });
  }, [projectSlug]);

  const editStart = useCallback(() => {
    const socket = getSocket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.emit('queue:editStart' as any, { projectSlug });
  }, [projectSlug]);

  const editEnd = useCallback(() => {
    const socket = getSocket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.emit('queue:editEnd' as any, { projectSlug });
  }, [projectSlug]);

  const reorderItems = useCallback((newOrder: number[]) => {
    // Optimistic update — immediately reorder items in the store
    useQueueStore.getState().optimisticReorder(newOrder, projectSlug);
    const socket = getSocket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.emit('queue:reorderItems' as any, { projectSlug, newOrder });
  }, [projectSlug]);

  return {
    isRunning,
    isPaused,
    isPauseRequested,
    isWaitingForInput,
    isStarting,
    isCompleted,
    progress: { current: currentIndex, total: totalItems },
    lockedSessionId,
    pauseReason,
    completedItems,
    errorItem,
    itemSessionIds,
    start,
    pause,
    cancelPause,
    resume,
    abort,
    removeItem,
    addItem,
    reorderItems,
    replaceItems,
    editStart,
    editEnd,
    dismiss,
  };
}
