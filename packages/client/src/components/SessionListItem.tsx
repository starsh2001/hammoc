/**
 * SessionListItem - Session list item component
 * [Source: Story 3.4 - Task 3]
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, MoreVertical, Trash2, Pencil, X } from 'lucide-react';
import type { SessionListItem as SessionListItemType } from '@bmad-studio/shared';
import { formatRelativeTime } from '../utils/formatters';

interface SessionListItemProps {
  session: SessionListItemType;
  onClick: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
  onRename?: (sessionId: string, name: string | null) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (sessionId: string) => void;
  /** Controlled inline edit mode */
  isEditing?: boolean;
  onEditStart?: (sessionId: string) => void;
  onEditEnd?: () => void;
}

export function SessionListItem({ session, onClick, onDelete, onRename, selectionMode, selected, onToggleSelect, isEditing, onEditStart, onEditEnd }: SessionListItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [editValue, setEditValue] = useState(session.name || '');
  const editInputRef = useRef<HTMLInputElement>(null);

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

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setEditValue(session.name || '');
    onEditStart?.(session.sessionId);
  };

  const handleRemoveNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onRename?.(session.sessionId, null);
  };

  const handleEditSubmit = () => {
    const trimmed = editValue.trim();
    onRename?.(session.sessionId, trimmed || null);
    onEditEnd?.();
  };

  const handleEditCancel = () => {
    onEditEnd?.();
  };

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

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
          {/* Session name badge + Session ID */}
          <div className="flex items-baseline gap-1.5 mb-0.5 min-w-0">
            {session.name && (
              <span className="flex-shrink-0 inline-block text-[11px] leading-tight font-medium px-1.5 py-px rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 max-w-[40%] truncate">
                {session.name}
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate font-mono">
              {session.sessionId}
            </span>
          </div>

          {/* Inline edit mode for renaming */}
          {isEditing ? (
            <input
              ref={editInputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleEditSubmit(); }
                if (e.key === 'Escape') { e.preventDefault(); handleEditCancel(); }
              }}
              onBlur={handleEditSubmit}
              onClick={(e) => e.stopPropagation()}
              placeholder="세션 이름 입력..."
              className="w-full text-sm font-medium bg-white dark:bg-gray-700 border border-blue-500 rounded px-2 py-1 mb-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            /* Primary title: always firstPrompt */
            <p className="text-gray-900 dark:text-white font-medium truncate mb-1">
              {session.firstPrompt || '새 세션'}
            </p>
          )}

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
      {(onDelete || onRename) && !selectionMode && (
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
              {onRename && (
                <button
                  type="button"
                  onClick={handleRenameClick}
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Pencil className="w-4 h-4" aria-hidden="true" />
                  이름 변경
                </button>
              )}
              {onRename && session.name && (
                <button
                  type="button"
                  onClick={handleRemoveNameClick}
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                  이름 제거
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  세션 삭제
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
