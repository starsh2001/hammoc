import { useState, useCallback, useEffect } from 'react';

const MAX_FAVORITES = 20;
const STORAGE_KEY_PREFIX = 'bmad-command-favorites';

function getStorageKey(projectSlug: string): string {
  return `${STORAGE_KEY_PREFIX}:${projectSlug}`;
}

function loadFromStorage(projectSlug: string): string[] {
  try {
    const stored = localStorage.getItem(getStorageKey(projectSlug));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function useFavoriteCommands(projectSlug: string | undefined) {
  const [favoriteCommands, setFavoriteCommands] = useState<string[]>(() => {
    if (!projectSlug) return [];
    return loadFromStorage(projectSlug);
  });

  // Reload when projectSlug changes (useState initializer only runs on mount)
  useEffect(() => {
    if (!projectSlug) {
      setFavoriteCommands([]);
      return;
    }
    setFavoriteCommands(loadFromStorage(projectSlug));
  }, [projectSlug]);

  const addFavorite = useCallback((command: string) => {
    if (!projectSlug) return;
    setFavoriteCommands((prev) => {
      if (prev.includes(command)) return prev;
      if (prev.length >= MAX_FAVORITES) return prev;
      const next = [...prev, command];
      localStorage.setItem(getStorageKey(projectSlug), JSON.stringify(next));
      return next;
    });
  }, [projectSlug]);

  const removeFavorite = useCallback((command: string) => {
    if (!projectSlug) return;
    setFavoriteCommands((prev) => {
      const next = prev.filter((c) => c !== command);
      localStorage.setItem(getStorageKey(projectSlug), JSON.stringify(next));
      return next;
    });
  }, [projectSlug]);

  const reorderFavorites = useCallback((commands: string[]) => {
    if (!projectSlug) return;
    setFavoriteCommands((prev) => {
      if (commands.length === 0) return prev;
      // Only keep items that exist in the current favorites
      const validReordered = commands.filter((c) => prev.includes(c));
      // Add back any items from prev that were missing in the input
      const missing = prev.filter((c) => !commands.includes(c));
      const next = [...validReordered, ...missing];
      localStorage.setItem(getStorageKey(projectSlug), JSON.stringify(next));
      return next;
    });
  }, [projectSlug]);

  const isFavorite = useCallback((command: string): boolean => {
    return favoriteCommands.includes(command);
  }, [favoriteCommands]);

  return { favoriteCommands, addFavorite, removeFavorite, reorderFavorites, isFavorite };
}
