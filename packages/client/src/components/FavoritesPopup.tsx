/**
 * FavoritesPopup - Favorite commands quick access popup
 * [Source: Story 9.6 - Task 1, BS-1 - Task 6]
 *
 * Features:
 * - Display favorite commands with icon, name, description
 * - Empty state guidance message
 * - Drag & drop reordering (desktop only, HTML5 DnD)
 * - Remove from favorites button
 * - ARIA accessibility (listbox/option roles)
 * - Scope distinction: global favorites show purple border + (Global) badge
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, X } from 'lucide-react';
import type { SlashCommand, StarCommand, CommandFavoriteEntry } from '@hammoc/shared';

interface FavoritesPopupProps {
  /** Favorite command entries with scope */
  favoriteCommands: CommandFavoriteEntry[];
  /** Full command objects for display (icon, description) */
  commands: SlashCommand[];
  /** Callback when a favorite command is selected */
  onSelect: (command: string) => void;
  /** Callback to close the popup */
  onClose: () => void;
  /** Callback to reorder favorites */
  onReorder: (commands: CommandFavoriteEntry[]) => void;
  /** Callback to remove from favorites */
  onRemoveFavorite: (entry: CommandFavoriteEntry) => void;
  /** Star favorite command strings for active agent (Story 9.12) */
  starFavorites?: string[];
  /** Star command objects for display (description lookup) (Story 9.12) */
  starCommands?: StarCommand[];
  /** Active agent info for section header (Story 9.12) */
  activeAgent?: SlashCommand | null;
  /** Reorder star favorites callback (Story 9.12) */
  onReorderStarFavorites?: (commands: string[]) => void;
  /** Remove star favorite callback (Story 9.12) */
  onRemoveStarFavorite?: (command: string) => void;
  /** Select star favorite for execution (Story 9.12) */
  onSelectStarFavorite?: (command: string) => void;
}

export function FavoritesPopup({
  favoriteCommands,
  commands,
  onSelect,
  onClose: _onClose,
  onReorder,
  onRemoveFavorite,
  starFavorites,
  starCommands,
  activeAgent,
  onReorderStarFavorites,
  onRemoveStarFavorite,
  onSelectStarFavorite,
}: FavoritesPopupProps) {
  const { t } = useTranslation('common');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Star favorites DnD state (Story 9.12)
  const [starDragIndex, setStarDragIndex] = useState<number | null>(null);
  const [starDragOverIndex, setStarDragOverIndex] = useState<number | null>(null);

  const findCommand = useCallback(
    (commandStr: string): SlashCommand | undefined => {
      return commands.find((c) => c.command === commandStr);
    },
    [commands]
  );

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback(
    (index: number) => {
      if (dragIndex !== null && dragIndex !== index) {
        const reordered = [...favoriteCommands];
        const [moved] = reordered.splice(dragIndex, 1);
        reordered.splice(index, 0, moved);
        onReorder(reordered);
      }
      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex, favoriteCommands, onReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleRemove = useCallback(
    (e: React.MouseEvent, entry: CommandFavoriteEntry) => {
      e.stopPropagation();
      onRemoveFavorite(entry);
    },
    [onRemoveFavorite]
  );

  // Star command description lookup helper (Story 9.12)
  const findStarCommand = useCallback(
    (commandStr: string): StarCommand | undefined => {
      return starCommands?.find((c) => c.command === commandStr);
    },
    [starCommands]
  );

  // Star favorites DnD handlers (Story 9.12)
  const handleStarDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setStarDragIndex(index);
  }, []);

  const handleStarDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setStarDragOverIndex(index);
  }, []);

  const handleStarDrop = useCallback(
    (index: number) => {
      if (starDragIndex !== null && starDragIndex !== index && starFavorites) {
        const reordered = [...starFavorites];
        const [moved] = reordered.splice(starDragIndex, 1);
        reordered.splice(index, 0, moved);
        onReorderStarFavorites?.(reordered);
      }
      setStarDragIndex(null);
      setStarDragOverIndex(null);
    },
    [starDragIndex, starFavorites, onReorderStarFavorites]
  );

  const handleStarDragEnd = useCallback(() => {
    setStarDragIndex(null);
    setStarDragOverIndex(null);
  }, []);

  const handleStarRemove = useCallback(
    (e: React.MouseEvent, command: string) => {
      e.stopPropagation();
      onRemoveStarFavorite?.(command);
    },
    [onRemoveStarFavorite]
  );

  const hasSlashFavorites = favoriteCommands.length > 0;
  const hasStarFavorites = activeAgent && starFavorites && starFavorites.length > 0;

  // Empty state — both slash and star favorites are empty
  if (!hasSlashFavorites && !hasStarFavorites) {
    return (
      <div
        className="absolute bottom-full left-0 mb-1 min-w-[280px] w-full sm:w-auto
                   bg-white dark:bg-[#263240]
                   border border-gray-300 dark:border-[#3a4d5e]
                   shadow-lg rounded-lg z-50 p-4"
        role="listbox"
        aria-label={t('favorites.listAria')}
        data-testid="favorites-popup"
      >
        <p className="text-sm text-gray-500 dark:text-gray-300" data-testid="favorites-empty-message">
          {t('favorites.emptyMessage')}
        </p>
      </div>
    );
  }

  return (
    <div
      className="absolute bottom-full left-0 mb-1 min-w-[280px] w-full sm:w-auto
                 bg-white dark:bg-[#263240]
                 border border-gray-300 dark:border-[#3a4d5e]
                 shadow-lg rounded-lg z-50
                 max-h-[300px] overflow-y-auto"
      role="listbox"
      aria-label={t('favorites.listAria')}
      data-testid="favorites-popup"
    >
      {/* Star favorites section (Story 9.12) — agent commands first */}
      {hasStarFavorites && (
        <>
          {/* Section header */}
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-300"
               data-testid="star-section-header">
            {activeAgent!.icon} Agent Command
          </div>

          {starFavorites!.map((commandStr, index) => {
            const starCmd = findStarCommand(commandStr);
            const isDragging = starDragIndex === index;
            const isDragOver = starDragOverIndex === index && starDragIndex !== index;

            return (
              <div
                key={`star-${commandStr}`}
                role="option"
                aria-selected={false}
                tabIndex={0}
                draggable
                onDragStart={(e) => handleStarDragStart(e, index)}
                onDragOver={(e) => handleStarDragOver(e, index)}
                onDrop={() => handleStarDrop(index)}
                onDragEnd={handleStarDragEnd}
                onClick={() => onSelectStarFavorite?.(commandStr)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectStarFavorite?.(commandStr);
                  }
                }}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer
                           hover:bg-yellow-50 dark:hover:bg-yellow-900/20
                           transition-colors
                           ${isDragging ? 'opacity-50' : ''}
                           ${isDragOver ? 'border-t-2 border-yellow-500' : ''}`}
                data-testid={`star-favorite-item-${index}`}
              >
                {/* Drag handle */}
                <span
                  className="flex-shrink-0 cursor-grab text-gray-400"
                  aria-label={t('favorites.reorderHandle')}
                >
                  <GripVertical className="w-4 h-4" />
                </span>

                {/* Star prefix */}
                <span className="w-5 flex-shrink-0 text-center text-sm text-yellow-500 font-bold">
                  *
                </span>

                {/* Name and description */}
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {commandStr}
                  </span>
                  {starCmd?.description && (
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      {starCmd.description}
                    </span>
                  )}
                </span>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={(e) => handleStarRemove(e, commandStr)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onRemoveStarFavorite?.(commandStr);
                    }
                  }}
                  aria-label={t('favorites.removeStarPrefix', { command: commandStr })}
                  className="flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-[#2d3a4a]
                             text-gray-400 hover:text-red-500 dark:hover:text-red-400
                             transition-colors"
                  data-testid={`star-favorite-remove-${index}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </>
      )}

      {/* Divider between star and slash sections */}
      {hasStarFavorites && hasSlashFavorites && (
        <div className="border-t border-gray-300 dark:border-[#3a4d5e] my-1"
             data-testid="popup-star-divider" aria-hidden="true" />
      )}

      {/* Slash favorites section */}
      {hasSlashFavorites && (
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-300"
             data-testid="slash-section-header">
          Slash Command
        </div>
      )}
      {favoriteCommands.map((entry, index) => {
        const cmd = findCommand(entry.command);
        const isDragging = dragIndex === index;
        const isDragOver = dragOverIndex === index && dragIndex !== index;
        const isGlobal = entry.scope === 'global';

        return (
          <div
            key={`${entry.scope}-${entry.command}`}
            role="option"
            aria-selected={false}
            tabIndex={0}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={() => handleDrop(index)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelect(entry.command)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(entry.command);
              }
            }}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer
                       hover:bg-gray-100 dark:hover:bg-[#253040]
                       transition-colors
                       ${isGlobal ? 'border-l-2 border-purple-400' : ''}
                       ${isDragging ? 'opacity-50' : ''}
                       ${isDragOver ? 'border-t-2 border-blue-500' : ''}`}
            data-testid={`favorite-item-${index}`}
          >
            {/* Drag handle */}
            <span
              className="flex-shrink-0 cursor-grab text-gray-400"
              aria-label={t('favorites.reorderHandle')}
            >
              <GripVertical className="w-4 h-4" />
            </span>

            {/* Icon */}
            <span className="w-5 flex-shrink-0 text-center text-base">
              {cmd?.icon || ''}
            </span>

            {/* Name and description */}
            <span className="flex-1 min-w-0">
              <span className="text-sm text-gray-900 dark:text-gray-100">
                {cmd?.name || entry.command}
              </span>
              {isGlobal && (
                <span className="text-xs text-purple-500 ml-1" data-testid={`favorite-global-badge-${index}`}>
                  {t('favorites.globalBadge')}
                </span>
              )}
              {cmd?.description && (
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  {cmd.description}
                </span>
              )}
            </span>

            {/* Remove button */}
            <button
              type="button"
              onClick={(e) => handleRemove(e, entry)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemoveFavorite(entry);
                }
              }}
              aria-label={t('favorites.removePrefix', { command: entry.command })}
              className="flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-[#2d3a4a]
                         text-gray-400 hover:text-red-500 dark:hover:text-red-400
                         transition-colors"
              data-testid={`favorite-remove-${index}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
