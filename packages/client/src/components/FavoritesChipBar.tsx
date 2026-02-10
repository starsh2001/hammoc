/**
 * FavoritesChipBar - Horizontal chip bar for favorite commands quick execution
 * [Source: Story 9.7 - Task 1]
 *
 * Features:
 * - Fixed star button to open favorites dialog
 * - Horizontally scrollable chip area
 * - Chip tap for immediate command execution
 * - Hidden when no favorites exist (AC: 7)
 * - ARIA toolbar accessibility
 */

import { Star } from 'lucide-react';
import type { SlashCommand } from '@bmad-studio/shared';

interface FavoritesChipBarProps {
  /** Favorite command strings (ordered) */
  favoriteCommands: string[];
  /** Full command objects for display (icon, name) */
  commands: SlashCommand[];
  /** Callback when a chip is tapped — immediate execution */
  onExecute: (command: string) => void;
  /** Callback to open the favorites dialog */
  onOpenDialog: () => void;
  /** Whether input is disabled (streaming) */
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
  disabled = false,
}: FavoritesChipBarProps) {
  // AC: 7 — hide when no favorites
  if (favoriteCommands.length === 0) {
    return null;
  }

  const findCommand = (commandStr: string): SlashCommand | undefined => {
    return commands.find((c) => c.command === commandStr);
  };

  return (
    <div
      className="flex items-center gap-1 px-1"
      role="toolbar"
      aria-label="즐겨찾기 커맨드 바로실행"
      data-testid="favorites-chip-bar"
    >
      {/* Fixed star button */}
      <button
        type="button"
        onClick={onOpenDialog}
        disabled={disabled}
        aria-label="즐겨찾기 편집"
        data-testid="chip-bar-star-button"
        className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded
                   ${disabled ? 'opacity-50 pointer-events-none' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}
                   transition-colors`}
      >
        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" aria-hidden="true" />
      </button>

      {/* Horizontal scrollable chip area */}
      <div
        className="flex-1 overflow-x-auto flex gap-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        data-testid="chip-scroll-area"
      >
        {favoriteCommands.map((commandStr) => {
          const cmd = findCommand(commandStr);
          const label = getChipLabel(commandStr, cmd);

          return (
            <button
              key={commandStr}
              type="button"
              role="button"
              aria-label={`${label} 실행`}
              disabled={disabled}
              onClick={() => onExecute(commandStr)}
              className={`px-2 py-1 rounded-full text-xs
                         bg-gray-100 dark:bg-gray-700
                         text-gray-700 dark:text-gray-300
                         hover:bg-gray-200 dark:hover:bg-gray-600
                         whitespace-nowrap flex-shrink-0 cursor-pointer
                         transition-colors min-h-[28px]
                         flex items-center gap-1
                         disabled:opacity-50 disabled:cursor-not-allowed`}
              data-testid={`favorite-chip-${commandStr}`}
            >
              {cmd?.icon && <span className="text-sm">{cmd.icon}</span>}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
