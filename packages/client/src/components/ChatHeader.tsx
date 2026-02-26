/**
 * ChatHeader Component
 * Header for chat page with project path and session info
 * [Source: Story 4.1 - Task 2, Story 4.7 - Task 3]
 *
 * Responsive:
 * - Mobile (< md): ContextUsage + ConnectionStatus + overflow menu (⋮)
 * - Desktop (≥ md): All icons inline
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Plus, History, FolderOpen, GitBranch, Terminal, Settings, LogOut } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import { useChatStore } from '../stores/chatStore';
import { formatAgentRoleLabel } from '../utils/agentUtils';
import { ThemeToggleButton } from './ThemeToggleButton';
import { LayoutToggleButton } from './LayoutToggleButton';
import { HeaderOverflowMenu } from './HeaderOverflowMenu';
import { BrandLogo } from './BrandLogo';

interface ChatHeaderProps {
  /** Project slug/path to display */
  projectSlug?: string;
  /** Session title or ID to display */
  sessionTitle?: string;
  /** User-assigned session name (shown as badge) */
  sessionName?: string;
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
  /** Callback when file explorer button is clicked */
  onShowFileExplorer?: () => void;
  /** Callback when Git panel button is clicked */
  onShowGit?: () => void;
  /** Changed file count for Git badge */
  gitChangedCount?: number;
  /** Callback when terminal panel button is clicked */
  onShowTerminal?: () => void;
  /** Whether terminal is accessible (false = disabled button due to non-local IP) */
  terminalAccessible?: boolean;
  /** Callback when logout is clicked */
  onLogout?: () => void;
  /** Callback when session is renamed (null to remove name) */
  onRenameSession?: (name: string | null) => void;
  /** Active agent info (name, command, optional icon) */
  activeAgent?: { name: string; command: string; icon?: string } | null;
  /** Callback when agent indicator is clicked */
  onAgentIndicatorClick?: () => void;
  /** Whether current project is a BMad project */
  isBmadProject?: boolean;
}

export function ChatHeader({
  projectSlug,
  sessionTitle,
  sessionName,
  onBack,
  onRefresh,
  isRefreshing = false,
  onNewSession,
  onShowSessions,
  onShowFileExplorer,
  onShowGit,
  gitChangedCount,
  onShowTerminal,
  terminalAccessible = true,
  onLogout,
  onRenameSession,
  activeAgent,
  onAgentIndicatorClick,
  isBmadProject,
}: ChatHeaderProps) {
  const navigate = useNavigate();
  const { connectionStatus, reconnectAttempt, lastError, connect } = useWebSocket();
  const apiHealth = useChatStore((state) => state.apiHealth);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleClick = () => {
    if (!onRenameSession) return;
    setEditTitleValue(sessionName || '');
    setIsEditingTitle(true);
  };

  const handleTitleSubmit = () => {
    const trimmed = editTitleValue.trim();
    onRenameSession?.(trimmed || null);
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
  };

  return (
    <header
      aria-label="채팅 헤더"
      data-testid="chat-header"
      className="flex-shrink-0 sticky top-0 z-10 bg-gray-50 dark:bg-gray-800
                 border-b border-gray-200 dark:border-gray-700"
    >
      <div className="content-container flex items-center justify-between px-4 py-3 min-h-16">
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
            <h1
              className="text-base font-semibold truncate text-gray-900 dark:text-white"
              title={projectSlug}
            >
              {projectSlug ? projectSlug.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : '채팅'}
            </h1>
            {sessionTitle && (
              isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleTitleSubmit(); }
                    if (e.key === 'Escape') { e.preventDefault(); handleTitleCancel(); }
                  }}
                  onBlur={handleTitleSubmit}
                  placeholder="세션 이름 입력..."
                  className="w-full text-xs bg-white dark:bg-gray-700 border border-blue-500 rounded px-1.5 py-0.5 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <div
                  className={`flex items-baseline gap-1.5 min-w-0 ${onRenameSession ? 'cursor-pointer group' : ''}`}
                  onClick={onRenameSession ? handleTitleClick : undefined}
                  title={onRenameSession ? '클릭하여 세션 이름 변경' : undefined}
                >
                  {sessionName && (
                    <span className="flex-shrink-0 text-[11px] leading-tight font-medium px-1.5 py-px rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 max-w-[40%] truncate">
                      {sessionName}
                    </span>
                  )}
                  <span className={`text-xs text-gray-500 dark:text-gray-400 truncate font-mono ${onRenameSession ? 'group-hover:text-blue-500 dark:group-hover:text-blue-400' : ''}`}>
                    {sessionTitle}
                  </span>
                  {isBmadProject && (
                    <>
                      <span className="text-xs text-gray-300 dark:text-gray-600 mx-1">|</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); onAgentIndicatorClick?.(); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            onAgentIndicatorClick?.();
                          }
                        }}
                        aria-label={`현재 에이전트: ${activeAgent ? formatAgentRoleLabel(activeAgent.command) || activeAgent.name : 'Claude'}. 클릭하여 에이전트 목록 열기`}
                        data-testid="agent-indicator"
                        className={`flex-shrink-0 text-xs cursor-pointer ${
                          activeAgent
                            ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 rounded px-2 py-0.5'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {activeAgent ? (
                          <>{activeAgent.icon && <span>{activeAgent.icon}</span>} {formatAgentRoleLabel(activeAgent.command) || activeAgent.name}</>
                        ) : (
                          'Claude'
                        )}
                      </span>
                    </>
                  )}
                </div>
              )
            )}
          </div>
        </div>

        {/* Right side: Connection status and Actions */}
        <div className="flex items-center gap-1 ml-4">
          {/* Connection status indicator - always visible */}
          <ConnectionStatusIndicator
            status={connectionStatus}
            reconnectAttempt={reconnectAttempt}
            lastError={lastError}
            onReconnect={connect}
            compact
            apiHealthy={apiHealth?.healthy ?? null}
          />

          {/* Desktop-only: inline action buttons */}
          {onNewSession && (
            <button
              onClick={onNewSession}
              className="hidden md:block p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                         text-gray-700 dark:text-gray-300
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="새 세션 시작"
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          {onShowSessions && (
            <button
              onClick={onShowSessions}
              className="hidden md:block p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                         text-gray-700 dark:text-gray-300
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="세션 목록"
            >
              <History className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          {onShowFileExplorer && (
            <button
              onClick={onShowFileExplorer}
              className="hidden md:block p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                         text-gray-700 dark:text-gray-300
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="파일 리스트"
            >
              <FolderOpen className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          {onShowGit && (
            <button
              onClick={onShowGit}
              className="hidden md:block relative p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                         text-gray-700 dark:text-gray-300
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Git 패널"
            >
              <GitBranch className="w-5 h-5" aria-hidden="true" />
              {!!gitChangedCount && gitChangedCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center leading-none px-1">
                  {gitChangedCount}
                </span>
              )}
            </button>
          )}

          {onShowTerminal && (
            <button
              onClick={terminalAccessible ? onShowTerminal : undefined}
              disabled={!terminalAccessible}
              className={`hidden md:block p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                terminalAccessible
                  ? 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  : 'opacity-50 cursor-not-allowed text-gray-400 dark:text-gray-500'
              }`}
              aria-label="터미널"
              aria-disabled={!terminalAccessible}
              title={!terminalAccessible ? '보안상 로컬 네트워크 외부에서는 터미널을 이용할 수 없습니다' : undefined}
            >
              <Terminal className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="hidden md:block p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
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

          <div className="hidden md:flex items-center">
            <LayoutToggleButton />
            <ThemeToggleButton />
          </div>

          {/* Desktop-only: settings + logout */}
          <button
            onClick={() => navigate('/settings')}
            aria-label="설정"
            className="hidden md:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700
                       text-gray-700 dark:text-gray-300 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
          </button>
          {onLogout && (
            <button
              onClick={onLogout}
              aria-label="로그아웃"
              className="hidden md:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700
                         text-red-600 dark:text-red-400 transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <LogOut className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          {/* Mobile-only: overflow menu */}
          <div className="md:hidden">
            <HeaderOverflowMenu
              onShowSessions={onShowSessions}
              onShowFileExplorer={onShowFileExplorer}
              onShowGit={onShowGit}
              onShowTerminal={onShowTerminal}
              terminalAccessible={terminalAccessible}
              onNewSession={onNewSession}
              onRefresh={onRefresh}
              isRefreshing={isRefreshing}
              onNavigateSettings={() => navigate('/settings')}
              onLogout={onLogout}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
