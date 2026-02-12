/**
 * ChatPage - Chat page layout with header, message area, and input area
 * [Source: Story 4.1 - Task 1, Story 4.2 - Task 7, Story 4.5 - Task 8]
 *
 * Features:
 * - Three-part layout: header, messages, input
 * - Auto-scroll to new messages
 * - Dark/light theme support
 * - Error handling with retry
 * - Accessibility support (ARIA, keyboard navigation)
 * - Chat input with streaming state support
 * - Real-time streaming support (Story 4.5)
 */

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { toast } from 'sonner';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useMessageStore } from '../stores/messageStore';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import { useSessionStore } from '../stores/sessionStore';
import { useAuthStore } from '../stores/authStore';
import type { Attachment, HistoryMessage } from '@bmad-studio/shared';
import { useStreaming } from '../hooks/useStreaming';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useFavoriteCommands } from '../hooks/useFavoriteCommands';
import { useStarFavorites } from '../hooks/useStarFavorites';
import { useActiveAgent } from '../hooks/useActiveAgent';
import { getSocket } from '../services/socket';
import { generateUUID } from '../utils/uuid';
import { getAgentId } from '../utils/agentUtils';
import { debugLog } from '../utils/debugLogger';
import { ChatHeader } from '../components/ChatHeader';
import { MessageArea } from '../components/MessageArea';
import { InputArea } from '../components/InputArea';
import { ChatInput } from '../components/ChatInput';
import { MessageBubble } from '../components/MessageBubble';
import { ToolCallCard } from '../components/ToolCallCard';
import { InteractiveResponseCard } from '../components/InteractiveResponseCard';
import { MessageListSkeleton } from '../components/MessageListSkeleton';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { SessionQuickAccessPanel } from '../components/SessionQuickAccessPanel';
import { ConfirmModal } from '../components/ConfirmModal';
import { ThinkingBlock } from '../components/ThinkingBlock';

/**
 * Render a single history message as the appropriate component.
 * Handles AskUserQuestion → InteractiveResponseCard, tool messages → ToolCallCard,
 * and text messages → MessageBubble. (Story 7.1 - QA fix MAINT-001)
 */
const COMPACT_MESSAGE_PREFIX = 'This session is being continued from a previous conversation';

function renderHistoryMessage(message: HistoryMessage, index: number, messages: HistoryMessage[]) {
  // Render context compaction as a simple assistant "Compacted" bubble
  if (message.type === 'user' && typeof message.content === 'string' && message.content.startsWith(COMPACT_MESSAGE_PREFIX)) {
    return <MessageBubble key={message.id} message={{ ...message, type: 'assistant', content: 'Compacted' }} />;
  }

  if (message.type === 'tool_use' && message.toolName === 'AskUserQuestion') {
    const rawQuestions = message.toolInput?.questions as Array<{
      question: string;
      header: string;
      options: Array<{ label: string; description?: string }>;
      multiSelect?: boolean;
    }> | undefined;
    // Map all questions with their choices
    const mappedQuestions = rawQuestions?.map((q) => ({
      question: q.question,
      header: q.header,
      choices: q.options.map((opt) => ({
        label: opt.label, description: opt.description, value: opt.label,
      })),
      multiSelect: q.multiSelect,
    }));
    // First question's choices as top-level for backward compat
    const firstChoices = mappedQuestions?.[0]?.choices || [];
    return (
      <InteractiveResponseCard
        key={message.id}
        type="question"
        toolName="AskUserQuestion"
        toolInput={message.toolInput}
        choices={firstChoices}
        questions={mappedQuestions}
        multiSelect={rawQuestions?.[0]?.multiSelect}
        status="responded"
        response={message.toolResult?.output ?? '응답됨'}
      />
    );
  }
  // tool_use: result already merged by parser — pass as resultOutput
  if (message.type === 'tool_use') {
    return <ToolCallCard key={message.id} message={message} resultOutput={message.toolResult?.output} />;
  }
  // Skip successful tool_result — already merged into tool_use by parser
  if (message.type === 'tool_result' && message.toolResult?.success !== false) {
    return null;
  }
  // Skip user-denied tool_result — already shown as denied in the tool_use card
  if (message.type === 'tool_result' && /denied|거절/i.test(message.toolResult?.error ?? '')) {
    return null;
  }
  // Failed tool_result that couldn't be merged
  if (message.type === 'tool_result') {
    return <ToolCallCard key={message.id} message={message} />;
  }

  // Assistant message with thinking → separate ThinkingBlock card + MessageBubble
  if (message.type === 'assistant' && message.thinking) {
    return (
      <Fragment key={message.id}>
        <div className="flex justify-start">
          <div className="max-w-[90%] md:max-w-[80%]">
            <ThinkingBlock content={message.thinking} />
          </div>
        </div>
        {message.content && <MessageBubble message={message} />}
      </Fragment>
    );
  }

  return <MessageBubble key={message.id} message={message} />;
}

export function ChatPage() {
  const { projectSlug, sessionId } = useParams<{
    projectSlug: string;
    sessionId: string;
  }>();
  const navigate = useNavigate();

  const {
    messages,
    isLoading,
    isLoadingMore,
    error,
    pagination,
    lastAgentCommand,
    fetchMessages,
    fetchMoreMessages,
    clearMessages,
    addOptimisticMessage,
  } = useMessageStore();

  const { isStreaming, isCompacting, streamingSessionId, streamingSegments, segmentsPendingClear, sendMessage, abortStreaming, abortResponse, permissionMode, setPermissionMode, selectedModel, setSelectedModel, activeModel, contextUsage, resetContextUsage, clearStreamingSegments } = useChatStore();
  const { projects, fetchProjects } = useProjectStore();
  const { sessions, renameSession } = useSessionStore();
  const { logout } = useAuthStore();

  // Get session name from sessionStore (populated when coming from session list)
  const sessionName = useMemo(() => {
    return sessions.find((s) => s.sessionId === sessionId)?.name;
  }, [sessions, sessionId]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  // Handle session rename
  const handleRenameSession = useCallback((name: string | null) => {
    if (projectSlug && sessionId) {
      renameSession(projectSlug, sessionId, name);
    }
  }, [projectSlug, sessionId, renameSession]);

  // Get working directory and isBmadProject from project
  const currentProject = useMemo(() => {
    return projects.find((p) => p.projectSlug === projectSlug);
  }, [projects, projectSlug]);

  const workingDirectory = currentProject?.originalPath || '';
  const isBmadProject = currentProject?.isBmadProject ?? false;

  // Fetch projects if not loaded (for direct URL navigation)
  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects();
    }
  }, [projects.length, fetchProjects]);

  // Initialize streaming event handlers
  useStreaming();

  // Fetch slash commands for autocomplete (Story 5.1)
  const { commands, starCommands } = useSlashCommands(projectSlug);

  // Command favorites (Story 9.4/9.5)
  const { favoriteCommands, addFavorite, removeFavorite, reorderFavorites, isFavorite } = useFavoriteCommands();

  // Toggle favorite command handler (Story 9.5)
  const handleToggleFavorite = useCallback((command: string) => {
    if (isFavorite(command)) {
      removeFavorite(command);
    } else {
      if (favoriteCommands.length >= 20) {
        toast.warning('즐겨찾기는 최대 20개까지 추가할 수 있습니다');
        return;
      }
      addFavorite(command);
    }
  }, [isFavorite, addFavorite, removeFavorite, favoriteCommands.length]);

  // Active agent detection (Story 8.5)
  const { activeAgent } = useActiveAgent(messages, commands, lastAgentCommand);

  // Star favorites per agent (Story 9.11)
  const activeAgentId = useMemo(() => {
    if (!activeAgent) return null;
    return getAgentId(activeAgent.command);
  }, [activeAgent]);

  // Current agent's star commands (Story 9.9)
  const activeAgentStarCommands = useMemo(() => {
    if (!activeAgentId) return undefined;
    return starCommands[activeAgentId] ?? [];
  }, [activeAgentId, starCommands]);

  const { starFavorites, addStarFavorite, removeStarFavorite, reorderStarFavorites, isStarFavorite } = useStarFavorites(activeAgentId);

  const handleToggleStarFavorite = useCallback((command: string) => {
    if (!activeAgent) return;
    if (isStarFavorite(command)) {
      removeStarFavorite(command);
    } else {
      if (starFavorites.length >= 10) {
        toast.warning('별표 즐겨찾기는 최대 10개까지 추가할 수 있습니다');
        return;
      }
      addStarFavorite(command);
    }
  }, [activeAgent, isStarFavorite, addStarFavorite, removeStarFavorite, starFavorites.length]);

  // Remove star favorite (Story 9.12)
  const handleRemoveStarFavorite = useCallback((command: string) => {
    if (!activeAgent) return;
    removeStarFavorite(command);
  }, [activeAgent, removeStarFavorite]);

  const [agentListOpenTrigger, setAgentListOpenTrigger] = useState(0);
  const handleAgentIndicatorClick = useCallback(() => {
    setAgentListOpenTrigger((prev) => prev + 1);
  }, []);

  // Handle message send
  const handleSendMessage = useCallback(
    (content: string, attachments?: Attachment[]) => {
      if (!workingDirectory) {
        console.error('[ChatPage] Cannot send message: workingDirectory not found');
        return;
      }
      // Read latest messages from store BEFORE adding optimistic message
      // to correctly detect whether this is a new or existing session.
      // Uses getState() to avoid stale closure (messages may have loaded
      // after this callback was created).
      const currentMessages = useMessageStore.getState().messages;
      // Convert Attachment[] to ImageAttachment[] for optimistic message display
      const images = attachments?.map((a) => ({
        mimeType: a.mimeType,
        data: a.data,
        name: a.name,
      }));
      // Add user message immediately (optimistic UI)
      addOptimisticMessage(content, images);
      // Send to server — sessionId is always a UUID (pre-allocated),
      // resume when messages already exist in this session.
      sendMessage(content, {
        workingDirectory,
        sessionId,
        resume: currentMessages.length > 0,
        attachments,
      });
    },
    [sendMessage, addOptimisticMessage, workingDirectory, sessionId]
  );

  // Handle abort
  const handleAbort = useCallback(() => {
    if (useChatStore.getState().isStreaming) {
      abortResponse();
    }
  }, [abortResponse]);

  // Handle BMad agent selection (Story 8.3) - Quick Launch
  const handleAgentSelect = useCallback((agentCommand: string) => {
    const currentMessages = useMessageStore.getState().messages;
    const currentIsStreaming = useChatStore.getState().isStreaming;

    if (currentMessages.length === 0 && !currentIsStreaming) {
      // Empty session: send agent command directly
      handleSendMessage(agentCommand);
    } else {
      // Active session: start new session immediately (no confirmation)
      abortResponse();
      clearMessages();
      clearStreamingSegments();
      pendingAgentCommandRef.current = agentCommand;
      const newSessionId = generateUUID();
      navigate(`/project/${projectSlug}/session/${newSessionId}`);
    }
  }, [handleSendMessage, abortResponse, clearMessages, clearStreamingSegments, navigate, projectSlug]);

  // Ref to keep latest handleSendMessage for use in fetchMessages callback (Story 8.3)
  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => { handleSendMessageRef.current = handleSendMessage; }, [handleSendMessage]);

  // Handle manual compaction
  const handleCompact = useCallback(() => {
    if (!workingDirectory || isStreaming || messages.length === 0) return;
    addOptimisticMessage('/compact');
    sendMessage('/compact', {
      workingDirectory,
      sessionId,
      resume: true,
    });
  }, [sendMessage, addOptimisticMessage, workingDirectory, sessionId, isStreaming]);

  // Fetch messages on mount (only for existing sessions)
  // After fetch completes, clear any lingering streaming tool segments
  // (handles new session → real session URL navigation case)
  // If a background stream was restored during fetch, trim the last
  // assistant message to avoid duplication with buffer replay.
  useEffect(() => {
    if (projectSlug && sessionId) {
      fetchMessages(projectSlug, sessionId).then(() => {
        const chat = useChatStore.getState();
        const msgState = useMessageStore.getState();
        console.log('[DEDUP] fetchMessages.then() callback', {
          isStreaming: chat.isStreaming,
          isCompacting: chat.isCompacting,
          segCount: chat.streamingSegments.length,
          segTypes: chat.streamingSegments.map(s => s.type),
          msgCount: msgState.messages.length,
          msgTypes: msgState.messages.map(m => m.type),
        });
        if (chat.isStreaming) {
          // During active streaming, trim all messages after the last user message
          // to avoid duplication with buffer replay. The entire assistant turn
          // will be recreated from streaming segments via completeStreaming.
          // Exception: during compaction, don't trim — there's no assistant turn
          // being replayed, trimming would remove legitimate history.
          if (!chat.isCompacting) {
            const msgs = useMessageStore.getState().messages;
            let lastUserIdx = -1;
            for (let i = msgs.length - 1; i >= 0; i--) {
              if (msgs[i].type === 'user') {
                lastUserIdx = i;
                break;
              }
            }
            if (lastUserIdx >= 0 && lastUserIdx < msgs.length - 1) {
              useMessageStore.setState({ messages: msgs.slice(0, lastUserIdx + 1) });
            }
          }
          // If messages are empty during active streaming (SDK may be rewriting
          // JSONL during compaction), schedule a retry to pick up flushed history
          if (useMessageStore.getState().messages.length === 0) {
            setTimeout(() => {
              useMessageStore.getState().fetchMessages(projectSlug, sessionId, { silent: true });
            }, 3000);
          }
        } else if (chat.streamingSegments.length > 0) {
          clearStreamingSegments();
        }

        // Auto-send pending agent command after navigation (Story 8.3)
        if (pendingAgentCommandRef.current) {
          const command = pendingAgentCommandRef.current;
          pendingAgentCommandRef.current = null;
          handleSendMessageRef.current(command);
        }
      });
    }
  }, [projectSlug, sessionId, fetchMessages, clearStreamingSegments]);

  // Clean up on component unmount (not on sessionId change):
  // - Clear messages
  // - Detach socket from server-side stream (session:leave)
  // - Clear client-side streaming state (without aborting server-side stream,
  //   which continues in background for reconnection support)
  useEffect(() => {
    return () => {
      console.log('[DEDUP] ChatPage UNMOUNT cleanup', {
        isStreaming: useChatStore.getState().isStreaming,
        segCount: useChatStore.getState().streamingSegments.length,
        msgCount: useMessageStore.getState().messages.length,
      });
      clearMessages();
      const socket = getSocket();
      socket.emit('session:leave', '');
      if (useChatStore.getState().isStreaming) {
        useChatStore.getState().abortStreaming();
      }
    };
  }, [clearMessages]);

  // Probe for active background stream on session mount
  // Must also handle case where socket connects AFTER this effect runs (fresh page load)
  // Skip if already streaming (e.g., navigated from /new to real sessionId mid-stream)
  useEffect(() => {
    if (!sessionId) return;

    const socket = getSocket();
    let isInitialConnect = true; // Track whether this is first connect or reconnect
    let hasJoined = false; // Prevent duplicate session:join (React Strict Mode / rapid navigation)

    const emitJoin = () => {
      const isStreaming = useChatStore.getState().isStreaming;
      console.log('[DEDUP] emitJoin', {
        sessionId,
        isStreaming,
        hasJoined,
        segCount: useChatStore.getState().streamingSegments.length,
        msgCount: useMessageStore.getState().messages.length,
      });
      debugLog.chatpage('emitJoin', { sessionId, isStreaming });
      // Don't probe if we're already streaming on this session (avoids duplicate buffer replay)
      if (isStreaming) return;
      // Prevent duplicate join for the same effect lifecycle
      if (hasJoined) return;
      hasJoined = true;
      socket.emit('session:join', sessionId);
    };

    const handleConnect = () => {
      const chatState = useChatStore.getState();
      debugLog.chatpage('handleConnect', {
        isInitialConnect,
        isStreaming: chatState.isStreaming,
        streamingSessionId: chatState.streamingSessionId,
        sessionId,
        projectSlug,
        socketConnected: socket.connected,
        msgCount: useMessageStore.getState().messages.length,
      });
      // On reconnection, allow re-joining (server needs to know we're back)
      if (!isInitialConnect) {
        hasJoined = false;
      }
      emitJoin();

      // On RECONNECTION (not initial load), do a silent history refresh
      // to pick up any messages that arrived while disconnected.
      // Skip during active streaming — useStreaming handles reconnection separately,
      // and fetchMessages could replace messages with stale history (JSONL not yet flushed).
      if (!isInitialConnect && projectSlug && sessionId && !useChatStore.getState().isStreaming) {
        const msgState = useMessageStore.getState();
        if (msgState.currentSessionId === sessionId && msgState.messages.length > 0) {
          debugLog.chatpage('handleConnect → fetchMessages (reconnection)', {
            currentSessionId: msgState.currentSessionId,
            msgCount: msgState.messages.length,
          });
          msgState.fetchMessages(projectSlug, sessionId, { silent: true });
        }
      }
      isInitialConnect = false;
    };

    if (socket.connected) {
      handleConnect();
    }
    socket.on('connect', handleConnect);

    return () => {
      socket.off('connect', handleConnect);
    };
  }, [sessionId, projectSlug]);

  // Reset context usage on session change (separate from fetchMessages useEffect)
  useEffect(() => {
    resetContextUsage();
  }, [sessionId, resetContextUsage]);

  const handleBack = useCallback(() => {
    if (projectSlug) {
      navigate(`/project/${projectSlug}/sessions`);
    }
  }, [navigate, projectSlug]);

  // Session quick access panel state
  const [showSessionPanel, setShowSessionPanel] = useState(false);

  // Confirm modal state (non-blocking replacement for window.confirm)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'newSession' | 'switchSession' | 'agentLaunch';
    targetSessionId?: string;
    agentCommand?: string;
  }>({ isOpen: false, action: 'newSession' });

  // Ref to store pending agent command for auto-send after navigation (Story 8.3)
  const pendingAgentCommandRef = useRef<string | null>(null);

  const handleShowSessions = useCallback(() => {
    setShowSessionPanel(true);
  }, []);

  const handleCloseSessionPanel = useCallback(() => {
    setShowSessionPanel(false);
  }, []);

  // Execute confirmed action (after user confirms in modal)
  const executeConfirmedAction = useCallback(() => {
    setConfirmModal({ isOpen: false, action: 'newSession' });
    abortResponse();

    if (confirmModal.action === 'newSession') {
      clearMessages();
      clearStreamingSegments();
      const newSessionId = generateUUID();
      navigate(`/project/${projectSlug}/session/${newSessionId}`);
    } else if (confirmModal.action === 'switchSession' && confirmModal.targetSessionId) {
      clearMessages();
      clearStreamingSegments();
      navigate(`/project/${projectSlug}/session/${confirmModal.targetSessionId}`);
    } else if (confirmModal.action === 'agentLaunch') {
      clearMessages();
      clearStreamingSegments();
      pendingAgentCommandRef.current = confirmModal.agentCommand ?? null;
      const newSessionId = generateUUID();
      navigate(`/project/${projectSlug}/session/${newSessionId}`);
    }
  }, [confirmModal.action, confirmModal.targetSessionId, confirmModal.agentCommand, abortResponse, clearMessages, clearStreamingSegments, navigate, projectSlug]);

  const handleSessionSelect = useCallback((selectedSessionId: string) => {
    setShowSessionPanel(false);
    if (!projectSlug) return;
    // Don't navigate if selecting the current session
    if (selectedSessionId === sessionId) return;
    // Confirm if streaming is active
    const currentIsStreaming = useChatStore.getState().isStreaming;
    if (currentIsStreaming) {
      setConfirmModal({
        isOpen: true,
        action: 'switchSession',
        targetSessionId: selectedSessionId,
      });
      return;
    }
    clearMessages();
    clearStreamingSegments();
    navigate(`/project/${projectSlug}/session/${selectedSessionId}`);
  }, [sessionId, clearMessages, clearStreamingSegments, navigate, projectSlug]);

  const handleNewSession = useCallback(() => {
    if (!projectSlug) return;
    const currentIsStreaming = useChatStore.getState().isStreaming;

    if (currentIsStreaming) {
      setConfirmModal({
        isOpen: true,
        action: 'newSession',
      });
      return;
    }

    clearMessages();
    clearStreamingSegments();
    const newSessionId = generateUUID();
    navigate(`/project/${projectSlug}/session/${newSessionId}`);
  }, [clearMessages, clearStreamingSegments, navigate, projectSlug]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmModal({ isOpen: false, action: 'newSession' });
  }, []);

  const handleRetry = useCallback(() => {
    if (projectSlug && sessionId) {
      fetchMessages(projectSlug, sessionId);
    }
  }, [projectSlug, sessionId, fetchMessages]);

  // During active streaming (non-compaction), hide history messages after
  // the last user message to prevent duplication with streaming segments.
  // This render-level filter avoids timing races between fetchMessages (HTTP)
  // and buffer replay (WebSocket) that state-based trims can't handle.
  const displayMessages = useMemo(() => {
    const segCount = useChatStore.getState().streamingSegments.length;
    if (!isStreaming || isCompacting) {
      console.log('[DEDUP] displayMessages: NO FILTER', {
        isStreaming, isCompacting, msgCount: messages.length,
        msgTypes: messages.map(m => m.type),
        segCount,
      });
      return messages;
    }
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx >= 0 && lastUserIdx < messages.length - 1) {
      const filtered = messages.slice(0, lastUserIdx + 1);
      console.log('[DEDUP] displayMessages: FILTERED', {
        isStreaming, isCompacting,
        totalMsgCount: messages.length,
        filteredMsgCount: filtered.length,
        removedCount: messages.length - filtered.length,
        removedTypes: messages.slice(lastUserIdx + 1).map(m => m.type),
        segCount,
      });
      return filtered;
    }
    console.log('[DEDUP] displayMessages: NO TRIM NEEDED (user is last)', {
      isStreaming, msgCount: messages.length,
      msgTypes: messages.map(m => m.type),
      segCount,
    });
    return messages;
  }, [messages, isStreaming, isCompacting]);

  const handleLoadMore = useCallback(() => {
    fetchMoreMessages();
  }, [fetchMoreMessages]);

  // Redirect if required params are missing (MUST be after all hooks)
  if (!projectSlug || !sessionId) {
    return <Navigate to="/" replace />;
  }

  const sessionPanel = (
    <SessionQuickAccessPanel
      isOpen={showSessionPanel}
      projectSlug={projectSlug}
      currentSessionId={sessionId}
      onSelectSession={handleSessionSelect}
      onClose={handleCloseSessionPanel}
    />
  );

  const confirmModalElement = (
    <ConfirmModal
      isOpen={confirmModal.isOpen}
      title={confirmModal.action === 'agentLaunch' ? '에이전트 시작 확인' : '진행 중인 응답'}
      message={
        confirmModal.action === 'agentLaunch'
          ? '진행 중인 대화가 있습니다. 에이전트를 새 세션에서 시작하시겠습니까?'
          : confirmModal.action === 'newSession'
            ? '진행 중인 응답이 있습니다. 새 세션을 시작하시겠습니까?'
            : '진행 중인 응답이 있습니다. 세션을 전환하시겠습니까?'
      }
      confirmText="확인"
      cancelText="취소"
      onConfirm={executeConfirmedAction}
      onCancel={handleCancelConfirm}
      variant="danger"
    />
  );

  // Loading state
  if (isLoading) {
    return (
      <div
        data-testid="chat-page"
        className="h-dvh grid grid-rows-[auto_1fr_auto] bg-white dark:bg-gray-900"
      >
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} sessionName={sessionName} onBack={handleBack} onNewSession={handleNewSession} onShowSessions={handleShowSessions} onLogout={handleLogout} onRenameSession={handleRenameSession} activeAgent={activeAgent ? { name: activeAgent.name, command: activeAgent.command, icon: activeAgent.icon } : null} onAgentIndicatorClick={handleAgentIndicatorClick} isBmadProject={isBmadProject} />
        <main
          role="main"
          aria-label="채팅 페이지"
          className="flex-1 flex flex-col min-h-0"
        >
          <section
            role="log"
            aria-label="메시지 목록"
            aria-live="polite"
            data-testid="message-area"
            className="flex-1 overflow-y-auto"
          >
            <div className="content-container p-4">
              <MessageListSkeleton />
            </div>
          </section>
        </main>
        <InputArea disabled>
          <ChatInput
            onSend={handleSendMessage}
            disabled
            isStreaming={isStreaming}
            onAbort={handleAbort}
            placeholder="로딩 중..."
            commands={commands}
            permissionMode={permissionMode}
            onPermissionModeChange={setPermissionMode}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            activeModel={activeModel}
            isBmadProject={isBmadProject}
            onAgentSelect={handleAgentSelect}
            agentListOpenTrigger={agentListOpenTrigger}
            activeAgentCommand={activeAgent?.command}
            starCommands={activeAgentStarCommands}
            activeAgent={activeAgent}
            isFavorite={isFavorite}
            onToggleFavorite={handleToggleFavorite}
            favoriteCommands={favoriteCommands}
            onReorderFavorites={reorderFavorites}
            onRemoveFavorite={removeFavorite}

            isStarFavorite={isStarFavorite}
            onToggleStarFavorite={handleToggleStarFavorite}
            starFavorites={starFavorites}
            onReorderStarFavorites={reorderStarFavorites}
            onRemoveStarFavorite={handleRemoveStarFavorite}

          />
        </InputArea>
        {sessionPanel}
        {confirmModalElement}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        data-testid="chat-page"
        className="h-dvh grid grid-rows-[auto_1fr_auto] bg-white dark:bg-gray-900"
      >
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} sessionName={sessionName} onBack={handleBack} onNewSession={handleNewSession} onShowSessions={handleShowSessions} onLogout={handleLogout} onRenameSession={handleRenameSession} activeAgent={activeAgent ? { name: activeAgent.name, command: activeAgent.command, icon: activeAgent.icon } : null} onAgentIndicatorClick={handleAgentIndicatorClick} isBmadProject={isBmadProject} />
        <main
          role="main"
          aria-label="채팅 페이지"
          className="flex-1 flex flex-col min-h-0"
        >
          <section
            role="log"
            aria-label="메시지 목록"
            data-testid="message-area"
            className="flex-1 flex items-center justify-center"
          >
            <ErrorState errorType="unknown" onRetry={handleRetry} />
          </section>
        </main>
        <InputArea disabled>
          <ChatInput
            onSend={handleSendMessage}
            disabled
            isStreaming={isStreaming}
            onAbort={handleAbort}
            placeholder="오류가 발생했습니다"
            commands={commands}
            permissionMode={permissionMode}
            onPermissionModeChange={setPermissionMode}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            activeModel={activeModel}
            isBmadProject={isBmadProject}
            onAgentSelect={handleAgentSelect}
            agentListOpenTrigger={agentListOpenTrigger}
            activeAgentCommand={activeAgent?.command}
            starCommands={activeAgentStarCommands}
            activeAgent={activeAgent}
            isFavorite={isFavorite}
            onToggleFavorite={handleToggleFavorite}
            favoriteCommands={favoriteCommands}
            onReorderFavorites={reorderFavorites}
            onRemoveFavorite={removeFavorite}

            isStarFavorite={isStarFavorite}
            onToggleStarFavorite={handleToggleStarFavorite}
            starFavorites={starFavorites}
            onReorderStarFavorites={reorderStarFavorites}
            onRemoveStarFavorite={handleRemoveStarFavorite}

          />
        </InputArea>
        {sessionPanel}
        {confirmModalElement}
      </div>
    );
  }

  // Empty state (no messages)
  if (messages.length === 0) {
    return (
      <div
        data-testid="chat-page"
        className="h-dvh grid grid-rows-[auto_1fr_auto] bg-white dark:bg-gray-900"
      >
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} sessionName={sessionName} onBack={handleBack} onNewSession={handleNewSession} onShowSessions={handleShowSessions} onLogout={handleLogout} onRenameSession={handleRenameSession} activeAgent={activeAgent ? { name: activeAgent.name, command: activeAgent.command, icon: activeAgent.icon } : null} onAgentIndicatorClick={handleAgentIndicatorClick} isBmadProject={isBmadProject} />
        <main
          role="main"
          aria-label="채팅 페이지"
          className="flex-1 flex flex-col min-h-0"
        >
          <MessageArea
            streamingSegments={streamingSegments}
            isStreaming={isStreaming && !!streamingSessionId}
            isCompacting={isCompacting}
            segmentsPendingClear={segmentsPendingClear}
            emptyState={
              !isStreaming && streamingSegments.length === 0 ? (
                <EmptyState
                  title="새 세션"
                  description="Claude와 새 대화를 시작하세요."
                />
              ) : undefined
            }
          >
            {null}
          </MessageArea>
        </main>
        <InputArea>
          <ChatInput
            onSend={handleSendMessage}
            isStreaming={isStreaming}
            onAbort={handleAbort}
            placeholder={isStreaming ? '응답 중...' : '메시지를 입력하세요...'}
            commands={commands}
            permissionMode={permissionMode}
            onPermissionModeChange={setPermissionMode}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            activeModel={activeModel}
            isBmadProject={isBmadProject}
            onAgentSelect={handleAgentSelect}
            agentListOpenTrigger={agentListOpenTrigger}
            activeAgentCommand={activeAgent?.command}
            starCommands={activeAgentStarCommands}
            activeAgent={activeAgent}
            isFavorite={isFavorite}
            onToggleFavorite={handleToggleFavorite}
            favoriteCommands={favoriteCommands}
            onReorderFavorites={reorderFavorites}
            onRemoveFavorite={removeFavorite}

            isStarFavorite={isStarFavorite}
            onToggleStarFavorite={handleToggleStarFavorite}
            starFavorites={starFavorites}
            onReorderStarFavorites={reorderStarFavorites}
            onRemoveStarFavorite={handleRemoveStarFavorite}

          />
        </InputArea>
        {sessionPanel}
        {confirmModalElement}
      </div>
    );
  }

  // Messages view
  return (
    <div
      data-testid="chat-page"
      className="h-dvh flex flex-col bg-white dark:bg-gray-900"
    >
      <ChatHeader
        projectSlug={workingDirectory || projectSlug}
        sessionTitle={sessionId} sessionName={sessionName}
        onBack={handleBack}
        onNewSession={handleNewSession}
        onShowSessions={handleShowSessions}
        onRefresh={handleRetry}
        onLogout={handleLogout}
        onRenameSession={handleRenameSession}
        activeAgent={activeAgent ? { name: activeAgent.name, command: activeAgent.command, icon: activeAgent.icon } : null}
        onAgentIndicatorClick={handleAgentIndicatorClick}
        isBmadProject={isBmadProject}
      />

      <main
        role="main"
        aria-label="채팅 페이지"
        className="flex-1 flex flex-col min-h-0"
      >
        <MessageArea scrollDependencies={[messages]} streamingSegments={streamingSegments} isStreaming={isStreaming && !!streamingSessionId} isCompacting={isCompacting} isLoadingMore={isLoadingMore} segmentsPendingClear={segmentsPendingClear}>
          {/* Load older messages button */}
          {pagination?.hasMore && (
            <div className="flex justify-center py-4">
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400
                           hover:text-blue-700 dark:hover:text-blue-300
                           disabled:opacity-50 focus:outline-none focus:ring-2
                           focus:ring-blue-500 rounded-lg"
              >
                {isLoadingMore ? '로딩 중...' : '이전 메시지 더 보기'}
              </button>
            </div>
          )}

          {/* Message list */}
          {displayMessages.map((msg, idx) => renderHistoryMessage(msg, idx, displayMessages))}
        </MessageArea>
      </main>

      <InputArea>
        <ChatInput
          onSend={handleSendMessage}
          isStreaming={isStreaming}
          onAbort={handleAbort}
          placeholder={isStreaming ? '응답 중...' : '메시지를 입력하세요...'}
          commands={commands}
          permissionMode={permissionMode}
          onPermissionModeChange={setPermissionMode}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          activeModel={activeModel}
          isBmadProject={isBmadProject}
          onAgentSelect={handleAgentSelect}
          agentListOpenTrigger={agentListOpenTrigger}
          activeAgentCommand={activeAgent?.command}
          starCommands={activeAgentStarCommands}
          activeAgent={activeAgent}
          contextUsage={contextUsage}
          onNewSession={handleNewSession}
          onCompact={handleCompact}
          isFavorite={isFavorite}
          onToggleFavorite={handleToggleFavorite}
          favoriteCommands={favoriteCommands}
          onReorderFavorites={reorderFavorites}
          onRemoveFavorite={removeFavorite}
          isStarFavorite={isStarFavorite}
          onToggleStarFavorite={handleToggleStarFavorite}
          starFavorites={starFavorites}
          onReorderStarFavorites={reorderStarFavorites}
          onRemoveStarFavorite={handleRemoveStarFavorite}
        />
      </InputArea>
      {sessionPanel}
      {confirmModalElement}
    </div>
  );
}
