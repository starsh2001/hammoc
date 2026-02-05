/**
 * ChatHeader Component
 * Header for chat page with project path and session info
 * [Source: Story 4.1 - Task 2, Story 4.7 - Task 3]
 */

import { ArrowLeft, RefreshCw, Plus, History } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import { ContextUsageDisplay } from './ContextUsageDisplay';
import { ThemeToggleButton } from './ThemeToggleButton';
import { BrandLogo } from './BrandLogo';
import type { ChatUsage } from '@bmad-studio/shared';

interface ChatHeaderProps {
  /** Project slug/path to display */
  projectSlug?: string;
  /** Session title or ID to display */
  sessionTitle?: string;
  /** Callback when back button is clicked */
  onBack?: () => void;
  /** Callback when refresh button is clicked */
  onRefresh?: () => void;
  /** Whether refresh is in progress */
  isRefreshing?: boolean;
  /** Callback when new session button is clicked */
  onNewSession?: () => void;
  /** Callback when session history button is clicked */
  onShowSessions?: () => void;
  /** Context usage data from last SDK response */
  contextUsage?: ChatUsage | null;
}

export function ChatHeader({
  projectSlug,
  sessionTitle,
  onBack,
  onRefresh,
  isRefreshing = false,
  onNewSession,
  onShowSessions,
  contextUsage,
}: ChatHeaderProps) {
  const { connectionStatus, reconnectAttempt, lastError, connect } = useWebSocket();

  return (
    <header
      aria-label="채팅 헤더"
      data-testid="chat-header"
      className="flex-shrink-0 sticky top-0 z-10 bg-white dark:bg-gray-800
                 border-b border-gray-200 dark:border-gray-700"
    >
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left side: Back button and project info */}
        <div className="flex items-center min-w-0 flex-1">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 -ml-2 mr-2 hover:bg-gray-100 dark:hover:bg-gray-700
                         rounded-lg text-gray-700 dark:text-gray-300
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="세션 목록으로 돌아가기"
            >
              <ArrowLeft className="w-6 h-6" aria-hidden="true" />
            </button>
          )}

          <BrandLogo />
          <div className="w-px self-stretch bg-gray-200 dark:bg-gray-700 mx-3" />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold truncate text-gray-900 dark:text-white">
              {projectSlug || '채팅'}
            </h1>
            {sessionTitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
                {sessionTitle}
              </p>
            )}
          </div>
        </div>

        {/* Right side: Connection status and Actions */}
        <div className="flex items-center gap-2 ml-4">
          {/* Context usage display */}
          <ContextUsageDisplay
            contextUsage={contextUsage ?? null}
            onNewSession={onNewSession}
          />

          {/* Connection status indicator (compact mode) */}
          <ConnectionStatusIndicator
            status={connectionStatus}
            reconnectAttempt={reconnectAttempt}
            lastError={lastError}
            onReconnect={connect}
            compact
          />

          {/* Theme toggle */}
          <ThemeToggleButton />

          {onShowSessions && (
            <button
              onClick={onShowSessions}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                         text-gray-700 dark:text-gray-300
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="세션 목록"
            >
              <History className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          {onNewSession && (
            <button
              onClick={onNewSession}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                         text-gray-700 dark:text-gray-300
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="새 세션 시작"
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                         text-gray-700 dark:text-gray-300 disabled:opacity-50
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={isRefreshing ? '새로고침 중' : '새로고침'}
            >
              <RefreshCw
                className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
