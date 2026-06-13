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

// Device-local: diff layout lives in this browser's localStorage (the original
// pre-server-migration key), NOT the server — each device keeps its own; never broadcasts.
const DIFF_LAYOUT_KEY = 'hammoc-diff-layout';

function getSavedLayout(): DiffLayout | null {
  if (typeof window !== 'undefined') {
    const local = window.localStorage.getItem(DIFF_LAYOUT_KEY);
    if (local === 'side-by-side' || local === 'inline') return local;
  }
  // One-time migration: adopt the value still on the server, persist it locally.
  const saved = usePreferencesStore.getState().preferences.diffLayout;
  if (saved === 'side-by-side' || saved === 'inline') {
    try { window.localStorage.setItem(DIFF_LAYOUT_KEY, saved); } catch { /* quota */ }
    return saved;
  }
  return null;
}

export function useDiffLayout(): UseDiffLayoutReturn {
  const saved = getSavedLayout();
  const [layout, setLayoutState] = useState<DiffLayout>(saved ?? getAutoLayout());
  const [isManualOverride, setIsManualOverride] = useState<boolean>(saved !== null);
  const isManualRef = useRef(saved !== null);

  // No server sync: diff layout is device-local now (localStorage), so it does NOT follow
  // preferencesStore changes from other devices.

  // Keep ref in sync with state
  useEffect(() => {
    isManualRef.current = isManualOverride;
  }, [isManualOverride]);

  const setLayout = useCallback((newLayout: DiffLayout) => {
    setLayoutState(newLayout);
    setIsManualOverride(true);
    isManualRef.current = true;
    try { window.localStorage.setItem(DIFF_LAYOUT_KEY, newLayout); } catch { /* quota */ }
  }, []);

  const resetToAuto = useCallback(() => {
    setIsManualOverride(false);
    isManualRef.current = false;
    setLayoutState(getAutoLayout());
    try { window.localStorage.removeItem(DIFF_LAYOUT_KEY); } catch { /* quota */ }
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
