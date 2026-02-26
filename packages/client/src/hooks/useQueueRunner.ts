/**
 * useQueueRunner - WebSocket integration hook for queue execution control
 * [Source: Story 15.3 - Task 3]
 */

import { useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { QueueItem, QueueProgressEvent, QueueItemCompleteEvent, QueueErrorEvent, QueueItemsUpdatedEvent } from '@bmad-studio/shared';
import { getSocket } from '../services/socket';
import { useQueueStore } from '../stores/queueStore';
import { useChatStore } from '../stores/chatStore';
import { queueApi } from '../services/api/queue';

export interface UseQueueRunnerReturn {
  // State (from queueStore)
  isRunning: boolean;
  isPaused: boolean;
  isStarting: boolean;
  progress: { current: number; total: number };
  lockedSessionId: string | null;
  pauseReason: string | undefined;
  completedItems: Set<number>;
  errorItem: { index: number; error: string } | null;
  itemSessionIds: Map<number, string>;

  // Control functions
  start: (items: QueueItem[], sessionId?: string) => void;
  pause: () => void;
  resume: () => void;
  abort: () => void;
  removeItem: (itemIndex: number) => void;
  addItem: (rawLine: string) => void;
  reorderItems: (newOrder: number[]) => void;
  dismiss: () => void;
}

export function useQueueRunner(projectSlug: string): UseQueueRunnerReturn {
  // Subscribe only to state values we expose (not script/parsedItems/warnings)
  const {
    isRunning,
    isPaused,
    isStarting,
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
    isStarting: s.isStarting,
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
    const { handleProgress, handleItemComplete, handleError, handleItemsUpdated, syncFromStatus } = useQueueStore.getState();

    // Join project room
    socket.emit('project:join', projectSlug);

    // Register listeners
    const onProgress = (data: QueueProgressEvent) => handleProgress(data);
    const onItemComplete = (data: QueueItemCompleteEvent) => handleItemComplete(data);
    const onError = (data: QueueErrorEvent) => handleError(data);
    const onItemsUpdated = (data: QueueItemsUpdatedEvent) => handleItemsUpdated(data);

    socket.on('queue:progress', onProgress);
    socket.on('queue:itemComplete', onItemComplete);
    socket.on('queue:error', onError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('queue:itemsUpdated' as any, onItemsUpdated);

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
      socket.emit('project:leave', projectSlug);
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

  const resume = useCallback(() => {
    const socket = getSocket();
    socket.emit('queue:resume', { projectSlug });
  }, [projectSlug]);

  const abort = useCallback(() => {
    const socket = getSocket();
    socket.emit('queue:abort', { projectSlug });
    useQueueStore.getState().reset();
  }, [projectSlug]);

  const dismiss = useCallback(() => {
    useQueueStore.getState().reset();
  }, []);

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
    isStarting,
    progress: { current: currentIndex, total: totalItems },
    lockedSessionId,
    pauseReason,
    completedItems,
    errorItem,
    itemSessionIds,
    start,
    pause,
    resume,
    abort,
    removeItem,
    addItem,
    reorderItems,
    dismiss,
  };
}
