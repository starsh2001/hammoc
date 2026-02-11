/**
 * Layout Mode Hook
 * Manages narrow (1280px) / wide (full-width) layout preference
 * with localStorage persistence
 */

import { useState, useCallback, useEffect } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';

export type LayoutMode = 'narrow' | 'wide';

export interface UseLayoutModeReturn {
  layoutMode: LayoutMode;
  toggleLayoutMode: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
}

function getInitialMode(): LayoutMode {
  if (typeof window === 'undefined') return 'narrow';
  const stored = localStorage.getItem(STORAGE_KEYS.LAYOUT_MODE);
  if (stored === 'narrow' || stored === 'wide') return stored;
  return 'narrow';
}

export function useLayoutMode(): UseLayoutModeReturn {
  const [layoutMode, setModeState] = useState<LayoutMode>(getInitialMode);

  const applyMode = useCallback((mode: LayoutMode) => {
    if (mode === 'narrow') {
      document.documentElement.classList.add('narrow-layout');
    } else {
      document.documentElement.classList.remove('narrow-layout');
    }
  }, []);

  const setLayoutMode = useCallback(
    (mode: LayoutMode) => {
      setModeState(mode);
      localStorage.setItem(STORAGE_KEYS.LAYOUT_MODE, mode);
      applyMode(mode);
    },
    [applyMode]
  );

  const toggleLayoutMode = useCallback(() => {
    setLayoutMode(layoutMode === 'narrow' ? 'wide' : 'narrow');
  }, [layoutMode, setLayoutMode]);

  // Apply initial mode on mount
  useEffect(() => {
    applyMode(layoutMode);
  }, []);

  return { layoutMode, toggleLayoutMode, setLayoutMode };
}
