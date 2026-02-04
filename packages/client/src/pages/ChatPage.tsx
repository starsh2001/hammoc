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

import { useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useMessageStore } from '../stores/messageStore';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
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

  const { isStreaming, streamingSessionId, streamingSegments, sendMessage } = useChatStore();
  const { projects, fetchProjects } = useProjectStore();

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
    (content: string) => {
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
      });
    },
    [sendMessage, addOptimisticMessage, workingDirectory, sessionId]
  );

  // Redirect if required params are missing
  if (!projectSlug || !sessionId) {
    return <Navigate to="/" replace />;
  }

  // Fetch messages on mount
  useEffect(() => {
    if (sessionId !== 'new') {
      fetchMessages(projectSlug, sessionId);
    }
    return () => clearMessages();
  }, [projectSlug, sessionId, fetchMessages, clearMessages]);

  const handleBack = useCallback(() => {
    navigate(`/project/${projectSlug}`);
  }, [navigate, projectSlug]);

  const handleRetry = useCallback(() => {
    fetchMessages(projectSlug, sessionId);
  }, [projectSlug, sessionId, fetchMessages]);

  const handleLoadMore = useCallback(() => {
    fetchMoreMessages();
  }, [fetchMoreMessages]);

  // New session state
  if (sessionId === 'new') {
    return (
      <div
        data-testid="chat-page"
        className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-900"
      >
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} onBack={handleBack} />
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
                  title="새 세션"
                  description="Claude와 새 대화를 시작하세요. 메시지 입력은 다음 스토리에서 구현됩니다."
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
            placeholder={isStreaming ? '응답 중...' : '메시지를 입력하세요...'}
            commands={commands}
          />
        </InputArea>
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
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} onBack={handleBack} />
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
          <ChatInput onSend={handleSendMessage} disabled placeholder="로딩 중..." commands={commands} />
        </InputArea>
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
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} onBack={handleBack} />
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
          <ChatInput onSend={handleSendMessage} disabled placeholder="오류가 발생했습니다" commands={commands} />
        </InputArea>
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
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} onBack={handleBack} />
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
            placeholder={isStreaming ? '응답 중...' : '메시지를 입력하세요...'}
            commands={commands}
          />
        </InputArea>
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
        onRefresh={handleRetry}
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
          placeholder={isStreaming ? '응답 중...' : '메시지를 입력하세요...'}
          commands={commands}
        />
      </InputArea>
    </div>
  );
}
