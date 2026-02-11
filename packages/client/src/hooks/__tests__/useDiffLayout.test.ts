/**
 * useDiffLayout Hook Tests
 * Story 6.2: Responsive Diff Layout
 * Updated: Now backed by preferencesStore (global, server-persisted)
 */

import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useDiffLayout } from '../useDiffLayout';
import { usePreferencesStore } from '../../stores/preferencesStore';

// --- matchMedia mock helper ---
function createMockMatchMedia(matches: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];

  const mql = {
    matches,
    media: '(min-width: 768px)',
    addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') listeners.push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') {
        const idx = listeners.indexOf(handler);
        if (idx >= 0) listeners.splice(idx, 1);
      }
    }),
    dispatchChange: (newMatches: boolean) => {
      mql.matches = newMatches;
      listeners.forEach((fn) => fn({ matches: newMatches } as MediaQueryListEvent));
    },
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  return mql;
}

let mockMql: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  mockMql = createMockMatchMedia(true); // desktop by default
  vi.spyOn(window, 'matchMedia').mockReturnValue(mockMql as unknown as MediaQueryList);
  localStorage.clear();
  usePreferencesStore.setState({ preferences: {}, loaded: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDiffLayout', () => {
  describe('Initial State', () => {
    it('returns side-by-side when screen >= 768px', () => {
      mockMql.matches = true;
      const { result } = renderHook(() => useDiffLayout());
      expect(result.current.layout).toBe('side-by-side');
      expect(result.current.isManualOverride).toBe(false);
    });

    it('returns inline when screen < 768px', () => {
      mockMql.matches = false;
      vi.spyOn(window, 'matchMedia').mockReturnValue(mockMql as unknown as MediaQueryList);
      const { result } = renderHook(() => useDiffLayout());
      expect(result.current.layout).toBe('inline');
      expect(result.current.isManualOverride).toBe(false);
    });

    it('uses saved preferencesStore value on initial load', () => {
      usePreferencesStore.setState({ preferences: { diffLayout: 'inline' }, loaded: true });
      mockMql.matches = true; // desktop, but saved is inline
      const { result } = renderHook(() => useDiffLayout());
      expect(result.current.layout).toBe('inline');
      expect(result.current.isManualOverride).toBe(true);
    });
  });

  describe('Auto Layout via matchMedia', () => {
    it('updates layout when matchMedia changes', () => {
      const { result } = renderHook(() => useDiffLayout());
      expect(result.current.layout).toBe('side-by-side');

      act(() => {
        mockMql.dispatchChange(false);
      });
      expect(result.current.layout).toBe('inline');

      act(() => {
        mockMql.dispatchChange(true);
      });
      expect(result.current.layout).toBe('side-by-side');
    });
  });

  describe('Manual Override', () => {
    it('setLayout saves to preferencesStore and sets manual override', () => {
      const { result } = renderHook(() => useDiffLayout());

      act(() => {
        result.current.setLayout('inline');
      });

      expect(result.current.layout).toBe('inline');
      expect(result.current.isManualOverride).toBe(true);
      expect(usePreferencesStore.getState().preferences.diffLayout).toBe('inline');
    });

    it('manual override ignores matchMedia changes', () => {
      const { result } = renderHook(() => useDiffLayout());

      // Manually set to inline
      act(() => {
        result.current.setLayout('inline');
      });
      expect(result.current.layout).toBe('inline');

      // matchMedia changes should be ignored
      act(() => {
        mockMql.dispatchChange(true);
      });
      expect(result.current.layout).toBe('inline');

      act(() => {
        mockMql.dispatchChange(false);
      });
      expect(result.current.layout).toBe('inline');
    });
  });

  describe('resetToAuto', () => {
    it('clears preference and returns to auto mode', () => {
      const { result } = renderHook(() => useDiffLayout());

      // Set manual override
      act(() => {
        result.current.setLayout('inline');
      });
      expect(result.current.isManualOverride).toBe(true);
      expect(usePreferencesStore.getState().preferences.diffLayout).toBe('inline');

      // Reset to auto
      act(() => {
        result.current.resetToAuto();
      });

      expect(result.current.isManualOverride).toBe(false);
      expect(usePreferencesStore.getState().preferences.diffLayout).toBeUndefined();
      // Should reflect current matchMedia (desktop = side-by-side)
      expect(result.current.layout).toBe('side-by-side');
    });

    it('responds to matchMedia changes after resetToAuto', () => {
      const { result } = renderHook(() => useDiffLayout());

      // Set manual, then reset
      act(() => {
        result.current.setLayout('inline');
      });
      act(() => {
        result.current.resetToAuto();
      });

      // Should now respond to matchMedia
      act(() => {
        mockMql.dispatchChange(false);
      });
      expect(result.current.layout).toBe('inline');
    });
  });

  describe('Cleanup', () => {
    it('removes matchMedia listener on unmount', () => {
      const { unmount } = renderHook(() => useDiffLayout());

      expect(mockMql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

      unmount();

      expect(mockMql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });
});
