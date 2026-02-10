/**
 * useFavoriteCommands Tests
 * [Source: Story 9.4 - Task 3]
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFavoriteCommands } from '../useFavoriteCommands';

describe('useFavoriteCommands', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // TC1: Initial state returns empty array
  it('returns empty array on initial state', () => {
    const { result } = renderHook(() => useFavoriteCommands('test-project'));
    expect(result.current.favoriteCommands).toEqual([]);
  });

  // TC2: addFavorite saves to localStorage and updates state
  it('saves to localStorage and updates state when addFavorite is called', () => {
    const { result } = renderHook(() => useFavoriteCommands('test-project'));

    act(() => {
      result.current.addFavorite('/BMad:agents:pm');
    });

    expect(result.current.favoriteCommands).toEqual(['/BMad:agents:pm']);
    expect(JSON.parse(localStorage.getItem('bmad-command-favorites:test-project')!)).toEqual(['/BMad:agents:pm']);
  });

  // TC3: removeFavorite removes from localStorage and updates state
  it('removes from localStorage and updates state when removeFavorite is called', () => {
    const { result } = renderHook(() => useFavoriteCommands('test-project'));

    act(() => {
      result.current.addFavorite('/BMad:agents:pm');
      result.current.addFavorite('/BMad:agents:dev');
    });

    act(() => {
      result.current.removeFavorite('/BMad:agents:pm');
    });

    expect(result.current.favoriteCommands).toEqual(['/BMad:agents:dev']);
    expect(JSON.parse(localStorage.getItem('bmad-command-favorites:test-project')!)).toEqual(['/BMad:agents:dev']);
  });

  // TC4: Maximum 20 favorites — rejects addition at limit
  it('rejects addition when 20 favorites already exist', () => {
    const { result } = renderHook(() => useFavoriteCommands('test-project'));

    // Add 20 favorites
    for (let i = 0; i < 20; i++) {
      act(() => {
        result.current.addFavorite(`/BMad:cmd:${i}`);
      });
    }

    expect(result.current.favoriteCommands).toHaveLength(20);

    // 21st should be rejected
    act(() => {
      result.current.addFavorite('/BMad:cmd:overflow');
    });

    expect(result.current.favoriteCommands).toHaveLength(20);
    expect(result.current.favoriteCommands).not.toContain('/BMad:cmd:overflow');
  });

  // TC5: Duplicate command addition is ignored (existing position maintained)
  it('ignores duplicate command addition', () => {
    const { result } = renderHook(() => useFavoriteCommands('test-project'));

    act(() => {
      result.current.addFavorite('/BMad:agents:pm');
      result.current.addFavorite('/BMad:agents:dev');
    });

    act(() => {
      result.current.addFavorite('/BMad:agents:pm');
    });

    expect(result.current.favoriteCommands).toEqual(['/BMad:agents:pm', '/BMad:agents:dev']);
  });

  // TC6: reorderFavorites changes order and syncs to localStorage
  it('reorders favorites and syncs to localStorage', () => {
    const { result } = renderHook(() => useFavoriteCommands('test-project'));

    act(() => {
      result.current.addFavorite('/BMad:agents:pm');
      result.current.addFavorite('/BMad:agents:dev');
      result.current.addFavorite('/BMad:agents:qa');
    });

    act(() => {
      result.current.reorderFavorites(['/BMad:agents:qa', '/BMad:agents:pm', '/BMad:agents:dev']);
    });

    expect(result.current.favoriteCommands).toEqual(['/BMad:agents:qa', '/BMad:agents:pm', '/BMad:agents:dev']);
    expect(JSON.parse(localStorage.getItem('bmad-command-favorites:test-project')!)).toEqual(['/BMad:agents:qa', '/BMad:agents:pm', '/BMad:agents:dev']);
  });

  // TC7: Project-specific favorites are isolated
  it('isolates favorites per project', () => {
    const { result: result1 } = renderHook(() => useFavoriteCommands('project-a'));
    const { result: result2 } = renderHook(() => useFavoriteCommands('project-b'));

    act(() => {
      result1.current.addFavorite('/BMad:agents:pm');
    });

    expect(result1.current.favoriteCommands).toEqual(['/BMad:agents:pm']);
    expect(result2.current.favoriteCommands).toEqual([]);
  });

  // TC8: undefined projectSlug — empty array, mutations are no-ops
  it('returns empty array and mutations are no-ops when projectSlug is undefined', () => {
    const { result } = renderHook(() => useFavoriteCommands(undefined));

    expect(result.current.favoriteCommands).toEqual([]);

    act(() => {
      result.current.addFavorite('/BMad:agents:pm');
    });
    expect(result.current.favoriteCommands).toEqual([]);

    act(() => {
      result.current.removeFavorite('/BMad:agents:pm');
    });
    expect(result.current.favoriteCommands).toEqual([]);

    act(() => {
      result.current.reorderFavorites(['/BMad:agents:pm']);
    });
    expect(result.current.favoriteCommands).toEqual([]);

    expect(localStorage.length).toBe(0);
  });

  // TC9: Invalid JSON in localStorage falls back to empty array
  it('returns empty array when localStorage contains invalid JSON', () => {
    localStorage.setItem('bmad-command-favorites:test-project', 'invalid-json{{{');

    const { result } = renderHook(() => useFavoriteCommands('test-project'));
    expect(result.current.favoriteCommands).toEqual([]);
  });

  // TC10: Reloads favorites when projectSlug changes
  it('reloads favorites when projectSlug changes', () => {
    localStorage.setItem('bmad-command-favorites:project-b', JSON.stringify(['/BMad:agents:qa']));

    const { result, rerender } = renderHook(
      ({ slug }) => useFavoriteCommands(slug),
      { initialProps: { slug: 'project-a' as string | undefined } }
    );

    expect(result.current.favoriteCommands).toEqual([]);

    rerender({ slug: 'project-b' });

    expect(result.current.favoriteCommands).toEqual(['/BMad:agents:qa']);
  });

  // TC11: isFavorite returns correct boolean
  it('isFavorite returns true for favorited commands and false otherwise', () => {
    const { result } = renderHook(() => useFavoriteCommands('test-project'));

    act(() => {
      result.current.addFavorite('/BMad:agents:pm');
    });

    expect(result.current.isFavorite('/BMad:agents:pm')).toBe(true);
    expect(result.current.isFavorite('/BMad:agents:dev')).toBe(false);
  });

  // TC12: reorderFavorites input validation edge cases
  describe('reorderFavorites input validation', () => {
    it('ignores new items not in existing favorites', () => {
      const { result } = renderHook(() => useFavoriteCommands('test-project'));

      act(() => {
        result.current.addFavorite('/BMad:agents:pm');
        result.current.addFavorite('/BMad:agents:dev');
      });

      act(() => {
        result.current.reorderFavorites(['/BMad:agents:dev', '/BMad:agents:pm', '/BMad:agents:new']);
      });

      expect(result.current.favoriteCommands).toEqual(['/BMad:agents:dev', '/BMad:agents:pm']);
    });

    it('retains missing items from existing favorites at the end', () => {
      const { result } = renderHook(() => useFavoriteCommands('test-project'));

      act(() => {
        result.current.addFavorite('/BMad:agents:pm');
        result.current.addFavorite('/BMad:agents:dev');
        result.current.addFavorite('/BMad:agents:qa');
      });

      // Only reorder pm and qa, missing dev
      act(() => {
        result.current.reorderFavorites(['/BMad:agents:qa', '/BMad:agents:pm']);
      });

      expect(result.current.favoriteCommands).toEqual(['/BMad:agents:qa', '/BMad:agents:pm', '/BMad:agents:dev']);
    });

    it('keeps existing list when empty array is passed', () => {
      const { result } = renderHook(() => useFavoriteCommands('test-project'));

      act(() => {
        result.current.addFavorite('/BMad:agents:pm');
        result.current.addFavorite('/BMad:agents:dev');
      });

      act(() => {
        result.current.reorderFavorites([]);
      });

      expect(result.current.favoriteCommands).toEqual(['/BMad:agents:pm', '/BMad:agents:dev']);
    });
  });
});
