/**
 * Queue Store - Zustand store for queue editor and execution state
 * [Source: Story 15.3 - Task 1]
 */

import { create } from 'zustand';
import { parseQueueScript } from '@hammoc/shared';
import type {
  QueueItem,
  QueueParseWarning,
  QueueExecutionState,
  QueueProgressEvent,
  QueueItemCompleteEvent,
  QueueErrorEvent,
  QueueItemsUpdatedEvent,
} from '@hammoc/shared';
import { queueApi } from '../services/api/queue';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let reorderSafetyTimer: ReturnType<typeof setTimeout> | null = null;

interface QueueState {
  // Editor state
  script: string;
  parsedItems: QueueItem[];
  warnings: QueueParseWarning[];

  // Execution state (from server via WebSocket)
  isRunning: boolean;
  isPaused: boolean;
  /** Server-persisted: queue finished successfully (persists until dismissed) */
  isCompleted: boolean;
  /** Server-persisted: queue finished with error (persists until dismissed) */
  isErrored: boolean;
  isStarting: boolean;
  isAborted: boolean; // suppresses late server events after abort
  /** True when pause requested but current item still executing */
  isPauseRequested: boolean;
  /** True when waiting for user input (permission/question) */
  isWaitingForInput: boolean;
  currentIndex: number;
  totalItems: number;
  pauseReason: string | undefined;
  lockedSessionId: string | null;
  currentModel: string | undefined;
  completedItems: Set<number>;
  errorItem: { index: number; error: string } | null;
  /** Map of itemIndex -> sessionId for session links */
  itemSessionIds: Map<number, string>;
  /** True while waiting for server to confirm a reorder */
  isReordering: boolean;
  /** True when local user is editing pending items as script */
  isEditingPaused: boolean;
  /** True when a remote client is editing (from server broadcast) */
  isRemoteEditing: boolean;
  /** Loop progress when executing inside a @loop block */
  loopProgress: { iteration: number; max: number; innerIndex: number; innerTotal: number } | null;
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
  handleItemsUpdated: (data: QueueItemsUpdatedEvent) => void;
  optimisticReorder: (newOrder: number[], projectSlug: string) => void;
  setEditingPaused: (editing: boolean) => void;
  handleEditState: (data: { isEditing: boolean }) => void;
  cancelScriptDebounce: () => void;
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
  isCompleted: false,
  isErrored: false,
  isStarting: false,
  isAborted: false,
  isPauseRequested: false,
  isWaitingForInput: false,
  currentIndex: 0,
  totalItems: 0,
  pauseReason: undefined,
  lockedSessionId: null,
  currentModel: undefined,
  completedItems: new Set<number>(),
  errorItem: null,
  itemSessionIds: new Map<number, string>(),
  isReordering: false,
  isEditingPaused: false,
  isRemoteEditing: false,
  loopProgress: null,

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
      isPauseRequested: data.isPauseRequested ?? false,
      isWaitingForInput: data.isWaitingForInput ?? false,
      loopProgress: data.loopProgress ?? null,
    };

    switch (data.status) {
      case 'running':
        update.isRunning = true;
        update.isPaused = false;
        update.isCompleted = false;
        update.isErrored = false;
        update.errorItem = null;
        break;
      case 'paused':
        update.isRunning = true;
        update.isPaused = true;
        break;
      case 'completed':
        update.isRunning = false;
        update.isPaused = false;
        update.isCompleted = true;
        update.lockedSessionId = null;
        break;
      case 'aborted':
        update.isRunning = false;
        update.isPaused = false;
        update.isCompleted = false;
        update.isErrored = false;
        update.isStarting = false;
        update.errorItem = null;
        update.pauseReason = undefined;
        update.lockedSessionId = null;
        update.completedItems = new Set<number>();
        update.itemSessionIds = new Map<number, string>();
        update.loopProgress = null;
        break;
      case 'error':
        update.isRunning = false;
        update.isPaused = false;
        update.isErrored = true;
        update.lockedSessionId = null;
        break;
    }

    // Auto-exit edit mode when queue resumes/aborts/completes (e.g. another client resumed)
    if (get().isEditingPaused && data.status !== 'paused') {
      update.isEditingPaused = false;
    }

    // Track current item's sessionId
    if (data.status === 'running' && data.sessionId) {
      const newSessionIds = new Map(get().itemSessionIds);
      newSessionIds.set(data.currentIndex, data.sessionId);
      update.itemSessionIds = newSessionIds;
    }

    set(update);
  },

  handleItemComplete: (data: QueueItemCompleteEvent) => {
    if (get().isAborted) return;
    set((state) => {
      const newSessionIds = new Map(state.itemSessionIds);
      if (data.sessionId) {
        newSessionIds.set(data.itemIndex, data.sessionId);
      }
      return {
        completedItems: new Set([...state.completedItems, data.itemIndex]),
        itemSessionIds: newSessionIds,
      };
    });
  },

  handleError: (data: QueueErrorEvent) => {
    if (get().isAborted) return;
    set({
      errorItem: { index: data.itemIndex, error: data.error },
    });
  },

  setStarting: (starting: boolean) => {
    set({
      isStarting: starting,
      isAborted: false,
      // Clear previous run's error when starting a new run
      ...(starting ? { errorItem: null } : {}),
    });
  },

  syncFromStatus: (state: QueueExecutionState) => {
    // Clamp completedItems: when totalItems is 0 (dismissed/idle), completedItems must also be 0
    const maxCompleted = state.totalItems > 0
      ? Math.min(state.currentIndex, state.totalItems)
      : 0;
    const completedItems = state.isRunning || maxCompleted > 0
      ? new Set(Array.from({ length: maxCompleted }, (_, i) => i))
      : new Set<number>();

    set({
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      isCompleted: state.isCompleted ?? false,
      isErrored: state.isErrored ?? false,
      isAborted: false, // clear abort flag on server state sync
      isPauseRequested: state.isPauseRequested ?? false,
      isWaitingForInput: state.isWaitingForInput ?? false,
      isReordering: false,
      currentIndex: Math.min(state.currentIndex, state.totalItems > 0 ? state.totalItems : state.currentIndex),
      totalItems: state.totalItems,
      pauseReason: state.pauseReason,
      lockedSessionId: state.lockedSessionId,
      currentModel: state.currentModel,
      completedItems,
      // Restore error from server state, or clear if server has none
      errorItem: state.lastError
        ? { index: state.lastError.itemIndex, error: state.lastError.error }
        : null,
      isRemoteEditing: state.isEditing ?? false,
      // Restore queue items from server, or clear stale items when server omits them
      parsedItems: state.items && state.items.length > 0 ? state.items : [],
      // Restore completed item session IDs from server
      itemSessionIds: state.completedSessionIds
        ? new Map(Object.entries(state.completedSessionIds).map(([k, v]) => [Number(k), v]))
        : new Map<number, string>(),
      // Restore loop progress from server
      loopProgress: state.loopProgress ?? null,
    });
  },

  handleItemsUpdated: (data: QueueItemsUpdatedEvent) => {
    if (get().isAborted) return;
    if (reorderSafetyTimer) { clearTimeout(reorderSafetyTimer); reorderSafetyTimer = null; }
    set({
      parsedItems: data.items,
      totalItems: data.totalItems,
      currentIndex: data.currentIndex,
      isReordering: false,
    });
  },

  optimisticReorder: (newOrder: number[], projectSlug: string) => {
    const { parsedItems, currentIndex, isPaused } = get();
    const pendingStart = isPaused ? currentIndex : currentIndex + 1;
    const reordered = newOrder.map(i => parsedItems[i]);
    if (reorderSafetyTimer) clearTimeout(reorderSafetyTimer);
    reorderSafetyTimer = setTimeout(() => {
      if (!get().isReordering) return;
      // Re-fetch server state to recover from lost response
      queueApi.getStatus(projectSlug)
        .then((state) => get().syncFromStatus(state))
        .catch(() => set({ isReordering: false }));
      reorderSafetyTimer = null;
    }, 3000);
    set({
      parsedItems: [...parsedItems.slice(0, pendingStart), ...reordered],
      isReordering: true,
    });
  },

  setEditingPaused: (editing: boolean) => {
    set({ isEditingPaused: editing });
  },

  handleEditState: (data: { isEditing: boolean }) => {
    // If we are the editor, this is not a remote edit
    const isRemote = data.isEditing && !get().isEditingPaused;
    set({ isRemoteEditing: isRemote });
  },

  cancelScriptDebounce: () => {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  },

  reset: () => {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    set({
      // Editor state
      script: '',
      parsedItems: [],
      warnings: [],
      // Execution state
      isRunning: false,
      isPaused: false,
      isCompleted: false,
      isErrored: false,
      isStarting: false,
      isAborted: true,
      isPauseRequested: false,
      isWaitingForInput: false,
      currentIndex: 0,
      totalItems: 0,
      pauseReason: undefined,
      lockedSessionId: null,
      currentModel: undefined,
      completedItems: new Set<number>(),
      errorItem: null,
      itemSessionIds: new Map<number, string>(),
      isReordering: false,
      isEditingPaused: false,
      isRemoteEditing: false,
      loopProgress: null,
    });
  },
}));
