/**
 * useTheme Hook Tests
 * Story 1.5: End-to-End Test Page
 * Updated: Now backed by preferencesStore (global, server-persisted)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../useTheme';
import { usePreferencesStore } from '../../stores/preferencesStore';

describe('useTheme', () => {
  // Mock matchMedia
  const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    usePreferencesStore.setState({ preferences: {}, loaded: true });
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
  });
});
