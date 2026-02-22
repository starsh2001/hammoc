/**
 * Auth Store - Zustand store for authentication state
 * [Source: Story 2.2 - Task 5, Story 2.3 - Task 4]
 */

import { create } from 'zustand';
import type { RateLimitInfo } from '@bmad-studio/shared';
import { authApi } from '../services/api/auth';
import { ApiError } from '../services/api/client';
import { disconnectSocket } from '../services/socket';

interface AuthState {
  isAuthenticated: boolean;
  isPasswordConfigured: boolean | null;
  isLoading: boolean;
  error: string | null;
  rateLimitInfo: RateLimitInfo | null;
}

interface AuthActions {
  login: (password: string, rememberMe?: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setupPassword: (password: string, confirmPassword: string) => Promise<boolean>;
  clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

// Module-level dedup: stores the in-flight checkAuth promise so concurrent
// callers share one request instead of causing a mount/unmount loop
// (PublicRoute hides children while isLoading → LoginPage unmounts →
//  remounts → calls checkAuth again → isLoading:true → cycle repeats).
let checkAuthPromise: Promise<void> | null = null;
let hasCheckedAuth = false;

export const useAuthStore = create<AuthStore>((set) => ({
  // Initial state - isLoading starts true to prevent premature redirects on page refresh
  isAuthenticated: false,
  isPasswordConfigured: null,
  isLoading: true,
  error: null,
  rateLimitInfo: null,

  // Actions
  login: async (password: string, rememberMe: boolean = true): Promise<boolean> => {
    set({ isLoading: true, error: null, rateLimitInfo: null });

    try {
      await authApi.login({ password, rememberMe });
      set({ isAuthenticated: true, isLoading: false });
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        // Handle rate limit (429)
        if (err.status === 429 && err.details) {
          set({
            error: err.message,
            rateLimitInfo: err.details as RateLimitInfo,
            isLoading: false,
          });
        } else {
          // Handle other errors (401, etc.)
          set({
            error: err.message,
            isLoading: false,
          });
        }
      } else {
        set({
          error: '로그인 중 오류가 발생했습니다.',
          isLoading: false,
        });
      }
      return false;
    }
  },

  logout: async (): Promise<void> => {
    set({ isLoading: true });

    // Disconnect WebSocket before logout
    disconnectSocket();

    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    } finally {
      hasCheckedAuth = false;
      set({
        isAuthenticated: false,
        isLoading: false,
        error: null,
        rateLimitInfo: null,
      });
    }
  },

  checkAuth: (): Promise<void> => {
    // Already checked — skip (prevents mount/unmount loop between
    // PublicRoute and LoginPage).
    if (hasCheckedAuth) return Promise.resolve();
    // Deduplicate concurrent calls
    if (checkAuthPromise) return checkAuthPromise;

    set({ isLoading: true });

    checkAuthPromise = authApi
      .status()
      .then(({ authenticated, passwordConfigured }) => {
        set({ isAuthenticated: authenticated, isPasswordConfigured: passwordConfigured, isLoading: false });
      })
      .catch(() => {
        set({ isAuthenticated: false, isPasswordConfigured: null, isLoading: false });
      })
      .finally(() => {
        hasCheckedAuth = true;
        checkAuthPromise = null;
      });

    return checkAuthPromise;
  },

  setupPassword: async (password: string, confirmPassword: string): Promise<boolean> => {
    set({ isLoading: true, error: null });

    try {
      await authApi.setup({ password, confirmPassword });
      set({ isAuthenticated: true, isPasswordConfigured: true, isLoading: false });
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        set({ error: err.message, isLoading: false });
      } else {
        set({ error: '패스워드 설정 중 오류가 발생했습니다.', isLoading: false });
      }
      return false;
    }
  },

  clearError: (): void => {
    set({ error: null, rateLimitInfo: null });
  },
}));
