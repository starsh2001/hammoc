/**
 * useFavoriteCommands - Global slash command favorites
 * Backed by server-side preferences (via preferencesStore)
 */

import { useCallback } from 'react';
import { usePreferencesStore } from '../stores/preferencesStore';

const MAX_FAVORITES = 20;
const EMPTY: string[] = [];

export function useFavoriteCommands() {
  const favoriteCommands = usePreferencesStore(
    (s) => s.preferences.commandFavorites ?? EMPTY
  );

  const addFavorite = useCallback((command: string) => {
    const store = usePreferencesStore.getState();
    const prev = store.preferences.commandFavorites ?? [];
    if (prev.includes(command) || prev.length >= MAX_FAVORITES) return;
    store.updatePreference('commandFavorites', [...prev, command]);
  }, []);

  const removeFavorite = useCallback((command: string) => {
    const store = usePreferencesStore.getState();
    const prev = store.preferences.commandFavorites ?? [];
    store.updatePreference('commandFavorites', prev.filter((c) => c !== command));
  }, []);

  const reorderFavorites = useCallback((commands: string[]) => {
    const store = usePreferencesStore.getState();
    const prev = store.preferences.commandFavorites ?? [];
    if (commands.length === 0) return;
    const validReordered = commands.filter((c) => prev.includes(c));
    const missing = prev.filter((c) => !commands.includes(c));
    store.updatePreference('commandFavorites', [...validReordered, ...missing]);
  }, []);

  const isFavorite = useCallback((command: string): boolean => {
    return (usePreferencesStore.getState().preferences.commandFavorites ?? []).includes(command);
  }, []);

  return { favoriteCommands, addFavorite, removeFavorite, reorderFavorites, isFavorite };
}
