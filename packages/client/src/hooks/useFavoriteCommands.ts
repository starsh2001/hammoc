/**
 * useFavoriteCommands - Global slash command favorites
 * Backed by server-side preferences (via preferencesStore)
 * [Updated: BS-1 - Task 7] Now uses CommandFavoriteEntry[] with scope
 */

import { useMemo, useCallback } from 'react';
import type { CommandFavoriteEntry } from '@hammoc/shared';
import { usePreferencesStore, normalizeCommandFavorites } from '../stores/preferencesStore';

const MAX_FAVORITES = 20;

export function useFavoriteCommands() {
  const rawFavorites = usePreferencesStore(
    (s) => s.preferences.commandFavorites
  );

  const favoriteCommands: CommandFavoriteEntry[] = useMemo(
    () => normalizeCommandFavorites(rawFavorites),
    [rawFavorites]
  );

  const addFavorite = useCallback((command: string, scope?: 'project' | 'global') => {
    const store = usePreferencesStore.getState();
    const prev = normalizeCommandFavorites(store.preferences.commandFavorites);
    if (prev.some((e) => e.command === command) || prev.length >= MAX_FAVORITES) return;
    const entry: CommandFavoriteEntry = { command, scope: scope ?? 'project' };
    store.updatePreference('commandFavorites', [...prev, entry]);
  }, []);

  const removeFavorite = useCallback((entry: CommandFavoriteEntry) => {
    const store = usePreferencesStore.getState();
    const prev = normalizeCommandFavorites(store.preferences.commandFavorites);
    store.updatePreference('commandFavorites',
      prev.filter((e) => !(e.command === entry.command && e.scope === entry.scope))
    );
  }, []);

  const reorderFavorites = useCallback((commands: CommandFavoriteEntry[]) => {
    const store = usePreferencesStore.getState();
    if (commands.length === 0) return;
    store.updatePreference('commandFavorites', commands);
  }, []);

  const isFavorite = useCallback((command: string): boolean => {
    const prev = normalizeCommandFavorites(
      usePreferencesStore.getState().preferences.commandFavorites
    );
    return prev.some((e) => e.command === command);
  }, []);

  return { favoriteCommands, addFavorite, removeFavorite, reorderFavorites, isFavorite };
}
