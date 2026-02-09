/**
 * BmadAgentButton - BMad agent quick access button with popup list
 * [Source: Story 8.1 - Tasks 1-2, Story 8.2 - Tasks 2-3]
 *
 * Features:
 * - Ⓑ button in bottom bar (next to PermissionModeSelector)
 * - Agent list popup with keyboard navigation
 * - Click outside / Escape to close
 * - Dark/light mode neon styling consistent with PermissionModeSelector
 * - Conditional rendering based on isBmadProject
 * - Hover tooltip with agent description (Story 8.2)
 * - Mobile bottom sheet UI (Story 8.2)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import { useIsMobile } from '../hooks/useIsMobile';
import { X } from 'lucide-react';
import type { SlashCommand } from '@bmad-studio/shared';

interface BmadAgentButtonProps {
  /** Whether current project is a BMad project */
  isBmadProject: boolean;
  /** Agent commands (category === 'agent' filtered) */
  agents: SlashCommand[];
  /** Callback when an agent is selected */
  onAgentSelect: (agentId: string) => void;
  /** Disabled state (during streaming) */
  disabled?: boolean;
}

export function BmadAgentButton({
  isBmadProject,
  agents,
  onAgentSelect,
  disabled = false,
}: BmadAgentButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const bottomSheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsMobile();
  const prevIsMobileRef = useRef(isMobile);

  // Close handler that respects mobile animation
  const handleClose = useCallback(() => {
    if (isMobile) {
      setIsClosing(true);
    } else {
      setIsOpen(false);
    }
  }, [isMobile]);

  // Close popup on outside click (desktop only)
  useClickOutside(containerRef, useCallback(() => {
    if (isOpen && !isMobile) setIsOpen(false);
  }, [isOpen, isMobile]));

  // Reset selected index when popup opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(-1);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!isOpen || selectedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[role="option"]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, selectedIndex]);

  // Lock body scroll when mobile bottom sheet is open
  useEffect(() => {
    if (!isOpen || !isMobile) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, isMobile]);

  // Auto-close bottom sheet when viewport changes from mobile to desktop
  useEffect(() => {
    if (prevIsMobileRef.current && !isMobile && isOpen) {
      setIsClosing(false);
      setIsOpen(false);
    }
    prevIsMobileRef.current = isMobile;
  }, [isMobile, isOpen]);

  // Focus close button when mobile bottom sheet opens
  useEffect(() => {
    if (isOpen && isMobile && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [isOpen, isMobile]);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    if (isOpen) {
      handleClose();
    } else {
      setIsOpen(true);
    }
  }, [disabled, isOpen, handleClose]);

  const handleAgentClick = useCallback(
    (command: string) => {
      onAgentSelect(command);
      setIsClosing(false);
      setIsOpen(false);
    },
    [onAgentSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
        return;
      }

      if (agents.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev >= agents.length - 1 ? 0 : prev + 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev <= 0 ? agents.length - 1 : prev - 1));
        return;
      }

      if (e.key === 'Enter' && selectedIndex >= 0 && agents[selectedIndex]) {
        e.preventDefault();
        handleAgentClick(agents[selectedIndex].command);
      }
    },
    [isOpen, agents, selectedIndex, handleAgentClick, handleClose]
  );

  // Focus trapping for mobile bottom sheet
  const handleBottomSheetKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
        return;
      }

      if (e.key === 'Tab' && bottomSheetRef.current) {
        const focusableElements = bottomSheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [handleClose]
  );

  const handleBottomSheetAnimationEnd = useCallback(() => {
    if (isClosing) {
      setIsClosing(false);
      setIsOpen(false);
    }
  }, [isClosing]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleClose();
      }
    },
    [handleClose]
  );

  // Don't render if not a BMad project
  if (!isBmadProject) return null;

  // Shared agent list items renderer
  const renderAgentItems = (isMobileView: boolean) => (
    agents.map((agent, index) => (
      <li
        key={agent.command}
        role="option"
        aria-selected={index === selectedIndex}
        onClick={() => handleAgentClick(agent.command)}
        onMouseEnter={() => setSelectedIndex(index)}
        className={`
          flex items-center gap-2 px-3 ${isMobileView ? 'py-3' : 'py-2'} cursor-pointer
          text-sm text-gray-800 dark:text-gray-200
          transition-colors duration-75
          ${index === selectedIndex
            ? 'bg-purple-100 dark:bg-purple-900/40'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }
        `}
        data-testid={`bmad-agent-item-${index}`}
      >
        {agent.icon && <span className="text-base flex-shrink-0">{agent.icon}</span>}
        <span
          className="truncate"
          title={agent.description ? `${agent.name} - ${agent.description}` : agent.name}
        >
          {agent.name}
        </span>
      </li>
    ))
  );

  return (
    <div ref={containerRef} className="relative self-center -mt-1.5" onKeyDown={!isMobile ? handleKeyDown : undefined}>
      {/* Ⓑ Button */}
      <button
        type="button"
        tabIndex={-1}
        onClick={handleToggle}
        onMouseDown={(e) => e.preventDefault()}
        disabled={disabled}
        aria-label="BMad 에이전트 목록"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        data-testid="bmad-agent-button"
        className={`
          w-[48px] h-[48px] text-sm font-bold rounded-lg transition-all
          border-1 select-none
          focus:outline-none focus:ring-2 focus:ring-offset-1
          disabled:opacity-50 disabled:cursor-not-allowed
          hover:brightness-95 dark:hover:brightness-110
          active:brightness-90 dark:active:brightness-125
          bg-purple-100 border-purple-500 text-purple-700
          dark:bg-purple-900/40 dark:border-purple-400 dark:text-purple-300
        `}
      >
        Ⓑ
      </button>

      {/* Desktop: Agent List Popup */}
      {isOpen && !isMobile && (
        <div
          className={`
            absolute bottom-full left-0 mb-2 z-50
            min-w-[200px] max-w-[280px]
            bg-white dark:bg-gray-800
            border border-gray-200 dark:border-gray-600
            rounded-lg shadow-lg
            transition-all duration-150
            overflow-hidden
          `}
          data-testid="bmad-agent-popup"
        >
          {agents.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              등록된 에이전트가 없습니다
            </div>
          ) : (
            <ul
              ref={listRef}
              role="listbox"
              aria-label="에이전트 목록"
              className="max-h-64 overflow-y-auto py-1"
            >
              {renderAgentItems(false)}
            </ul>
          )}
        </div>
      )}

      {/* Mobile: Bottom Sheet */}
      {(isOpen || isClosing) && isMobile && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={handleBackdropClick}
          data-testid="bmad-bottom-sheet-backdrop"
        >
          <div
            ref={bottomSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="에이전트 선택"
            onKeyDown={handleBottomSheetKeyDown}
            onAnimationEnd={handleBottomSheetAnimationEnd}
            className={`
              fixed bottom-0 left-0 right-0 z-50
              bg-white dark:bg-gray-800
              rounded-t-xl shadow-lg
              max-h-[70vh]
              flex flex-col
              ${isClosing ? 'animate-bottomSheetDown' : 'animate-bottomSheetUp'}
            `}
            data-testid="bmad-bottom-sheet"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1" data-testid="bmad-bottom-sheet-handle">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-600">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                에이전트 선택
              </span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => handleClose()}
                aria-label="닫기"
                data-testid="bmad-bottom-sheet-close"
                className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded"
              >
                <X size={20} />
              </button>
            </div>

            {/* Agent List */}
            <div className="overflow-y-auto">
              {agents.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  등록된 에이전트가 없습니다
                </div>
              ) : (
                <ul
                  ref={listRef}
                  role="listbox"
                  aria-label="에이전트 목록"
                  className="py-1"
                >
                  {renderAgentItems(true)}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
