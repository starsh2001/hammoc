/**
 * SessionListPage Tests
 * [Source: Story 3.4 - Task 4]
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionListPage } from '../SessionListPage';
import { useSessionStore } from '../../stores/sessionStore';
import type { SessionListItem } from '@bmad-studio/shared';

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock the session store
vi.mock('../../stores/sessionStore');

// Mock usePullToRefresh to simplify tests
vi.mock('../../hooks/usePullToRefresh', () => ({
  usePullToRefresh: () => ({
    containerRef: { current: null },
    isPulling: false,
    pullDistance: 0,
    isRefreshing: false,
  }),
}));

// Mock useSkeletonCount
vi.mock('../../hooks/useSkeletonCount', () => ({
  useSkeletonCount: () => 5,
}));

describe('SessionListPage', () => {
  const mockSessions: SessionListItem[] = [
    {
      sessionId: 'session-123',
      firstPrompt: '프로젝트 구조를 설명해줘',
      messageCount: 15,
      created: '2026-01-15T09:30:00Z',
      modified: '2026-02-01T10:00:00Z',
    },
    {
      sessionId: 'session-456',
      firstPrompt: 'React 컴포넌트를 작성해줘',
      messageCount: 8,
      created: '2026-01-20T10:00:00Z',
      modified: '2026-01-30T12:00:00Z',
    },
  ];

  const mockFetchSessions = vi.fn().mockResolvedValue(undefined);
  const mockSetRefreshing = vi.fn();
  const mockClearError = vi.fn();
  const mockClearSessions = vi.fn();
  const mockSearchSessions = vi.fn().mockResolvedValue(undefined);
  const mockClearSearch = vi.fn().mockResolvedValue(undefined);
  const mockSetSearchQuery = vi.fn();
  const mockSetSearchContent = vi.fn();

  const defaultMockState = {
    sessions: [] as SessionListItem[],
    currentProjectSlug: null as string | null,
    isLoading: false,
    isRefreshing: false,
    isLoadingMore: false,
    hasMore: false,
    total: 0,
    error: null as string | null,
    errorType: 'none' as const,
    includeEmpty: false,
    searchQuery: '',
    searchContent: false,
    isSearching: false,
    _searchVersion: 0,
    fetchSessions: mockFetchSessions,
    loadMoreSessions: vi.fn(),
    setRefreshing: mockSetRefreshing,
    clearError: mockClearError,
    clearSessions: mockClearSessions,
    updateSessionStreaming: vi.fn(),
    deleteSession: vi.fn(),
    deleteSessions: vi.fn(),
    setIncludeEmpty: vi.fn(),
    renameSession: vi.fn(),
    searchSessions: mockSearchSessions,
    clearSearch: mockClearSearch,
    setSearchQuery: mockSetSearchQuery,
    setSearchContent: mockSetSearchContent,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));
    vi.clearAllMocks();

    // Default mock state
    vi.mocked(useSessionStore).mockReturnValue({ ...defaultMockState });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderPage = (projectSlug = 'my-project') => {
    return render(
      <MemoryRouter initialEntries={[`/project/${projectSlug}`]}>
        <Routes>
          <Route path="/project/:projectSlug" element={<SessionListPage />} />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('loading state', () => {
    it('renders skeleton loading state', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        isLoading: true,
      });

      renderPage();

      expect(screen.getByRole('status', { name: '로딩 중' })).toBeInTheDocument();
    });

    it('disables refresh button while loading', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        isLoading: true,
      });

      renderPage();

      const refreshButton = screen.getByLabelText('새로고침');
      expect(refreshButton).toBeDisabled();
    });
  });

  describe('error states', () => {
    it('renders 404 error with back button', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        error: '프로젝트를 찾을 수 없습니다.',
        errorType: 'not_found',
      });

      renderPage();

      expect(screen.getByText('프로젝트를 찾을 수 없습니다')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /돌아가기/i })).toBeInTheDocument();
    });

    it('navigates back on 404 error back button click', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        error: '프로젝트를 찾을 수 없습니다.',
        errorType: 'not_found',
      });

      renderPage();

      fireEvent.click(screen.getByRole('button', { name: /돌아가기/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('renders network error with retry button', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        error: '네트워크 연결을 확인해주세요.',
        errorType: 'network',
      });

      renderPage();

      expect(screen.getByText('네트워크 연결 오류')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /다시 시도/i })).toBeInTheDocument();
    });

    it('renders server error with retry button', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        error: '서버 오류가 발생했습니다.',
        errorType: 'server',
      });

      renderPage();

      expect(screen.getByText('서버 오류')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /다시 시도/i })).toBeInTheDocument();
    });

    it('calls fetchSessions on retry button click', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        error: '네트워크 오류',
        errorType: 'network',
      });

      renderPage();

      fireEvent.click(screen.getByRole('button', { name: /다시 시도/i }));

      // handleRefresh now calls fetchSessions directly (no setRefreshing)
      expect(mockFetchSessions).toHaveBeenCalled();
    });
  });

  describe('empty state', () => {
    it('renders empty state message when no sessions', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        currentProjectSlug: 'my-project',
      });

      renderPage();

      expect(screen.getByText('세션이 없습니다')).toBeInTheDocument();
      expect(screen.getByText(/새 세션을 시작하여/)).toBeInTheDocument();
    });

    it('renders new session button in empty state', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        currentProjectSlug: 'my-project',
      });

      renderPage();

      expect(screen.getByRole('button', { name: /새 세션 시작/i })).toBeInTheDocument();
    });

    it('navigates to new session on empty state button click', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        currentProjectSlug: 'my-project',
      });

      renderPage();

      fireEvent.click(screen.getByRole('button', { name: /새 세션 시작/i }));

      // New session now uses UUID instead of 'new'
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/\/project\/my-project\/session\/[a-f0-9-]+/));
    });
  });

  describe('session list', () => {
    it('renders session list items', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        sessions: mockSessions,
        currentProjectSlug: 'my-project',
      });

      renderPage();

      expect(screen.getByText('프로젝트 구조를 설명해줘')).toBeInTheDocument();
      expect(screen.getByText('React 컴포넌트를 작성해줘')).toBeInTheDocument();
    });

    it('renders message count for each session', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        sessions: mockSessions,
        currentProjectSlug: 'my-project',
      });

      renderPage();

      expect(screen.getByText('15개 메시지')).toBeInTheDocument();
      expect(screen.getByText('8개 메시지')).toBeInTheDocument();
    });

    it('navigates to session on click', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        sessions: mockSessions,
        currentProjectSlug: 'my-project',
      });

      renderPage();

      // Find session buttons (not header buttons)
      const sessionButtons = screen.getAllByRole('button').filter((btn) =>
        btn.getAttribute('aria-label')?.includes('세션:')
      );

      fireEvent.click(sessionButtons[0]);

      expect(mockNavigate).toHaveBeenCalledWith('/project/my-project/session/session-123');
    });
  });

  describe('header', () => {
    it('renders project slug as title', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        sessions: mockSessions,
        currentProjectSlug: 'my-project',
      });

      renderPage();

      expect(screen.getByRole('heading', { name: 'my-project' })).toBeInTheDocument();
    });

    it('renders back button', () => {
      renderPage();

      expect(screen.getByLabelText('뒤로 가기')).toBeInTheDocument();
    });

    it('navigates back on back button click', () => {
      renderPage();

      fireEvent.click(screen.getByLabelText('뒤로 가기'));

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('renders refresh button', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        sessions: mockSessions,
        currentProjectSlug: 'my-project',
      });

      renderPage();

      expect(screen.getByLabelText('새로고침')).toBeInTheDocument();
    });

    it('renders new session button in header', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        sessions: mockSessions,
        currentProjectSlug: 'my-project',
      });

      renderPage();

      expect(screen.getByRole('button', { name: /새 세션/ })).toBeInTheDocument();
    });

    it('navigates to new session on header button click', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        sessions: mockSessions,
        currentProjectSlug: 'my-project',
      });

      renderPage();

      // Get the header new session button (not the empty state one)
      const headerButtons = screen.getAllByRole('button', { name: /새 세션/ });
      fireEvent.click(headerButtons[0]);

      // New session now uses UUID instead of 'new'
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/\/project\/my-project\/session\/[a-f0-9-]+/));
    });
  });

  describe('interactions', () => {
    it('fetches sessions on mount via clearSearch (no duplicate fetchSessions)', () => {
      renderPage();

      // Mount effect calls clearSearch which internally fetches sessions
      expect(mockClearSearch).toHaveBeenCalledWith('my-project');
      // fetchSessions should NOT be called separately on mount (includeEmpty effect is skipped)
      expect(mockFetchSessions).not.toHaveBeenCalled();
    });

    it('calls fetchSessions on refresh button click', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        sessions: mockSessions,
        currentProjectSlug: 'my-project',
      });

      renderPage();

      fireEvent.click(screen.getByLabelText('새로고침'));

      // handleRefresh now calls fetchSessions directly (no setRefreshing)
      expect(mockFetchSessions).toHaveBeenCalled();
    });
  });

  describe('search UI', () => {
    it('renders search input', () => {
      renderPage();

      const searchInput = screen.getByPlaceholderText('세션 검색...');
      expect(searchInput).toBeInTheDocument();
    });

    it('search input has role="search" container and aria-label', () => {
      renderPage();

      expect(screen.getByRole('search')).toBeInTheDocument();
      const searchInput = screen.getByPlaceholderText('세션 검색...');
      expect(searchInput).toHaveAttribute('aria-label', '세션 검색...');
    });

    it('typing triggers search after 300ms debounce', () => {
      renderPage();

      const searchInput = screen.getByPlaceholderText('세션 검색...');
      fireEvent.change(searchInput, { target: { value: 'test query' } });

      // Search should NOT be called immediately
      expect(mockSearchSessions).not.toHaveBeenCalled();

      // Advance time by 300ms
      vi.advanceTimersByTime(300);

      // Search should be called after debounce
      expect(mockSearchSessions).toHaveBeenCalledWith('my-project', 'test query', false);
    });

    it('does not trigger search before 300ms', () => {
      renderPage();

      const searchInput = screen.getByPlaceholderText('세션 검색...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      vi.advanceTimersByTime(200);

      expect(mockSearchSessions).not.toHaveBeenCalled();
    });

    it('content search toggle appears when input has text', () => {
      renderPage();

      // Toggle should not be visible initially
      expect(screen.queryByText('대화 내용 검색')).not.toBeInTheDocument();

      // Type in search
      const searchInput = screen.getByPlaceholderText('세션 검색...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      // Toggle should now be visible
      expect(screen.getByText('대화 내용 검색')).toBeInTheDocument();
    });

    it('content search toggle is hidden when input is empty', () => {
      renderPage();

      const searchInput = screen.getByPlaceholderText('세션 검색...');
      fireEvent.change(searchInput, { target: { value: '' } });

      expect(screen.queryByText('대화 내용 검색')).not.toBeInTheDocument();
    });

    it('shows loading indicator when isSearching is true', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        isSearching: true,
      });

      renderPage();

      expect(screen.getByText('검색 중...')).toBeInTheDocument();
    });

    it('shows no results message when search returns empty', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        searchQuery: 'nonexistent',
      });

      renderPage();

      expect(screen.getByText('검색 결과가 없습니다')).toBeInTheDocument();
    });

    it('shows error message when search fails', () => {
      vi.mocked(useSessionStore).mockReturnValue({
        ...defaultMockState,
        searchQuery: 'failed query',
        error: 'Search failed',
        errorType: 'unknown',
      });

      renderPage();

      expect(screen.getByText('검색에 실패했습니다. 다시 시도해 주세요.')).toBeInTheDocument();
    });

    it('clearing search input restores normal session list', () => {
      renderPage();

      const searchInput = screen.getByPlaceholderText('세션 검색...');

      // Type something first
      fireEvent.change(searchInput, { target: { value: 'test' } });

      // Clear the input
      fireEvent.change(searchInput, { target: { value: '' } });

      expect(mockClearSearch).toHaveBeenCalledWith('my-project');
    });

    it('clear button calls clearSearch', () => {
      renderPage();

      // Type to show clear button
      const searchInput = screen.getByPlaceholderText('세션 검색...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      // Clear button must exist when input has text
      const clearBtn = screen.getByRole('button', { name: '검색 지우기' });
      expect(clearBtn).toBeInTheDocument();

      act(() => {
        fireEvent.click(clearBtn);
      });
      expect(mockClearSearch).toHaveBeenCalledWith('my-project');
    });
  });
});
