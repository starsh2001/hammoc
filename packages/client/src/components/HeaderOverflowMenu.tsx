/**
 * HeaderOverflowMenu - Mobile overflow menu for header actions
 *
 * Displays a ⋮ (more) button that opens a dropdown with header actions
 * that are hidden on mobile to save space.
 * Only visible on screens < md (768px).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { MoreVertical, Moon, Sun, History, Plus, RefreshCw, LogOut } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

interface HeaderOverflowMenuProps {
  onShowSessions?: () => void;
  onNewSession?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onLogout?: () => void;
}

export function HeaderOverflowMenu({
  onShowSessions,
  onNewSession,
  onRefresh,
  isRefreshing = false,
  onLogout,
}: HeaderOverflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

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

  const handleThemeToggle = useCallback(() => {
    toggleTheme();
    setIsOpen(false);
  }, [toggleTheme]);

  const handleShowSessions = useCallback(() => {
    onShowSessions?.();
    setIsOpen(false);
  }, [onShowSessions]);

  const handleNewSession = useCallback(() => {
    onNewSession?.();
    setIsOpen(false);
  }, [onNewSession]);

  const handleRefresh = useCallback(() => {
    onRefresh?.();
    setIsOpen(false);
  }, [onRefresh]);

  const handleLogout = useCallback(() => {
    onLogout?.();
    setIsOpen(false);
  }, [onLogout]);

  const itemClass =
    'w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                   text-gray-700 dark:text-gray-300
                   focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="더보기 메뉴"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreVertical className="w-5 h-5" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800
                     border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50
                     py-1 overflow-hidden"
        >
          {/* Theme toggle */}
          <button
            type="button"
            role="menuitem"
            onClick={handleThemeToggle}
            className={itemClass}
          >
            {isDark ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
            {isDark ? '라이트 모드' : '다크 모드'}
          </button>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

          {/* Session list */}
          {onShowSessions && (
            <button
              type="button"
              role="menuitem"
              onClick={handleShowSessions}
              className={itemClass}
            >
              <History className="w-4 h-4" aria-hidden="true" />
              세션 목록
            </button>
          )}

          {/* New session */}
          {onNewSession && (
            <button
              type="button"
              role="menuitem"
              onClick={handleNewSession}
              className={itemClass}
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              새 세션
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
              {isRefreshing ? '새로고침 중...' : '새로고침'}
            </button>
          )}

          {/* Logout */}
          {onLogout && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                로그아웃
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
