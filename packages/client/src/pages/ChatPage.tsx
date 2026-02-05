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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useMessageStore } from '../stores/messageStore';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import type { Attachment } from '@bmad-studio/shared';
import { useStreaming } from '../hooks/useStreaming';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { ChatHeader } from '../components/ChatHeader';
import { MessageArea } from '../components/MessageArea';
import { InputArea } from '../components/InputArea';
import { ChatInput } from '../components/ChatInput';
import { MessageBubble } from '../components/MessageBubble';
import { ToolCallCard } from '../components/ToolCallCard';
import { MessageListSkeleton } from '../components/MessageListSkeleton';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { SessionQuickAccessPanel } from '../components/SessionQuickAccessPanel';

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

  const { isStreaming, streamingSessionId, streamingSegments, sendMessage, abortStreaming, abortResponse, permissionMode, setPermissionMode, contextUsage, resetContextUsage, completedSessionId, clearCompletedSessionId } = useChatStore();
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
      // Add user message immediately (optimistic UI)
      addOptimisticMessage(content);
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

  // Fetch messages on mount (only for existing sessions)
  useEffect(() => {
    if (projectSlug && sessionId && sessionId !== 'new') {
      fetchMessages(projectSlug, sessionId);
    }
  }, [projectSlug, sessionId, fetchMessages]);

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

  const handleShowSessions = useCallback(() => {
    setShowSessionPanel(true);
  }, []);

  const handleCloseSessionPanel = useCallback(() => {
    setShowSessionPanel(false);
  }, []);

  const handleSessionSelect = useCallback((selectedSessionId: string) => {
    setShowSessionPanel(false);
    if (!projectSlug) return;
    // Don't navigate if selecting the current session
    if (selectedSessionId === sessionId) return;
    // Confirm if streaming is active
    const currentIsStreaming = useChatStore.getState().isStreaming;
    if (currentIsStreaming) {
      const confirmed = window.confirm('진행 중인 응답이 있습니다. 세션을 전환하시겠습니까?');
      if (!confirmed) return;
      abortResponse();
    }
    clearMessages();
    navigate(`/project/${projectSlug}/session/${selectedSessionId}`);
  }, [sessionId, abortResponse, clearMessages, navigate, projectSlug]);

  const handleNewSession = useCallback(() => {
    if (!projectSlug) return;
    const currentIsStreaming = useChatStore.getState().isStreaming;

    if (currentIsStreaming) {
      const confirmed = window.confirm('진행 중인 응답이 있습니다. 새 세션을 시작하시겠습니까?');
      if (!confirmed) return;
      abortResponse();
    }

    clearMessages();
    navigate(`/project/${projectSlug}/session/new`);
  }, [abortResponse, clearMessages, navigate, projectSlug]);

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

  // New session state
  if (sessionId === 'new') {
    return (
      <div
        data-testid="chat-page"
        className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-900"
      >
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} onBack={handleBack} onNewSession={handleNewSession} onShowSessions={handleShowSessions} contextUsage={contextUsage} />
        <main
          role="main"
          aria-label="채팅 페이지"
          className="flex-1 flex flex-col min-h-0"
        >
          <MessageArea
            scrollDependencies={[messages]}
            streamingSegments={streamingSegments}
            isStreaming={isStreaming && !!streamingSessionId}
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
            {messages.map((message) =>
              message.type === 'tool_use' || message.type === 'tool_result' ? (
                <ToolCallCard key={message.id} message={message} />
              ) : (
                <MessageBubble key={message.id} message={message} />
              )
            )}
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
          />
        </InputArea>
        {sessionPanel}
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
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} onBack={handleBack} onNewSession={handleNewSession} onShowSessions={handleShowSessions} contextUsage={contextUsage} />
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
          />
        </InputArea>
        {sessionPanel}
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
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} onBack={handleBack} onNewSession={handleNewSession} onShowSessions={handleShowSessions} contextUsage={contextUsage} />
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
          />
        </InputArea>
        {sessionPanel}
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
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} onBack={handleBack} onNewSession={handleNewSession} onShowSessions={handleShowSessions} contextUsage={contextUsage} />
        <main
          role="main"
          aria-label="채팅 페이지"
          className="flex-1 flex flex-col min-h-0"
        >
          <MessageArea
            streamingSegments={streamingSegments}
            isStreaming={isStreaming && !!streamingSessionId}
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
          />
        </InputArea>
        {sessionPanel}
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
      />

      <main
        role="main"
        aria-label="채팅 페이지"
        className="flex-1 flex flex-col min-h-0"
      >
        <MessageArea scrollDependencies={[messages]} streamingSegments={streamingSegments} isStreaming={isStreaming && !!streamingSessionId} isLoadingMore={isLoadingMore}>
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
          {messages.map((message) =>
            message.type === 'tool_use' || message.type === 'tool_result' ? (
              <ToolCallCard key={message.id} message={message} />
            ) : (
              <MessageBubble key={message.id} message={message} />
            )
          )}
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
        />
      </InputArea>
      {sessionPanel}
    </div>
  );
}
