/**
 * BmadAgentButton - BMad agent quick access button with dropdown list
 * [Source: Story 8.1 - Tasks 1-2, Story 8.2 - Tasks 2-3]
 *
 * Features:
 * - Icon button in bottom bar (left of ModelSelector)
 * - Agent list dropdown matching ModelSelector style
 * - Click outside / Escape to close
 * - Dark/light mode consistent with ModelSelector
 * - Conditional rendering based on isBmadProject
 * - Hover tooltip with agent description (Story 8.2)
 * - Categorized groups: Planning → Implementation → Other
 * - Active agent checkmark indicator
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import { Users, Check } from 'lucide-react';
import type { SlashCommand } from '@bmad-studio/shared';
import { formatAgentRoleLabel, categorizeAgents, getAgentDescription } from '../utils/agentUtils';
import type { AgentGroup } from '../utils/agentUtils';

interface BmadAgentButtonProps {
  /** Whether current project is a BMad project */
  isBmadProject: boolean;
  /** Agent commands (category === 'agent' filtered) */
  agents: SlashCommand[];
  /** Callback when an agent is selected */
  onAgentSelect: (agentId: string) => void;
  /** Disabled state (during streaming) */
  disabled?: boolean;
  /** External trigger to open the popup (increment to open) */
  openTrigger?: number;
  /** Currently active agent command (for checkmark indicator) */
  activeAgentCommand?: string | null;
}

export function BmadAgentButton({
  isBmadProject,
  agents,
  onAgentSelect,
  disabled = false,
  openTrigger,
  activeAgentCommand,
}: BmadAgentButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevTriggerRef = useRef(openTrigger ?? 0);

  // External open trigger
  useEffect(() => {
    if (openTrigger !== undefined && openTrigger !== prevTriggerRef.current) {
      prevTriggerRef.current = openTrigger;
      if (openTrigger > 0) {
        setIsOpen(true);
      }
    }
  }, [openTrigger]);

  // Categorize agents into workflow-phase groups
  const agentGroups = useMemo(() => categorizeAgents(agents), [agents]);

  // Flatten categorized agents for keyboard navigation
  const flatAgents = useMemo(() => agentGroups.flatMap((g) => g.agents), [agentGroups]);

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

      if (flatAgents.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev >= flatAgents.length - 1 ? 0 : prev + 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev <= 0 ? flatAgents.length - 1 : prev - 1));
        return;
      }

      if (e.key === 'Enter' && selectedIndex >= 0 && flatAgents[selectedIndex]) {
        e.preventDefault();
        handleAgentClick(flatAgents[selectedIndex].command);
      }
    },
    [isOpen, flatAgents, selectedIndex, handleAgentClick]
  );

  // Don't render if not a BMad project
  if (!isBmadProject) return null;

  // Render a single agent item (ModelSelector-matching format: checkmark + icon + role label + description)
  const renderAgentItem = (agent: SlashCommand, flatIndex: number) => {
    const roleLabel = formatAgentRoleLabel(agent.command);
    const description = getAgentDescription(agent);
    const isActive = activeAgentCommand === agent.command;
    return (
      <button
        key={`${agent.command}-${flatIndex}`}
        type="button"
        role="option"
        aria-selected={flatIndex === selectedIndex}
        onClick={() => handleAgentClick(agent.command)}
        onMouseEnter={() => setSelectedIndex(flatIndex)}
        title={description ? `${roleLabel} - ${description}` : roleLabel}
        className={`
          w-full text-left flex items-center gap-2 px-3 py-1.5
          transition-colors
          ${isActive ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
          ${flatIndex === selectedIndex
            ? 'bg-gray-100 dark:bg-gray-700'
            : isActive ? '' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }
        `}
        data-testid={`bmad-agent-item-${flatIndex}`}
      >
        {/* Checkmark column */}
        <span className="w-4 flex-shrink-0">
          {isActive && <Check className="w-4 h-4 text-blue-500" data-testid="bmad-agent-check" />}
        </span>
        {agent.icon && <span className="text-base flex-shrink-0">{agent.icon}</span>}
        <span className="flex-1 min-w-0">
          <span className={`text-sm ${isActive ? 'font-semibold text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
            {roleLabel || agent.name}
          </span>
          {description && (
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
              {description}
            </span>
          )}
        </span>
      </button>
    );
  };

  // Render categorized group
  const renderGroup = (group: AgentGroup, groupIndex: number, indexOffset: number) => (
    <div key={group.testId} role="group" aria-label={group.label} data-testid={group.testId}>
      {groupIndex > 0 && <div className="border-t border-gray-200 dark:border-gray-700" />}
      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {group.label}
      </div>
      {group.agents.map((agent, i) => renderAgentItem(agent, indexOffset + i))}
    </div>
  );

  // Render categorized groups
  const renderAgentItems = () => {
    let offset = 0;
    return agentGroups.map((group, gi) => {
      const el = renderGroup(group, gi, offset);
      offset += group.agents.length;
      return el;
    });
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      {/* Icon trigger button (matches ModelSelector style) */}
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
          w-[40px] h-[40px] -mt-1.5 ml-0.4 rounded-lg transition-all
          flex items-center justify-center
          border border-gray-300 dark:border-gray-600
          bg-white dark:bg-gray-800
          text-gray-600 dark:text-gray-300
          focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400
          disabled:opacity-50 disabled:cursor-not-allowed
          hover:bg-gray-100 dark:hover:bg-gray-700
          active:bg-gray-200 dark:active:bg-gray-600
          select-none
          ${isOpen ? 'bg-gray-100 dark:bg-gray-700 ring-2 ring-gray-400 ring-offset-1' : ''}
        `}
      >
        <Users className="w-5 h-5" aria-hidden="true" />
      </button>

      {/* Dropdown menu (matches ModelSelector style, same on all screen sizes) */}
      {isOpen && (
        <div
          className="absolute bottom-full left-0 mb-1 w-64 max-h-96 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50"
          data-testid="bmad-agent-popup"
        >
          {agents.length === 0 ? (
            <div className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">
              등록된 에이전트가 없습니다
            </div>
          ) : (
            <div
              ref={listRef}
              role="listbox"
              aria-label="에이전트 목록"
            >
              {renderAgentItems()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
