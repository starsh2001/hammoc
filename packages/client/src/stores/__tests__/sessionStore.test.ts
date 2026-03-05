/**
 * Session Store Tests
 * [Source: Story 3.4 - Task 2]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSessionStore } from '../sessionStore';
import { ApiError } from '../../services/api/client';

// Mock the sessions API
vi.mock('../../services/api/sessions', () => ({
  sessionsApi: {
    list: vi.fn(),
  },
}));

import { sessionsApi } from '../../services/api/sessions';

describe('useSessionStore', () => {
  beforeEach(() => {
    // Reset store state
    useSessionStore.setState({
      sessions: [],
      currentProjectSlug: null,
      isLoading: false,
      isRefreshing: false,
      error: null,
      errorType: 'none',
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useSessionStore.getState();
      expect(state.sessions).toEqual([]);
      expect(state.currentProjectSlug).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.isRefreshing).toBe(false);
      expect(state.error).toBeNull();
      expect(state.errorType).toBe('none');
    });
  });

  describe('fetchSessions', () => {
    const mockSessions = [
      {
        sessionId: 'session-123',
        firstPrompt: '프로젝트 구조를 설명해줘',
        messageCount: 15,
        created: '2026-01-15T09:30:00Z',
        modified: '2026-01-31T14:22:00Z',
      },
      {
        sessionId: 'session-456',
        firstPrompt: 'React 컴포넌트를 작성해줘',
        messageCount: 8,
        created: '2026-01-20T10:00:00Z',
        modified: '2026-01-30T12:00:00Z',
      },
    ];

    it('should fetch sessions successfully', async () => {
      vi.mocked(sessionsApi.list).mockResolvedValue({ sessions: mockSessions, total: mockSessions.length, hasMore: false });

      await useSessionStore.getState().fetchSessions('my-project');

      expect(useSessionStore.getState().sessions).toEqual(mockSessions);
      expect(useSessionStore.getState().currentProjectSlug).toBe('my-project');
      expect(useSessionStore.getState().isLoading).toBe(false);
      expect(useSessionStore.getState().error).toBeNull();
      expect(useSessionStore.getState().errorType).toBe('none');
    });

    it('should handle empty sessions list', async () => {
      vi.mocked(sessionsApi.list).mockResolvedValue({ sessions: [], total: 0, hasMore: false });

      await useSessionStore.getState().fetchSessions('empty-project');

      expect(useSessionStore.getState().sessions).toEqual([]);
      expect(useSessionStore.getState().isLoading).toBe(false);
      expect(useSessionStore.getState().error).toBeNull();
    });

    it('should set isLoading during fetch', async () => {
      let resolvePromise: (value: { sessions: []; total: number; hasMore: boolean }) => void;
      vi.mocked(sessionsApi.list).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve;
          })
      );

      // Start fetch
      const fetchPromise = useSessionStore.getState().fetchSessions('my-project');

      // Check loading state
      expect(useSessionStore.getState().isLoading).toBe(true);
      expect(useSessionStore.getState().error).toBeNull();
      expect(useSessionStore.getState().errorType).toBe('none');

      // Resolve promise
      resolvePromise!({ sessions: [], total: 0, hasMore: false });
      await fetchPromise;

      // Check state after completion
      expect(useSessionStore.getState().isLoading).toBe(false);
    });

    it('should clear sessions when switching to a different project', async () => {
      // Set initial state with sessions from old project
      useSessionStore.setState({
        sessions: mockSessions,
        currentProjectSlug: 'old-project',
      });

      vi.mocked(sessionsApi.list).mockResolvedValue({ sessions: [], total: 0, hasMore: false });

      await useSessionStore.getState().fetchSessions('new-project');

      expect(useSessionStore.getState().currentProjectSlug).toBe('new-project');
      expect(useSessionStore.getState().sessions).toEqual([]);
    });

    it('should not clear sessions when fetching same project (refresh)', async () => {
      useSessionStore.setState({
        sessions: mockSessions,
        currentProjectSlug: 'my-project',
      });

      const newSessions = [{ ...mockSessions[0], messageCount: 20 }];
      vi.mocked(sessionsApi.list).mockResolvedValue({ sessions: newSessions, total: newSessions.length, hasMore: false });

      await useSessionStore.getState().fetchSessions('my-project');

      expect(useSessionStore.getState().sessions).toEqual(newSessions);
    });

    it('should handle 404 error correctly', async () => {
      vi.mocked(sessionsApi.list).mockRejectedValue(
        new ApiError(404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없습니다.')
      );

      await useSessionStore.getState().fetchSessions('nonexistent');

      expect(useSessionStore.getState().errorType).toBe('not_found');
      expect(useSessionStore.getState().error).toBe('프로젝트를 찾을 수 없습니다.');
      expect(useSessionStore.getState().isLoading).toBe(false);
    });

    it('should handle server error (5xx) correctly', async () => {
      vi.mocked(sessionsApi.list).mockRejectedValue(
        new ApiError(500, 'INTERNAL_ERROR', '서버 내부 오류')
      );

      await useSessionStore.getState().fetchSessions('my-project');

      expect(useSessionStore.getState().errorType).toBe('server');
      expect(useSessionStore.getState().error).toContain('서버 오류');
      expect(useSessionStore.getState().isLoading).toBe(false);
    });

    it('should handle 503 error as server error', async () => {
      vi.mocked(sessionsApi.list).mockRejectedValue(
        new ApiError(503, 'SERVICE_UNAVAILABLE', '서비스 이용 불가')
      );

      await useSessionStore.getState().fetchSessions('my-project');

      expect(useSessionStore.getState().errorType).toBe('server');
    });

    it('should handle network error correctly', async () => {
      vi.mocked(sessionsApi.list).mockRejectedValue(
        new TypeError('Failed to fetch')
      );

      await useSessionStore.getState().fetchSessions('my-project');

      expect(useSessionStore.getState().errorType).toBe('network');
      expect(useSessionStore.getState().error).toBe('네트워크 연결을 확인해주세요.');
      expect(useSessionStore.getState().isLoading).toBe(false);
    });

    it('should handle other ApiError as unknown', async () => {
      vi.mocked(sessionsApi.list).mockRejectedValue(
        new ApiError(400, 'BAD_REQUEST', '잘못된 요청입니다.')
      );

      await useSessionStore.getState().fetchSessions('my-project');

      expect(useSessionStore.getState().errorType).toBe('unknown');
      expect(useSessionStore.getState().error).toBe('잘못된 요청입니다.');
    });

    it('should handle unexpected errors as unknown', async () => {
      vi.mocked(sessionsApi.list).mockRejectedValue(new Error('Unexpected error'));

      await useSessionStore.getState().fetchSessions('my-project');

      expect(useSessionStore.getState().errorType).toBe('unknown');
      expect(useSessionStore.getState().error).toBe('세션 목록을 불러오는 중 오류가 발생했습니다.');
    });

    it('should clear previous error on new fetch', async () => {
      useSessionStore.setState({ error: 'Previous error', errorType: 'network' });

      vi.mocked(sessionsApi.list).mockResolvedValue({ sessions: [], total: 0, hasMore: false });

      await useSessionStore.getState().fetchSessions('my-project');

      expect(useSessionStore.getState().error).toBeNull();
      expect(useSessionStore.getState().errorType).toBe('none');
    });

    it('should reset isRefreshing on success', async () => {
      useSessionStore.setState({ isRefreshing: true });

      vi.mocked(sessionsApi.list).mockResolvedValue({ sessions: [], total: 0, hasMore: false });

      await useSessionStore.getState().fetchSessions('my-project');

      expect(useSessionStore.getState().isRefreshing).toBe(false);
    });

    it('should reset isRefreshing on error', async () => {
      useSessionStore.setState({ isRefreshing: true });

      vi.mocked(sessionsApi.list).mockRejectedValue(new Error('Error'));

      await useSessionStore.getState().fetchSessions('my-project');

      expect(useSessionStore.getState().isRefreshing).toBe(false);
    });
  });

  describe('clearSessions', () => {
    it('should clear sessions and reset state', () => {
      useSessionStore.setState({
        sessions: [{ sessionId: 'test', firstPrompt: '', messageCount: 0, created: '', modified: '' }],
        currentProjectSlug: 'my-project',
        error: 'Some error',
        errorType: 'network',
      });

      useSessionStore.getState().clearSessions();

      expect(useSessionStore.getState().sessions).toEqual([]);
      expect(useSessionStore.getState().currentProjectSlug).toBeNull();
      expect(useSessionStore.getState().error).toBeNull();
      expect(useSessionStore.getState().errorType).toBe('none');
    });
  });

  describe('clearError', () => {
    it('should clear error and errorType', () => {
      useSessionStore.setState({ error: 'Some error', errorType: 'server' });

      useSessionStore.getState().clearError();

      expect(useSessionStore.getState().error).toBeNull();
      expect(useSessionStore.getState().errorType).toBe('none');
    });
  });

  describe('setRefreshing', () => {
    it('should set isRefreshing to true', () => {
      useSessionStore.getState().setRefreshing(true);

      expect(useSessionStore.getState().isRefreshing).toBe(true);
    });

    it('should set isRefreshing to false', () => {
      useSessionStore.setState({ isRefreshing: true });

      useSessionStore.getState().setRefreshing(false);

      expect(useSessionStore.getState().isRefreshing).toBe(false);
    });
  });
});
