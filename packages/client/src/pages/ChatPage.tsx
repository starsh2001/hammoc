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

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useMessageStore } from '../stores/messageStore';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import type { Attachment, HistoryMessage } from '@bmad-studio/shared';
import { useStreaming } from '../hooks/useStreaming';
import { useSlashCommands } from '../hooks/useSlashCommands';
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
    fetchMessages,
    fetchMoreMessages,
    clearMessages,
    addOptimisticMessage,
  } = useMessageStore();

  const { isStreaming, isCompacting, streamingSessionId, streamingSegments, sendMessage, abortStreaming, abortResponse, permissionMode, setPermissionMode, selectedModel, setSelectedModel, activeModel, contextUsage, resetContextUsage, completedSessionId, clearCompletedSessionId, clearStreamingSegments } = useChatStore();
  const { projects, fetchProjects } = useProjectStore();

  // Navigate to the new sessionId when streaming completes (completedSessionId is set by completeStreaming)
  useEffect(() => {
    if (
      sessionId === 'new' &&
      completedSessionId &&
      completedSessionId !== 'pending' &&
      projectSlug
    ) {
      const targetSessionId = completedSessionId;
      clearCompletedSessionId();
      navigate(`/project/${projectSlug}/session/${targetSessionId}`, { replace: true });
    }
  }, [sessionId, completedSessionId, projectSlug, navigate, clearCompletedSessionId]);

  // Get working directory from project
  const workingDirectory = useMemo(() => {
    const project = projects.find((p) => p.projectSlug === projectSlug);
    return project?.originalPath || '';
  }, [projects, projectSlug]);

  // Fetch projects if not loaded (for direct URL navigation)
  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects();
    }
  }, [projects.length, fetchProjects]);

  // Initialize streaming event handlers
  useStreaming();

  // Fetch slash commands for autocomplete (Story 5.1)
  const { commands } = useSlashCommands(projectSlug);

  // Handle message send
  const handleSendMessage = useCallback(
    (content: string, attachments?: Attachment[]) => {
      if (!workingDirectory) {
        console.error('[ChatPage] Cannot send message: workingDirectory not found');
        return;
      }
      // Convert Attachment[] to ImageAttachment[] for optimistic message display
      const images = attachments?.map((a) => ({
        mimeType: a.mimeType,
        data: a.data,
        name: a.name,
      }));
      // Add user message immediately (optimistic UI)
      addOptimisticMessage(content, images);
      // Send to server
      sendMessage(content, {
        workingDirectory,
        sessionId: sessionId !== 'new' ? sessionId : undefined,
        resume: sessionId !== 'new',
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

  // Handle manual compaction
  const handleCompact = useCallback(() => {
    if (!workingDirectory || isStreaming || sessionId === 'new') return;
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
  useEffect(() => {
    if (projectSlug && sessionId && sessionId !== 'new') {
      fetchMessages(projectSlug, sessionId).then(() => {
        const chat = useChatStore.getState();
        if (!chat.isStreaming && chat.streamingSegments.length > 0) {
          clearStreamingSegments();
        }
      });
    }
  }, [projectSlug, sessionId, fetchMessages, clearStreamingSegments]);

  // Clear messages only on component unmount (not on sessionId change)
  useEffect(() => {
    return () => clearMessages();
  }, [clearMessages]);

  // Reset context usage on session change (separate from fetchMessages useEffect)
  useEffect(() => {
    resetContextUsage();
  }, [sessionId, resetContextUsage]);

  const handleBack = useCallback(() => {
    if (projectSlug) {
      navigate(`/project/${projectSlug}`);
    }
  }, [navigate, projectSlug]);

  // Session quick access panel state
  const [showSessionPanel, setShowSessionPanel] = useState(false);

  // Confirm modal state (non-blocking replacement for window.confirm)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'newSession' | 'switchSession';
    targetSessionId?: string;
  }>({ isOpen: false, action: 'newSession' });

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
      navigate(`/project/${projectSlug}/session/new`);
    } else if (confirmModal.action === 'switchSession' && confirmModal.targetSessionId) {
      clearMessages();
      clearStreamingSegments();
      navigate(`/project/${projectSlug}/session/${confirmModal.targetSessionId}`);
    }
  }, [confirmModal.action, confirmModal.targetSessionId, abortResponse, clearMessages, clearStreamingSegments, navigate, projectSlug]);

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
    navigate(`/project/${projectSlug}/session/new`);
  }, [clearMessages, clearStreamingSegments, navigate, projectSlug]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmModal({ isOpen: false, action: 'newSession' });
  }, []);

  const handleRetry = useCallback(() => {
    if (projectSlug && sessionId) {
      fetchMessages(projectSlug, sessionId);
    }
  }, [projectSlug, sessionId, fetchMessages]);

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
      onNewSession={handleNewSession}
    />
  );

  const confirmModalElement = (
    <ConfirmModal
      isOpen={confirmModal.isOpen}
      title="진행 중인 응답"
      message={
        confirmModal.action === 'newSession'
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

  // New session state
  if (sessionId === 'new') {
    return (
      <div
        data-testid="chat-page"
        className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-900"
      >
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} onBack={handleBack} onNewSession={handleNewSession} onShowSessions={handleShowSessions} contextUsage={contextUsage} onCompact={handleCompact} />
        <main
          role="main"
          aria-label="채팅 페이지"
          className="flex-1 flex flex-col min-h-0"
        >
          <MessageArea
            scrollDependencies={[messages]}
            streamingSegments={streamingSegments}
            isStreaming={isStreaming && !!streamingSessionId}
            isCompacting={isCompacting}
            emptyState={
              !isStreaming && streamingSegments.length === 0 && messages.length === 0 ? (
                <EmptyState
                  title="새 세션"
                  description="Claude와 새 대화를 시작하세요."
                />
              ) : undefined
            }
          >
            {/* Show user messages in new session too */}
            {messages.map((msg, idx) => renderHistoryMessage(msg, idx, messages))}
          </MessageArea>
        </main>
        <InputArea>
          <ChatInput
            onSend={handleSendMessage}
            disabled={isStreaming}
            isStreaming={isStreaming}
            onAbort={handleAbort}
            placeholder={isStreaming ? '응답 중...' : '메시지를 입력하세요...'}
            commands={commands}
            permissionMode={permissionMode}
            onPermissionModeChange={setPermissionMode}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            activeModel={activeModel}
          />
        </InputArea>
        {sessionPanel}
        {confirmModalElement}
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        data-testid="chat-page"
        className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-900"
      >
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} onBack={handleBack} onNewSession={handleNewSession} onShowSessions={handleShowSessions} contextUsage={contextUsage} onCompact={handleCompact} />
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
            className="flex-1 overflow-y-auto p-4"
          >
            <MessageListSkeleton />
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
        className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-900"
      >
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} onBack={handleBack} onNewSession={handleNewSession} onShowSessions={handleShowSessions} contextUsage={contextUsage} onCompact={handleCompact} />
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
        className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-900"
      >
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} onBack={handleBack} onNewSession={handleNewSession} onShowSessions={handleShowSessions} contextUsage={contextUsage} onCompact={handleCompact} />
        <main
          role="main"
          aria-label="채팅 페이지"
          className="flex-1 flex flex-col min-h-0"
        >
          <MessageArea
            streamingSegments={streamingSegments}
            isStreaming={isStreaming && !!streamingSessionId}
            isCompacting={isCompacting}
            emptyState={
              !isStreaming && streamingSegments.length === 0 ? (
                <EmptyState
                  title="메시지가 없습니다"
                  description="이 세션에 저장된 메시지가 없습니다."
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
            disabled={isStreaming}
            isStreaming={isStreaming}
            onAbort={handleAbort}
            placeholder={isStreaming ? '응답 중...' : '메시지를 입력하세요...'}
            commands={commands}
            permissionMode={permissionMode}
            onPermissionModeChange={setPermissionMode}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            activeModel={activeModel}
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
      className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-900"
    >
      <ChatHeader
        projectSlug={workingDirectory || projectSlug}
        sessionTitle={sessionId}
        onBack={handleBack}
        onNewSession={handleNewSession}
        onShowSessions={handleShowSessions}
        onRefresh={handleRetry}
        contextUsage={contextUsage}
        onCompact={handleCompact}
      />

      <main
        role="main"
        aria-label="채팅 페이지"
        className="flex-1 flex flex-col min-h-0"
      >
        <MessageArea scrollDependencies={[messages]} streamingSegments={streamingSegments} isStreaming={isStreaming && !!streamingSessionId} isCompacting={isCompacting} isLoadingMore={isLoadingMore}>
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
          {messages.map((msg, idx) => renderHistoryMessage(msg, idx, messages))}
        </MessageArea>
      </main>

      <InputArea>
        <ChatInput
          onSend={handleSendMessage}
          disabled={isStreaming}
          isStreaming={isStreaming}
          onAbort={handleAbort}
          placeholder={isStreaming ? '응답 중...' : '메시지를 입력하세요...'}
          commands={commands}
          permissionMode={permissionMode}
          onPermissionModeChange={setPermissionMode}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          activeModel={activeModel}
        />
      </InputArea>
      {sessionPanel}
      {confirmModalElement}
    </div>
  );
}
