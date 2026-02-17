/**
 * Theme Hook
 * Story 1.5: End-to-End Test Page
 * Story 10.2: Added 'system' theme option with OS preference detection
 *
 * Manages dark/light/system theme with server-side persistence
 * and localStorage write-through cache (via preferencesStore)
 */

import { useState, useEffect, useCallback } from 'react';
import { usePreferencesStore } from '../stores/preferencesStore';

export type Theme = 'light' | 'dark' | 'system';

export interface UseThemeReturn {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

function getInitialTheme(): Theme {
  const stored = usePreferencesStore.getState().preferences.theme;
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'dark';
}

/** Resolve a theme value to the effective 'dark' or 'light' */
function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
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
    const effective = resolveTheme(newTheme);
    if (effective === 'dark') {
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
    if (theme === 'system') {
      // Resolve system to actual, then toggle to opposite
      const resolved = resolveTheme('system');
      setTheme(resolved === 'dark' ? 'light' : 'dark');
    } else {
      setTheme(theme === 'light' ? 'dark' : 'light');
    }
  }, [theme, setTheme]);

  // Apply initial theme on mount
  useEffect(() => {
    applyTheme(theme);
  }, []);

  // Listen for OS theme changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      // Only update DOM, keep store theme as 'system'
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return {
    theme,
    toggleTheme,
    setTheme,
  };
}
