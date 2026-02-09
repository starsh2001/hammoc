/**
 * useIsMobile Hook Tests
 * [Source: Story 8.2 - Task 4]
 */

import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useIsMobile } from '../useIsMobile';

// --- matchMedia mock helper ---
function createMockMatchMedia(matches: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];

  const mql = {
    matches,
    media: '(max-width: 767px)',
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

describe('useIsMobile', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  // TC1: Desktop viewport returns false
  it('returns false on desktop viewport', () => {
    mockMql = createMockMatchMedia(false);
    window.matchMedia = vi.fn().mockReturnValue(mockMql);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  // TC2: Mobile viewport returns true
  it('returns true on mobile viewport', () => {
    mockMql = createMockMatchMedia(true);
    window.matchMedia = vi.fn().mockReturnValue(mockMql);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  // TC3: Viewport change updates value
  it('updates value when viewport changes', () => {
    mockMql = createMockMatchMedia(false);
    window.matchMedia = vi.fn().mockReturnValue(mockMql);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      mockMql.dispatchChange(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      mockMql.dispatchChange(false);
    });
    expect(result.current).toBe(false);
  });
});
