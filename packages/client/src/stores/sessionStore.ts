/**
 * Session Store - Zustand store for session list state
 * [Source: Story 3.4 - Task 2]
 */

import { create } from 'zustand';
import type { SessionListItem } from '@bmad-studio/shared';
import { sessionsApi } from '../services/api/sessions';
import { ApiError } from '../services/api/client';

export type ErrorType = 'none' | 'not_found' | 'network' | 'server' | 'unknown';

interface SessionState {
  sessions: SessionListItem[];
  currentProjectSlug: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  errorType: ErrorType;
}

interface SessionActions {
  fetchSessions: (projectSlug: string) => Promise<void>;
  clearSessions: () => void;
  clearError: () => void;
  setRefreshing: (isRefreshing: boolean) => void;
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

  // Actions
  fetchSessions: async (projectSlug: string) => {
    const state = get();

    // Clear sessions if switching projects
    if (state.currentProjectSlug !== projectSlug) {
      set({ sessions: [], currentProjectSlug: projectSlug });
    }

    set({ isLoading: true, error: null, errorType: 'none' });
    try {
      const { sessions } = await sessionsApi.list(projectSlug);
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
}));
