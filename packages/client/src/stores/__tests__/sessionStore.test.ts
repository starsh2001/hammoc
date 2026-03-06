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
      searchQuery: '',
      searchContent: false,
      isSearching: false,
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

  describe('searchSessions', () => {
    const mockSearchResults = [
      {
        sessionId: 'session-789',
        firstPrompt: 'Search result session',
        messageCount: 5,
        created: '2026-02-01T10:00:00Z',
        modified: '2026-02-01T11:00:00Z',
      },
    ];

    it('should call API with correct params and replace sessions', async () => {
      vi.mocked(sessionsApi.list).mockResolvedValue({
        sessions: mockSearchResults,
        total: 1,
        hasMore: false,
      });

      await useSessionStore.getState().searchSessions('my-project', 'test query', false);

      expect(sessionsApi.list).toHaveBeenCalledWith('my-project', {
        query: 'test query',
        searchContent: false,
        includeEmpty: false,
        limit: 20,
        offset: 0,
      });
      expect(useSessionStore.getState().sessions).toEqual(mockSearchResults);
      expect(useSessionStore.getState().hasMore).toBe(false);
      expect(useSessionStore.getState().total).toBe(1);
      expect(useSessionStore.getState().isSearching).toBe(false);
      expect(useSessionStore.getState().searchQuery).toBe('test query');
    });

    it('should set isSearching during search', async () => {
      let resolvePromise: (value: { sessions: []; total: number; hasMore: boolean }) => void;
      vi.mocked(sessionsApi.list).mockImplementation(
        () => new Promise((resolve) => { resolvePromise = resolve; })
      );

      const searchPromise = useSessionStore.getState().searchSessions('my-project', 'query', false);
      expect(useSessionStore.getState().isSearching).toBe(true);

      resolvePromise!({ sessions: [], total: 0, hasMore: false });
      await searchPromise;

      expect(useSessionStore.getState().isSearching).toBe(false);
    });

    it('should call API with searchContent=true when enabled', async () => {
      vi.mocked(sessionsApi.list).mockResolvedValue({
        sessions: [],
        total: 0,
        hasMore: false,
      });

      await useSessionStore.getState().searchSessions('my-project', 'deep search', true);

      expect(sessionsApi.list).toHaveBeenCalledWith('my-project', expect.objectContaining({
        query: 'deep search',
        searchContent: true,
      }));
    });

    it('should handle error: set error state and clear isSearching', async () => {
      vi.mocked(sessionsApi.list).mockRejectedValue(new Error('Network error'));

      await useSessionStore.getState().searchSessions('my-project', 'query', false);

      expect(useSessionStore.getState().isSearching).toBe(false);
      expect(useSessionStore.getState().error).toBeTruthy();
      expect(useSessionStore.getState().errorType).toBe('unknown');
      // Search query should NOT be cleared on error
      expect(useSessionStore.getState().searchQuery).toBe('query');
    });

    it('should handle ApiError and use its message', async () => {
      vi.mocked(sessionsApi.list).mockRejectedValue(
        new ApiError(500, 'INTERNAL_ERROR', 'Server exploded')
      );

      await useSessionStore.getState().searchSessions('my-project', 'query', false);

      expect(useSessionStore.getState().error).toBe('Server exploded');
      expect(useSessionStore.getState().isSearching).toBe(false);
    });
  });

  describe('clearSearch', () => {
    it('should reset search state and re-fetch normal list', async () => {
      useSessionStore.setState({
        searchQuery: 'active query',
        searchContent: true,
        isSearching: true,
        currentProjectSlug: 'my-project',
      });

      const normalSessions = [
        { sessionId: 'normal-1', firstPrompt: 'Normal session', messageCount: 3, created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z' },
      ];
      vi.mocked(sessionsApi.list).mockResolvedValue({
        sessions: normalSessions,
        total: 1,
        hasMore: false,
      });

      await useSessionStore.getState().clearSearch('my-project');

      expect(useSessionStore.getState().searchQuery).toBe('');
      expect(useSessionStore.getState().searchContent).toBe(false);
      expect(useSessionStore.getState().isSearching).toBe(false);
      expect(useSessionStore.getState().sessions).toEqual(normalSessions);
      // API should be called without query/searchContent
      expect(sessionsApi.list).toHaveBeenCalledWith('my-project', expect.objectContaining({
        limit: 20,
      }));
      const callArgs = vi.mocked(sessionsApi.list).mock.calls[0][1]!;
      expect(callArgs.query).toBeUndefined();
      expect(callArgs.searchContent).toBeUndefined();
    });
  });

  describe('loadMoreSessions with active search', () => {
    it('should pass query and searchContent to API when search is active', async () => {
      useSessionStore.setState({
        sessions: [
          { sessionId: 's1', firstPrompt: 'First', messageCount: 1, created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z' },
        ],
        hasMore: true,
        currentProjectSlug: 'my-project',
        searchQuery: 'active query',
        searchContent: true,
      });

      vi.mocked(sessionsApi.list).mockResolvedValue({
        sessions: [
          { sessionId: 's2', firstPrompt: 'Second', messageCount: 2, created: '2026-01-02T00:00:00Z', modified: '2026-01-02T00:00:00Z' },
        ],
        total: 2,
        hasMore: false,
      });

      await useSessionStore.getState().loadMoreSessions('my-project', { limit: 20 });

      expect(sessionsApi.list).toHaveBeenCalledWith('my-project', expect.objectContaining({
        query: 'active query',
        searchContent: true,
        offset: 1,
        limit: 20,
      }));
      expect(useSessionStore.getState().sessions).toHaveLength(2);
    });

    it('should not pass query when search is not active', async () => {
      useSessionStore.setState({
        sessions: [
          { sessionId: 's1', firstPrompt: 'First', messageCount: 1, created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z' },
        ],
        hasMore: true,
        currentProjectSlug: 'my-project',
        searchQuery: '',
      });

      vi.mocked(sessionsApi.list).mockResolvedValue({
        sessions: [],
        total: 1,
        hasMore: false,
      });

      await useSessionStore.getState().loadMoreSessions('my-project');

      const callArgs = vi.mocked(sessionsApi.list).mock.calls[0][1]!;
      expect(callArgs.query).toBeUndefined();
    });
  });

  describe('setSearchQuery and setSearchContent', () => {
    it('should update searchQuery state', () => {
      useSessionStore.getState().setSearchQuery('new query');
      expect(useSessionStore.getState().searchQuery).toBe('new query');
    });

    it('should update searchContent state', () => {
      useSessionStore.getState().setSearchContent(true);
      expect(useSessionStore.getState().searchContent).toBe(true);
    });
  });

  describe('fetchSessions with active search', () => {
    it('should include searchQuery and searchContent in API call when search is active', async () => {
      useSessionStore.setState({
        searchQuery: 'active query',
        searchContent: true,
        currentProjectSlug: 'my-project',
      });

      vi.mocked(sessionsApi.list).mockResolvedValue({
        sessions: [],
        total: 0,
        hasMore: false,
      });

      await useSessionStore.getState().fetchSessions('my-project', { limit: 20 });

      expect(sessionsApi.list).toHaveBeenCalledWith('my-project', expect.objectContaining({
        query: 'active query',
        searchContent: true,
      }));
    });

    it('should not include query in API call when search is not active', async () => {
      useSessionStore.setState({
        searchQuery: '',
        currentProjectSlug: 'my-project',
      });

      vi.mocked(sessionsApi.list).mockResolvedValue({
        sessions: [],
        total: 0,
        hasMore: false,
      });

      await useSessionStore.getState().fetchSessions('my-project', { limit: 20 });

      const callArgs = vi.mocked(sessionsApi.list).mock.calls[0][1]!;
      expect(callArgs.query).toBeUndefined();
      expect(callArgs.searchContent).toBeUndefined();
    });
  });
});
