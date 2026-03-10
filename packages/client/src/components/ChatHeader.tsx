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
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Plus, Settings, PanelRight } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import { useChatStore } from '../stores/chatStore';
import { formatAgentRoleLabel } from '../utils/agentUtils';
import { ThemeToggleButton } from './ThemeToggleButton';
import { LayoutToggleButton } from './LayoutToggleButton';
import { HeaderOverflowMenu } from './HeaderOverflowMenu';
import type { QuickPanelType } from '../stores/panelStore';
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
  /** Currently active quick panel type */
  activePanel?: QuickPanelType | null;
  /** Last active panel type (used to restore tab on reopen) */
  lastActivePanel?: QuickPanelType;
  /** Toggle quick panel by type */
  onTogglePanel?: (type: QuickPanelType) => void;
  /** Changed file count for Git badge */
  gitChangedCount?: number;
  /** Whether terminal is accessible (false = disabled button due to non-local IP) */
  terminalAccessible?: boolean;
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
  activePanel,
  lastActivePanel = 'sessions',
  onTogglePanel,
  gitChangedCount,
  terminalAccessible = true,
  onRenameSession,
  activeAgent,
  onAgentIndicatorClick,
  isBmadProject,
}: ChatHeaderProps) {
  const { t } = useTranslation('chat');
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
      aria-label={t('header.ariaLabel')}
      data-testid="chat-header"
      className="flex-shrink-0 sticky top-0 z-10 bg-slate-50 dark:bg-[#171e24]
                 border-b border-slate-200 dark:border-slate-700/50"
    >
      <div className="content-container flex items-center justify-between px-4 py-3 min-h-16">
        {/* Left side: Back button and project info */}
        <div className="flex items-stretch min-w-0 flex-1">
          {onBack && (
            <button
              onClick={onBack}
              className="self-center p-2 -ml-2 mr-2 hover:bg-gray-100 dark:hover:bg-gray-700
                         rounded-lg text-gray-700 dark:text-gray-200
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={t('header.backButton')}
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
              {projectSlug ? projectSlug.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : t('header.defaultTitle')}
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
                  placeholder={t('sessionTitle.placeholder')}
                  className="w-full text-xs bg-white dark:bg-gray-700 border border-blue-500 rounded px-1.5 py-0.5 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <div
                  className={`flex items-baseline gap-1.5 min-w-0 ${onRenameSession ? 'cursor-pointer group' : ''}`}
                  onClick={onRenameSession ? handleTitleClick : undefined}
                  title={onRenameSession ? t('sessionTitle.hint') : undefined}
                >
                  {sessionName && (
                    <span className="flex-shrink-0 text-[11px] leading-tight font-medium px-1.5 py-px rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 max-w-[40%] truncate">
                      {sessionName}
                    </span>
                  )}
                  <span className={`text-xs text-gray-500 dark:text-gray-300 truncate font-mono ${onRenameSession ? 'group-hover:text-blue-500 dark:group-hover:text-blue-400' : ''}`}>
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
                        aria-label={t('agentIndicator.ariaLabel', { agent: activeAgent ? formatAgentRoleLabel(activeAgent.command) || activeAgent.name : 'Claude' })}
                        data-testid="agent-indicator"
                        className={`flex-shrink-0 text-xs cursor-pointer ${
                          activeAgent
                            ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 rounded px-2 py-0.5'
                            : 'text-gray-500 dark:text-gray-300'
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
                         text-gray-700 dark:text-gray-200
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={t('header.newSession')}
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          {onTogglePanel && (
            <button
              onClick={() => onTogglePanel(activePanel ?? lastActivePanel)}
              className={`hidden md:block p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500
                transition-colors relative
                ${activePanel
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
                }`}
              aria-label={t('header.panelToggle')}
              aria-pressed={!!activePanel}
              title={t('header.panelToggle')}
              data-testid="panel-toggle-button"
            >
              <PanelRight className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="hidden md:block p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                         text-gray-700 dark:text-gray-200 disabled:opacity-50
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={isRefreshing ? t('header.refreshing') : t('header.refresh')}
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

          {/* Desktop-only: settings */}
          <button
            onClick={() => navigate('/settings')}
            aria-label={t('header.settings')}
            className="hidden md:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700
                       text-gray-700 dark:text-gray-200 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
          </button>

          {/* Mobile-only: overflow menu */}
          <div className="md:hidden">
            <HeaderOverflowMenu
              onShowSessions={onTogglePanel ? () => onTogglePanel('sessions') : undefined}
              onShowFileExplorer={onTogglePanel ? () => onTogglePanel('files') : undefined}
              onShowGit={onTogglePanel ? () => onTogglePanel('git') : undefined}
              onShowTerminal={onTogglePanel ? () => onTogglePanel('terminal') : undefined}
              terminalAccessible={terminalAccessible}
              onNewSession={onNewSession}
              onRefresh={onRefresh}
              isRefreshing={isRefreshing}
              onNavigateSettings={() => navigate('/settings')}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
