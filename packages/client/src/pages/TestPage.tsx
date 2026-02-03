/**
 * End-to-End Test Page
 * Story 1.5: End-to-End Test Page
 *
 * Provides a full communication flow test interface
 * for validating the relay server functionality
 */

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useChatMessages } from '../hooks/useChatMessages';
import { useTheme } from '../hooks/useTheme';
import { useSession } from '../hooks/useSession';
import { useAuthStore } from '../stores/authStore';
import { ConnectionStatusIndicator } from '../components/ConnectionStatusIndicator';
import { SettingsMenu } from '../components/SettingsMenu';
import { STORAGE_KEYS } from '../constants/storageKeys';
import type { DisplayMessage } from '@bmad-studio/shared';

/**
 * Format message content for display
 */
function formatToolArguments(args: Record<string, unknown>): string {
  return JSON.stringify(args, null, 2);
}

/**
 * Message component for displaying different message types
 */
function MessageItem({ message }: { message: DisplayMessage }) {
  const baseClasses = 'p-3 rounded-lg max-w-[85%] break-words';

  switch (message.type) {
    case 'user':
      return (
        <div className="flex justify-end">
          <div className={`${baseClasses} bg-blue-500 dark:bg-blue-600 text-white`}>
            {message.content}
          </div>
        </div>
      );

    case 'assistant':
      return (
        <div className="flex justify-start">
          <div className={`${baseClasses} bg-gray-200 dark:bg-gray-700 dark:text-white`}>
            <pre className="whitespace-pre-wrap font-sans">{message.content}</pre>
          </div>
        </div>
      );

    case 'tool_use':
      return (
        <div className="flex justify-start">
          <div className={`${baseClasses} bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-100`}>
            <div className="flex items-center gap-2 font-semibold mb-1">
              <span aria-hidden="true">🔧</span>
              <span>Tool: {message.toolCall?.name}</span>
            </div>
            {message.toolCall?.arguments && (
              <pre className="text-xs overflow-x-auto">
                {formatToolArguments(message.toolCall.arguments)}
              </pre>
            )}
          </div>
        </div>
      );

    case 'tool_result':
      return (
        <div className="flex justify-start">
          <div
            className={`${baseClasses} ${
              message.toolResult?.success
                ? 'bg-green-100 dark:bg-green-900 dark:text-green-100'
                : 'bg-red-100 dark:bg-red-900 dark:text-red-100'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold mb-1">
              <span aria-hidden="true">{message.toolResult?.success ? '✅' : '❌'}</span>
              <span>Tool Result</span>
            </div>
            <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
              {message.toolResult?.success ? message.toolResult.output : message.toolResult?.error}
            </pre>
          </div>
        </div>
      );

    case 'error':
      return (
        <div className="flex justify-start" role="alert">
          <div className={`${baseClasses} bg-red-100 dark:bg-red-900 border-l-4 border-red-500 dark:text-red-100`}>
            <div className="flex items-center gap-2 font-semibold">
              <span aria-hidden="true">❌</span>
              <span>Error</span>
            </div>
            <p className="text-sm mt-1">{message.content}</p>
          </div>
        </div>
      );

    default:
      return null;
  }
}

/**
 * Streaming indicator component
 */
function StreamingIndicator({ content }: { content: string }) {
  if (!content) return null;

  return (
    <div className="flex justify-start">
      <div className="p-3 rounded-lg max-w-[85%] bg-gray-200 dark:bg-gray-700 dark:text-white">
        <pre className="whitespace-pre-wrap font-sans">
          {content}
          <span className="animate-blink">▌</span>
        </pre>
      </div>
    </div>
  );
}

/**
 * Test Page Component
 */
export function TestPage() {
  const [projectPath, setProjectPath] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.TEST_PROJECT_PATH) || '';
  });
  const [inputPath, setInputPath] = useState<string>(projectPath);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { connectionStatus, reconnectAttempt, lastError: wsError, connect } = useWebSocket();
  const {
    messages,
    streamingContent,
    isStreaming,
    lastError: chatError,
    sendMessage,
    clearError,
    clearMessages,
  } = useChatMessages();
  const { theme, toggleTheme } = useTheme();
  const {
    currentSessionId,
    pendingResume,
    sessions,
    isLoadingSessions,
    resumeSession,
    startNewSession,
    listSessions,
  } = useSession();

  const [showSessionDropdown, setShowSessionDropdown] = useState(false);

  /**
   * Handle logout
   */
  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Auto-connect WebSocket on mount
  useEffect(() => {
    connect();
  }, [connect]);

  /**
   * Handle project path update
   */
  const handleSetPath = () => {
    setProjectPath(inputPath);
    localStorage.setItem(STORAGE_KEYS.TEST_PROJECT_PATH, inputPath);
  };

  /**
   * Handle message send
   */
  const handleSendMessage = () => {
    if (!inputMessage.trim() || !projectPath || isStreaming) return;

    // Get resume options if a session is selected for resumption
    const options = pendingResume ? { sessionId: pendingResume, resume: true } : undefined;
    sendMessage(inputMessage, projectPath, options);
    setInputMessage('');
    textareaRef.current?.focus();
  };

  /**
   * Handle new session start
   */
  const handleNewSession = () => {
    startNewSession();
    clearMessages();
    setShowSessionDropdown(false);
  };

  /**
   * Handle session resume selection
   */
  const handleResumeSession = (sessionId: string) => {
    resumeSession(sessionId);
    clearMessages();
    setShowSessionDropdown(false);
  };

  /**
   * Handle session dropdown toggle
   */
  const handleSessionDropdownToggle = () => {
    if (!showSessionDropdown && projectPath) {
      listSessions(projectPath);
    }
    setShowSessionDropdown(!showSessionDropdown);
  };

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            BMad Studio - E2E Test
          </h1>
          <div className="flex items-center gap-4">
            {/* Session Info */}
            {currentSessionId && (
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                Session: {currentSessionId.substring(0, 8)}...
              </span>
            )}

            {/* Session Dropdown */}
            <div className="relative">
              <button
                onClick={handleSessionDropdownToggle}
                disabled={!projectPath}
                className="px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="세션 관리"
              >
                Sessions
              </button>

              {showSessionDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
                  <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                    <button
                      onClick={handleNewSession}
                      className="w-full px-3 py-2 text-sm text-left bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-200 rounded hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors"
                    >
                      + New Session
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto">
                    {isLoadingSessions ? (
                      <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                        Loading...
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                        No sessions found
                      </div>
                    ) : (
                      sessions.map((session) => (
                        <button
                          key={session.sessionId}
                          onClick={() => handleResumeSession(session.sessionId)}
                          className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <div className="text-sm text-gray-900 dark:text-white truncate">
                            {session.firstPrompt}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {session.messageCount} messages
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <ConnectionStatusIndicator
              status={connectionStatus}
              reconnectAttempt={reconnectAttempt}
              lastError={wsError}
              onReconnect={connect}
            />
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="테마 전환"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* Settings Menu */}
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                aria-label="Settings menu"
                aria-expanded={showSettings}
                aria-haspopup="menu"
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
              <SettingsMenu
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Project Path Input */}
      <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <label htmlFor="project-path" className="text-sm text-gray-600 dark:text-gray-400">
              Project Path:
            </label>
            <div className="flex flex-1 gap-2">
              <input
                id="project-path"
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder="/path/to/project"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="프로젝트 경로 입력"
              />
              <button
                onClick={handleSetPath}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Set
              </button>
            </div>
          </div>
          {projectPath && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Current: <span className="font-mono">{projectPath}</span>
            </p>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-4xl mx-auto space-y-4" role="log" aria-live="polite">
          {messages.length === 0 && !streamingContent && (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              프로젝트 경로를 설정하고 메시지를 보내보세요.
            </div>
          )}

          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}

          {streamingContent && <StreamingIndicator content={streamingContent} />}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Error Banner */}
      {chatError && (
        <div
          className="bg-red-100 dark:bg-red-900 border-l-4 border-red-500 px-4 py-3"
          role="alert"
        >
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <p className="text-red-700 dark:text-red-200">
              <strong>[{chatError.code}]</strong> {chatError.message}
            </p>
            <button
              onClick={clearError}
              className="text-red-700 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100"
              aria-label="에러 닫기"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? 'Streaming...' : 'Type a message... (Enter to send, Shift+Enter for newline)'}
              disabled={isStreaming || !projectPath}
              rows={2}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
              aria-label="메시지 입력"
            />
            <button
              onClick={handleSendMessage}
              disabled={isStreaming || !inputMessage.trim() || !projectPath}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
              aria-label="메시지 전송"
            >
              Send
            </button>
          </div>
          {isStreaming && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Streaming...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
