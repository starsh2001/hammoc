/**
 * Preferences Store - Zustand store for server-persisted user preferences
 *
 * Strategy: Write-through cache
 * - localStorage = fast cache (prevents flash on initial load)
 * - Server = persistent source of truth
 * - Writes: state + localStorage + debounced server PATCH
 * - Reads: localStorage immediately → server fetch in background → reconcile
 */

import { create } from 'zustand';
import type { UserPreferences, SupportedLanguage } from '@hammoc/shared';
import { preferencesApi } from '../services/api/preferences';
import { debugLogger } from '../utils/debugLogger';
import i18n from '../i18n';

const CACHE_KEY = 'hammoc-preferences';
const DEBOUNCE_MS = 300;

// localStorage helpers
function readCache(): UserPreferences {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(prefs: UserPreferences): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
  } catch {
    // quota exceeded — in-memory state is still updated
  }
}

// Legacy localStorage keys for one-time migration
const LEGACY_KEYS = {
  theme: 'hammoc-theme',
  diffLayout: 'hammoc-diff-layout',
} as const;

const LEGACY_FAVORITES_PREFIX = 'bmad-command-favorites';
const LEGACY_STAR_PREFIX = 'bmad-star-favorites';

function collectLegacyPreferences(): UserPreferences {
  const prefs: UserPreferences = {};

  // Simple global settings
  const theme = localStorage.getItem(LEGACY_KEYS.theme);
  if (theme === 'light' || theme === 'dark') prefs.theme = theme;

  const diffLayout = localStorage.getItem(LEGACY_KEYS.diffLayout);
  if (diffLayout === 'side-by-side' || diffLayout === 'inline') prefs.diffLayout = diffLayout;

  // Collect command favorites from all projects (merge into global list)
  const allFavorites = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LEGACY_FAVORITES_PREFIX + ':')) {
      try {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(arr)) arr.forEach((c: string) => allFavorites.add(c));
      } catch { /* skip */ }
    }
  }
  if (allFavorites.size > 0) prefs.commandFavorites = [...allFavorites].slice(0, 20);

  // Collect star favorites from all projects (key by agentId only)
  const allStars: Record<string, Set<string>> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LEGACY_STAR_PREFIX + ':')) {
      // Format: bmad-star-favorites:{projectSlug}:{agentId}
      const parts = key.split(':');
      const agentId = parts.slice(2).join(':'); // agentId may contain colons
      if (!agentId) continue;
      try {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(arr)) continue;
        if (!allStars[agentId]) allStars[agentId] = new Set();
        arr.forEach((c: string) => allStars[agentId].add(c));
      } catch { /* skip */ }
    }
  }
  if (Object.keys(allStars).length > 0) {
    prefs.starFavorites = {};
    for (const [agentId, cmds] of Object.entries(allStars)) {
      prefs.starFavorites[agentId] = [...cmds].slice(0, 10);
    }
  }

  return prefs;
}

interface PreferencesStore {
  preferences: UserPreferences;
  overrides: string[];
  loaded: boolean;
  init: () => Promise<void>;
  updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  updatePreferences: (partial: Partial<UserPreferences>) => void;
  setLanguage: (lang: SupportedLanguage) => void;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPatch: Partial<UserPreferences> = {};

function flushToServer() {
  if (Object.keys(pendingPatch).length === 0) return;
  const patch = { ...pendingPatch };
  pendingPatch = {};
  preferencesApi.update(patch).catch((err) => {
    debugLogger.error('Failed to save preferences', { error: err instanceof Error ? err.message : String(err) });
  });
}

function schedulePatch(partial: Partial<UserPreferences>) {
  Object.assign(pendingPatch, partial);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushToServer, DEBOUNCE_MS);
}

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  preferences: readCache(),
  overrides: [],
  loaded: false,

  init: async () => {
    if (get().loaded) return;
    try {
      const serverPrefs = await preferencesApi.get();
      const { _overrides, ...prefs } = serverPrefs;
      const hasServerData = Object.keys(prefs).length > 0;

      if (hasServerData) {
        // Server has data — it's the source of truth
        set({ preferences: prefs, overrides: _overrides ?? [], loaded: true });
        writeCache(prefs);
        // Sync i18next language with stored preference (Epic 22)
        if (prefs.language) {
          i18n.changeLanguage(prefs.language);
        }
      } else {
        // Server empty — migrate from localStorage
        const legacy = collectLegacyPreferences();
        const hasLegacy = Object.keys(legacy).length > 0;
        if (hasLegacy) {
          // Send legacy data to server
          const saved = await preferencesApi.update(legacy);
          set({ preferences: saved, loaded: true });
          writeCache(saved);
        } else {
          set({ loaded: true });
        }
      }
    } catch (err) {
      debugLogger.error('Failed to init preferences', { error: err instanceof Error ? err.message : String(err) });
      // Fall back to cache — already in state from readCache()
      set({ loaded: true });
    }
  },

  updatePreference: (key, value) => {
    const updated = { ...get().preferences, [key]: value };
    set({ preferences: updated });
    writeCache(updated);
    schedulePatch({ [key]: value } as Partial<UserPreferences>);
  },

  updatePreferences: (partial) => {
    const updated = { ...get().preferences, ...partial };
    set({ preferences: updated });
    writeCache(updated);
    schedulePatch(partial);
  },

  setLanguage: (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang);
    const updated = { ...get().preferences, language: lang };
    set({ preferences: updated });
    writeCache(updated);
    schedulePatch({ language: lang });
  },
}));
