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

/** How long to show the completed/errored banner before auto-dismissing (ms) */
const TERMINAL_BANNER_DURATION = 4000;

export interface UseQueueSessionReturn {
  isQueueLocked: boolean;
  isQueueRunning: boolean;
  isQueuePaused: boolean;
  isQueueCompleted: boolean;
  isQueueErrored: boolean;
  /** Queue is running but on a different session */
  isQueueOnOtherSession: boolean;
  /** Session ID where queue is currently running */
  queueActiveSessionId: string | null;
  progress: { current: number; total: number };
  currentPromptPreview: string | undefined;
  pauseReason: string | undefined;
  errorItem: { index: number; error: string } | null;
  projectSlug: string;
  pause: () => void;
  resume: () => void;
  abort: () => void;
  /** Manually dismiss the completed/errored banner (clears server state) */
  dismissBanner: () => void;
}

export function useQueueSession(projectSlug: string, sessionId: string): UseQueueSessionReturn {
  const {
    isRunning,
    isPaused,
    isCompleted,
    isErrored,
    currentIndex,
    totalItems,
    lockedSessionId,
    pauseReason,
    parsedItems,
    errorItem,
  } = useQueueStore(useShallow((s) => ({
    isRunning: s.isRunning,
    isPaused: s.isPaused,
    isCompleted: s.isCompleted,
    isErrored: s.isErrored,
    currentIndex: s.currentIndex,
    totalItems: s.totalItems,
    lockedSessionId: s.lockedSessionId,
    pauseReason: s.pauseReason,
    parsedItems: s.parsedItems,
    errorItem: s.errorItem,
  })));

  // Track whether we were actively watching the queue run (to distinguish
  // "completed while I was here" from "was already completed when I arrived")
  const wasRunningRef = useRef(false);

  // Local override: suppress terminal banners (completed/errored) on this session
  const [terminalDismissed, setTerminalDismissed] = useState(false);

  // Queue lock: this session is controlled by queue runner
  const isQueueLocked = lockedSessionId === sessionId && (isRunning || isPaused);

  // Queue running on a different session
  const isQueueOnOtherSession = (isRunning || isPaused) && !!lockedSessionId && lockedSessionId !== sessionId;

  // Current prompt preview (truncated to 100 chars)
  const currentPromptPreview = parsedItems[currentIndex]?.prompt?.slice(0, 100);

  // Track whether the queue was running while the user was on this page
  useEffect(() => {
    if (isRunning || isPaused) {
      wasRunningRef.current = true;
      setTerminalDismissed(false); // reset dismiss when a new run starts
    }
  }, [isRunning, isPaused]);

  // Auto-dismiss completed/errored banners
  useEffect(() => {
    if (!isCompleted && !isErrored) return;

    // If we weren't watching the run, suppress immediately (session re-entry case)
    if (!wasRunningRef.current) {
      setTerminalDismissed(true);
      return;
    }

    // Otherwise show briefly, then auto-dismiss
    const timer = setTimeout(() => {
      setTerminalDismissed(true);
    }, TERMINAL_BANNER_DURATION);
    return () => clearTimeout(timer);
  }, [isCompleted, isErrored]);

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

    // Initial status fetch — restores server-persisted completed/errored state
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

  // Dismiss completed/errored banner — notifies server to clear persisted state
  const dismissBanner = useCallback(() => {
    setTerminalDismissed(true);
    const socket = getSocket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).emit('queue:dismiss', { projectSlug });
    useQueueStore.setState({ isCompleted: false, isErrored: false, errorItem: null });
  }, [projectSlug]);

  return {
    isQueueLocked,
    isQueueRunning: isQueueLocked && isRunning && !isPaused,
    isQueuePaused: isQueueLocked && isPaused,
    isQueueCompleted: isCompleted && !terminalDismissed,
    isQueueErrored: isErrored && !terminalDismissed,
    isQueueOnOtherSession,
    queueActiveSessionId: (isRunning || isPaused) ? lockedSessionId : null,
    progress: { current: currentIndex, total: totalItems },
    currentPromptPreview,
    pauseReason,
    errorItem,
    projectSlug,
    pause,
    resume,
    abort,
    dismissBanner,
  };
}
