/**
 * Queue Store - Zustand store for queue editor and execution state
 * [Source: Story 15.3 - Task 1]
 */

import { create } from 'zustand';
import { parseQueueScript } from '@bmad-studio/shared';
import type {
  QueueItem,
  QueueParseWarning,
  QueueExecutionState,
  QueueProgressEvent,
  QueueItemCompleteEvent,
  QueueErrorEvent,
} from '@bmad-studio/shared';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

interface QueueState {
  // Editor state
  script: string;
  parsedItems: QueueItem[];
  warnings: QueueParseWarning[];

  // Execution state (from server via WebSocket)
  isRunning: boolean;
  isPaused: boolean;
  isStarting: boolean;
  isAborted: boolean; // suppresses late server events after abort
  currentIndex: number;
  totalItems: number;
  pauseReason: string | undefined;
  lockedSessionId: string | null;
  currentModel: string | undefined;
  completedItems: Set<number>;
  errorItem: { index: number; error: string } | null;
}

interface QueueActions {
  setScript: (script: string) => void;
  parseScript: () => void;

  // WebSocket event handlers
  handleProgress: (data: QueueProgressEvent) => void;
  handleItemComplete: (data: QueueItemCompleteEvent) => void;
  handleError: (data: QueueErrorEvent) => void;
  setStarting: (starting: boolean) => void;
  syncFromStatus: (state: QueueExecutionState) => void;
  reset: () => void;
}

type QueueStore = QueueState & QueueActions;

export const useQueueStore = create<QueueStore>((set, get) => ({
  // Editor state
  script: '',
  parsedItems: [],
  warnings: [],

  // Execution state
  isRunning: false,
  isPaused: false,
  isStarting: false,
  isAborted: false,
  currentIndex: 0,
  totalItems: 0,
  pauseReason: undefined,
  lockedSessionId: null,
  currentModel: undefined,
  completedItems: new Set<number>(),
  errorItem: null,

  setScript: (script: string) => {
    set({ script });
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      get().parseScript();
      debounceTimer = null;
    }, 300);
  },

  parseScript: () => {
    const { script } = get();
    const result = parseQueueScript(script);
    set({ parsedItems: result.items, warnings: result.warnings });
  },

  handleProgress: (data: QueueProgressEvent) => {
    // Ignore late server events after local abort
    if (get().isAborted) return;

    const update: Partial<QueueState> = {
      currentIndex: data.currentIndex,
      totalItems: data.totalItems,
      pauseReason: data.pauseReason,
      lockedSessionId: data.sessionId,
      isStarting: false,
    };

    switch (data.status) {
      case 'running':
        update.isRunning = true;
        update.isPaused = false;
        break;
      case 'paused':
        update.isRunning = true;
        update.isPaused = true;
        break;
      case 'completed':
        update.isRunning = false;
        update.isPaused = false;
        break;
      case 'error':
        update.isRunning = false;
        update.isPaused = false;
        break;
    }

    set(update);
  },

  handleItemComplete: (data: QueueItemCompleteEvent) => {
    if (get().isAborted) return;
    set((state) => ({
      completedItems: new Set([...state.completedItems, data.itemIndex]),
    }));
  },

  handleError: (data: QueueErrorEvent) => {
    if (get().isAborted) return;
    set({
      errorItem: { index: data.itemIndex, error: data.error },
    });
  },

  setStarting: (starting: boolean) => {
    set({ isStarting: starting, isAborted: false });
  },

  syncFromStatus: (state: QueueExecutionState) => {
    const completedItems = state.isRunning || state.currentIndex > 0
      ? new Set(Array.from({ length: state.currentIndex }, (_, i) => i))
      : new Set<number>();

    set({
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      currentIndex: state.currentIndex,
      totalItems: state.totalItems,
      pauseReason: state.pauseReason,
      lockedSessionId: state.lockedSessionId,
      currentModel: state.currentModel,
      completedItems,
    });
  },

  reset: () => {
    set({
      isRunning: false,
      isPaused: false,
      isStarting: false,
      isAborted: true,
      currentIndex: 0,
      totalItems: 0,
      pauseReason: undefined,
      lockedSessionId: null,
      currentModel: undefined,
      completedItems: new Set<number>(),
      errorItem: null,
    });
  },
}));
