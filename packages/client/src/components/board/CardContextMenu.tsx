/**
 * CardContextMenu - Context menu for board card actions
 * [Source: Story 21.3 - Task 1]
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BoardItem } from '@hammoc/shared';
import { resolveBadge } from './constants';

export interface CardContextMenuProps {
  item: BoardItem;
  onQuickFix?: (item: BoardItem) => void;
  onPromote?: (item: BoardItem, targetType: 'story' | 'epic') => void;
  onEdit?: (item: BoardItem) => void;
  onClose?: (item: BoardItem) => void;
  onReopen?: (item: BoardItem) => void;
  onDelete?: (item: BoardItem) => void;
  onWorkflowAction?: (item: BoardItem) => void;
  onValidateAndFixAction?: (item: BoardItem) => void;
  onValidateOnlyAction?: (item: BoardItem) => void;
  onViewEpicStories?: (item: BoardItem) => void;
  onCreateNextStory?: (item: BoardItem) => void;
  onRequestQAReview?: (item: BoardItem) => void;
  onIssueStatusChange?: (item: BoardItem, status: string) => void;
  onCommitAndComplete?: (item: BoardItem) => void;
  onMenuClose?: () => void;
}

interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  title?: string;
}

function getStoryWorkflowActions(
  item: BoardItem,
  badgeId: string,
  onWorkflowAction: ((item: BoardItem) => void) | undefined,
  onValidateAndFixAction: ((item: BoardItem) => void) | undefined,
  onValidateOnlyAction: ((item: BoardItem) => void) | undefined,
  onCommitAndComplete: ((item: BoardItem) => void) | undefined,
  t: (key: string) => string,
): MenuItem[] {
  // Draft — validate+fix and validate-only
  if (badgeId === 'draft') {
    const items: MenuItem[] = [];
    if (onValidateAndFixAction) {
      items.push({ label: t('workflow.validateAndFixStory'), action: () => onValidateAndFixAction(item) });
    }
    const validateOnly = onValidateOnlyAction ?? onWorkflowAction;
    if (validateOnly) {
      items.push({ label: t('workflow.validateStoryOnly'), action: () => validateOnly(item) });
    }
    return items;
  }

  // Approved — start dev first, then validate options
  if (badgeId === 'approved') {
    const items: MenuItem[] = [];
    if (onWorkflowAction) {
      items.push({ label: t('workflow.startDevelopment'), action: () => onWorkflowAction(item) });
    }
    if (onValidateAndFixAction) {
      items.push({ label: t('workflow.validateAndFixStory'), action: () => onValidateAndFixAction(item) });
    }
    if (onValidateOnlyAction) {
      items.push({ label: t('workflow.validateStoryOnly'), action: () => onValidateOnlyAction(item) });
    }
    return items;
  }

  if (!onWorkflowAction) return [];

  // QA gate compound badges
  if (badgeId === 'qa-passed' || badgeId === 'qa-waived') {
    const items: MenuItem[] = [];
    if (onCommitAndComplete) {
      items.push({ label: t('workflow.commitAndCompleteStory'), action: () => onCommitAndComplete(item) });
    }
    items.push({ label: t('workflow.completeStory'), action: () => onWorkflowAction(item) });
    return items;
  }
  if (badgeId === 'qa-failed' || badgeId === 'qa-concerns') {
    return [{ label: t('workflow.applyQAFix'), action: () => onWorkflowAction(item) }];
  }
  if (badgeId === 'qa-fixed') {
    return [{ label: t('workflow.reviewStory'), action: () => onWorkflowAction(item) }];
  }

  // No gate — request QA review
  if (badgeId === 'ready-for-review' || badgeId === 'ready-for-done') {
    return [{ label: t('workflow.reviewStory'), action: () => onWorkflowAction(item) }];
  }

  const labelMap: Record<string, string> = {
    'in-progress': t('workflow.resumeDevelopment'),
  };

  const label = labelMap[badgeId];
  if (!label) return [];
  return [{ label, action: () => onWorkflowAction(item) }];
}

export function CardContextMenu({
  item,
  onQuickFix,
  onPromote,
  onEdit,
  onClose,
  onReopen,
  onDelete,
  onWorkflowAction,
  onValidateAndFixAction,
  onValidateOnlyAction,
  onViewEpicStories,
  onCreateNextStory,
  onRequestQAReview,
  onIssueStatusChange,
  onCommitAndComplete,
  onMenuClose,
}: CardContextMenuProps) {
  const { t } = useTranslation('board');
  const [isOpen, setIsOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const menuItems: MenuItem[] = [];
  const badge = resolveBadge(item);

  if (item.type === 'issue') {
    if (badge.id === 'open') {
      if (onQuickFix) {
        menuItems.push({ label: t('issue.quickFix'), action: () => onQuickFix(item) });
      }
      if (onPromote) {
        menuItems.push({
          label: t('issue.promoteToStory'),
          action: () => onPromote(item, 'story'),
          disabled: !!item.linkedStory,
          title: item.linkedStory ? t('issue.alreadyPromotedToStory') : undefined,
        });
        menuItems.push({
          label: t('issue.promoteToEpic'),
          action: () => onPromote(item, 'epic'),
          disabled: !!item.linkedEpic,
          title: item.linkedEpic ? t('issue.alreadyPromotedToEpic') : undefined,
        });
      }
      if (onEdit) {
        menuItems.push({ label: t('common:button.edit'), action: () => onEdit(item) });
      }
      if (onClose) {
        menuItems.push({ label: t('common:button.close'), action: () => onClose(item) });
      }
    } else if (badge.id === 'in-progress' && onWorkflowAction) {
      menuItems.push({ label: t('issue.resumeDev'), action: () => onWorkflowAction(item) });
    } else if (badge.id === 'ready-for-done' && onIssueStatusChange) {
      // Ready for Done → commit & done, then plain done
      if (onCommitAndComplete) {
        menuItems.push({ label: t('issue.commitAndMarkDone'), action: () => onCommitAndComplete(item) });
      }
      menuItems.push({ label: t('issue.markDone'), action: () => onIssueStatusChange(item, 'Done') });
    } else if ((badge.id === 'closed' || badge.id === 'done' || badge.id === 'promoted') && onReopen) {
      menuItems.push({ label: t('issue.reopen'), action: () => onReopen(item) });
    }
    if (onDelete) {
      menuItems.push({
        label: t('common:button.delete'),
        action: () => onDelete(item),
      });
    }
  } else if (item.type === 'story') {
    const workflowItems = getStoryWorkflowActions(item, badge.id, onWorkflowAction, onValidateAndFixAction, onValidateOnlyAction, onCommitAndComplete, t);
    for (const wi of workflowItems) {
      menuItems.push(wi);
    }
    // QA re-request: stories that passed/waived QA can re-request
    if (
      onRequestQAReview &&
      (badge.id === 'qa-passed' || badge.id === 'qa-waived')
    ) {
      menuItems.push({
        label: t('workflow.requestQAReview'),
        action: () => onRequestQAReview(item),
      });
    }
  } else if (item.type === 'epic') {
    if (onViewEpicStories) {
      menuItems.push({ label: t('epic.viewSubStories'), action: () => onViewEpicStories(item) });
    }
    if (badge.id !== 'done' && onCreateNextStory) {
      menuItems.push({ label: t('epic.createNextStory'), action: () => onCreateNextStory(item) });
    }
  }

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setFocusIndex(-1);
    onMenuClose?.();
  }, [onMenuClose]);

  // Compute menu position when opened
  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 192; // w-48 = 12rem = 192px
    let left = rect.right - menuWidth;
    if (left < 0) left = rect.left;
    setMenuPos({ top: rect.bottom + 4, left });
  }, [isOpen]);

  // Outside click to close
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
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
  }, [isOpen, focusIndex, closeMenu]);

  // No actions available — hide menu button
  if (menuItems.length === 0) return null;

  return (
    <div ref={containerRef}>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
          setFocusIndex(-1);
        }}
        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
        aria-label={t('card.menu')}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          className="w-48 bg-white dark:bg-[#263240] border border-gray-300 dark:border-[#3a4d5e] rounded-lg shadow-lg z-50 py-1"
        >
          {menuItems.map((mi, idx) => (
            <button
              key={mi.label}
              role="menuitem"
              disabled={mi.disabled}
              title={mi.title}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                mi.disabled
                  ? 'text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : idx === focusIndex
                    ? 'bg-gray-100 dark:bg-[#253040] text-gray-900 dark:text-white'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040]'
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
        </div>,
        document.body,
      )}
    </div>
  );
}
