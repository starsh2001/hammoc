/**
 * Diff Layout Hook
 * Story 6.2: Responsive Diff Layout
 *
 * Manages responsive diff layout with server-side persistence
 * (via preferencesStore) and screen size auto-detection via matchMedia
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePreferencesStore } from '../stores/preferencesStore';

const BREAKPOINT = 768; // px

export type DiffLayout = 'side-by-side' | 'inline';

export interface UseDiffLayoutReturn {
  /** Current effective layout */
  layout: DiffLayout;
  /** Manually set layout (saves to server) */
  setLayout: (layout: DiffLayout) => void;
  /** Whether user has manually overridden auto layout */
  isManualOverride: boolean;
  /** Reset to auto-detect mode */
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
  const saved = usePreferencesStore.getState().preferences.diffLayout;
  if (saved === 'side-by-side' || saved === 'inline') return saved;
  return null;
}

export function useDiffLayout(): UseDiffLayoutReturn {
  const saved = getSavedLayout();
  const [layout, setLayoutState] = useState<DiffLayout>(saved ?? getAutoLayout());
  const [isManualOverride, setIsManualOverride] = useState<boolean>(saved !== null);
  const isManualRef = useRef(saved !== null);

  // Sync with preferencesStore when server data arrives
  const storeDiffLayout = usePreferencesStore((s) => s.preferences.diffLayout);
  useEffect(() => {
    if (storeDiffLayout && storeDiffLayout !== layout) {
      setLayoutState(storeDiffLayout);
      setIsManualOverride(true);
      isManualRef.current = true;
    } else if (storeDiffLayout === undefined && isManualOverride) {
      // Server has no preference — reset to auto
      setIsManualOverride(false);
      isManualRef.current = false;
      setLayoutState(getAutoLayout());
    }
  }, [storeDiffLayout]);

  // Keep ref in sync with state
  useEffect(() => {
    isManualRef.current = isManualOverride;
  }, [isManualOverride]);

  const setLayout = useCallback((newLayout: DiffLayout) => {
    setLayoutState(newLayout);
    setIsManualOverride(true);
    isManualRef.current = true;
    usePreferencesStore.getState().updatePreference('diffLayout', newLayout);
  }, []);

  const resetToAuto = useCallback(() => {
    setIsManualOverride(false);
    isManualRef.current = false;
    setLayoutState(getAutoLayout());
    usePreferencesStore.getState().updatePreference('diffLayout', undefined);
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
