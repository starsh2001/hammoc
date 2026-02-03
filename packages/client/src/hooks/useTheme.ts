/**
 * Theme Hook
 * Story 1.5: End-to-End Test Page
 *
 * Manages dark/light theme with localStorage persistence
 * and system preference detection
 */

import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';

export type Theme = 'light' | 'dark';

export interface UseThemeReturn {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

/**
 * Detect system preferred color scheme
 */
function getSystemTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Get initial theme from localStorage or default to dark
 */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const stored = localStorage.getItem(STORAGE_KEYS.THEME);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  // Default to dark theme
  return 'dark';
}

/**
 * Hook for managing theme state
 * @returns Theme state and control functions
 */
export function useTheme(): UseThemeReturn {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  /**
   * Apply theme to document
   */
  const applyTheme = useCallback((newTheme: Theme) => {
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  /**
   * Set theme and persist to localStorage
   */
  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
      applyTheme(newTheme);
    },
    [applyTheme]
  );

  /**
   * Toggle between light and dark theme
   */
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
