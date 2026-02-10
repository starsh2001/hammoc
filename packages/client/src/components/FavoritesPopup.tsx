/**
 * FavoritesPopup - Favorite commands quick access popup
 * [Source: Story 9.6 - Task 1]
 *
 * Features:
 * - Display favorite commands with icon, name, description
 * - Empty state guidance message
 * - Drag & drop reordering (desktop only, HTML5 DnD)
 * - Remove from favorites button
 * - ARIA accessibility (listbox/option roles)
 */

import { useState, useCallback } from 'react';
import { GripVertical, X } from 'lucide-react';
import type { SlashCommand } from '@bmad-studio/shared';

interface FavoritesPopupProps {
  /** Favorite command strings list */
  favoriteCommands: string[];
  /** Full command objects for display (icon, description) */
  commands: SlashCommand[];
  /** Callback when a favorite command is selected */
  onSelect: (command: string) => void;
  /** Callback to close the popup */
  onClose: () => void;
  /** Callback to reorder favorites */
  onReorder: (commands: string[]) => void;
  /** Callback to remove from favorites */
  onRemoveFavorite: (command: string) => void;
}

export function FavoritesPopup({
  favoriteCommands,
  commands,
  onSelect,
  onClose: _onClose,
  onReorder,
  onRemoveFavorite,
}: FavoritesPopupProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const findCommand = useCallback(
    (commandStr: string): SlashCommand | undefined => {
      return commands.find((c) => c.command === commandStr);
    },
    [commands]
  );

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
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
    (e: React.MouseEvent, command: string) => {
      e.stopPropagation();
      onRemoveFavorite(command);
    },
    [onRemoveFavorite]
  );

  // Empty state
  if (favoriteCommands.length === 0) {
    return (
      <div
        className="absolute bottom-full left-0 mb-1 min-w-[280px] w-full sm:w-auto
                   bg-white dark:bg-gray-800
                   border border-gray-200 dark:border-gray-700
                   shadow-lg rounded-lg z-50 p-4"
        role="listbox"
        aria-label="즐겨찾기 커맨드 목록"
        data-testid="favorites-popup"
      >
        <p className="text-sm text-gray-500 dark:text-gray-400" data-testid="favorites-empty-message">
          즐겨찾기가 비어있습니다. 슬래시 커맨드 목록에서 ⭐을 눌러 추가하세요.
        </p>
      </div>
    );
  }

  return (
    <div
      className="absolute bottom-full left-0 mb-1 min-w-[280px] w-full sm:w-auto
                 bg-white dark:bg-gray-800
                 border border-gray-200 dark:border-gray-700
                 shadow-lg rounded-lg z-50
                 max-h-[300px] overflow-y-auto"
      role="listbox"
      aria-label="즐겨찾기 커맨드 목록"
      data-testid="favorites-popup"
    >
      {favoriteCommands.map((commandStr, index) => {
        const cmd = findCommand(commandStr);
        const isDragging = dragIndex === index;
        const isDragOver = dragOverIndex === index && dragIndex !== index;

        return (
          <div
            key={commandStr}
            role="option"
            aria-selected={false}
            tabIndex={0}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={() => handleDrop(index)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelect(commandStr)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(commandStr);
              }
            }}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer
                       hover:bg-gray-100 dark:hover:bg-gray-700
                       transition-colors
                       ${isDragging ? 'opacity-50' : ''}
                       ${isDragOver ? 'border-t-2 border-blue-500' : ''}`}
            data-testid={`favorite-item-${index}`}
          >
            {/* Drag handle */}
            <span
              className="flex-shrink-0 cursor-grab text-gray-400"
              aria-label="순서 변경"
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
                {cmd?.name || commandStr}
              </span>
              {cmd?.description && (
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                  {cmd.description}
                </span>
              )}
            </span>

            {/* Remove button */}
            <button
              type="button"
              onClick={(e) => handleRemove(e, commandStr)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemoveFavorite(commandStr);
                }
              }}
              aria-label={`즐겨찾기에서 제거: ${commandStr}`}
              className="flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600
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
