/**
 * useStarFavorites - Global agent-specific star command favorites
 * Backed by server-side preferences (via preferencesStore)
 * Keyed by agentId only (no longer project-scoped)
 */

import { useCallback } from 'react';
import { usePreferencesStore } from '../stores/preferencesStore';

const MAX_STAR_FAVORITES = 10;
const EMPTY: string[] = [];

export function useStarFavorites(agentId: string | null | undefined) {
  const starFavorites = usePreferencesStore((s) => {
    if (!agentId) return EMPTY;
    return s.preferences.starFavorites?.[agentId] ?? EMPTY;
  });

  const updateAgentStars = useCallback((newStars: string[]) => {
    if (!agentId) return;
    const store = usePreferencesStore.getState();
    const allStars = { ...store.preferences.starFavorites };
    allStars[agentId] = newStars;
    store.updatePreference('starFavorites', allStars);
  }, [agentId]);

  const addStarFavorite = useCallback((command: string) => {
    if (!agentId) return;
    const store = usePreferencesStore.getState();
    const prev = store.preferences.starFavorites?.[agentId] ?? [];
    if (prev.includes(command) || prev.length >= MAX_STAR_FAVORITES) return;
    updateAgentStars([...prev, command]);
  }, [agentId, updateAgentStars]);

  const removeStarFavorite = useCallback((command: string) => {
    if (!agentId) return;
    const store = usePreferencesStore.getState();
    const prev = store.preferences.starFavorites?.[agentId] ?? [];
    updateAgentStars(prev.filter((c) => c !== command));
  }, [agentId, updateAgentStars]);

  const reorderStarFavorites = useCallback((commands: string[]) => {
    if (!agentId) return;
    const store = usePreferencesStore.getState();
    const prev = store.preferences.starFavorites?.[agentId] ?? [];
    if (commands.length === 0) return;
    const validReordered = commands.filter((c) => prev.includes(c));
    const missing = prev.filter((c) => !commands.includes(c));
    updateAgentStars([...validReordered, ...missing]);
  }, [agentId, updateAgentStars]);

  const isStarFavorite = useCallback((command: string): boolean => {
    if (!agentId) return false;
    return (usePreferencesStore.getState().preferences.starFavorites?.[agentId] ?? []).includes(command);
  }, [agentId]);

  return { starFavorites, addStarFavorite, removeStarFavorite, reorderStarFavorites, isStarFavorite };
}
