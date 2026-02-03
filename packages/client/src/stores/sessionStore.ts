/**
 * Session Store - Zustand store for session list state
 * [Source: Story 3.4 - Task 2]
 */

import { create } from 'zustand';
import type { SessionListItem } from '@bmad-studio/shared';
import { sessionsApi } from '../services/api/sessions';
import { ApiError } from '../services/api/client';

export type ErrorType = 'none' | 'not_found' | 'network' | 'server' | 'unknown';

/** Cache validity duration in milliseconds (5 minutes) */
const CACHE_DURATION_MS = 5 * 60 * 1000;

/** Cache entry for sessions per project */
interface SessionCacheEntry {
  sessions: SessionListItem[];
  fetchedAt: number;
}

interface SessionState {
  sessions: SessionListItem[];
  currentProjectSlug: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  errorType: ErrorType;
  /** Cache for sessions by project slug */
  cache: Map<string, SessionCacheEntry>;
}

interface SessionActions {
  /** Fetch sessions (uses cache unless forceRefresh is true) */
  fetchSessions: (projectSlug: string, forceRefresh?: boolean) => Promise<void>;
  clearSessions: () => void;
  clearError: () => void;
  setRefreshing: (isRefreshing: boolean) => void;
  /** Invalidate cache for a specific project or all projects */
  invalidateCache: (projectSlug?: string) => void;
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
  cache: new Map(),

  // Actions
  fetchSessions: async (projectSlug: string, forceRefresh = false) => {
    const state = get();
    const cached = state.cache.get(projectSlug);

    // Check if cache is valid (has data, not expired, and not force refresh)
    if (
      !forceRefresh &&
      cached &&
      cached.sessions.length > 0 &&
      Date.now() - cached.fetchedAt < CACHE_DURATION_MS
    ) {
      // Use cached data if switching projects
      if (state.currentProjectSlug !== projectSlug) {
        set({
          sessions: cached.sessions,
          currentProjectSlug: projectSlug,
          error: null,
          errorType: 'none',
        });
      }
      return;
    }

    // Clear sessions if switching projects (and no valid cache)
    if (state.currentProjectSlug !== projectSlug) {
      set({ sessions: [], currentProjectSlug: projectSlug });
    }

    set({ isLoading: true, error: null, errorType: 'none' });
    try {
      const { sessions } = await sessionsApi.list(projectSlug);

      // Update cache
      const newCache = new Map(state.cache);
      newCache.set(projectSlug, { sessions, fetchedAt: Date.now() });

      set({ sessions, isLoading: false, isRefreshing: false, cache: newCache });
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

  invalidateCache: (projectSlug?: string) => {
    const state = get();
    if (projectSlug) {
      const newCache = new Map(state.cache);
      newCache.delete(projectSlug);
      set({ cache: newCache });
    } else {
      set({ cache: new Map() });
    }
  },
}));
