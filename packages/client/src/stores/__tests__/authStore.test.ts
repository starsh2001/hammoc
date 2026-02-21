/**
 * Auth Store Tests
 * [Source: Story 2.2 - Task 11, Story 2.3 - Task 10]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAuthStore } from '../authStore';
import { ApiError } from '../../services/api/client';

// Mock the auth API
vi.mock('../../services/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    status: vi.fn(),
  },
}));

import { authApi } from '../../services/api/auth';

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: false,
      error: null,
      rateLimitInfo: null,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.rateLimitInfo).toBeNull();
    });
  });

  describe('login', () => {
    it('should set isAuthenticated to true on successful login', async () => {
      vi.mocked(authApi.login).mockResolvedValue({ success: true });

      const result = await useAuthStore.getState().login('correct-password');

      expect(result).toBe(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().error).toBeNull();
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should set error on 401 response', async () => {
      vi.mocked(authApi.login).mockRejectedValue(
        new ApiError(401, 'INVALID_PASSWORD', '패스워드가 올바르지 않습니다.')
      );

      const result = await useAuthStore.getState().login('wrong-password');

      expect(result).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().error).toBe('패스워드가 올바르지 않습니다.');
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should set rateLimitInfo on 429 response', async () => {
      const rateLimitDetails = { retryAfter: 30, remainingAttempts: 0 };
      vi.mocked(authApi.login).mockRejectedValue(
        new ApiError(
          429,
          'RATE_LIMIT_EXCEEDED',
          '로그인 시도 횟수를 초과했습니다.',
          rateLimitDetails
        )
      );

      const result = await useAuthStore.getState().login('any-password');

      expect(result).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().error).toBe('로그인 시도 횟수를 초과했습니다.');
      expect(useAuthStore.getState().rateLimitInfo).toEqual(rateLimitDetails);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should set isLoading during login', async () => {
      let resolveLogin: (value: { success: boolean }) => void;
      vi.mocked(authApi.login).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLogin = resolve;
          })
      );

      // Start login
      const loginPromise = useAuthStore.getState().login('password');

      // Check loading state
      expect(useAuthStore.getState().isLoading).toBe(true);

      // Resolve login
      resolveLogin!({ success: true });
      await loginPromise;

      // Check loading state after completion
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(authApi.login).mockRejectedValue(new Error('Network error'));

      const result = await useAuthStore.getState().login('password');

      expect(result).toBe(false);
      expect(useAuthStore.getState().error).toBe('로그인 중 오류가 발생했습니다.');
    });

    // Story 2.3 - rememberMe tests
    describe('rememberMe handling', () => {
      it('[HIGH] should pass rememberMe=true to API', async () => {
        vi.mocked(authApi.login).mockResolvedValue({ success: true });

        await useAuthStore.getState().login('password', true);

        expect(authApi.login).toHaveBeenCalledWith({
          password: 'password',
          rememberMe: true,
        });
      });

      it('[HIGH] should pass rememberMe=false to API', async () => {
        vi.mocked(authApi.login).mockResolvedValue({ success: true });

        await useAuthStore.getState().login('password', false);

        expect(authApi.login).toHaveBeenCalledWith({
          password: 'password',
          rememberMe: false,
        });
      });

      it('[MEDIUM] should default to rememberMe=true when not specified', async () => {
        vi.mocked(authApi.login).mockResolvedValue({ success: true });

        await useAuthStore.getState().login('password');

        expect(authApi.login).toHaveBeenCalledWith({
          password: 'password',
          rememberMe: true,
        });
      });
    });
  });

  describe('logout', () => {
    it('[HIGH] should call API and clear authentication state', async () => {
      // Set authenticated state
      useAuthStore.setState({ isAuthenticated: true });

      vi.mocked(authApi.logout).mockResolvedValue({ success: true, message: '로그아웃 성공' });

      await useAuthStore.getState().logout();

      expect(authApi.logout).toHaveBeenCalled();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().error).toBeNull();
      expect(useAuthStore.getState().rateLimitInfo).toBeNull();
    });

    it('[HIGH] should clear state even on logout error', async () => {
      useAuthStore.setState({ isAuthenticated: true });

      vi.mocked(authApi.logout).mockRejectedValue(new Error('Logout failed'));

      await useAuthStore.getState().logout();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('checkAuth', () => {
    it('should set isAuthenticated to true when authenticated', async () => {
      vi.mocked(authApi.status).mockResolvedValue({ authenticated: true, passwordConfigured: true });

      await useAuthStore.getState().checkAuth();

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should set isAuthenticated to false when not authenticated', async () => {
      vi.mocked(authApi.status).mockResolvedValue({ authenticated: false, passwordConfigured: true });

      await useAuthStore.getState().checkAuth();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should set isAuthenticated to false on error', async () => {
      vi.mocked(authApi.status).mockRejectedValue(new Error('Network error'));

      await useAuthStore.getState().checkAuth();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe('clearError', () => {
    it('should clear error and rateLimitInfo', () => {
      useAuthStore.setState({
        error: 'Some error',
        rateLimitInfo: { retryAfter: 30, remainingAttempts: 0 },
      });

      useAuthStore.getState().clearError();

      expect(useAuthStore.getState().error).toBeNull();
      expect(useAuthStore.getState().rateLimitInfo).toBeNull();
    });
  });
});
