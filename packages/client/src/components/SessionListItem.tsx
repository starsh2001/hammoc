/**
 * SessionListItem - Session list item component
 * [Source: Story 3.4 - Task 3]
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, MoreVertical, Trash2 } from 'lucide-react';
import type { SessionListItem as SessionListItemType } from '@bmad-studio/shared';
import { formatRelativeTime } from '../utils/formatters';

interface SessionListItemProps {
  session: SessionListItemType;
  onClick: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (sessionId: string) => void;
}

export function SessionListItem({ session, onClick, onDelete, selectionMode, selected, onToggleSelect }: SessionListItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect?.(session.sessionId);
      return;
    }
    if (!menuOpen) {
      onClick(session.sessionId);
    }
  };

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onDelete?.(session.sessionId);
  };

  // Close menu on outside click
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setMenuOpen(false);
    }
  }, []);

  useEffect(() => {
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [menuOpen, handleOutsideClick]);

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onToggleSelect?.(session.sessionId);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`relative w-full text-left p-4 bg-white dark:bg-gray-800 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 cursor-pointer ${
        selected
          ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400'
      }`}
      aria-label={`세션: ${session.firstPrompt || '새 세션'}. 메시지 ${session.messageCount}개. ${formatRelativeTime(session.modified)}`}
    >
      <div className="flex items-start gap-3">
        {/* Selection checkbox */}
        {selectionMode && (
          <div className="flex-shrink-0 pt-0.5">
            <input
              type="checkbox"
              checked={selected || false}
              onChange={handleCheckboxChange}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
              aria-label={`${session.firstPrompt || '새 세션'} 선택`}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Session ID */}
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate mb-1 font-mono">
            {session.sessionId}
          </p>

          {/* First Prompt Preview */}
          <p className="text-gray-900 dark:text-white font-medium truncate mb-2">
            {session.firstPrompt || '새 세션'}
          </p>

          {/* Meta Info */}
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <span className="relative flex h-2 w-2 mr-1" title={session.isStreaming ? '스트리밍 중' : '대기 중'}>
                {session.isStreaming && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${session.isStreaming ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
              </span>
              <MessageSquare className="w-4 h-4" aria-hidden="true" />
              <span>{session.messageCount}개 메시지</span>
            </div>
            <span>{formatRelativeTime(session.modified)}</span>
          </div>
        </div>
      </div>

      {/* Kebab menu - hidden in selection mode */}
      {onDelete && !selectionMode && (
        <div ref={menuRef} className="absolute top-2 right-2 z-10">
          <button
            type="button"
            onClick={handleMenuToggle}
            aria-label="세션 메뉴"
            aria-expanded={menuOpen}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            <MoreVertical className="w-4 h-4" aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1"
              role="menu"
            >
              <button
                type="button"
                onClick={handleDeleteClick}
                role="menuitem"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                세션 삭제
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
