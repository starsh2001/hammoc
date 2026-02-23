/**
 * useQueueRunner - WebSocket integration hook for queue execution control
 * [Source: Story 15.3 - Task 3]
 */

import { useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { QueueItem, QueueProgressEvent, QueueItemCompleteEvent, QueueErrorEvent } from '@bmad-studio/shared';
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

  // Control functions
  start: (items: QueueItem[], sessionId?: string) => void;
  pause: () => void;
  resume: () => void;
  abort: () => void;
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
  })));

  // WebSocket setup and teardown
  useEffect(() => {
    const socket = getSocket();
    // Actions are stable refs — access via getState() to avoid unnecessary effect re-runs
    const { handleProgress, handleItemComplete, handleError, syncFromStatus } = useQueueStore.getState();

    // Join project room
    socket.emit('project:join', projectSlug);

    // Register listeners
    const onProgress = (data: QueueProgressEvent) => handleProgress(data);
    const onItemComplete = (data: QueueItemCompleteEvent) => handleItemComplete(data);
    const onError = (data: QueueErrorEvent) => handleError(data);

    socket.on('queue:progress', onProgress);
    socket.on('queue:itemComplete', onItemComplete);
    socket.on('queue:error', onError);

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

  return {
    isRunning,
    isPaused,
    isStarting,
    progress: { current: currentIndex, total: totalItems },
    lockedSessionId,
    pauseReason,
    completedItems,
    errorItem,
    start,
    pause,
    resume,
    abort,
  };
}
