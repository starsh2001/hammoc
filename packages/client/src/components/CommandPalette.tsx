/**
 * CommandPalette - Autocomplete popup for slash commands
 * [Source: Story 5.1 - Task 3]
 *
 * Features:
 * - Category-based grouping (Agents, Tasks)
 * - Filter-based matching (partial, case-insensitive)
 * - Keyboard navigation support
 * - ARIA accessibility (listbox pattern)
 * - Max height with scroll
 * - Responsive width
 */

import { useRef, useEffect, useMemo } from 'react';
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SlashCommand } from '@hammoc/shared';

interface CommandPaletteProps {
  /** Available slash commands */
  commands: SlashCommand[];
  /** Current filter string (without leading "/") */
  filter: string;
  /** Currently selected index */
  selectedIndex: number;
  /** Callback when a command is selected */
  onSelect: (command: SlashCommand) => void;
  /** Callback to close the palette */
  onClose: () => void;
  /** Check if a command is favorited (Story 9.5) */
  isFavorite?: (command: string) => boolean;
  /** Toggle favorite status for a command (Story 9.5) */
  onToggleFavorite?: (command: string) => void;
}

/**
 * Filter commands by query string (case-insensitive, partial match)
 */
function filterCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  if (!query) return commands;

  const normalizedQuery = query.toLowerCase();

  return commands.filter((cmd) => {
    const fullCommand = cmd.command.toLowerCase();
    const name = cmd.name.toLowerCase();
    const lastSegment = fullCommand.split(':').pop() || '';

    return (
      fullCommand.includes(normalizedQuery) ||
      name.includes(normalizedQuery) ||
      lastSegment.includes(normalizedQuery)
    );
  });
}

/**
 * Group commands by category
 */
function groupCommands(commands: SlashCommand[]): Map<string, SlashCommand[]> {
  const groups = new Map<string, SlashCommand[]>();
  for (const cmd of commands) {
    const key = cmd.category === 'agent' ? 'Agents' : cmd.category === 'task' ? 'Tasks' : cmd.category === 'skill' ? 'Skills' : 'Commands';
    const group = groups.get(key) ?? [];
    group.push(cmd);
    groups.set(key, group);
  }
  return groups;
}

export function CommandPalette({
  commands,
  filter,
  selectedIndex,
  onSelect,
  onClose,
  isFavorite,
  onToggleFavorite,
}: CommandPaletteProps) {
  const { t } = useTranslation('common');
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => filterCommands(commands, filter), [commands, filter]);
  const grouped = useMemo(() => groupCommands(filtered), [filtered]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = listRef.current?.querySelector('[aria-selected="true"]');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Build flat index for aria-selected mapping
  let flatIndex = 0;

  if (filtered.length === 0) {
    return (
      <div
        data-testid="command-palette"
        className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-[#263240]
                   border border-gray-300 dark:border-[#3a4d5e] rounded-lg shadow-lg
                   max-h-[300px] overflow-y-auto z-50"
      >
        <p className="text-center text-gray-500 dark:text-gray-300 text-sm py-4">
          {t('command.noMatch')}
        </p>
      </div>
    );
  }

  return (
    <ul
      ref={listRef}
      role="listbox"
      id="command-palette"
      aria-label={t('command.slashListAria')}
      data-testid="command-palette"
      className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-[#263240]
                 border border-gray-300 dark:border-[#3a4d5e] rounded-lg shadow-lg
                 max-h-[300px] overflow-y-auto z-50 py-1"
    >
      {Array.from(grouped.entries()).map(([category, cmds]) => (
        <li key={category} role="presentation">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
            {category}
          </div>
          <ul role="group" aria-label={category}>
            {cmds.map((cmd) => {
              const currentIndex = flatIndex++;
              const isSelected = currentIndex === selectedIndex;

              return (
                <li
                  key={cmd.command}
                  role="option"
                  id={`command-option-${currentIndex}`}
                  aria-selected={isSelected}
                  onClick={() => onSelect(cmd)}
                  className={`px-3 py-2 cursor-pointer flex items-start gap-2
                    ${isSelected
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100'
                      : 'hover:bg-gray-100 dark:hover:bg-[#253040] text-gray-900 dark:text-gray-100'
                    }`}
                >
                  {cmd.icon && (
                    <span className="text-base flex-shrink-0" aria-hidden="true">
                      {cmd.icon}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{cmd.command}</div>
                    {cmd.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-300 truncate">
                        {cmd.description}
                      </div>
                    )}
                  </div>
                  {isFavorite && onToggleFavorite && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(cmd.command);
                      }}
                      aria-label={isFavorite(cmd.command) ? t('command.removeFavorite') : t('command.addFavorite')}
                      className="flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-[#2d3a4a] transition-colors"
                    >
                      <Star
                        className={`w-4 h-4 ${isFavorite(cmd.command) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400 hover:text-yellow-400'}`}
                      />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

// Export for testing
export { filterCommands };
