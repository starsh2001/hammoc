/**
 * HeaderOverflowMenu - Mobile overflow menu for header actions
 *
 * Displays a ⋮ (more) button that opens a dropdown with header actions
 * that are hidden on mobile to save space.
 * Only visible on screens < md (768px).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreVertical, History, Plus, FolderOpen, GitBranch, Terminal, RefreshCw, Settings } from 'lucide-react';

interface HeaderOverflowMenuProps {
  onShowSessions?: () => void;
  onShowFileExplorer?: () => void;
  onShowGit?: () => void;
  onShowTerminal?: () => void;
  terminalAccessible?: boolean;
  onNewSession?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onNavigateSettings?: () => void;
  onToggleBranchViewer?: () => void;
  isBranchViewerMode?: boolean;
  isBranchViewerDisabled?: boolean;
}

export function HeaderOverflowMenu({
  onShowSessions,
  onShowFileExplorer,
  onShowGit,
  onShowTerminal,
  terminalAccessible = true,
  onNewSession,
  onRefresh,
  isRefreshing = false,
  onNavigateSettings,
  onToggleBranchViewer,
  isBranchViewerMode,
  isBranchViewerDisabled,
}: HeaderOverflowMenuProps) {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleShowSessions = useCallback(() => {
    onShowSessions?.();
    setIsOpen(false);
  }, [onShowSessions]);

  const handleShowFileExplorer = useCallback(() => {
    onShowFileExplorer?.();
    setIsOpen(false);
  }, [onShowFileExplorer]);

  const handleShowGit = useCallback(() => {
    onShowGit?.();
    setIsOpen(false);
  }, [onShowGit]);

  const handleShowTerminal = useCallback(() => {
    onShowTerminal?.();
    setIsOpen(false);
  }, [onShowTerminal]);

  const handleNewSession = useCallback(() => {
    onNewSession?.();
    setIsOpen(false);
  }, [onNewSession]);

  const handleRefresh = useCallback(() => {
    onRefresh?.();
    setIsOpen(false);
  }, [onRefresh]);

  const handleNavigateSettings = useCallback(() => {
    onNavigateSettings?.();
    setIsOpen(false);
  }, [onNavigateSettings]);

  const handleToggleBranchViewer = useCallback(() => {
    onToggleBranchViewer?.();
    setIsOpen(false);
  }, [onToggleBranchViewer]);

  const itemClass =
    'w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040] transition-colors';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="p-2 hover:bg-white/10 dark:hover:bg-[#253040] rounded-lg
                   text-white/80 dark:text-gray-200
                   focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label={t('headerMenu.moreMenu')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreVertical className="w-5 h-5" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-[#263240]
                     border border-gray-300 dark:border-[#3a4d5e] rounded-lg shadow-lg z-50
                     py-1 overflow-hidden"
        >
          {/* New session */}
          {onNewSession && (
            <button
              type="button"
              role="menuitem"
              onClick={handleNewSession}
              className={itemClass}
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {t('headerMenu.newSession')}
            </button>
          )}

          {/* Branch viewer */}
          {onToggleBranchViewer && (
            <button
              type="button"
              role="menuitem"
              onClick={isBranchViewerDisabled ? undefined : handleToggleBranchViewer}
              disabled={isBranchViewerDisabled}
              aria-disabled={isBranchViewerDisabled}
              className={`${itemClass} ${isBranchViewerDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${isBranchViewerMode ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
            >
              <GitBranch className="w-4 h-4" aria-hidden="true" />
              {isBranchViewerMode ? t('headerMenu.exitBranchViewer') : t('headerMenu.branchViewer')}
            </button>
          )}

          {/* Session list */}
          {onShowSessions && (
            <button
              type="button"
              role="menuitem"
              onClick={handleShowSessions}
              className={itemClass}
            >
              <History className="w-4 h-4" aria-hidden="true" />
              {t('headerMenu.sessionList')}
            </button>
          )}

          {/* File list */}
          {onShowFileExplorer && (
            <button
              type="button"
              role="menuitem"
              onClick={handleShowFileExplorer}
              className={itemClass}
            >
              <FolderOpen className="w-4 h-4" aria-hidden="true" />
              {t('headerMenu.fileList')}
            </button>
          )}

          {/* Git */}
          {onShowGit && (
            <button
              type="button"
              role="menuitem"
              onClick={handleShowGit}
              className={itemClass}
            >
              <GitBranch className="w-4 h-4" aria-hidden="true" />
              {t('headerMenu.git')}
            </button>
          )}

          {/* Terminal */}
          {onShowTerminal && (
            <button
              type="button"
              role="menuitem"
              onClick={terminalAccessible ? handleShowTerminal : undefined}
              disabled={!terminalAccessible}
              aria-disabled={!terminalAccessible}
              className={`${itemClass} ${!terminalAccessible ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Terminal className="w-4 h-4" aria-hidden="true" />
              {t('headerMenu.terminal')}
            </button>
          )}

          {/* Refresh */}
          {onRefresh && (
            <button
              type="button"
              role="menuitem"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`${itemClass} ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {isRefreshing ? t('headerMenu.refreshing') : t('headerMenu.refresh')}
            </button>
          )}

          {/* Settings */}
          {onNavigateSettings && (
            <>
              <div className="border-t border-gray-300 dark:border-[#3a4d5e] my-1" />
              <button
                type="button"
                role="menuitem"
                onClick={handleNavigateSettings}
                className={itemClass}
              >
                <Settings className="w-4 h-4" aria-hidden="true" />
                {t('project.settings')}
              </button>
            </>
          )}

        </div>
      )}
    </div>
  );
}
