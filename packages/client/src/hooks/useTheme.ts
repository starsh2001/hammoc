/**
 * Theme Hook
 * Story 1.5: End-to-End Test Page
 *
 * Manages dark/light theme with server-side persistence
 * and localStorage write-through cache (via preferencesStore)
 */

import { useState, useEffect, useCallback } from 'react';
import { usePreferencesStore } from '../stores/preferencesStore';

export type Theme = 'light' | 'dark';

export interface UseThemeReturn {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

function getInitialTheme(): Theme {
  const stored = usePreferencesStore.getState().preferences.theme;
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
}

/**
 * Hook for managing theme state
 * @returns Theme state and control functions
 */
export function useTheme(): UseThemeReturn {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Sync with preferencesStore when server data arrives
  const storeTheme = usePreferencesStore((s) => s.preferences.theme);
  useEffect(() => {
    if (storeTheme && storeTheme !== theme) {
      setThemeState(storeTheme);
      applyTheme(storeTheme);
    }
  }, [storeTheme]);

  const applyTheme = useCallback((newTheme: Theme) => {
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      applyTheme(newTheme);
      usePreferencesStore.getState().updatePreference('theme', newTheme);
    },
    [applyTheme]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  // Apply initial theme on mount
  useEffect(() => {
    applyTheme(theme);
  }, []);

  return {
    theme,
    toggleTheme,
    setTheme,
  };
}
