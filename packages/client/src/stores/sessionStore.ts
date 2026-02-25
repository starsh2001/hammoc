/**
 * Session Store - Zustand store for session list state
 * [Source: Story 3.4 - Task 2]
 */

import { create } from 'zustand';
import type { SessionListItem } from '@bmad-studio/shared';
import { sessionsApi } from '../services/api/sessions';
import { ApiError } from '../services/api/client';
import { getSocket } from '../services/socket';

export type ErrorType = 'none' | 'not_found' | 'network' | 'server' | 'unknown';

interface SessionState {
  sessions: SessionListItem[];
  currentProjectSlug: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  errorType: ErrorType;
  includeEmpty: boolean;
}

interface SessionActions {
  fetchSessions: (projectSlug: string, options?: { limit?: number }) => Promise<void>;
  clearSessions: () => void;
  clearError: () => void;
  setRefreshing: (isRefreshing: boolean) => void;
  /** Update a session's streaming status (called from socket listener) */
  updateSessionStreaming: (sessionId: string, active: boolean) => void;
  /** Delete a single session */
  deleteSession: (projectSlug: string, sessionId: string) => Promise<boolean>;
  /** Delete multiple sessions at once */
  deleteSessions: (projectSlug: string, sessionIds: string[]) => Promise<boolean>;
  /** Toggle include empty sessions */
  setIncludeEmpty: (includeEmpty: boolean) => void;
  /** Rename a session (optimistic update + API call) */
  renameSession: (projectSlug: string, sessionId: string, name: string | null) => Promise<boolean>;
}

type SessionStore = SessionState & SessionActions;

export const useSessionStore = create<SessionStore>((set, get) => ({
  // State
  sessions: [],
  currentProjectSlug: null,
  isLoading: false,
  isRefreshing: false,
  error: null,
  errorType: 'none',
  includeEmpty: false,

  // Actions
  fetchSessions: async (projectSlug: string, options?: { limit?: number }) => {
    const state = get();

    // Clear sessions if switching projects
    if (state.currentProjectSlug !== projectSlug) {
      set({ sessions: [], currentProjectSlug: projectSlug });
    }

    // Only show loading skeleton when there are no cached sessions.
    // Otherwise keep stale data visible while revalidating.
    const hasCachedData = get().sessions.length > 0;
    set({
      isLoading: !hasCachedData,
      isRefreshing: hasCachedData,
      error: null,
      errorType: 'none',
    });
    try {
      const { includeEmpty } = get();
      const { sessions } = await sessionsApi.list(projectSlug, { includeEmpty, limit: options?.limit });
      set({ sessions, isLoading: false, isRefreshing: false });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          set({
            error: '프로젝트를 찾을 수 없습니다.',
            errorType: 'not_found',
            isLoading: false,
            isRefreshing: false,
          });
        } else if (err.status >= 500) {
          set({
            error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
            errorType: 'server',
            isLoading: false,
            isRefreshing: false,
          });
        } else {
          set({
            error: err.message,
            errorType: 'unknown',
            isLoading: false,
            isRefreshing: false,
          });
        }
      } else if (err instanceof TypeError && err.message.includes('fetch')) {
        // Network error (fetch failed)
        set({
          error: '네트워크 연결을 확인해주세요.',
          errorType: 'network',
          isLoading: false,
          isRefreshing: false,
        });
      } else {
        set({
          error: '세션 목록을 불러오는 중 오류가 발생했습니다.',
          errorType: 'unknown',
          isLoading: false,
          isRefreshing: false,
        });
      }
    }
  },

  clearSessions: () =>
    set({ sessions: [], currentProjectSlug: null, error: null, errorType: 'none' }),

  clearError: () => set({ error: null, errorType: 'none' }),

  setRefreshing: (isRefreshing: boolean) => set({ isRefreshing }),

  updateSessionStreaming: (sessionId: string, active: boolean) => {
    const { sessions } = get();
    const updated = sessions.map((s) =>
      s.sessionId === sessionId ? { ...s, isStreaming: active || undefined } : s,
    );
    // Only update if a matching session was found
    if (updated !== sessions) {
      set({ sessions: updated });
    }
  },

  deleteSession: async (projectSlug: string, sessionId: string) => {
    try {
      await sessionsApi.delete(projectSlug, sessionId);
      // Remove from local state immediately
      set((state) => ({
        sessions: state.sessions.filter((s) => s.sessionId !== sessionId),
      }));
      return true;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : '세션 삭제 중 오류가 발생했습니다.';
      set({ error: message, errorType: 'unknown' });
      return false;
    }
  },

  setIncludeEmpty: (includeEmpty: boolean) => set({ includeEmpty }),

  renameSession: async (projectSlug: string, sessionId: string, name: string | null) => {
    // Save previous name for revert
    const prev = get().sessions.find((s) => s.sessionId === sessionId)?.name;
    // Optimistic update
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId ? { ...s, name: name || undefined } : s,
      ),
    }));
    try {
      await sessionsApi.updateName(projectSlug, sessionId, name);
      return true;
    } catch {
      // Revert on failure
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.sessionId === sessionId ? { ...s, name: prev } : s,
        ),
      }));
      return false;
    }
  },

  deleteSessions: async (projectSlug: string, sessionIds: string[]) => {
    try {
      const deletedSet = new Set(sessionIds);
      await sessionsApi.deleteBatch(projectSlug, sessionIds);
      // Remove all deleted sessions from local state
      set((state) => ({
        sessions: state.sessions.filter((s) => !deletedSet.has(s.sessionId)),
      }));
      return true;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : '세션 삭제 중 오류가 발생했습니다.';
      set({ error: message, errorType: 'unknown' });
      return false;
    }
  },
}));

// --- Real-time session streaming status via WebSocket ---
// Module-level listener: subscribes once when this module is first imported.
// Uses lazy initialization to avoid issues with socket not being ready at import time.
let listenerRegistered = false;

function registerStreamChangeListener() {
  if (listenerRegistered) return;
  listenerRegistered = true;

  const socket = getSocket();
  socket.on('session:stream-change', (data: { sessionId: string; active: boolean }) => {
    useSessionStore.getState().updateSessionStreaming(data.sessionId, data.active);
  });
}

// Register on next tick to ensure socket is initialized
setTimeout(registerStreamChangeListener, 0);
