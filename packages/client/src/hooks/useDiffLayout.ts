/**
 * Diff Layout Hook
 * Story 6.2: Responsive Diff Layout
 *
 * Manages responsive diff layout with localStorage persistence
 * and screen size auto-detection via matchMedia
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';

const BREAKPOINT = 768; // px

export type DiffLayout = 'side-by-side' | 'inline';

export interface UseDiffLayoutReturn {
  /** Current effective layout */
  layout: DiffLayout;
  /** Manually set layout (saves to localStorage) */
  setLayout: (layout: DiffLayout) => void;
  /** Whether user has manually overridden auto layout */
  isManualOverride: boolean;
  /** Reset to auto-detect mode (removes localStorage) */
  resetToAuto: () => void;
}

function getAutoLayout(): DiffLayout {
  if (typeof window === 'undefined') {
    return 'side-by-side';
  }
  return window.matchMedia(`(min-width: ${BREAKPOINT}px)`).matches
    ? 'side-by-side'
    : 'inline';
}

function getSavedLayout(): DiffLayout | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const saved = localStorage.getItem(STORAGE_KEYS.DIFF_LAYOUT);
  if (saved === 'side-by-side' || saved === 'inline') {
    return saved;
  }
  return null;
}

export function useDiffLayout(): UseDiffLayoutReturn {
  const saved = getSavedLayout();
  const [layout, setLayoutState] = useState<DiffLayout>(saved ?? getAutoLayout());
  const [isManualOverride, setIsManualOverride] = useState<boolean>(saved !== null);
  const isManualRef = useRef(saved !== null);

  // Keep ref in sync with state
  useEffect(() => {
    isManualRef.current = isManualOverride;
  }, [isManualOverride]);

  const setLayout = useCallback((newLayout: DiffLayout) => {
    setLayoutState(newLayout);
    setIsManualOverride(true);
    isManualRef.current = true;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.DIFF_LAYOUT, newLayout);
    }
  }, []);

  const resetToAuto = useCallback(() => {
    setIsManualOverride(false);
    isManualRef.current = false;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.DIFF_LAYOUT);
    }
    setLayoutState(getAutoLayout());
  }, []);

  // Listen for matchMedia changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(`(min-width: ${BREAKPOINT}px)`);

    const handleChange = (e: MediaQueryListEvent) => {
      if (!isManualRef.current) {
        setLayoutState(e.matches ? 'side-by-side' : 'inline');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return { layout, setLayout, isManualOverride, resetToAuto };
}
