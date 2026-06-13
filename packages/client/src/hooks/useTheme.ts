/**
 * Theme Hook
 * Story 1.5: End-to-End Test Page
 * Story 10.2: Added 'system' theme option with OS preference detection
 *
 * Manages dark/light/system theme with server-side persistence
 * and localStorage write-through cache (via preferencesStore)
 */

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { usePreferencesStore } from '../stores/preferencesStore';

export type Theme = 'light' | 'dark' | 'system';

export interface UseThemeReturn {
  /** Raw theme preference ('light' | 'dark' | 'system') */
  theme: Theme;
  /** Resolved effective theme ('light' | 'dark'), accounts for OS preference when 'system' */
  resolvedTheme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

// Device-local: theme lives in this browser's localStorage (the original pre-server-migration
// key), NOT the server — so each device keeps its own theme and a change never broadcasts.
const THEME_KEY = 'hammoc-theme';

function getInitialTheme(): Theme {
  if (typeof window !== 'undefined') {
    const local = window.localStorage.getItem(THEME_KEY);
    if (local === 'light' || local === 'dark' || local === 'system') return local;
  }
  // One-time migration: adopt the value still on the server (for users coming off server
  // storage), persist it locally, then localStorage is authoritative from here on.
  const stored = usePreferencesStore.getState().preferences.theme;
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    try { window.localStorage.setItem(THEME_KEY, stored); } catch { /* quota */ }
    return stored;
  }
  return 'dark';
}

// Samsung Internet doesn't support prefers-color-scheme; fall back to dark
const isSamsungBrowser = typeof navigator !== 'undefined' && /SamsungBrowser/i.test(navigator.userAgent);

/** Resolve a theme value to the effective 'dark' or 'light' */
function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    if (isSamsungBrowser) return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

// Subscribe to OS color scheme changes for useSyncExternalStore
function subscribeToMediaQuery(callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia || isSamsungBrowser) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getOsPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  if (isSamsungBrowser) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Hook for managing theme state
 * @returns Theme state and control functions
 */
export function useTheme(): UseThemeReturn {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Re-render when OS color scheme changes (needed for 'system' mode)
  const osPrefersDark = useSyncExternalStore(subscribeToMediaQuery, getOsPrefersDark);

  const resolvedTheme: 'dark' | 'light' =
    theme === 'system' ? (osPrefersDark ? 'dark' : 'light') : theme;

  // No server sync: theme is device-local now (localStorage), so it does NOT follow
  // preferencesStore changes from other devices.

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
      try { window.localStorage.setItem(THEME_KEY, newTheme); } catch { /* quota */ }
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

  // Apply theme whenever resolvedTheme changes (covers OS preference change in system mode)
  useEffect(() => {
    if (resolvedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [resolvedTheme]);

  return {
    theme,
    resolvedTheme,
    toggleTheme,
    setTheme,
  };
}
