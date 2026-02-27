/**
 * SessionQuickAccessPanel Component Tests (Content-only, post-refactor)
 * [Source: Story 5.7 - Task 2, Story 19.1 - Task 9.3]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionQuickAccessPanel } from '../SessionQuickAccessPanel';

// Mock sessionStore
const mockFetchSessions = vi.fn();
vi.mock('../../stores/sessionStore', () => ({
  useSessionStore: vi.fn(() => ({
    sessions: [],
    isLoading: false,
    error: null,
    fetchSessions: mockFetchSessions,
  })),
}));

// Import after mock
import { useSessionStore } from '../../stores/sessionStore';

// Mock formatRelativeTime
vi.mock('../../utils/formatters', () => ({
  formatRelativeTime: vi.fn((date: string) => '2시간 전'),
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

describe('SessionQuickAccessPanel', () => {
  const defaultProps = {
    projectSlug: 'test-project',
    currentSessionId: 'session-1',
    onSelectSession: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSessionStore).mockReturnValue({
      sessions: [],
      isLoading: false,
      error: null,
      errorType: 'none',
      currentProjectSlug: null,
      isRefreshing: false,
      fetchSessions: mockFetchSessions,
      clearSessions: vi.fn(),
      clearError: vi.fn(),
      setRefreshing: vi.fn(),
    } as ReturnType<typeof useSessionStore>);
  });

  it('should display session list', () => {
    vi.mocked(useSessionStore).mockReturnValue({
      sessions: mockSessions,
      isLoading: false,
      error: null,
      errorType: 'none',
      currentProjectSlug: 'test-project',
      isRefreshing: false,
      fetchSessions: mockFetchSessions,
      clearSessions: vi.fn(),
      clearError: vi.fn(),
      setRefreshing: vi.fn(),
    } as ReturnType<typeof useSessionStore>);

    render(<SessionQuickAccessPanel {...defaultProps} />);

    expect(screen.getByText('First session prompt')).toBeInTheDocument();
    expect(screen.getByText('Second session prompt')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should highlight the current session', () => {
    vi.mocked(useSessionStore).mockReturnValue({
      sessions: mockSessions,
      isLoading: false,
      error: null,
      errorType: 'none',
      currentProjectSlug: 'test-project',
      isRefreshing: false,
      fetchSessions: mockFetchSessions,
      clearSessions: vi.fn(),
      clearError: vi.fn(),
      setRefreshing: vi.fn(),
    } as ReturnType<typeof useSessionStore>);

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
    vi.mocked(useSessionStore).mockReturnValue({
      sessions: mockSessions,
      isLoading: false,
      error: null,
      errorType: 'none',
      currentProjectSlug: 'test-project',
      isRefreshing: false,
      fetchSessions: mockFetchSessions,
      clearSessions: vi.fn(),
      clearError: vi.fn(),
      setRefreshing: vi.fn(),
    } as ReturnType<typeof useSessionStore>);

    const onSelectSession = vi.fn();
    render(<SessionQuickAccessPanel {...defaultProps} onSelectSession={onSelectSession} />);

    fireEvent.click(screen.getByTestId('session-item-session-2'));

    expect(onSelectSession).toHaveBeenCalledWith('session-2');
  });

  it('should show loading indicator when isLoading is true', () => {
    vi.mocked(useSessionStore).mockReturnValue({
      sessions: [],
      isLoading: true,
      error: null,
      errorType: 'none',
      currentProjectSlug: 'test-project',
      isRefreshing: false,
      fetchSessions: mockFetchSessions,
      clearSessions: vi.fn(),
      clearError: vi.fn(),
      setRefreshing: vi.fn(),
    } as ReturnType<typeof useSessionStore>);

    render(<SessionQuickAccessPanel {...defaultProps} />);

    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
  });

  it('should show empty state message when no sessions', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('세션이 없습니다')).toBeInTheDocument();
  });

  it('should call fetchSessions on mount', () => {
    render(<SessionQuickAccessPanel {...defaultProps} />);

    expect(mockFetchSessions).toHaveBeenCalledWith('test-project', { limit: 20 });
  });
});
