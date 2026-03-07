/**
 * SessionQuickAccessPanel Component Tests (Content-only, post-refactor)
 * [Source: Story 5.7 - Task 2, Story 19.1 - Task 9.3, Story 23.3 - Task 3]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SessionQuickAccessPanel } from '../SessionQuickAccessPanel';

// Mock store actions
const mockFetchSessions = vi.fn().mockResolvedValue(undefined);
const mockLoadMoreSessions = vi.fn().mockResolvedValue(undefined);
const mockSearchSessions = vi.fn().mockResolvedValue(undefined);
const mockClearSearch = vi.fn().mockResolvedValue(undefined);
const mockResetSearchState = vi.fn();

vi.mock('../../stores/sessionStore', () => ({
  useSessionStore: vi.fn(() => ({
    sessions: [],
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    error: null,
    fetchSessions: mockFetchSessions,
    loadMoreSessions: mockLoadMoreSessions,
    searchSessions: mockSearchSessions,
    clearSearch: mockClearSearch,
    resetSearchState: mockResetSearchState,
    searchQuery: '',
    isSearching: false,
  })),
}));

// Import after mock
import { useSessionStore } from '../../stores/sessionStore';

// Mock formatRelativeTime
vi.mock('../../utils/formatters', () => ({
  formatRelativeTime: vi.fn(() => '2시간 전'),
}));

const mockSessions = [
  {
    sessionId: 'session-1',
    firstPrompt: 'First session prompt',
    messageCount: 5,
    created: '2026-02-05T10:00:00Z',
    modified: '2026-02-05T12:00:00Z',
  },
  {
    sessionId: 'session-2',
    firstPrompt: 'Second session prompt',
    messageCount: 3,
    created: '2026-02-04T10:00:00Z',
    modified: '2026-02-04T14:00:00Z',
  },
];

function mockStore(overrides: Partial<ReturnType<typeof useSessionStore>> = {}) {
  vi.mocked(useSessionStore).mockReturnValue({
    sessions: [],
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    error: null,
    errorType: 'none',
    currentProjectSlug: null,
    isRefreshing: false,
    fetchSessions: mockFetchSessions,
    loadMoreSessions: mockLoadMoreSessions,
    searchSessions: mockSearchSessions,
    clearSearch: mockClearSearch,
    resetSearchState: mockResetSearchState,
    searchQuery: '',
    isSearching: false,
    clearSessions: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useSessionStore>);
}

describe('SessionQuickAccessPanel', () => {
  const defaultProps = {
    projectSlug: 'test-project',
    currentSessionId: 'session-1',
    onSelectSession: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should display session list', () => {
    mockStore({ sessions: mockSessions });

    render(<SessionQuickAccessPanel {...defaultProps} />);

    expect(screen.getByText('First session prompt')).toBeInTheDocument();
    expect(screen.getByText('Second session prompt')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should highlight the current session', () => {
    mockStore({ sessions: mockSessions });

    render(<SessionQuickAccessPanel {...defaultProps} currentSessionId="session-1" />);

    const currentItem = screen.getByTestId('session-item-session-1');
    expect(currentItem.className).toContain('border-l-blue-500');
    expect(currentItem.className).toContain('bg-blue-50');
    expect(currentItem).toHaveAttribute('aria-current', 'true');

    const otherItem = screen.getByTestId('session-item-session-2');
    expect(otherItem.className).not.toContain('border-l-blue-500');
    expect(otherItem).not.toHaveAttribute('aria-current');
  });

  it('should call onSelectSession when session is clicked', () => {
    mockStore({ sessions: mockSessions });

    const onSelectSession = vi.fn();
    render(<SessionQuickAccessPanel {...defaultProps} onSelectSession={onSelectSession} />);

    fireEvent.click(screen.getByTestId('session-item-session-2'));

    expect(onSelectSession).toHaveBeenCalledWith('session-2');
  });

  it('should show loading indicator when isLoading is true', () => {
    mockStore({ isLoading: true });

    render(<SessionQuickAccessPanel {...defaultProps} />);

    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
  });

  it('should show empty state message when no sessions', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('should call clearSearch on mount instead of fetchSessions', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    expect(mockClearSearch).toHaveBeenCalledWith('test-project');
    expect(mockFetchSessions).not.toHaveBeenCalled();
  });

  it('should call resetSearchState on unmount instead of clearSearch', () => {
    const { unmount } = render(<SessionQuickAccessPanel {...defaultProps} />);
    mockResetSearchState.mockClear();

    unmount();

    expect(mockResetSearchState).toHaveBeenCalled();
  });

  // Search tests
  it('should render search input', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    const searchInput = screen.getByTestId('search-input');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveAttribute('type', 'text');
  });

  it('should have role="search" container and aria-label on input', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    expect(screen.getByRole('search')).toBeInTheDocument();
    const searchInput = screen.getByTestId('search-input');
    expect(searchInput).toHaveAttribute('aria-label');
  });

  it('should autoFocus search input when autoFocusSearch is true', () => {
    render(<SessionQuickAccessPanel {...defaultProps} autoFocusSearch />);

    const searchInput = screen.getByTestId('search-input');
    expect(document.activeElement).toBe(searchInput);
  });

  it('should NOT autoFocus search input by default', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    const searchInput = screen.getByTestId('search-input');
    expect(document.activeElement).not.toBe(searchInput);
  });

  it('should trigger searchSessions after 300ms debounce', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'test query' } });

    // Should NOT call searchSessions before 300ms
    expect(mockSearchSessions).not.toHaveBeenCalled();

    // Advance timers by 300ms
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should call searchSessions after debounce
    expect(mockSearchSessions).toHaveBeenCalledWith('test-project', 'test query', false);
  });

  it('should NOT call searchSessions before 300ms', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Only 200ms
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(mockSearchSessions).not.toHaveBeenCalled();
  });

  it('should show loading indicator during search (isSearching = true)', () => {
    mockStore({ isSearching: true });

    render(<SessionQuickAccessPanel {...defaultProps} />);

    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
  });

  it('should show "no results" message when search returns empty and searchQuery is non-empty', () => {
    mockStore({ sessions: [], searchQuery: 'no match' });

    render(<SessionQuickAccessPanel {...defaultProps} />);

    expect(screen.getByTestId('search-no-results')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  it('should show clear button when input has text', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    // No clear button initially
    expect(screen.queryByTestId('clear-search-button')).not.toBeInTheDocument();

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'query' } });

    // Clear button should appear
    expect(screen.getByTestId('clear-search-button')).toBeInTheDocument();
  });

  it('should call clearSearch when clear button is clicked', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'query' } });

    mockClearSearch.mockClear();
    fireEvent.click(screen.getByTestId('clear-search-button'));

    expect(mockClearSearch).toHaveBeenCalledWith('test-project');
    expect((searchInput as HTMLInputElement).value).toBe('');
  });

  it('should call clearSearch when input is emptied', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'query' } });

    mockClearSearch.mockClear();
    fireEvent.change(searchInput, { target: { value: '' } });

    expect(mockClearSearch).toHaveBeenCalledWith('test-project');
  });

  it('should clear search on Escape key when input has text and stop propagation', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'query' } });

    mockClearSearch.mockClear();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');
    act(() => {
      searchInput.dispatchEvent(event);
    });

    expect(stopPropagationSpy).toHaveBeenCalled();
    expect(mockClearSearch).toHaveBeenCalledWith('test-project');
    expect((searchInput as HTMLInputElement).value).toBe('');
  });

  it('should NOT clear search on Escape key when input is empty', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    const searchInput = screen.getByTestId('search-input');
    mockClearSearch.mockClear();

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');
    act(() => {
      searchInput.dispatchEvent(event);
    });

    expect(stopPropagationSpy).not.toHaveBeenCalled();
  });

  it('should have aria-live="polite" on results container', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    const resultsContainer = screen.getByTestId('empty-state').parentElement;
    expect(resultsContainer).toHaveAttribute('aria-live', 'polite');
  });
});
