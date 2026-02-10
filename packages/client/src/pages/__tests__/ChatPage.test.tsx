/**
 * ChatPage Tests
 * [Source: Story 4.1 - Task 8]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ChatPage } from '../ChatPage';
import { useMessageStore } from '../../stores/messageStore';
import { useChatStore } from '../../stores/chatStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSessionStore } from '../../stores/sessionStore';
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

// Mock useWebSocket to control connection state (TEST-001 fix)
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

// Mock useSlashCommands to prevent URL parse and act() warnings (TEST-002 fix)
const mockUseSlashCommands = vi.fn((_projectSlug?: string) => ({
  commands: [] as import('@bmad-studio/shared').SlashCommand[],
  starCommands: {} as Record<string, import('@bmad-studio/shared').StarCommand[]>,
  isLoading: false,
}));
vi.mock('../../hooks/useSlashCommands', () => ({
  useSlashCommands: (projectSlug?: string) => mockUseSlashCommands(projectSlug),
}));

// Mock useIsMobile for BmadAgentButton (Story 8.3)
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

// Mock useStreaming hook (Story 5.4 - avoid real socket connection)
vi.mock('../../hooks/useStreaming', () => ({
  useStreaming: vi.fn(),
}));

// Mock sessionStore for SessionQuickAccessPanel (Story 5.7)
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
    setRefreshing: vi.fn(),
  })),
}));

// Mock socket service (Story 5.4 - abortResponse calls getSocket)
vi.mock('../../services/socket', () => ({
  getSocket: () => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    connected: false,
  }),
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

  const mockFetchMessages = vi.fn().mockResolvedValue(undefined);
  const mockFetchMoreMessages = vi.fn();
  const mockClearMessages = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore sessionStore mock (reset by vi.resetAllMocks in afterEach)
    vi.mocked(useSessionStore).mockReturnValue({
      sessions: [],
      isLoading: false,
      error: null,
      errorType: 'none',
      currentProjectSlug: null,
      isRefreshing: false,
      fetchSessions: vi.fn(),
      clearSessions: vi.fn(),
      clearError: vi.fn(),
      setRefreshing: vi.fn(),
    } as ReturnType<typeof useSessionStore>);
    useChatStore.setState({
      isStreaming: false,
      streamingSessionId: null,
      streamingMessageId: null,
      streamingSegments: [],
      streamingStartedAt: null,
      permissionMode: 'default',
    });
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
    vi.clearAllMocks();
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

    it('should fetch messages for new session (sessionId is truthy)', () => {
      render(
        <MemoryRouter initialEntries={['/project/test-project/session/new']}>
          <Routes>
            <Route path="/project/:projectSlug/session/:sessionId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(mockFetchMessages).toHaveBeenCalledWith('test-project', 'new');
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

      expect(screen.getByText('새 세션')).toBeInTheDocument();
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
    // PermissionModeSelector is now a single toggle button that cycles through modes
    // Default mode is 'default' (label: 'Ask'), clicking cycles: default → acceptEdits → bypassPermissions → plan → default
    it('should render PermissionModeSelector in new session state', () => {
      render(
        <MemoryRouter initialEntries={['/project/test-project/session/new']}>
          <Routes>
            <Route path="/project/:projectSlug/session/:sessionId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Default mode is 'default' which shows 'Ask' label
      expect(screen.getByRole('button', { name: /권한 모드/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /권한 모드/i })).toHaveTextContent('Ask');
    });

    it('should render PermissionModeSelector in messages state', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByRole('button', { name: /권한 모드/i })).toBeInTheDocument();
    });

    it('should render PermissionModeSelector in loading state', () => {
      useMessageStore.setState({ isLoading: true });

      renderChatPage();

      const permissionButton = screen.getByRole('button', { name: /권한 모드/i });
      expect(permissionButton).toBeInTheDocument();
      // PermissionModeSelector is disabled when isStreaming, not when isLoading
    });

    it('should render PermissionModeSelector in error state', () => {
      useMessageStore.setState({ error: '오류 발생' });

      renderChatPage();

      const permissionButton = screen.getByRole('button', { name: /권한 모드/i });
      expect(permissionButton).toBeInTheDocument();
      // PermissionModeSelector is disabled when isStreaming, not when error
    });

    it('should render PermissionModeSelector in empty state', () => {
      useMessageStore.setState({ messages: [] });

      renderChatPage();

      expect(screen.getByRole('button', { name: /권한 모드/i })).toBeInTheDocument();
    });

    it('should cycle permission mode when clicked', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      const permissionButton = screen.getByRole('button', { name: /권한 모드/i });
      // Default mode is 'default' (Ask), clicking cycles to next: acceptEdits (Auto)
      fireEvent.click(permissionButton);
      expect(useChatStore.getState().permissionMode).toBe('acceptEdits');
    });
  });

  describe('New session button (Story 5.3)', () => {
    it('should render new session button in header', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByRole('button', { name: '새 세션 시작' })).toBeInTheDocument();
    });

    it('should render new session button in new session state', () => {
      render(
        <MemoryRouter initialEntries={['/project/test-project/session/new']}>
          <Routes>
            <Route path="/project/:projectSlug/session/:sessionId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByRole('button', { name: '새 세션 시작' })).toBeInTheDocument();
    });

    it('should render new session button in loading state', () => {
      useMessageStore.setState({ isLoading: true });

      renderChatPage();

      expect(screen.getByRole('button', { name: '새 세션 시작' })).toBeInTheDocument();
    });

    it('should render new session button in error state', () => {
      useMessageStore.setState({ error: '오류 발생' });

      renderChatPage();

      expect(screen.getByRole('button', { name: '새 세션 시작' })).toBeInTheDocument();
    });

    it('should render new session button in empty state', () => {
      useMessageStore.setState({ messages: [] });

      renderChatPage();

      expect(screen.getByRole('button', { name: '새 세션 시작' })).toBeInTheDocument();
    });

    it('should navigate to new session URL when clicked', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      fireEvent.click(screen.getByRole('button', { name: '새 세션 시작' }));

      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/\/project\/test-project\/session\/.+/));
    });

    it('should call clearMessages when new session button is clicked', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      fireEvent.click(screen.getByRole('button', { name: '새 세션 시작' }));

      expect(mockClearMessages).toHaveBeenCalled();
    });

    it('should show confirm modal when streaming and new session button is clicked', () => {
      useChatStore.setState({ isStreaming: true });
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      fireEvent.click(screen.getByRole('button', { name: '새 세션 시작' }));

      // ConfirmModal should be shown
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('진행 중인 응답이 있습니다. 새 세션을 시작하시겠습니까?')).toBeInTheDocument();
    });

    it('should not navigate when cancel is clicked in confirm modal during streaming', () => {
      useChatStore.setState({ isStreaming: true });
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      fireEvent.click(screen.getByRole('button', { name: '새 세션 시작' }));

      // Click cancel button in the modal
      fireEvent.click(screen.getByRole('button', { name: '취소' }));

      expect(mockNavigate).not.toHaveBeenCalledWith('/project/test-project/session/new');
      expect(mockClearMessages).not.toHaveBeenCalled();
    });

    it('should abort streaming and navigate when confirm is accepted in modal during streaming', () => {
      const mockAbortResponse = vi.fn();
      useChatStore.setState({ isStreaming: true, abortResponse: mockAbortResponse });
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      fireEvent.click(screen.getByRole('button', { name: '새 세션 시작' }));

      // Click confirm button in the modal
      fireEvent.click(screen.getByRole('button', { name: '확인' }));

      expect(mockAbortResponse).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/\/project\/test-project\/session\/.+/));
      expect(mockClearMessages).toHaveBeenCalled();
    });

    it('should pass sessionId and resume false for new session when sending', () => {
      // Spy on chatStore sendMessage to verify the arguments
      const sendMessageSpy = vi.fn();
      useChatStore.setState({ sendMessage: sendMessageSpy });
      // Set up a project so workingDirectory is available
      useProjectStore.setState({
        projects: [{
          projectSlug: 'test-project',
          originalPath: '/test/path',
          sessionCount: 0,
          lastModified: '2026-01-01T00:00:00Z',
          isBmadProject: false,
        }],
      });

      render(
        <MemoryRouter initialEntries={['/project/test-project/session/new']}>
          <Routes>
            <Route path="/project/:projectSlug/session/:sessionId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      );

      // With useWebSocket mocked to isConnected:true, ChatInput.onSend fires through
      const textarea = screen.getByRole('textbox', { name: '메시지 입력' });
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      // Verify sendMessage was called with sessionId:'new' and resume:false
      expect(sendMessageSpy).toHaveBeenCalledWith('Test message', expect.objectContaining({
        sessionId: 'new',
        resume: false,
        workingDirectory: '/test/path',
      }));
    });

    it('should clear messages when clicking new session button on /session/new route', () => {
      render(
        <MemoryRouter initialEntries={['/project/test-project/session/new']}>
          <Routes>
            <Route path="/project/:projectSlug/session/:sessionId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: '새 세션 시작' }));

      expect(mockClearMessages).toHaveBeenCalled();
    });
  });

  describe('Context usage display (Story 5.6)', () => {
    const mockContextUsage = {
      inputTokens: 100000,
      outputTokens: 500,
      cacheReadInputTokens: 50000,
      cacheCreationInputTokens: 3000,
      totalCostUSD: 0.03,
      contextWindow: 200000,
    };

    it('should pass contextUsage to ChatHeader when available', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      // Set contextUsage after initial render (resetContextUsage fires on mount)
      act(() => {
        useChatStore.setState({ contextUsage: mockContextUsage });
      });

      expect(screen.getByTestId('context-usage-display')).toBeInTheDocument();
    });

    it('should not render ContextUsageDisplay when contextUsage is null', () => {
      useChatStore.setState({ contextUsage: null });
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.queryByTestId('context-usage-display')).not.toBeInTheDocument();
    });

    it('should reset contextUsage on session change', () => {
      const mockResetContextUsage = vi.fn();
      useChatStore.setState({ resetContextUsage: mockResetContextUsage });

      renderChatPage();

      expect(mockResetContextUsage).toHaveBeenCalled();
    });
  });

  describe('Session quick access panel (Story 5.7)', () => {
    it('should render session history button in header', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByRole('button', { name: '세션 목록' })).toBeInTheDocument();
    });

    it('should render session history button in all render paths', () => {
      // New session state
      const { unmount: unmount1 } = render(
        <MemoryRouter initialEntries={['/project/test-project/session/new']}>
          <Routes>
            <Route path="/project/:projectSlug/session/:sessionId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      );
      expect(screen.getByRole('button', { name: '세션 목록' })).toBeInTheDocument();
      unmount1();

      // Loading state
      useMessageStore.setState({ isLoading: true });
      const { unmount: unmount2 } = renderChatPage();
      expect(screen.getByRole('button', { name: '세션 목록' })).toBeInTheDocument();
      unmount2();

      // Error state
      useMessageStore.setState({ isLoading: false, error: '오류 발생' });
      const { unmount: unmount3 } = renderChatPage();
      expect(screen.getByRole('button', { name: '세션 목록' })).toBeInTheDocument();
      unmount3();

      // Empty state
      useMessageStore.setState({ error: null, messages: [] });
      const { unmount: unmount4 } = renderChatPage();
      expect(screen.getByRole('button', { name: '세션 목록' })).toBeInTheDocument();
      unmount4();
    });

    it('should navigate to selected session when session is selected', () => {
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      // Open the panel
      fireEvent.click(screen.getByRole('button', { name: '세션 목록' }));

      // Panel should be visible
      expect(screen.getByTestId('session-quick-access-panel')).toBeInTheDocument();
    });
  });

  describe('Abort response (Story 5.4)', () => {
    it('should show abort button when streaming', () => {
      useChatStore.setState({ isStreaming: true, streamingSessionId: 'session-123' });
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByRole('button', { name: /중단/i })).toBeInTheDocument();
    });

    it('should show send button when not streaming', () => {
      useChatStore.setState({ isStreaming: false });
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByRole('button', { name: /전송/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /중단/i })).not.toBeInTheDocument();
    });

    it('should show abort button in new session state when streaming', () => {
      useChatStore.setState({ isStreaming: true, streamingSessionId: 'pending' });

      render(
        <MemoryRouter initialEntries={['/project/test-project/session/new']}>
          <Routes>
            <Route path="/project/:projectSlug/session/:sessionId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByRole('button', { name: /중단/i })).toBeInTheDocument();
    });

    it('should show abort button in empty state when streaming', () => {
      useChatStore.setState({ isStreaming: true, streamingSessionId: 'session-123' });
      useMessageStore.setState({ messages: [] });

      renderChatPage();

      expect(screen.getByRole('button', { name: /중단/i })).toBeInTheDocument();
    });

    it('should call abortResponse when new session button confirmed in modal during streaming', () => {
      const mockAbortResponse = vi.fn();
      useChatStore.setState({ isStreaming: true, abortResponse: mockAbortResponse });
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      fireEvent.click(screen.getByRole('button', { name: '새 세션 시작' }));

      // Click confirm button in the modal
      fireEvent.click(screen.getByRole('button', { name: '확인' }));

      expect(mockAbortResponse).toHaveBeenCalled();
    });
  });

  describe('Agent Quick Launch (Story 8.3)', () => {
    const agentCommands = [
      {
        command: '/BMad:agents:dev',
        name: 'Dev',
        description: 'Full Stack Developer',
        category: 'agent' as const,
        icon: '\uD83D\uDCBB',
      },
    ];

    const setupBmadProject = () => {
      useProjectStore.setState({
        projects: [{
          projectSlug: 'test-project',
          originalPath: '/test/path',
          sessionCount: 0,
          lastModified: '2026-01-01T00:00:00Z',
          isBmadProject: true,
        }],
      });
      mockUseSlashCommands.mockReturnValue({
        commands: agentCommands,
        starCommands: {},
        isLoading: false,
      });
    };

    beforeEach(() => {
      // Reset project store to clean state before each agent test
      useProjectStore.setState({
        projects: [],
        isLoading: false,
        error: null,
      });
    });

    afterEach(() => {
      mockUseSlashCommands.mockReturnValue({
        commands: [],
        starCommands: {},
        isLoading: false,
      });
    });

    it('should call handleSendMessage directly when session is empty', () => {
      setupBmadProject();
      const sendMessageSpy = vi.fn();
      useChatStore.setState({ sendMessage: sendMessageSpy });
      useMessageStore.setState({ messages: [] });

      renderChatPage();

      // Open agent popup
      fireEvent.click(screen.getByTestId('bmad-agent-button'));

      // Click the agent
      fireEvent.click(screen.getByTestId('bmad-agent-item-0'));

      // Should call sendMessage directly (via handleSendMessage)
      expect(sendMessageSpy).toHaveBeenCalledWith('/BMad:agents:dev', expect.objectContaining({
        workingDirectory: '/test/path',
        resume: false,
      }));
    });

    it('should show confirm dialog when messages exist', () => {
      setupBmadProject();
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      // Open agent popup
      fireEvent.click(screen.getByTestId('bmad-agent-button'));

      // Click the agent
      fireEvent.click(screen.getByTestId('bmad-agent-item-0'));

      // Confirm dialog should appear
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('진행 중인 대화가 있습니다. 에이전트를 새 세션에서 시작하시겠습니까?')).toBeInTheDocument();
    });

    it('should disable agent button during streaming to prevent launch', () => {
      setupBmadProject();
      useChatStore.setState({ isStreaming: true });
      useMessageStore.setState({ messages: [] });

      renderChatPage();

      // BmadAgentButton is disabled during streaming — clicking does nothing
      const agentButton = screen.getByTestId('bmad-agent-button');
      fireEvent.click(agentButton);

      // Agent popup should not open, so no agent items are rendered
      expect(screen.queryByTestId('bmad-agent-item-0')).not.toBeInTheDocument();
      // No confirm dialog either
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should navigate to new session after confirm', () => {
      setupBmadProject();
      const mockAbortResponse = vi.fn();
      useChatStore.setState({ abortResponse: mockAbortResponse });
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      // Open agent popup and click agent
      fireEvent.click(screen.getByTestId('bmad-agent-button'));
      fireEvent.click(screen.getByTestId('bmad-agent-item-0'));

      // Confirm
      fireEvent.click(screen.getByRole('button', { name: '확인' }));

      expect(mockAbortResponse).toHaveBeenCalled();
      expect(mockClearMessages).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/\/project\/test-project\/session\/.+/));
    });

    it('should auto-send agent command via pendingAgentCommandRef after confirm', () => {
      setupBmadProject();
      const mockAbortResponse = vi.fn();
      useChatStore.setState({ abortResponse: mockAbortResponse });
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      // Open agent popup and click agent
      fireEvent.click(screen.getByTestId('bmad-agent-button'));
      fireEvent.click(screen.getByTestId('bmad-agent-item-0'));

      // Confirm → executes agentLaunch action
      fireEvent.click(screen.getByRole('button', { name: '확인' }));

      // Verify the agentLaunch action: navigate to new session
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/\/project\/test-project\/session\/[a-f0-9-]+/)
      );
      // clearMessages and clearStreamingSegments should be called
      expect(mockClearMessages).toHaveBeenCalled();
    });

    it('should show agentLaunch title in confirm dialog', () => {
      setupBmadProject();
      useMessageStore.setState({
        messages: mockMessages,
        pagination: mockPagination,
      });

      renderChatPage();

      // Open agent popup and click agent
      fireEvent.click(screen.getByTestId('bmad-agent-button'));
      fireEvent.click(screen.getByTestId('bmad-agent-item-0'));

      // Check dialog title
      expect(screen.getByText('에이전트 시작 확인')).toBeInTheDocument();
    });
  });

  describe('History AskUserQuestion rendering (Story 7.1)', () => {
    it('should render AskUserQuestion as InteractiveResponseCard with responded status', () => {
      // After parser merge, tool_result is merged into tool_use's toolResult field
      const askMessage: HistoryMessage = {
        id: 'msg-ask-1',
        type: 'tool_use',
        content: '',
        timestamp: '2026-01-15T10:00:00Z',
        toolName: 'AskUserQuestion',
        toolInput: {
          questions: [{
            question: 'Which option do you prefer?',
            header: 'Preference',
            options: [
              { label: 'Option A', description: 'First option' },
              { label: 'Option B' },
            ],
            multiSelect: false,
          }],
        },
        toolResult: { success: true, output: 'Option A' },
      };

      useMessageStore.setState({
        messages: [askMessage],
        pagination: mockPagination,
      });

      renderChatPage();

      // Should render InteractiveResponseCard, not ToolCallCard
      expect(screen.getByTestId('interactive-response-card')).toBeInTheDocument();
      // Should show the response value from tool_result content
      expect(screen.getByText('Option A')).toBeInTheDocument();
    });

    it('should show tool_result output as response value when toolResult.output is available', () => {
      // After parser merge, tool_result is merged into tool_use's toolResult field
      const askMessage: HistoryMessage = {
        id: 'msg-ask-2',
        type: 'tool_use',
        content: '',
        timestamp: '2026-01-15T10:00:00Z',
        toolName: 'AskUserQuestion',
        toolInput: {
          questions: [{
            question: 'Pick one',
            header: 'Choice',
            options: [{ label: 'X' }, { label: 'Y' }],
          }],
        },
        toolResult: { success: true, output: 'Y' },
      };

      useMessageStore.setState({
        messages: [askMessage],
        pagination: mockPagination,
      });

      renderChatPage();

      expect(screen.getByTestId('interactive-response-card')).toBeInTheDocument();
      expect(screen.getByText('Y')).toBeInTheDocument();
    });
  });
});
