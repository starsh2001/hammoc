/**
 * ChatPage Tests
 * [Source: Story 4.1 - Task 8]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ChatPage } from '../ChatPage';
import { useMessageStore } from '../../stores/messageStore';
import { useChatStore } from '../../stores/chatStore';
import type { HistoryMessage, PaginationInfo } from '@bmad-studio/shared';

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

describe('ChatPage', () => {
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

  const mockFetchMessages = vi.fn();
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

  afterEach(() => {
    vi.resetAllMocks();
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

  describe('Layout structure', () => {
    it('should render main with chat-page testid', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByTestId('chat-page')).toBeInTheDocument();
    });

    it('should render header, message area, and input area', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByTestId('chat-header')).toBeInTheDocument();
      expect(screen.getByTestId('message-area')).toBeInTheDocument();
      expect(screen.getByTestId('input-area')).toBeInTheDocument();
    });

    it('should have correct ARIA roles', () => {
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

  describe('Message fetching', () => {
    it('should fetch messages on mount', () => {
      renderChatPage();

      expect(mockFetchMessages).toHaveBeenCalledWith('test-project', 'session-123');
    });

    it('should clear messages on unmount', () => {
      const { unmount } = renderChatPage();

      unmount();

      expect(mockClearMessages).toHaveBeenCalled();
    });

    it('should not fetch messages for new session', () => {
      render(
        <MemoryRouter initialEntries={['/project/test-project/session/new']}>
          <Routes>
            <Route path="/project/:projectSlug/session/:sessionId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(mockFetchMessages).not.toHaveBeenCalled();
    });
  });

  describe('Loading state', () => {
    it('should show loading skeleton when isLoading is true', () => {
      useMessageStore.setState({ isLoading: true });

      renderChatPage();

      expect(screen.getByRole('status', { name: '메시지 로딩 중' })).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('should show error state when error exists', () => {
      useMessageStore.setState({ error: '세션을 찾을 수 없습니다.' });

      renderChatPage();

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('다시 시도')).toBeInTheDocument();
    });

    it('should retry fetch when retry button clicked in error state', async () => {
      useMessageStore.setState({ error: '오류 발생' });

      renderChatPage();

      const retryButton = screen.getByText('다시 시도');
      fireEvent.click(retryButton);

      expect(mockFetchMessages).toHaveBeenCalledWith('test-project', 'session-123');
    });
  });

  describe('Empty state', () => {
    it('should show empty state when no messages', () => {
      useMessageStore.setState({ messages: [] });

      renderChatPage();

      expect(screen.getByText('메시지가 없습니다')).toBeInTheDocument();
    });
  });

  describe('New session state', () => {
    it('should show new session state for session/new', () => {
      render(
        <MemoryRouter initialEntries={['/project/test-project/session/new']}>
          <Routes>
            <Route path="/project/:projectSlug/session/:sessionId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('새 세션')).toBeInTheDocument();
    });
  });

  describe('Messages rendering', () => {
    it('should render messages when loaded', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Hi! How can I help?')).toBeInTheDocument();
    });

    it('should render tool_use messages as ToolCallCard', () => {
      const toolMessage: HistoryMessage = {
        id: 'msg-tool',
        type: 'tool_use',
        content: 'Calling Read',
        timestamp: '2026-01-15T10:00:00Z',
        toolName: 'Read',
        toolInput: { file_path: '/index.ts' },
      };

      useMessageStore.setState({
        messages: [toolMessage],
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByText('Read')).toBeInTheDocument();
    });
  });

  describe('Header functionality', () => {
    it('should display project slug in header', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage('my-project');

      expect(screen.getByText('my-project')).toBeInTheDocument();
    });

    it('should navigate back when back button clicked', async () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      const backButton = screen.getByRole('button', { name: '세션 목록으로 돌아가기' });
      fireEvent.click(backButton);

      expect(mockNavigate).toHaveBeenCalledWith('/project/test-project');
    });

    it('should have refresh button in header when messages are shown', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument();
    });

    it('should call fetchMessages on refresh click', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      fireEvent.click(screen.getByRole('button', { name: '새로고침' }));

      expect(mockFetchMessages).toHaveBeenCalledWith('test-project', 'session-123');
    });
  });

  describe('Pagination', () => {
    it('should show load more button when hasMore is true', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: { ...mockPagination, hasMore: true },
      });

      renderChatPage();

      expect(screen.getByText('이전 메시지 더 보기')).toBeInTheDocument();
    });

    it('should call fetchMoreMessages when load more clicked', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: { ...mockPagination, hasMore: true },
      });

      renderChatPage();

      fireEvent.click(screen.getByText('이전 메시지 더 보기'));

      expect(mockFetchMoreMessages).toHaveBeenCalled();
    });

    it('should show loading text when loadingMore', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: { ...mockPagination, hasMore: true },
        isLoadingMore: true,
      });

      renderChatPage();

      expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have aria-live on message area', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('PermissionModeSelector integration (Story 5.2)', () => {
    it('should render PermissionModeSelector in new session state', () => {
      render(
        <MemoryRouter initialEntries={['/project/test-project/session/new']}>
          <Routes>
            <Route path="/project/:projectSlug/session/:sessionId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByRole('radiogroup', { name: 'Permission mode' })).toBeInTheDocument();
      expect(screen.getByText('Plan')).toBeInTheDocument();
      expect(screen.getByText('Ask')).toBeInTheDocument();
      expect(screen.getByText('Auto')).toBeInTheDocument();
    });

    it('should render PermissionModeSelector in messages state', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByRole('radiogroup', { name: 'Permission mode' })).toBeInTheDocument();
    });

    it('should render PermissionModeSelector in loading state (disabled)', () => {
      useMessageStore.setState({ isLoading: true });

      renderChatPage();

      expect(screen.getByRole('radiogroup', { name: 'Permission mode' })).toBeInTheDocument();
      const radios = screen.getAllByRole('radio');
      radios.forEach((radio) => {
        expect(radio).toBeDisabled();
      });
    });

    it('should render PermissionModeSelector in error state (disabled)', () => {
      useMessageStore.setState({ error: '오류 발생' });

      renderChatPage();

      expect(screen.getByRole('radiogroup', { name: 'Permission mode' })).toBeInTheDocument();
      const radios = screen.getAllByRole('radio');
      radios.forEach((radio) => {
        expect(radio).toBeDisabled();
      });
    });

    it('should render PermissionModeSelector in empty state', () => {
      useMessageStore.setState({ messages: [] });

      renderChatPage();

      expect(screen.getByRole('radiogroup', { name: 'Permission mode' })).toBeInTheDocument();
    });

    it('should call setPermissionMode when a mode is clicked', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      fireEvent.click(screen.getByText('Plan'));
      expect(useChatStore.getState().permissionMode).toBe('plan');
    });
  });
});
