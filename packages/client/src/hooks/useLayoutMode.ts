/**
 * Layout Mode Hook
 * Manages narrow (1280px) / wide (full-width) layout preference
 * with server-side persistence (via preferencesStore)
 */

import { useState, useCallback, useEffect } from 'react';
import { usePreferencesStore } from '../stores/preferencesStore';

export type LayoutMode = 'narrow' | 'wide';

export interface UseLayoutModeReturn {
  layoutMode: LayoutMode;
  toggleLayoutMode: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
}

function getInitialMode(): LayoutMode {
  const stored = usePreferencesStore.getState().preferences.layoutMode;
  if (stored === 'narrow' || stored === 'wide') return stored;
  return 'narrow';
}

export function useLayoutMode(): UseLayoutModeReturn {
  const [layoutMode, setModeState] = useState<LayoutMode>(getInitialMode);

  // Sync with preferencesStore when server data arrives
  const storeMode = usePreferencesStore((s) => s.preferences.layoutMode);
  useEffect(() => {
    if (storeMode && storeMode !== layoutMode) {
      setModeState(storeMode);
      applyMode(storeMode);
    }
  }, [storeMode]);

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
      applyMode(mode);
      usePreferencesStore.getState().updatePreference('layoutMode', mode);
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
