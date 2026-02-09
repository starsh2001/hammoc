/**
 * BmadAgentButton - BMad agent quick access button with popup list
 * [Source: Story 8.1 - Tasks 1-2]
 *
 * Features:
 * - Ⓑ button in bottom bar (next to PermissionModeSelector)
 * - Agent list popup with keyboard navigation
 * - Click outside / Escape to close
 * - Dark/light mode neon styling consistent with PermissionModeSelector
 * - Conditional rendering based on isBmadProject
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
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
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Close popup on outside click
  useClickOutside(containerRef, useCallback(() => {
    if (isOpen) setIsOpen(false);
  }, [isOpen]));

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

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  }, [disabled]);

  const handleAgentClick = useCallback(
    (command: string) => {
      onAgentSelect(command);
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
        setIsOpen(false);
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
    [isOpen, agents, selectedIndex, handleAgentClick]
  );

  // Don't render if not a BMad project
  if (!isBmadProject) return null;

  return (
    <div ref={containerRef} className="relative self-center -mt-1.5" onKeyDown={handleKeyDown}>
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

      {/* Agent List Popup */}
      {isOpen && (
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
              {agents.map((agent, index) => (
                <li
                  key={agent.command}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => handleAgentClick(agent.command)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`
                    flex items-center gap-2 px-3 py-2 cursor-pointer
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
                  <span className="truncate">{agent.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
