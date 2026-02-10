import { useState, useCallback, useEffect } from 'react';

const MAX_STAR_FAVORITES = 10;
const STORAGE_KEY_PREFIX = 'bmad-star-favorites';

function getStorageKey(projectSlug: string, agentId: string): string {
  return `${STORAGE_KEY_PREFIX}:${projectSlug}:${agentId}`;
}

function loadFromStorage(projectSlug: string, agentId: string): string[] {
  try {
    const stored = localStorage.getItem(getStorageKey(projectSlug, agentId));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveToStorage(projectSlug: string, agentId: string, items: string[]): void {
  try {
    localStorage.setItem(getStorageKey(projectSlug, agentId), JSON.stringify(items));
  } catch {
    // localStorage quota exceeded — in-memory state is still updated
  }
}

export function useStarFavorites(
  projectSlug: string | undefined,
  agentId: string | null | undefined
) {
  const [starFavorites, setStarFavorites] = useState<string[]>(() => {
    if (!projectSlug || !agentId) return [];
    return loadFromStorage(projectSlug, agentId);
  });

  // Reload when projectSlug or agentId changes (useState initializer only runs on mount)
  useEffect(() => {
    if (!projectSlug || !agentId) {
      setStarFavorites([]);
      return;
    }
    setStarFavorites(loadFromStorage(projectSlug, agentId));
  }, [projectSlug, agentId]);

  const addStarFavorite = useCallback((command: string) => {
    if (!projectSlug || !agentId) return;
    setStarFavorites((prev) => {
      if (prev.includes(command)) return prev;
      if (prev.length >= MAX_STAR_FAVORITES) return prev;
      const next = [...prev, command];
      saveToStorage(projectSlug, agentId, next);
      return next;
    });
  }, [projectSlug, agentId]);

  const removeStarFavorite = useCallback((command: string) => {
    if (!projectSlug || !agentId) return;
    setStarFavorites((prev) => {
      const next = prev.filter((c) => c !== command);
      saveToStorage(projectSlug, agentId, next);
      return next;
    });
  }, [projectSlug, agentId]);

  const reorderStarFavorites = useCallback((commands: string[]) => {
    if (!projectSlug || !agentId) return;
    setStarFavorites((prev) => {
      if (commands.length === 0) return prev;
      // Only keep items that exist in the current favorites
      const validReordered = commands.filter((c) => prev.includes(c));
      // Add back any items from prev that were missing in the input
      const missing = prev.filter((c) => !commands.includes(c));
      const next = [...validReordered, ...missing];
      saveToStorage(projectSlug, agentId, next);
      return next;
    });
  }, [projectSlug, agentId]);

  const isStarFavorite = useCallback((command: string): boolean => {
    return starFavorites.includes(command);
  }, [starFavorites]);

  return { starFavorites, addStarFavorite, removeStarFavorite, reorderStarFavorites, isStarFavorite };
}
