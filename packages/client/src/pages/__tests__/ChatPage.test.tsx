/**
 * ChatPage Tests
 * [Source: Story 4.1 - Task 8]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ChatPage } from '../ChatPage';
import { useMessageStore } from '../../stores/messageStore';
import { useChatStore } from '../../stores/chatStore';
import { useProjectStore } from '../../stores/projectStore';
import type { HistoryMessage, PaginationInfo } from '@hammoc/shared';

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
  commands: [] as import('@hammoc/shared').SlashCommand[],
  starCommands: {} as Record<string, import('@hammoc/shared').StarCommand[]>,
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
// vi.mock is hoisted — cannot reference top-level variables.
// We create the mock inline and export the reference via a module-level vi.hoisted.
const { mockSessionStoreReturnValue, mockUseSessionStoreHook } = vi.hoisted(() => {
  const state = {
    sessions: [] as never[],
    isLoading: false,
    error: null as string | null,
    errorType: 'none',
    currentProjectSlug: null as string | null,
    isRefreshing: false,
    fetchSessions: vi.fn(),
    clearSessions: vi.fn(),
    clearError: vi.fn(),
    clearSearch: vi.fn(),
    searchQuery: '',
    isSearching: false,
    searchContent: false,
    hasMore: false,
    isLoadingMore: false,
    loadMoreSessions: vi.fn(),
    searchSessions: vi.fn(),
    resetSearchState: vi.fn(),
    renameSession: vi.fn(),
  };
  const hook = Object.assign(
    vi.fn(() => state),
    { getState: () => state },
  );
  return { mockSessionStoreReturnValue: state, mockUseSessionStoreHook: hook };
});
vi.mock('../../stores/sessionStore', () => ({
  useSessionStore: mockUseSessionStoreHook,
}));

// Mock socket service (Story 5.4 - abortResponse calls getSocket)
vi.mock('../../services/socket', () => ({
  getSocket: () => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    connected: false,
  }),
  joinProjectRoom: vi.fn(),
  leaveProjectRoom: vi.fn(),
  rejoinProjectRooms: vi.fn(),
  forceReconnect: vi.fn(),
  disconnectSocket: vi.fn(),
}));

// Mock queue API (Story 15.4 - useQueueSession calls queueApi.getStatus)
vi.mock('../../services/api/queue', () => ({
  queueApi: {
    getStatus: vi.fn().mockRejectedValue(new Error('no active queue')),
  },
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

  const mockClearMessages = vi.fn();

  /**
   * Set messageStore with matching session context.
   * NOTE: ChatPage's mount useEffect always sets isLoading=true, so to test
   * non-loading states, call this AFTER render inside act() to simulate
   * the stream:history arrival that clears loading.
   */
  const setStoreWithSession = (
    overrides: Record<string, unknown> = {},
    projectSlug = 'test-project',
    sessionId = 'session-123',
  ) => {
    useMessageStore.setState({
      messages: [],
      currentProjectSlug: projectSlug,
      currentSessionId: sessionId,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      pagination: null,
      clearMessages: mockClearMessages,
      ...overrides,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore sessionStore mock (reset by vi.clearAllMocks in afterEach)
    mockUseSessionStoreHook.mockReturnValue(mockSessionStoreReturnValue);
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
      renderChatPage();
      // Simulate stream:history arrival
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      expect(screen.getByTestId('chat-page')).toBeInTheDocument();
    });

    it('should render header, message area, and input area', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      expect(screen.getByTestId('chat-header')).toBeInTheDocument();
      expect(screen.getByTestId('message-area')).toBeInTheDocument();
      expect(screen.getByTestId('input-area')).toBeInTheDocument();
    });

    it('should have correct ARIA roles', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      expect(screen.getByRole('main')).toHaveAttribute('aria-label', '채팅 페이지');
      expect(screen.getByTestId('chat-header')).toHaveAttribute('aria-label', '채팅 헤더');
      expect(screen.getByRole('log')).toHaveAttribute('aria-label', '메시지 목록');
      expect(screen.getByTestId('input-area')).toHaveAttribute('aria-label', '메시지 입력');
    });
  });

  describe('Session context setup', () => {
    it('should set session context in messageStore on mount', () => {
      renderChatPage();

      // Story 27.1: ChatPage sets session context via useMessageStore.setState
      const state = useMessageStore.getState();
      expect(state.currentProjectSlug).toBe('test-project');
      expect(state.currentSessionId).toBe('session-123');
    });

    it('should clear messages on unmount', () => {
      const { unmount } = renderChatPage();

      unmount();

      expect(mockClearMessages).toHaveBeenCalled();
    });

    it('should set session context for new session (sessionId is truthy)', () => {
      render(
        <MemoryRouter initialEntries={['/project/test-project/session/new']}>
          <Routes>
            <Route path="/project/:projectSlug/session/:sessionId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      );

      const state = useMessageStore.getState();
      expect(state.currentProjectSlug).toBe('test-project');
      expect(state.currentSessionId).toBe('new');
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
      renderChatPage();
      act(() => { setStoreWithSession({ error: '세션을 찾을 수 없습니다.' }); });

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('다시 시도')).toBeInTheDocument();
    });

    it('should retry by re-joining session when retry button clicked in error state', async () => {
      renderChatPage();
      act(() => { setStoreWithSession({ error: '오류 발생' }); });

      const retryButton = screen.getByText('다시 시도');
      fireEvent.click(retryButton);

      // Story 27.1: Retry re-joins the session via socket, not fetchMessages
      // Verify the error state was displayed and retry button is clickable
      expect(retryButton).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show empty state when no messages', () => {
      renderChatPage();
      // Simulate stream:history arrival with empty messages
      act(() => { setStoreWithSession({ messages: [] }); });

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
      // Simulate stream:history arrival with empty messages
      act(() => { setStoreWithSession({ messages: [] }, 'test-project', 'new'); });

      expect(screen.getByText('새 세션')).toBeInTheDocument();
    });
  });

  describe('Messages rendering', () => {
    it('should render messages when loaded', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

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

      renderChatPage();
      act(() => { setStoreWithSession({ messages: [toolMessage], pagination: mockPagination }); });

      expect(screen.getByText('Read')).toBeInTheDocument();
    });
  });

  describe('Header functionality', () => {
    it('should display project slug in header', () => {
      renderChatPage('my-project');
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }, 'my-project'); });

      expect(screen.getByText('my-project')).toBeInTheDocument();
    });

    it('should navigate back when back button clicked', async () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      const backButton = screen.getByRole('button', { name: '세션 목록으로 돌아가기' });
      fireEvent.click(backButton);

      expect(mockNavigate).toHaveBeenCalledWith('/project/test-project/sessions');
    });

    it('should have refresh button in header when messages are shown', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument();
    });

  });

  describe('Message delivery (Story 27.1)', () => {
    // Pagination was removed in Story 27.1 — messages are delivered via stream:history.
    it('should render all messages delivered via stream:history', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Hi! How can I help?')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have aria-live on message area', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

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
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      expect(screen.getByRole('button', { name: /권한 모드/i })).toBeInTheDocument();
    });

    it('should render PermissionModeSelector in loading state', () => {
      // Loading state is the default on mount — no need to set store after render
      renderChatPage();

      const permissionButton = screen.getByRole('button', { name: /권한 모드/i });
      expect(permissionButton).toBeInTheDocument();
      // PermissionModeSelector is disabled when isStreaming, not when isLoading
    });

    it('should render PermissionModeSelector in error state', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ error: '오류 발생' }); });

      const permissionButton = screen.getByRole('button', { name: /권한 모드/i });
      expect(permissionButton).toBeInTheDocument();
      // PermissionModeSelector is disabled when isStreaming, not when error
    });

    it('should render PermissionModeSelector in empty state', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: [] }); });

      expect(screen.getByRole('button', { name: /권한 모드/i })).toBeInTheDocument();
    });

    it('should cycle permission mode when clicked', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      const permissionButton = screen.getByRole('button', { name: /권한 모드/i });
      // Default mode is 'default' (Ask), clicking cycles to next: acceptEdits (Auto)
      fireEvent.click(permissionButton);
      expect(useChatStore.getState().permissionMode).toBe('acceptEdits');
    });
  });

  describe('New session button (Story 5.3)', () => {
    it('should render new session button in header', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

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
      act(() => { setStoreWithSession({ messages: [] }, 'test-project', 'new'); });

      expect(screen.getByRole('button', { name: '새 세션 시작' })).toBeInTheDocument();
    });

    it('should render new session button in loading state', () => {
      // Loading state is the default on mount
      renderChatPage();

      expect(screen.getByRole('button', { name: '새 세션 시작' })).toBeInTheDocument();
    });

    it('should render new session button in error state', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ error: '오류 발생' }); });

      expect(screen.getByRole('button', { name: '새 세션 시작' })).toBeInTheDocument();
    });

    it('should render new session button in empty state', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: [] }); });

      expect(screen.getByRole('button', { name: '새 세션 시작' })).toBeInTheDocument();
    });

    it('should navigate to new session URL when clicked', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      fireEvent.click(screen.getByRole('button', { name: '새 세션 시작' }));

      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/\/project\/test-project\/session\/.+/));
    });

    it('should call clearMessages when new session button is clicked', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      fireEvent.click(screen.getByRole('button', { name: '새 세션 시작' }));

      expect(mockClearMessages).toHaveBeenCalled();
    });

    it('should navigate to new session directly even when streaming is active', () => {
      useChatStore.setState({ isStreaming: true });

      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      fireEvent.click(screen.getByRole('button', { name: '새 세션 시작' }));

      // Should navigate without showing a confirm modal
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
      // Simulate stream:history arrival with empty messages for new session
      act(() => { setStoreWithSession({ messages: [] }, 'test-project', 'new'); });

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
      act(() => { setStoreWithSession({ messages: [] }, 'test-project', 'new'); });

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

    it('should pass contextUsage to ChatInput when available', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      // Set contextUsage after initial render (resetContextUsage fires on mount)
      act(() => {
        useChatStore.setState({ contextUsage: mockContextUsage });
      });

      // ContextUsageDisplay is rendered inside ChatInput, not ChatHeader
      expect(screen.getByTestId('context-usage-display')).toBeInTheDocument();
    });

    it('should not render ContextUsageDisplay when contextUsage is null', () => {
      useChatStore.setState({ contextUsage: null });
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

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
    it('should render panel toggle button in header', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      expect(screen.getByTestId('panel-toggle-button')).toBeInTheDocument();
    });

    it('should render panel toggle button in all render paths', () => {
      // Loading state (default on mount)
      const { unmount: unmount2 } = renderChatPage();
      expect(screen.getByTestId('panel-toggle-button')).toBeInTheDocument();
      unmount2();

      // Error state
      const { unmount: unmount3 } = renderChatPage();
      act(() => { setStoreWithSession({ error: '오류 발생' }); });
      expect(screen.getByTestId('panel-toggle-button')).toBeInTheDocument();
      unmount3();

      // Empty state
      const { unmount: unmount4 } = renderChatPage();
      act(() => { setStoreWithSession({ messages: [] }); });
      expect(screen.getByTestId('panel-toggle-button')).toBeInTheDocument();
      unmount4();
    });

    it('should open panel when toggle button is clicked', () => {
      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      // Open the panel
      fireEvent.click(screen.getByTestId('panel-toggle-button'));

      // QuickPanel should be visible with sessions content (default)
      expect(screen.getByTestId('quick-panel')).toBeInTheDocument();
      expect(screen.getByTestId('quick-panel')).toHaveAttribute('aria-label', '세션 목록');
    });
  });

  describe('Abort response (Story 5.4)', () => {
    it('should show abort button when streaming', () => {
      useChatStore.setState({ isStreaming: true, streamingSessionId: 'session-123' });

      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      expect(screen.getByRole('button', { name: /중단/i })).toBeInTheDocument();
    });

    it('should show send button when not streaming', () => {
      useChatStore.setState({ isStreaming: false });

      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

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
      act(() => { setStoreWithSession({ messages: [] }, 'test-project', 'new'); });

      expect(screen.getByRole('button', { name: /중단/i })).toBeInTheDocument();
    });

    it('should show abort button in empty state when streaming', () => {
      useChatStore.setState({ isStreaming: true, streamingSessionId: 'session-123' });

      renderChatPage();
      act(() => { setStoreWithSession({ messages: [] }); });

      expect(screen.getByRole('button', { name: /중단/i })).toBeInTheDocument();
    });

    it('should navigate to new session without aborting when streaming is active', () => {
      useChatStore.setState({ isStreaming: true });

      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      fireEvent.click(screen.getByRole('button', { name: '새 세션 시작' }));

      // Should navigate immediately without showing a modal
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/\/project\/test-project\/session\/.+/));
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

      renderChatPage();
      act(() => { setStoreWithSession({ messages: [] }); });

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

    it('should navigate to new session directly when messages exist (no confirm dialog)', () => {
      setupBmadProject();
      const mockAbortResponse = vi.fn();
      useChatStore.setState({ abortResponse: mockAbortResponse });

      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      // Open agent popup
      fireEvent.click(screen.getByTestId('bmad-agent-button'));

      // Click the agent
      fireEvent.click(screen.getByTestId('bmad-agent-item-0'));

      // Agent select now navigates directly without confirmation
      expect(mockAbortResponse).toHaveBeenCalled();
      expect(mockClearMessages).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/\/project\/test-project\/session\/[a-f0-9-]+/));
    });

    it('should allow agent popup during streaming', () => {
      setupBmadProject();
      useChatStore.setState({ isStreaming: true });

      renderChatPage();
      act(() => { setStoreWithSession({ messages: [] }); });

      // BmadAgentButton can be opened during streaming
      const agentButton = screen.getByTestId('bmad-agent-button');
      fireEvent.click(agentButton);

      // Agent popup opens and shows items
      expect(screen.getByTestId('bmad-agent-item-0')).toBeInTheDocument();
    });

    it('should navigate to new session and set pending agent command', () => {
      setupBmadProject();
      const mockAbortResponse = vi.fn();
      const mockClearStreamingSegments = vi.fn();
      const mockResetSelectedModel = vi.fn();
      useChatStore.setState({
        abortResponse: mockAbortResponse,
        clearStreamingSegments: mockClearStreamingSegments,
        resetSelectedModel: mockResetSelectedModel,
      });

      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      // Open agent popup and click agent
      fireEvent.click(screen.getByTestId('bmad-agent-button'));
      fireEvent.click(screen.getByTestId('bmad-agent-item-0'));

      // Verify all handleAgentLaunch preparation steps
      expect(mockAbortResponse).toHaveBeenCalled();
      expect(mockClearMessages).toHaveBeenCalled();
      expect(mockClearStreamingSegments).toHaveBeenCalled();
      expect(mockResetSelectedModel).toHaveBeenCalled();

      // Navigate directly to new session (UUID-based)
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/\/project\/test-project\/session\/[a-f0-9-]+/)
      );
    });

    it('should call sendMessage directly when agent is selected in empty session', () => {
      setupBmadProject();
      const sendMessageSpy = vi.fn();
      useChatStore.setState({ sendMessage: sendMessageSpy });

      renderChatPage();
      act(() => { setStoreWithSession({ messages: [] }); });

      // Open agent popup and click agent
      fireEvent.click(screen.getByTestId('bmad-agent-button'));
      fireEvent.click(screen.getByTestId('bmad-agent-item-0'));

      // In empty sessions, sendMessage is called directly with the agent command
      expect(sendMessageSpy).toHaveBeenCalledWith(
        '/BMad:agents:dev',
        expect.objectContaining({
          workingDirectory: '/test/path',
          resume: false,
        })
      );
      // Should NOT navigate — stays in same session
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should navigate directly to new session without showing confirm dialog message', () => {
      setupBmadProject();

      renderChatPage();
      act(() => { setStoreWithSession({ messages: mockMessages, pagination: mockPagination }); });

      // Open agent popup and click agent
      fireEvent.click(screen.getByTestId('bmad-agent-button'));
      fireEvent.click(screen.getByTestId('bmad-agent-item-0'));

      // Agent launches immediately without confirm dialog text
      expect(screen.queryByText('진행 중인 대화가 있습니다. 에이전트를 새 세션에서 시작하시겠습니까?')).not.toBeInTheDocument();
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/\/project\/test-project\/session\/[a-f0-9-]+/));
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

      renderChatPage();
      act(() => { setStoreWithSession({ messages: [askMessage], pagination: mockPagination }); });

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

      renderChatPage();
      act(() => { setStoreWithSession({ messages: [askMessage], pagination: mockPagination }); });

      expect(screen.getByTestId('interactive-response-card')).toBeInTheDocument();
      expect(screen.getByText('Y')).toBeInTheDocument();
    });
  });

  // Story 25.11: Fork session tests
  describe('fork session (Story 25.11)', () => {
    it('navigates to forked session when forkedSessionId is set', async () => {
      renderChatPage();

      // Simulate forkedSessionId being set by useStreaming handler
      act(() => {
        useChatStore.setState({ forkedSessionId: 'new-forked-session-id' });
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/project/test-project/session/new-forked-session-id'
        );
      });

      // forkedSessionId should be cleared after navigation
      expect(useChatStore.getState().forkedSessionId).toBeNull();
    });
  });
});
