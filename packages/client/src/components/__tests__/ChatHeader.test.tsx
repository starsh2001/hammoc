/**
 * ChatHeader Component Tests
 * [Source: Story 4.1 - Task 8, Story 4.7 - Task 7]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatHeader } from '../ChatHeader';

// Mock useWebSocket hook
const mockConnect = vi.fn();
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    connectionStatus: 'connected',
    isConnected: true,
    isReconnecting: false,
    reconnectAttempt: 0,
    lastError: null,
    connect: mockConnect,
    disconnect: vi.fn(),
  })),
}));

// Import after mock
import { useWebSocket } from '../../hooks/useWebSocket';

describe('ChatHeader', () => {
  const mockOnBack = vi.fn();
  const mockOnRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(
      <ChatHeader
        projectSlug="test-project"
        onBack={mockOnBack}
        {...props}
      />
    );
  };

  describe('rendering', () => {
    it('should render with data-testid', () => {
      renderComponent();

      expect(screen.getByTestId('chat-header')).toBeInTheDocument();
    });

    it('should render project slug as title', () => {
      renderComponent({ projectSlug: 'my-project' });

      expect(screen.getByText('my-project')).toBeInTheDocument();
    });

    it('should render default title when no project slug', () => {
      renderComponent({ projectSlug: undefined });

      expect(screen.getByText('채팅')).toBeInTheDocument();
    });

    it('should render session title when provided', () => {
      renderComponent({ sessionTitle: 'Session 1' });

      expect(screen.getByText('Session 1')).toBeInTheDocument();
    });

    it('should not render session title when not provided', () => {
      renderComponent();

      expect(screen.queryByText(/Session/)).not.toBeInTheDocument();
    });
  });

  describe('back button', () => {
    it('should render back button when onBack is provided', () => {
      renderComponent();

      expect(screen.getByRole('button', { name: '세션 목록으로 돌아가기' })).toBeInTheDocument();
    });

    it('should not render back button when onBack is not provided', () => {
      renderComponent({ onBack: undefined });

      expect(screen.queryByRole('button', { name: '세션 목록으로 돌아가기' })).not.toBeInTheDocument();
    });

    it('should call onBack when back button clicked', () => {
      renderComponent();

      fireEvent.click(screen.getByRole('button', { name: '세션 목록으로 돌아가기' }));

      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('new session button', () => {
    const mockOnNewSession = vi.fn();

    it('should render new session button when onNewSession is provided', () => {
      renderComponent({ onNewSession: mockOnNewSession });

      expect(screen.getByRole('button', { name: '새 세션 시작' })).toBeInTheDocument();
    });

    it('should not render new session button when onNewSession is not provided', () => {
      renderComponent();

      expect(screen.queryByRole('button', { name: '새 세션 시작' })).not.toBeInTheDocument();
    });

    it('should call onNewSession when new session button clicked', () => {
      renderComponent({ onNewSession: mockOnNewSession });

      fireEvent.click(screen.getByRole('button', { name: '새 세션 시작' }));

      expect(mockOnNewSession).toHaveBeenCalledTimes(1);
    });

    it('should have aria-label on new session button', () => {
      renderComponent({ onNewSession: mockOnNewSession });

      const button = screen.getByRole('button', { name: '새 세션 시작' });
      expect(button).toHaveAttribute('aria-label', '새 세션 시작');
    });

    it('should render Plus icon with aria-hidden', () => {
      renderComponent({ onNewSession: mockOnNewSession });

      const button = screen.getByRole('button', { name: '새 세션 시작' });
      const svg = button.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  // Story 5.7 - Task 1: Session history button tests
  describe('session history button', () => {
    const mockOnShowSessions = vi.fn();

    it('should render History button when onShowSessions is provided', () => {
      renderComponent({ onShowSessions: mockOnShowSessions });

      expect(screen.getByRole('button', { name: '세션 목록' })).toBeInTheDocument();
    });

    it('should not render History button when onShowSessions is not provided', () => {
      renderComponent();

      expect(screen.queryByRole('button', { name: '세션 목록' })).not.toBeInTheDocument();
    });

    it('should call onShowSessions when History button clicked', () => {
      renderComponent({ onShowSessions: mockOnShowSessions });

      fireEvent.click(screen.getByRole('button', { name: '세션 목록' }));

      expect(mockOnShowSessions).toHaveBeenCalledTimes(1);
    });
  });

  describe('refresh button', () => {
    it('should render refresh button when onRefresh is provided', () => {
      renderComponent({ onRefresh: mockOnRefresh });

      expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument();
    });

    it('should not render refresh button when onRefresh is not provided', () => {
      renderComponent();

      expect(screen.queryByRole('button', { name: '새로고침' })).not.toBeInTheDocument();
    });

    it('should call onRefresh when refresh button clicked', () => {
      renderComponent({ onRefresh: mockOnRefresh });

      fireEvent.click(screen.getByRole('button', { name: '새로고침' }));

      expect(mockOnRefresh).toHaveBeenCalledTimes(1);
    });

    it('should show "새로고침 중" label when isRefreshing is true', () => {
      renderComponent({ onRefresh: mockOnRefresh, isRefreshing: true });

      expect(screen.getByRole('button', { name: '새로고침 중' })).toBeInTheDocument();
    });

    it('should disable refresh button when isRefreshing is true', () => {
      renderComponent({ onRefresh: mockOnRefresh, isRefreshing: true });

      expect(screen.getByRole('button', { name: '새로고침 중' })).toBeDisabled();
    });
  });

  describe('accessibility', () => {
    it('should be rendered as header element', () => {
      renderComponent();

      const header = screen.getByTestId('chat-header');
      expect(header.tagName).toBe('HEADER');
    });

    it('should have aria-label', () => {
      renderComponent();

      expect(screen.getByTestId('chat-header')).toHaveAttribute('aria-label', '채팅 헤더');
    });

    it('should have accessible back button', () => {
      renderComponent();

      const backButton = screen.getByRole('button', { name: '세션 목록으로 돌아가기' });
      expect(backButton).toHaveAttribute('aria-label', '세션 목록으로 돌아가기');
    });
  });

  describe('dark mode', () => {
    it('should have dark mode classes', () => {
      renderComponent();

      const header = screen.getByTestId('chat-header');
      expect(header.className).toContain('dark:bg-gray-800');
      expect(header.className).toContain('dark:border-gray-700');
    });
  });

  // Story 5.6 - Task 8: Context usage display tests
  describe('context usage display', () => {
    it('should render ContextUsageDisplay when contextUsage is provided', () => {
      renderComponent({
        contextUsage: {
          inputTokens: 100000,
          outputTokens: 500,
          cacheReadInputTokens: 50000,
          cacheCreationInputTokens: 3000,
          totalCostUSD: 0.03,
          contextWindow: 200000,
        },
      });

      expect(screen.getByTestId('context-usage-display')).toBeInTheDocument();
    });

    it('should not render ContextUsageDisplay when contextUsage is not provided', () => {
      renderComponent();

      expect(screen.queryByTestId('context-usage-display')).not.toBeInTheDocument();
    });
  });

  // Story 8.5 - Agent indicator tests
  describe('agent indicator', () => {
    it('should show agent icon and name when activeAgent is provided (AC 1, 2)', () => {
      renderComponent({
        sessionTitle: 'test-session',
        activeAgent: { name: 'PM (Product Manager)', icon: '📋' },
        isBmadProject: true,
      });

      const indicator = screen.getByTestId('agent-indicator');
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveTextContent('📋');
      expect(indicator).toHaveTextContent('PM (Product Manager)');
    });

    it('should show "Claude" when activeAgent is null and isBmadProject is true (AC 3)', () => {
      renderComponent({
        sessionTitle: 'test-session',
        activeAgent: null,
        isBmadProject: true,
      });

      const indicator = screen.getByTestId('agent-indicator');
      expect(indicator).toHaveTextContent('Claude');
    });

    it('should not show indicator when isBmadProject is false', () => {
      renderComponent({
        sessionTitle: 'test-session',
        activeAgent: { name: 'PM', icon: '📋' },
        isBmadProject: false,
      });

      expect(screen.queryByTestId('agent-indicator')).not.toBeInTheDocument();
    });

    it('should call onAgentIndicatorClick when clicked (AC 4)', () => {
      const mockOnAgentIndicatorClick = vi.fn();
      renderComponent({
        sessionTitle: 'test-session',
        activeAgent: { name: 'PM', icon: '📋' },
        isBmadProject: true,
        onAgentIndicatorClick: mockOnAgentIndicatorClick,
      });

      fireEvent.click(screen.getByTestId('agent-indicator'));
      expect(mockOnAgentIndicatorClick).toHaveBeenCalledTimes(1);
    });

    it('should call onAgentIndicatorClick on Enter/Space key (keyboard accessibility)', () => {
      const mockOnAgentIndicatorClick = vi.fn();
      renderComponent({
        sessionTitle: 'test-session',
        activeAgent: { name: 'PM', icon: '📋' },
        isBmadProject: true,
        onAgentIndicatorClick: mockOnAgentIndicatorClick,
      });

      const indicator = screen.getByTestId('agent-indicator');
      fireEvent.keyDown(indicator, { key: 'Enter' });
      expect(mockOnAgentIndicatorClick).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(indicator, { key: ' ' });
      expect(mockOnAgentIndicatorClick).toHaveBeenCalledTimes(2);
    });
  });

  // Story 4.7 - Task 7: Connection status display tests
  describe('connection status', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should render ConnectionStatusIndicator', () => {
      renderComponent();

      expect(screen.getByTestId('connection-status-indicator')).toBeInTheDocument();
    });

    it('should display green icon for connected status', () => {
      vi.mocked(useWebSocket).mockReturnValue({
        connectionStatus: 'connected',
        isConnected: true,
        isReconnecting: false,
        reconnectAttempt: 0,
        lastError: null,
        connect: mockConnect,
        disconnect: vi.fn(),
      });

      const { container } = renderComponent();

      const svgIcon = container.querySelector('[data-testid="connection-status-indicator"] svg');
      expect(svgIcon?.getAttribute('class')).toContain('text-green-500');
    });

    it('should display red icon for disconnected status', () => {
      vi.mocked(useWebSocket).mockReturnValue({
        connectionStatus: 'disconnected',
        isConnected: false,
        isReconnecting: false,
        reconnectAttempt: 0,
        lastError: 'Connection failed',
        connect: mockConnect,
        disconnect: vi.fn(),
      });

      const { container } = renderComponent();

      const svgIcon = container.querySelector('[data-testid="connection-status-indicator"] svg');
      expect(svgIcon?.getAttribute('class')).toContain('text-red-500');
    });

    it('should display yellow spinning icon for reconnecting status', () => {
      vi.mocked(useWebSocket).mockReturnValue({
        connectionStatus: 'reconnecting',
        isConnected: false,
        isReconnecting: true,
        reconnectAttempt: 2,
        lastError: null,
        connect: mockConnect,
        disconnect: vi.fn(),
      });

      const { container } = renderComponent();

      const svgIcon = container.querySelector('[data-testid="connection-status-indicator"] svg');
      expect(svgIcon?.getAttribute('class')).toContain('text-yellow-500');
      expect(svgIcon?.getAttribute('class')).toContain('animate-spin');
    });

    it('should call connect when reconnect button is clicked', () => {
      vi.mocked(useWebSocket).mockReturnValue({
        connectionStatus: 'disconnected',
        isConnected: false,
        isReconnecting: false,
        reconnectAttempt: 0,
        lastError: 'Connection failed',
        connect: mockConnect,
        disconnect: vi.fn(),
      });

      renderComponent();

      const reconnectButton = screen.getByRole('button', { name: /서버에 다시 연결 시도/i });
      fireEvent.click(reconnectButton);

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should show error message in tooltip when lastError is present', () => {
      const errorMessage = 'Connection timeout';
      vi.mocked(useWebSocket).mockReturnValue({
        connectionStatus: 'disconnected',
        isConnected: false,
        isReconnecting: false,
        reconnectAttempt: 0,
        lastError: errorMessage,
        connect: mockConnect,
        disconnect: vi.fn(),
      });

      renderComponent();

      const statusIndicator = screen.getByTestId('connection-status-indicator');
      expect(statusIndicator).toHaveAttribute('title', errorMessage);
    });

    it('should have proper accessibility attributes on connection status', () => {
      renderComponent();

      const statusIndicator = screen.getByTestId('connection-status-indicator');
      expect(statusIndicator).toHaveAttribute('role', 'status');
      expect(statusIndicator).toHaveAttribute('aria-live', 'polite');
    });
  });
});
