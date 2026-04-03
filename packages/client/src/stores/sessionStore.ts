/**
 * Session Store - Zustand store for session list state
 * [Source: Story 3.4 - Task 2]
 */

import { create } from 'zustand';
import type { SessionListItem } from '@hammoc/shared';
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
  /** @internal monotonic counter to discard stale fetchSessions responses */
  _fetchVersion: number;
  /** @internal timestamp of last successful fetch */
  _lastFetchedAt: number;
}

interface SessionActions {
  fetchSessions: (projectSlug: string, options?: { limit?: number; skipIfFresh?: boolean }) => Promise<void>;
  /** Load more sessions (append to existing list) */
  loadMoreSessions: (projectSlug: string, options?: { limit?: number }) => Promise<void>;
  clearSessions: () => void;
  clearError: () => void;
  /** Update a session's streaming status (called from socket listener) */
  updateSessionStreaming: (sessionId: string, active: boolean) => void;
  /** Update a session's waiting status (called from socket listener) */
  updateSessionWaiting: (sessionId: string, waiting: boolean) => void;
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
  _fetchVersion: 0,
  _lastFetchedAt: 0,

  // Actions
  fetchSessions: async (projectSlug: string, options?: { limit?: number; skipIfFresh?: boolean }) => {
    const state = get();

    // Skip fetch if data is fresh enough (same project, no error, fetched within 2 seconds)
    const FRESH_THRESHOLD_MS = 2000;
    if (
      options?.skipIfFresh &&
      state.currentProjectSlug === projectSlug &&
      state.sessions.length > 0 &&
      !state.error &&
      Date.now() - state._lastFetchedAt < FRESH_THRESHOLD_MS
    ) {
      return;
    }

    // Clear sessions and search state if switching projects
    if (state.currentProjectSlug !== projectSlug) {
      set({
        sessions: [],
        currentProjectSlug: projectSlug,
        isSearching: false,
        searchQuery: '',
        searchContent: false,
        _searchVersion: state._searchVersion + 1,
      });
    }

    // Bump fetch version to discard any in-flight responses from previous calls
    const fetchVersion = get()._fetchVersion + 1;

    // Only show loading skeleton when there are no cached sessions.
    // Otherwise keep stale data visible while revalidating.
    const hasCachedData = get().sessions.length > 0;
    set({
      isLoading: !hasCachedData,
      isRefreshing: hasCachedData,
      error: null,
      errorType: 'none',
      _fetchVersion: fetchVersion,
    });
    const fetchStartedAt = Date.now();
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
      // Discard stale response if a newer fetch was issued or project changed
      if (get()._fetchVersion !== fetchVersion || get().currentProjectSlug !== projectSlug) return;
      // Prevent API response from overwriting fresher socket-based streaming state.
      // If a socket event arrived after this fetch started, the socket value is authoritative.
      // Reconcile first, then prune — so entries valid for this fetch aren't deleted prematurely.
      const sessions = recentStreamChanges.size > 0
        ? response.sessions.map(s => {
          const change = recentStreamChanges.get(s.sessionId);
          if (change && change.at >= fetchStartedAt && (!!s.isStreaming) !== change.active) {
            return { ...s, isStreaming: change.active || undefined };
          }
          return s;
        })
        : response.sessions;
      // Prune all stale entries from recentStreamChanges after reconciliation
      if (recentStreamChanges.size > 0) {
        const now = Date.now();
        for (const [id, entry] of recentStreamChanges) {
          if (now - entry.at > 10_000) recentStreamChanges.delete(id);
        }
      }
      set({ sessions, hasMore: response.hasMore, total: response.total, isLoading: false, isRefreshing: false, _lastFetchedAt: Date.now() });
    } catch (err) {
      // Discard stale error if a newer fetch was issued or project changed
      if (get()._fetchVersion !== fetchVersion || get().currentProjectSlug !== projectSlug) return;
      const setError = (error: string, errorType: ErrorType) =>
        set({ error, errorType, isLoading: false, isRefreshing: false });

      if (err instanceof ApiError) {
        if (err.status === 404) {
          setError(i18n.t('notification:session.notFound'), 'not_found');
        } else if (err.status >= 500) {
          setError(i18n.t('notification:session.serverError'), 'server');
        } else {
          setError(err.message, 'unknown');
        }
      } else if (err instanceof TypeError && err.message.includes('fetch')) {
        setError(i18n.t('notification:session.networkError'), 'network');
      } else {
        setError(i18n.t('notification:session.loadError'), 'unknown');
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
      // Capture offset from current state right before the API call.
      // Exclude no-JSONL placeholder sessions from offset — they are prepended by the server
      // but not part of the paginated JSONL result set. JSONL-backed sessions with isWaiting
      // ARE in the paginated set and must be counted.
      const offset = get().sessions.filter(s => !(s.isWaiting && !s.firstPrompt && s.messageCount === 0)).length;
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
    set((prev) => ({
      sessions: [],
      currentProjectSlug: null,
      hasMore: false,
      error: null,
      errorType: 'none',
      _lastFetchedAt: 0,
      _fetchVersion: prev._fetchVersion + 1,
    })),

  clearError: () => set({ error: null, errorType: 'none' }),

  updateSessionStreaming: (sessionId: string, active: boolean) => {
    const { sessions } = get();
    const idx = sessions.findIndex((s) => s.sessionId === sessionId);
    if (idx === -1) return;
    const updated = [...sessions];
    updated[idx] = { ...updated[idx], isStreaming: active || undefined };
    set({ sessions: updated });
  },

  updateSessionWaiting: (sessionId: string, waiting: boolean) => {
    const { sessions } = get();
    if (waiting) {
      // Add waiting session to top of list if not already present
      if (sessions.some((s) => s.sessionId === sessionId)) {
        const updated = sessions.map((s) =>
          s.sessionId === sessionId ? { ...s, isWaiting: true } : s,
        );
        set({ sessions: updated });
      } else {
        const now = new Date().toISOString();
        set({
          sessions: [
            { sessionId, firstPrompt: '', messageCount: 0, created: now, modified: now, isWaiting: true },
            ...sessions,
          ],
        });
      }
    } else {
      // Remove isWaiting flag; remove entirely if it was a JSONL-less placeholder
      const updated = sessions
        .map((s) => {
          if (s.sessionId !== sessionId) return s;
          if (s.messageCount === 0 && !s.firstPrompt) return null; // placeholder — remove
          const { isWaiting: _, ...rest } = s;
          return rest;
        })
        .filter(Boolean) as typeof sessions;
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
      // Discard stale response if a newer search or clearSearch was issued, or project changed
      if (get()._searchVersion !== version || get().currentProjectSlug !== projectSlug) return;
      set({
        sessions: response.sessions,
        hasMore: response.hasMore,
        total: response.total,
        isSearching: false,
      });
    } catch (err) {
      if (get()._searchVersion !== version || get().currentProjectSlug !== projectSlug) return;
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
let listenerRetryCount = 0;
const MAX_LISTENER_RETRIES = 20;
const streamEndRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Track sessions whose streaming state was recently updated via socket event.
// Stores the timestamp of the most recent socket-based streaming state change
// so fetchSessions can detect and discard stale API values.
const recentStreamChanges = new Map<string, { active: boolean; at: number }>();

function registerStreamChangeListener() {
  if (listenerRegistered) return;

  try {
    const socket = getSocket();

    socket.on('session:stream-change', (data: { sessionId: string; active: boolean; projectSlug?: string | null }) => {
      useSessionStore.getState().updateSessionStreaming(data.sessionId, data.active);

      // Track socket-based streaming state changes (both start and end) with timestamp.
      // fetchSessions uses this to avoid overwriting fresher local state with stale API data.
      recentStreamChanges.set(data.sessionId, { active: data.active, at: Date.now() });

      // When streaming ends, debounce-refresh session list to update messageCount and modified time.
      // Debounce per project so concurrent multi-project streams each get their own refresh.
      // Use server-provided projectSlug (authoritative); fall back to currentProjectSlug
      // only when server didn't resolve the project (e.g., very short-lived session).
      if (!data.active) {
        const slug = data.projectSlug ?? useSessionStore.getState().currentProjectSlug;
        if (slug) {
          const prev = streamEndRefreshTimers.get(slug);
          if (prev) clearTimeout(prev);
          streamEndRefreshTimers.set(slug, setTimeout(() => {
            streamEndRefreshTimers.delete(slug);
            useSessionStore.getState().fetchSessions(slug);
          }, 500));
        }
      }
    });

    socket.on('session:waiting-change', (data: { sessionId: string; waiting: boolean; projectSlug: string }) => {
      const state = useSessionStore.getState();
      if (state.currentProjectSlug === data.projectSlug) {
        state.updateSessionWaiting(data.sessionId, data.waiting);
      }
    });

    listenerRegistered = true;
  } catch {
    // Socket not ready yet; retry with bounded attempts
    if (++listenerRetryCount < MAX_LISTENER_RETRIES) {
      setTimeout(registerStreamChangeListener, 100);
    }
  }
}

// Register on next tick to ensure socket is initialized
setTimeout(registerStreamChangeListener, 0);
