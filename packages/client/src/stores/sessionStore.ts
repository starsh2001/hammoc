/**
 * Session Store - Zustand store for session list state
 * [Source: Story 3.4 - Task 2]
 */

import { create } from 'zustand';
import type { SessionListItem } from '@bmad-studio/shared';
import { sessionsApi } from '../services/api/sessions';
import { ApiError } from '../services/api/client';
import { getSocket } from '../services/socket';
import i18n from '../i18n';

export type ErrorType = 'none' | 'not_found' | 'network' | 'server' | 'unknown';

interface SessionState {
  sessions: SessionListItem[];
  currentProjectSlug: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  total: number;
  error: string | null;
  errorType: ErrorType;
  includeEmpty: boolean;
  searchQuery: string;
  searchContent: boolean;
  isSearching: boolean;
  /** @internal monotonic counter to discard stale search responses */
  _searchVersion: number;
}

interface SessionActions {
  fetchSessions: (projectSlug: string, options?: { limit?: number }) => Promise<void>;
  /** Load more sessions (append to existing list) */
  loadMoreSessions: (projectSlug: string, options?: { limit?: number }) => Promise<void>;
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
  /** Search sessions by query */
  searchSessions: (projectSlug: string, query: string, searchContent: boolean) => Promise<void>;
  /** Clear search state and re-fetch normal list */
  clearSearch: (projectSlug: string) => Promise<void>;
  /** Reset search state without re-fetching (for unmount cleanup) */
  resetSearchState: () => void;
  /** Update search query state (for UI binding) */
  setSearchQuery: (query: string) => void;
  /** Update search content toggle state */
  setSearchContent: (searchContent: boolean) => void;
}

type SessionStore = SessionState & SessionActions;

export const useSessionStore = create<SessionStore>((set, get) => ({
  // State
  sessions: [],
  currentProjectSlug: null,
  isLoading: false,
  isRefreshing: false,
  isLoadingMore: false,
  hasMore: false,
  total: 0,
  error: null,
  errorType: 'none',
  includeEmpty: false,
  searchQuery: '',
  searchContent: false,
  isSearching: false,
  _searchVersion: 0,

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
      const { includeEmpty, searchQuery, searchContent } = get();
      const apiOptions: { includeEmpty?: boolean; limit?: number; query?: string; searchContent?: boolean } = {
        includeEmpty,
        limit: options?.limit,
      };
      if (searchQuery) {
        apiOptions.query = searchQuery;
        apiOptions.searchContent = searchContent;
      }
      const response = await sessionsApi.list(projectSlug, apiOptions);
      set({ sessions: response.sessions, hasMore: response.hasMore, total: response.total, isLoading: false, isRefreshing: false });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          set({
            error: i18n.t('notification:session.notFound'),
            errorType: 'not_found',
            isLoading: false,
            isRefreshing: false,
          });
        } else if (err.status >= 500) {
          set({
            error: i18n.t('notification:session.serverError'),
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
          error: i18n.t('notification:session.networkError'),
          errorType: 'network',
          isLoading: false,
          isRefreshing: false,
        });
      } else {
        set({
          error: i18n.t('notification:session.loadError'),
          errorType: 'unknown',
          isLoading: false,
          isRefreshing: false,
        });
      }
    }
  },

  loadMoreSessions: async (projectSlug: string, options?: { limit?: number }) => {
    const state = get();
    if (state.isLoadingMore || !state.hasMore) return;

    set({ isLoadingMore: true });
    try {
      const { includeEmpty, searchQuery, searchContent } = get();
      const limit = options?.limit ?? 20;
      // Capture offset from current state right before the API call
      const offset = get().sessions.length;
      const apiOptions: { includeEmpty?: boolean; limit?: number; offset?: number; query?: string; searchContent?: boolean } = {
        includeEmpty,
        limit,
        offset,
      };
      if (searchQuery) {
        apiOptions.query = searchQuery;
        apiOptions.searchContent = searchContent;
      }
      const response = await sessionsApi.list(projectSlug, apiOptions);
      // Use functional set to avoid stale state after await.
      // Discard response if context changed (project switch or query change).
      set((prev) => {
        if (prev.currentProjectSlug !== projectSlug || prev.searchQuery !== searchQuery) {
          return { isLoadingMore: false };
        }
        const existingIds = new Set(prev.sessions.map(s => s.sessionId));
        const newSessions = response.sessions.filter(s => !existingIds.has(s.sessionId));
        return {
          sessions: [...prev.sessions, ...newSessions],
          hasMore: response.hasMore,
          isLoadingMore: false,
        };
      });
    } catch {
      set({ isLoadingMore: false });
    }
  },

  clearSessions: () =>
    set({ sessions: [], currentProjectSlug: null, hasMore: false, error: null, errorType: 'none' }),

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
        err instanceof ApiError ? err.message : i18n.t('notification:session.deleteError');
      set({ error: message, errorType: 'unknown' });
      return false;
    }
  },

  setIncludeEmpty: (includeEmpty: boolean) => set({ includeEmpty }),

  searchSessions: async (projectSlug: string, query: string, searchContent: boolean) => {
    const version = get()._searchVersion + 1;
    set({ isSearching: true, searchQuery: query, searchContent, error: null, errorType: 'none', _searchVersion: version });
    try {
      const { includeEmpty } = get();
      const response = await sessionsApi.list(projectSlug, {
        query,
        searchContent,
        includeEmpty,
        limit: 20,
        offset: 0,
      });
      // Discard stale response if a newer search or clearSearch was issued
      if (get()._searchVersion !== version) return;
      set({
        sessions: response.sessions,
        hasMore: response.hasMore,
        total: response.total,
        isSearching: false,
      });
    } catch (err) {
      if (get()._searchVersion !== version) return;
      const message = err instanceof ApiError ? err.message : i18n.t('chat:session.searchError');
      set({ error: message, errorType: 'unknown', isSearching: false });
    }
  },

  clearSearch: async (projectSlug: string) => {
    // Bump version to invalidate any in-flight searchSessions
    const version = get()._searchVersion + 1;
    set({ searchQuery: '', searchContent: false, isSearching: false, _searchVersion: version });
    await get().fetchSessions(projectSlug, { limit: 20 });
  },

  resetSearchState: () => {
    const version = get()._searchVersion + 1;
    set({ searchQuery: '', searchContent: false, isSearching: false, _searchVersion: version });
  },

  setSearchQuery: (query: string) => set({ searchQuery: query }),

  setSearchContent: (searchContent: boolean) => set({ searchContent }),

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
        err instanceof ApiError ? err.message : i18n.t('notification:session.deleteError');
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
