/**
 * FavoritesChipBar - Horizontal chip bar for favorite commands quick execution
 * [Source: Story 9.7 - Task 1, BS-1 - Tasks 4, 5]
 *
 * Features:
 * - Fixed star button to open favorites dialog
 * - Horizontally scrollable chip area
 * - Chip tap for immediate command execution
 * - Hidden when no favorites exist (AC: 7)
 * - ARIA toolbar accessibility
 * - Scope distinction: project (gray) vs global (purple) chips
 * - Invalid chip validation with AlertTriangle icon
 */

import { useTranslation } from 'react-i18next';
import { Star, AlertTriangle } from 'lucide-react';
import type { SlashCommand, CommandFavoriteEntry } from '@hammoc/shared';

interface FavoritesChipBarProps {
  /** Favorite command entries (ordered, with scope) */
  favoriteCommands: CommandFavoriteEntry[];
  /** Full command objects for display (icon, name) */
  commands: SlashCommand[];
  /** Callback when a chip is tapped — immediate execution */
  onExecute: (command: string) => void;
  /** Callback to open the favorites dialog */
  onOpenDialog: () => void;
  /** Star favorite command strings for active agent (Story 9.12) */
  starFavorites?: string[];
  /** Active agent info — null/undefined hides star section (Story 9.12) */
  activeAgent?: SlashCommand | null;
  /** Execute star favorite command immediately (Story 9.12) */
  onExecuteStarFavorite?: (command: string) => void;
  /** Disable all chip buttons (e.g., during queue runner execution) */
  disabled?: boolean;
}

function getChipLabel(commandStr: string, cmd?: SlashCommand): string {
  if (cmd?.name) return cmd.name;
  // Fallback: extract last segment from command string
  // "/BMad:agents:pm" → "pm", "/BMad:tasks:create-doc" → "create-doc"
  const parts = commandStr.split(':');
  return parts[parts.length - 1] || commandStr;
}

export function FavoritesChipBar({
  favoriteCommands,
  commands,
  onExecute,
  onOpenDialog,
  starFavorites,
  activeAgent,
  onExecuteStarFavorite,
  disabled,
}: FavoritesChipBarProps) {
  const { t } = useTranslation('common');
  // AC: 8 — hide when both slash and star favorites are empty
  const hasStarFavorites = activeAgent && starFavorites && starFavorites.length > 0;
  if (favoriteCommands.length === 0 && !hasStarFavorites) {
    return null;
  }

  const findCommand = (commandStr: string): SlashCommand | undefined => {
    return commands.find((c) => c.command === commandStr);
  };

  // Split favorites by scope
  const projectFavorites = favoriteCommands.filter((e) => e.scope !== 'global');
  const globalFavorites = favoriteCommands.filter((e) => e.scope === 'global');
  const hasProjectFavorites = projectFavorites.length > 0;
  const hasGlobalFavorites = globalFavorites.length > 0;

  const renderChip = (entry: CommandFavoriteEntry, isGlobal: boolean) => {
    const cmd = findCommand(entry.command);
    const label = getChipLabel(entry.command, cmd);
    const isInvalid = !cmd;
    const scopeLabel = isGlobal ? '(global)' : '(project)';

    if (isInvalid) {
      return (
        <button
          key={`${entry.scope}-${entry.command}`}
          type="button"
          role="button"
          disabled
          title={t('favorites.invalidChip')}
          aria-label={`${label} ${scopeLabel} - ${t('favorites.invalidChip')}`}
          className={`px-2 py-1 rounded-full text-xs
                     bg-gray-100 dark:bg-[#253040]
                     text-gray-700 dark:text-gray-200
                     whitespace-nowrap flex-shrink-0
                     transition-colors min-h-[28px]
                     flex items-center gap-1 opacity-50 cursor-not-allowed`}
          data-testid={`favorite-chip-${entry.command}`}
        >
          <AlertTriangle className="w-3 h-3 text-yellow-500" />
          <span>{label}</span>
        </button>
      );
    }

    const baseClasses = `px-2 py-1 rounded-full text-xs whitespace-nowrap flex-shrink-0 transition-colors min-h-[28px] flex items-center gap-1`;
    const colorClasses = isGlobal
      ? `bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-100 dark:hover:bg-purple-800/40 cursor-pointer'}`
      : `bg-gray-100 dark:bg-[#253040] text-gray-700 dark:text-gray-200 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-200 dark:hover:bg-[#2d3a4a] cursor-pointer'}`;

    return (
      <button
        key={`${entry.scope}-${entry.command}`}
        type="button"
        role="button"
        disabled={disabled}
        title={`${label} ${scopeLabel}`}
        aria-label={t('favorites.executePrefix', { label })}
        onClick={() => onExecute(entry.command)}
        className={`${baseClasses} ${colorClasses}`}
        data-testid={`favorite-chip-${entry.command}`}
      >
        {cmd?.icon && <span className="text-sm">{cmd.icon}</span>}
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div
      className="flex items-center gap-1 -mx-[1px]"
      role="toolbar"
      aria-label={t('favorites.toolbar')}
      data-testid="favorites-chip-bar"
    >
      {/* Fixed star button */}
      <button
        type="button"
        onClick={onOpenDialog}
        disabled={disabled}
        aria-label={t('favorites.editButton')}
        data-testid="chip-bar-star-button"
        className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded
                   transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-[#253040]'}`}
      >
        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" aria-hidden="true" />
      </button>

      {/* Horizontal scrollable chip area */}
      <div
        className="flex-1 overflow-x-auto flex gap-1 px-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        data-testid="chip-scroll-area"
      >
        {/* Star favorites section — shown first (Story 9.12) */}
        {hasStarFavorites && (
          <>
            {starFavorites!.map((commandStr) => (
              <button
                key={`star-${commandStr}`}
                type="button"
                role="button"
                disabled={disabled}
                aria-label={t('favorites.executeStarPrefix', { command: commandStr })}
                onClick={() => onExecuteStarFavorite?.(commandStr)}
                className={`px-2 py-1 rounded-full text-xs
                           bg-yellow-50 dark:bg-yellow-900/30
                           text-yellow-700 dark:text-yellow-300
                           border border-yellow-200 dark:border-yellow-700
                           whitespace-nowrap flex-shrink-0
                           transition-colors min-h-[28px]
                           flex items-center gap-1 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-yellow-100 dark:hover:bg-yellow-800/40 cursor-pointer'}`}
                data-testid={`star-favorite-chip-${commandStr}`}
              >
                <span className="text-yellow-500">*</span>
                <span>{commandStr}</span>
              </button>
            ))}
            {/* Divider — only show if slash favorites also exist */}
            {favoriteCommands.length > 0 && (
              <div className="flex-shrink-0 w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1"
                   data-testid="chip-bar-divider" aria-hidden="true" />
            )}
          </>
        )}

        {/* Project slash favorites (gray) */}
        {projectFavorites.map((entry) => renderChip(entry, false))}

        {/* Divider between project and global groups */}
        {hasProjectFavorites && hasGlobalFavorites && (
          <div className="flex-shrink-0 w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1"
               data-testid="chip-bar-scope-divider" aria-hidden="true" />
        )}

        {/* Global slash favorites (purple) */}
        {globalFavorites.map((entry) => renderChip(entry, true))}
      </div>
    </div>
  );
}
