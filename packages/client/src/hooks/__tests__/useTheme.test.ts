/**
 * useTheme Hook Tests
 * Story 1.5: End-to-End Test Page
 * Story 10.2: Added 'system' theme support tests
 * Updated: Now backed by preferencesStore (global, server-persisted)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../useTheme';
import { usePreferencesStore } from '../../stores/preferencesStore';

describe('useTheme', () => {
  // Mock matchMedia
  let mediaQueryMatches = false;
  const mockChangeListeners: Array<(e: MediaQueryListEvent) => void> = [];

  const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mediaQueryMatches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, handler: (e: MediaQueryListEvent) => void) => {
      mockChangeListeners.push(handler);
    }),
    removeEventListener: vi.fn((_event: string, handler: (e: MediaQueryListEvent) => void) => {
      const idx = mockChangeListeners.indexOf(handler);
      if (idx >= 0) mockChangeListeners.splice(idx, 1);
    }),
    dispatchEvent: vi.fn(),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mediaQueryMatches = false;
    mockChangeListeners.length = 0;
    usePreferencesStore.setState({ preferences: {}, overrides: [], loaded: true });
    Object.defineProperty(window, 'matchMedia', {
      value: mockMatchMedia,
      writable: true,
    });
    // Reset document classes
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  describe('initial state', () => {
    it('should return dark theme by default when no preference is set', () => {
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('dark');
    });

    it('should restore theme from preferencesStore', () => {
      usePreferencesStore.setState({ preferences: { theme: 'dark' }, loaded: true });
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('dark');
    });

    it('should use light theme when stored in preferencesStore', () => {
      usePreferencesStore.setState({ preferences: { theme: 'light' }, loaded: true });
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('light');
    });

    it('should use system theme when stored in preferencesStore', () => {
      usePreferencesStore.setState({ preferences: { theme: 'system' }, loaded: true });
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('system');
    });
  });

  describe('toggleTheme', () => {
    it('should toggle from light to dark', () => {
      usePreferencesStore.setState({ preferences: { theme: 'light' }, loaded: true });
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('light');

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('dark');
    });

    it('should toggle from dark to light', () => {
      usePreferencesStore.setState({ preferences: { theme: 'dark' }, loaded: true });
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('dark');

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('light');
    });

    it('should toggle from system (OS dark) to light', () => {
      mediaQueryMatches = true;
      usePreferencesStore.setState({ preferences: { theme: 'system' }, loaded: true });
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('light');
    });

    it('should toggle from system (OS light) to dark', () => {
      mediaQueryMatches = false;
      usePreferencesStore.setState({ preferences: { theme: 'system' }, loaded: true });
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('dark');
    });

    it('should save theme to preferencesStore', () => {
      usePreferencesStore.setState({ preferences: { theme: 'light' }, loaded: true });
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.toggleTheme();
      });

      expect(usePreferencesStore.getState().preferences.theme).toBe('dark');
    });
  });

  describe('setTheme', () => {
    it('should set theme to dark', () => {
      usePreferencesStore.setState({ preferences: { theme: 'light' }, loaded: true });
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('dark');
      });

      expect(result.current.theme).toBe('dark');
    });

    it('should set theme to light', () => {
      usePreferencesStore.setState({ preferences: { theme: 'dark' }, loaded: true });
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('light');
      });

      expect(result.current.theme).toBe('light');
    });

    it('should set theme to system', () => {
      usePreferencesStore.setState({ preferences: { theme: 'dark' }, loaded: true });
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('system');
      });

      expect(result.current.theme).toBe('system');
    });

    it('should save theme to preferencesStore', () => {
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('dark');
      });

      expect(usePreferencesStore.getState().preferences.theme).toBe('dark');
    });
  });

  describe('document class', () => {
    it('should add dark class to document when theme is dark', () => {
      usePreferencesStore.setState({ preferences: { theme: 'dark' }, loaded: true });
      renderHook(() => useTheme());
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should remove dark class from document when theme is light', () => {
      document.documentElement.classList.add('dark');
      usePreferencesStore.setState({ preferences: { theme: 'light' }, loaded: true });
      renderHook(() => useTheme());
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should toggle dark class when theme changes', () => {
      usePreferencesStore.setState({ preferences: { theme: 'light' }, loaded: true });
      const { result } = renderHook(() => useTheme());

      expect(document.documentElement.classList.contains('dark')).toBe(false);

      act(() => {
        result.current.toggleTheme();
      });

      expect(document.documentElement.classList.contains('dark')).toBe(true);

      act(() => {
        result.current.toggleTheme();
      });

      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should apply dark class when system theme is set and OS prefers dark', () => {
      mediaQueryMatches = true;
      usePreferencesStore.setState({ preferences: { theme: 'system' }, loaded: true });
      renderHook(() => useTheme());
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should remove dark class when system theme is set and OS prefers light', () => {
      mediaQueryMatches = false;
      document.documentElement.classList.add('dark');
      usePreferencesStore.setState({ preferences: { theme: 'system' }, loaded: true });
      renderHook(() => useTheme());
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should respond to OS theme changes when in system mode', () => {
      mediaQueryMatches = false;
      usePreferencesStore.setState({ preferences: { theme: 'system' }, loaded: true });
      renderHook(() => useTheme());

      expect(document.documentElement.classList.contains('dark')).toBe(false);

      // Simulate OS switching to dark mode
      act(() => {
        mediaQueryMatches = true;
        mockChangeListeners.forEach(handler =>
          handler({ matches: true } as MediaQueryListEvent)
        );
      });

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });
});
