/**
 * useQueueSession - Detects queue lock on a chat session and provides controls
 * [Source: Story 15.4 - Task 1]
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { QueueProgressEvent, QueueItemCompleteEvent, QueueErrorEvent } from '@bmad-studio/shared';
import { getSocket } from '../services/socket';
import { useQueueStore } from '../stores/queueStore';
import { queueApi } from '../services/api/queue';

export interface UseQueueSessionReturn {
  isQueueLocked: boolean;
  isQueueRunning: boolean;
  isQueuePaused: boolean;
  isQueueCompleted: boolean;
  isQueueErrored: boolean;
  progress: { current: number; total: number };
  currentPromptPreview: string | undefined;
  pauseReason: string | undefined;
  errorItem: { index: number; error: string } | null;
  projectSlug: string;
  pause: () => void;
  resume: () => void;
  abort: () => void;
}

export function useQueueSession(projectSlug: string, sessionId: string): UseQueueSessionReturn {
  const {
    isRunning,
    isPaused,
    currentIndex,
    totalItems,
    lockedSessionId,
    pauseReason,
    parsedItems,
    errorItem,
  } = useQueueStore(useShallow((s) => ({
    isRunning: s.isRunning,
    isPaused: s.isPaused,
    currentIndex: s.currentIndex,
    totalItems: s.totalItems,
    lockedSessionId: s.lockedSessionId,
    pauseReason: s.pauseReason,
    parsedItems: s.parsedItems,
    errorItem: s.errorItem,
  })));

  // Queue lock: this session is controlled by queue runner
  const isQueueLocked = lockedSessionId === sessionId && (isRunning || isPaused);

  // Track previous lock state to detect completion transitions
  const wasLockedRef = useRef(false);
  const [isQueueCompleted, setIsQueueCompleted] = useState(false);
  const [isQueueErrored, setIsQueueErrored] = useState(false);

  // Detect lock → unlock transitions for completion/error states
  useEffect(() => {
    if (isQueueLocked) {
      wasLockedRef.current = true;
    } else if (wasLockedRef.current) {
      // Transitioned from locked to unlocked
      wasLockedRef.current = false;
      const storeState = useQueueStore.getState();
      if (storeState.errorItem) {
        setIsQueueErrored(true);
      } else {
        setIsQueueCompleted(true);
      }
    }
  }, [isQueueLocked]);

  // Auto-clear completed state after 5 seconds
  useEffect(() => {
    if (!isQueueCompleted) return;
    const timer = setTimeout(() => setIsQueueCompleted(false), 5000);
    return () => clearTimeout(timer);
  }, [isQueueCompleted]);

  // Auto-clear errored state after 5 seconds
  useEffect(() => {
    if (!isQueueErrored) return;
    const timer = setTimeout(() => setIsQueueErrored(false), 5000);
    return () => clearTimeout(timer);
  }, [isQueueErrored]);

  // Current prompt preview (truncated to 100 chars)
  const currentPromptPreview = parsedItems[currentIndex]?.prompt?.slice(0, 100);

  // WebSocket integration — store listener refs for type-safe cleanup
  const listenersRef = useRef<{
    onProgress: (data: QueueProgressEvent) => void;
    onItemComplete: (data: QueueItemCompleteEvent) => void;
    onError: (data: QueueErrorEvent) => void;
  } | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const { handleProgress, handleItemComplete, handleError, syncFromStatus } = useQueueStore.getState();

    // Join project room (idempotent)
    socket.emit('project:join', projectSlug);

    // Avoid duplicate listeners if already registered
    if (!listenersRef.current) {
      const onProgress = (data: QueueProgressEvent) => handleProgress(data);
      const onItemComplete = (data: QueueItemCompleteEvent) => handleItemComplete(data);
      const onError = (data: QueueErrorEvent) => handleError(data);

      socket.on('queue:progress', onProgress);
      socket.on('queue:itemComplete', onItemComplete);
      socket.on('queue:error', onError);
      listenersRef.current = { onProgress, onItemComplete, onError };
    }

    // Initial status fetch
    queueApi.getStatus(projectSlug)
      .then((state) => syncFromStatus(state))
      .catch(() => {
        // 404 = no active queue, use default state
      });

    return () => {
      if (listenersRef.current) {
        socket.off('queue:progress', listenersRef.current.onProgress);
        socket.off('queue:itemComplete', listenersRef.current.onItemComplete);
        socket.off('queue:error', listenersRef.current.onError);
        listenersRef.current = null;
      }
      socket.emit('project:leave', projectSlug);
    };
  }, [projectSlug]);

  // Control functions
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
    isQueueLocked,
    isQueueRunning: isQueueLocked && isRunning && !isPaused,
    isQueuePaused: isQueueLocked && isPaused,
    isQueueCompleted,
    isQueueErrored,
    progress: { current: currentIndex, total: totalItems },
    currentPromptPreview,
    pauseReason,
    errorItem,
    projectSlug,
    pause,
    resume,
    abort,
  };
}
