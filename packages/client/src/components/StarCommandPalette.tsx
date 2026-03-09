/**
 * StarCommandPalette - Autocomplete popup for star (*) commands
 * [Source: Story 9.9 - Task 2]
 *
 * Features:
 * - Agent header with icon and name
 * - Filter-based matching (partial, case-insensitive)
 * - Keyboard navigation support
 * - ARIA accessibility (listbox pattern)
 * - Visual consistency with CommandPalette
 */

import { useRef, useEffect, useMemo } from 'react';
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SlashCommand, StarCommand } from '@hammoc/shared';

interface StarCommandPaletteProps {
  /** Current agent's star commands */
  commands: StarCommand[];
  /** Active agent info (name, icon display) */
  agent: SlashCommand;
  /** Filter text (after * prefix) */
  filter: string;
  /** Currently selected index for keyboard navigation */
  selectedIndex: number;
  /** Command selection callback — receives command name without * prefix */
  onSelect: (command: string) => void;
  /** Check if a star command is favorited */
  isStarFavorite?: (command: string) => boolean;
  /** Toggle star favorite callback */
  onToggleStarFavorite?: (command: string) => void;
}

/**
 * Filter star commands by query string (case-insensitive, partial match)
 */
function filterStarCommands(commands: StarCommand[], query: string): StarCommand[] {
  if (!query) return commands;
  const normalized = query.toLowerCase();
  return commands.filter((cmd) =>
    cmd.command.toLowerCase().includes(normalized) ||
    cmd.description.toLowerCase().includes(normalized)
  );
}

export function StarCommandPalette({
  commands,
  agent,
  filter,
  selectedIndex,
  onSelect,
  isStarFavorite,
  onToggleStarFavorite,
}: StarCommandPaletteProps) {
  const { t } = useTranslation('common');
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => filterStarCommands(commands, filter), [commands, filter]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = listRef.current?.querySelector('[aria-selected="true"]');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (filtered.length === 0) {
    return (
      <div
        id="star-command-palette"
        data-testid="star-command-palette"
        className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-800
                   border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg
                   max-h-[300px] overflow-y-auto z-50"
      >
        <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          {agent.icon && <span aria-hidden="true">{agent.icon}</span>}
          <span>{agent.name}</span>
        </div>
        <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">
          {t('command.noMatch')}
        </p>
      </div>
    );
  }

  return (
    <ul
      ref={listRef}
      role="listbox"
      id="star-command-palette"
      aria-label={t('command.starListAria')}
      data-testid="star-command-palette"
      className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-800
                 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg
                 max-h-[300px] overflow-y-auto z-50 py-1"
    >
      <li role="presentation">
        <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          {agent.icon && <span aria-hidden="true">{agent.icon}</span>}
          <span>{agent.name}</span>
        </div>
        <ul role="group" aria-label={agent.name}>
          {filtered.map((cmd, index) => {
            const isSelected = index === selectedIndex;
            return (
              <li
                key={cmd.command}
                role="option"
                id={`star-command-option-${index}`}
                aria-selected={isSelected}
                onClick={() => onSelect(cmd.command)}
                className={`px-3 py-2 cursor-pointer flex items-start gap-2
                  ${isSelected
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
                  }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">*{cmd.command}</div>
                  {cmd.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {cmd.description}
                    </div>
                  )}
                </div>
                {isStarFavorite && onToggleStarFavorite && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStarFavorite(cmd.command);
                    }}
                    aria-label={isStarFavorite(cmd.command) ? t('command.removeFavorite') : t('command.addFavorite')}
                    className="flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    <Star
                      className={`w-4 h-4 ${isStarFavorite(cmd.command) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400 hover:text-yellow-400'}`}
                    />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </li>
    </ul>
  );
}

// Export for testing
export { filterStarCommands };
