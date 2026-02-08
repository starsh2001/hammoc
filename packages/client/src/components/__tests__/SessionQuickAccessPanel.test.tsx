/**
 * SessionQuickAccessPanel Component Tests
 * [Source: Story 5.7 - Task 2]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    isOpen: false,
    projectSlug: 'test-project',
    currentSessionId: 'session-1',
    onSelectSession: vi.fn(),
    onClose: vi.fn(),
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

  // Test 1: isOpen=false renders nothing
  it('should render nothing when isOpen is false', () => {
    render(<SessionQuickAccessPanel {...defaultProps} isOpen={false} />);

    expect(screen.queryByTestId('session-quick-access-panel')).not.toBeInTheDocument();
  });

  // Test 2: isOpen=true renders panel
  it('should render panel when isOpen is true', () => {
    render(<SessionQuickAccessPanel {...defaultProps} isOpen={true} />);

    expect(screen.getByTestId('session-quick-access-panel')).toBeInTheDocument();
    expect(screen.getByText('세션 목록')).toBeInTheDocument();
  });

  // Test 3: Session list is displayed
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

    render(<SessionQuickAccessPanel {...defaultProps} isOpen={true} />);

    expect(screen.getByText('First session prompt')).toBeInTheDocument();
    expect(screen.getByText('Second session prompt')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  // Test 4: Current session is highlighted
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

    render(
      <SessionQuickAccessPanel
        {...defaultProps}
        isOpen={true}
        currentSessionId="session-1"
      />
    );

    const currentItem = screen.getByTestId('session-item-session-1');
    expect(currentItem.className).toContain('border-l-blue-500');
    expect(currentItem.className).toContain('bg-blue-50');
    expect(currentItem).toHaveAttribute('aria-current', 'true');

    const otherItem = screen.getByTestId('session-item-session-2');
    expect(otherItem.className).not.toContain('border-l-blue-500');
    expect(otherItem).not.toHaveAttribute('aria-current');
  });

  // Test 5: Session click calls onSelectSession
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
    render(
      <SessionQuickAccessPanel
        {...defaultProps}
        isOpen={true}
        onSelectSession={onSelectSession}
      />
    );

    fireEvent.click(screen.getByTestId('session-item-session-2'));

    expect(onSelectSession).toHaveBeenCalledWith('session-2');
  });

  // Test 6: Escape key calls onClose
  it('should call onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <SessionQuickAccessPanel {...defaultProps} isOpen={true} onClose={onClose} />
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Test 7: Backdrop click calls onClose
  it('should call onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <SessionQuickAccessPanel {...defaultProps} isOpen={true} onClose={onClose} />
    );

    fireEvent.click(screen.getByTestId('session-panel-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Test 8: Close button calls onClose
  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <SessionQuickAccessPanel {...defaultProps} isOpen={true} onClose={onClose} />
    );

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Test 9: Loading indicator
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

    render(<SessionQuickAccessPanel {...defaultProps} isOpen={true} />);

    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
  });

  // Test 10: Empty state message
  it('should show empty state message when no sessions', () => {
    render(<SessionQuickAccessPanel {...defaultProps} isOpen={true} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('세션이 없습니다')).toBeInTheDocument();
  });

  // Test 12: fetchSessions is called when isOpen changes to true
  it('should call fetchSessions when isOpen changes to true', () => {
    render(<SessionQuickAccessPanel {...defaultProps} isOpen={true} />);

    expect(mockFetchSessions).toHaveBeenCalledWith('test-project');
  });

  // Test 13: Focus moves into panel when isOpen is true
  it('should move focus into panel when opened', async () => {
    render(<SessionQuickAccessPanel {...defaultProps} isOpen={true} />);

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: '닫기' })
      );
    });
  });

  // Test 14: Tab key cycles focus within panel
  it('should trap focus within panel on Tab key', async () => {
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

    render(<SessionQuickAccessPanel {...defaultProps} isOpen={true} />);

    // Wait for focus to move to close button
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: '닫기' })
      );
    });

    // Get all focusable elements in panel
    const panel = screen.getByTestId('session-quick-access-panel');
    const focusableElements = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus the last element
    act(() => {
      lastElement.focus();
    });

    // Press Tab on the last element - should wrap to the first
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(document.activeElement).toBe(focusableElements[0]);
  });

  // Test: Accessibility attributes
  it('should have proper accessibility attributes', () => {
    render(<SessionQuickAccessPanel {...defaultProps} isOpen={true} />);

    const panel = screen.getByTestId('session-quick-access-panel');
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAttribute('aria-label', '세션 목록 패널');
    expect(panel).toHaveAttribute('aria-modal', 'true');
  });
});
