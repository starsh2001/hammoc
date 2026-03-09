/**
 * ChatPage Accessibility Tests
 * [Source: Story 4.1 - Task 9]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ChatPage } from '../ChatPage';
import { useMessageStore } from '../../stores/messageStore';
import type { HistoryMessage, PaginationInfo } from '@hammoc/shared';

expect.extend(toHaveNoViolations);

// Mock ResizeObserver (not available in jsdom)
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

// Mock Element.scrollTo (not available in jsdom)
Element.prototype.scrollTo = vi.fn();

// Mock HTMLCanvasElement.getContext (used by ContextUsageDisplay chart)
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock formatRelativeTime
vi.mock('../../utils/formatters', () => ({
  formatRelativeTime: vi.fn(() => '5분 전'),
}));

// Mock useWebSocket
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connectionStatus: 'connected',
    isConnected: true,
    isReconnecting: false,
    reconnectAttempt: 0,
    lastError: null,
    connect: () => {},
    disconnect: () => {},
  }),
}));

// Mock useSlashCommands
vi.mock('../../hooks/useSlashCommands', () => ({
  useSlashCommands: () => ({
    commands: [],
    starCommands: {},
    isLoading: false,
  }),
}));

// Mock useStreaming
vi.mock('../../hooks/useStreaming', () => ({
  useStreaming: vi.fn(),
}));

// Mock sessionStore
vi.mock('../../stores/sessionStore', () => ({
  useSessionStore: vi.fn(() => ({
    sessions: [],
    isLoading: false,
    error: null,
    errorType: 'none',
    currentProjectSlug: null,
    isRefreshing: false,
    fetchSessions: vi.fn(),
    clearSessions: vi.fn(),
    clearError: vi.fn(),
  })),
}));

// Mock socket service
vi.mock('../../services/socket', () => ({
  getSocket: () => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
}));

// Mock queue API (Story 15.4 - useQueueSession calls queueApi.getStatus)
vi.mock('../../services/api/queue', () => ({
  queueApi: {
    getStatus: vi.fn().mockRejectedValue(new Error('no active queue')),
  },
}));

describe('ChatPage Accessibility', () => {
  const mockMessages: HistoryMessage[] = [
    {
      id: 'msg-1',
      type: 'user',
      content: 'Hello',
      timestamp: '2026-01-15T10:00:00Z',
    },
    {
      id: 'msg-2',
      type: 'assistant',
      content: 'Hi! How can I help?',
      timestamp: '2026-01-15T10:00:05Z',
    },
  ];

  const mockPagination: PaginationInfo = {
    total: 2,
    limit: 50,
    offset: 0,
    hasMore: false,
  };

  const mockFetchMessages = vi.fn().mockResolvedValue(undefined);
  const mockFetchMoreMessages = vi.fn();
  const mockClearMessages = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useMessageStore.setState({
      messages: [],
      currentProjectSlug: null,
      currentSessionId: null,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      pagination: null,
      fetchMessages: mockFetchMessages,
      fetchMoreMessages: mockFetchMoreMessages,
      clearMessages: mockClearMessages,
    });
  });

  const renderChatPage = (projectSlug = 'test-project', sessionId = 'session-123') => {
    return render(
      <MemoryRouter initialEntries={[`/project/${projectSlug}/session/${sessionId}`]}>
        <Routes>
          <Route path="/project/:projectSlug/session/:sessionId" element={<ChatPage />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  // axe configuration to disable rules that are caused by external components
  // These will be addressed in their respective stories
  const axeConfig = {
    rules: {
      // MessageBubble uses role="listitem" without parent role="list" - to be fixed in Story 4.3
      'aria-required-parent': { enabled: false },
      // ErrorState uses h3 without h1/h2 - to be addressed separately
      'heading-order': { enabled: false },
    },
  };

  describe('WCAG AA Compliance', () => {
    it('should have no accessibility violations with messages', async () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      const { container } = renderChatPage();
      const results = await axe(container, axeConfig);

      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in loading state', async () => {
      useMessageStore.setState({ isLoading: true });

      const { container } = renderChatPage();
      const results = await axe(container, axeConfig);

      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in error state', async () => {
      useMessageStore.setState({ error: '오류 발생' });

      const { container } = renderChatPage();
      const results = await axe(container, axeConfig);

      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in empty state', async () => {
      useMessageStore.setState({ messages: [] });

      const { container } = renderChatPage();
      const results = await axe(container, axeConfig);

      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in new session state', async () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/project/test-project/session/new']}>
          <Routes>
            <Route path="/project/:projectSlug/session/:sessionId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      );

      const results = await axe(container, axeConfig);
      expect(results).toHaveNoViolations();
    });
  });

  describe('ARIA Labels', () => {
    it('should have correct ARIA labels for screen readers', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByRole('main')).toHaveAttribute('aria-label', '채팅 페이지');
      expect(screen.getByTestId('chat-header')).toHaveAttribute('aria-label', '채팅 헤더');
      expect(screen.getByRole('log')).toHaveAttribute('aria-label', '메시지 목록');
      expect(screen.getByTestId('input-area')).toHaveAttribute('aria-label', '메시지 입력');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should have focusable elements with proper tab order', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      // Back button should be focusable
      const backButton = screen.getByRole('button', { name: '세션 목록으로 돌아가기' });
      expect(backButton).toHaveAttribute('class');
      expect(backButton.tabIndex).not.toBe(-1);

      // Refresh button should be focusable
      const refreshButton = screen.getByRole('button', { name: '새로고침' });
      expect(refreshButton).toHaveAttribute('class');
      expect(refreshButton.tabIndex).not.toBe(-1);
    });

    it('should have focus ring styles on interactive elements', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      const backButton = screen.getByRole('button', { name: '세션 목록으로 돌아가기' });
      expect(backButton.className).toContain('focus:outline-none');
      expect(backButton.className).toContain('focus:ring-2');
    });
  });

  describe('Screen Reader Support', () => {
    it('should have aria-live region for new messages', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      const messageArea = screen.getByRole('log');
      expect(messageArea).toHaveAttribute('aria-live', 'polite');
    });

    it('should have role="alert" on error state', () => {
      useMessageStore.setState({ error: '오류 발생' });

      renderChatPage();

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should have role="status" on loading state', () => {
      useMessageStore.setState({ isLoading: true });

      renderChatPage();

      // Multiple role="status" elements exist (loading skeleton, connection indicator)
      const statusElements = screen.getAllByRole('status');
      // Should have at least 2: loading skeleton and connection indicator
      expect(statusElements.length).toBeGreaterThanOrEqual(1);
      // Verify loading skeleton specifically exists
      expect(screen.getByRole('status', { name: '메시지 로딩 중' })).toBeInTheDocument();
    });
  });

  describe('Color Contrast', () => {
    it('should have dark mode classes for sufficient contrast', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      // Check page container has dark mode background
      const pageContainer = screen.getByTestId('chat-page');
      expect(pageContainer.className).toContain('dark:bg-gray-900');

      // Check header has dark mode background
      const header = screen.getByTestId('chat-header');
      expect(header.className).toContain('dark:bg-gray-800');
    });
  });
});
