/**
 * CardContextMenu - Context menu for board card actions
 * [Source: Story 21.3 - Task 1]
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { MoreVertical } from 'lucide-react';
import type { BoardItem } from '@bmad-studio/shared';

export interface CardContextMenuProps {
  item: BoardItem;
  onQuickFix?: (item: BoardItem) => void;
  onPromote?: (item: BoardItem, targetType: 'story' | 'epic') => void;
  onEdit?: (item: BoardItem) => void;
  onClose?: (item: BoardItem) => void;
  onWorkflowAction?: (item: BoardItem) => void;
  onViewEpicStories?: (item: BoardItem) => void;
  onMenuClose?: () => void;
}

interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  title?: string;
}

function getStoryWorkflowAction(
  item: BoardItem,
  onWorkflowAction?: (item: BoardItem) => void,
): MenuItem | null {
  if (!onWorkflowAction) return null;
  const map: Record<string, string> = {
    Draft: '스토리 검증',
    Approved: '개발 시작',
    InProgress: 'QA 요청',
    Review: 'QA 수정 적용',
  };
  const label = map[item.status];
  if (!label) return null;
  return { label, action: () => onWorkflowAction(item) };
}

export function CardContextMenu({
  item,
  onQuickFix,
  onPromote,
  onEdit,
  onClose,
  onWorkflowAction,
  onViewEpicStories,
  onMenuClose,
}: CardContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const menuItems: MenuItem[] = [];

  if (item.type === 'issue') {
    if (onQuickFix) {
      menuItems.push({ label: '바로 수정하기', action: () => onQuickFix(item) });
    }
    if (onPromote) {
      menuItems.push({
        label: '스토리로 승격',
        action: () => onPromote(item, 'story'),
        disabled: !!item.linkedStory,
        title: item.linkedStory ? '이미 스토리로 승격됨' : undefined,
      });
      menuItems.push({
        label: '에픽으로 승격',
        action: () => onPromote(item, 'epic'),
        disabled: !!item.linkedEpic,
        title: item.linkedEpic ? '이미 에픽으로 승격됨' : undefined,
      });
    }
    if (onEdit) {
      menuItems.push({ label: '편집', action: () => onEdit(item) });
    }
    if (onClose) {
      menuItems.push({ label: '닫기', action: () => onClose(item) });
    }
  } else if (item.type === 'story') {
    const workflowItem = getStoryWorkflowAction(item, onWorkflowAction);
    if (workflowItem) {
      menuItems.push(workflowItem);
    }
  } else if (item.type === 'epic') {
    if (onViewEpicStories) {
      menuItems.push({ label: '하위 스토리 보기', action: () => onViewEpicStories(item) });
    }
  }

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setFocusIndex(-1);
    onMenuClose?.();
  }, [onMenuClose]);

  // Outside click to close
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, closeMenu]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const enabledItems = menuItems.filter((mi) => !mi.disabled);
      const enabledIndices = menuItems
        .map((mi, i) => (!mi.disabled ? i : -1))
        .filter((i) => i !== -1);

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          closeMenu();
          break;
        case 'ArrowDown': {
          e.preventDefault();
          if (enabledItems.length === 0) break;
          const currentEnabledIdx = enabledIndices.indexOf(focusIndex);
          const nextIdx =
            currentEnabledIdx < 0 || currentEnabledIdx >= enabledIndices.length - 1
              ? enabledIndices[0]
              : enabledIndices[currentEnabledIdx + 1];
          setFocusIndex(nextIdx);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          if (enabledItems.length === 0) break;
          const currentEnabledIdx = enabledIndices.indexOf(focusIndex);
          const prevIdx =
            currentEnabledIdx <= 0
              ? enabledIndices[enabledIndices.length - 1]
              : enabledIndices[currentEnabledIdx - 1];
          setFocusIndex(prevIdx);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (focusIndex >= 0 && focusIndex < menuItems.length && !menuItems[focusIndex].disabled) {
            menuItems[focusIndex].action();
            closeMenu();
          }
          break;
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, focusIndex, closeMenu]);

  // No actions available — hide menu button
  if (menuItems.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
          setFocusIndex(-1);
        }}
        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
        aria-label="카드 메뉴"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1"
        >
          {menuItems.map((mi, idx) => (
            <button
              key={mi.label}
              role="menuitem"
              disabled={mi.disabled}
              title={mi.title}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                mi.disabled
                  ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : idx === focusIndex
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (!mi.disabled) {
                  mi.action();
                  closeMenu();
                }
              }}
              onMouseEnter={() => setFocusIndex(idx)}
            >
              {mi.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
