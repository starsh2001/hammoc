/**
 * useFavoriteCommands Tests
 * [Source: Story 9.4 - Task 3, BS-1 - Task 7]
 * Updated: Now returns CommandFavoriteEntry[] with scope
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFavoriteCommands } from '../useFavoriteCommands';
import { usePreferencesStore } from '../../stores/preferencesStore';

describe('useFavoriteCommands', () => {
  beforeEach(() => {
    localStorage.clear();
    usePreferencesStore.setState({ preferences: {}, loaded: true });
  });

  // TC1: Initial state returns empty array
  it('returns empty array on initial state', () => {
    const { result } = renderHook(() => useFavoriteCommands());
    expect(result.current.favoriteCommands).toEqual([]);
  });

  // TC2: addFavorite updates state and store
  it('updates state when addFavorite is called', () => {
    const { result } = renderHook(() => useFavoriteCommands());

    act(() => {
      result.current.addFavorite('/BMad:agents:pm');
    });

    expect(result.current.favoriteCommands).toEqual([
      { command: '/BMad:agents:pm', scope: 'project' },
    ]);
  });

  // TC3: removeFavorite removes from store and updates state
  it('removes from store and updates state when removeFavorite is called', () => {
    const { result } = renderHook(() => useFavoriteCommands());

    act(() => {
      result.current.addFavorite('/BMad:agents:pm');
      result.current.addFavorite('/BMad:agents:dev');
    });

    act(() => {
      result.current.removeFavorite({ command: '/BMad:agents:pm', scope: 'project' });
    });

    expect(result.current.favoriteCommands).toEqual([
      { command: '/BMad:agents:dev', scope: 'project' },
    ]);
  });

  // TC4: Maximum 20 favorites — rejects addition at limit
  it('rejects addition when 20 favorites already exist', () => {
    const { result } = renderHook(() => useFavoriteCommands());

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
    expect(result.current.favoriteCommands.some((e) => e.command === '/BMad:cmd:overflow')).toBe(false);
  });

  // TC5: Duplicate command addition is ignored
  it('ignores duplicate command addition', () => {
    const { result } = renderHook(() => useFavoriteCommands());

    act(() => {
      result.current.addFavorite('/BMad:agents:pm');
      result.current.addFavorite('/BMad:agents:dev');
    });

    act(() => {
      result.current.addFavorite('/BMad:agents:pm');
    });

    expect(result.current.favoriteCommands).toEqual([
      { command: '/BMad:agents:pm', scope: 'project' },
      { command: '/BMad:agents:dev', scope: 'project' },
    ]);
  });

  // TC6: reorderFavorites changes order
  it('reorders favorites', () => {
    const { result } = renderHook(() => useFavoriteCommands());

    act(() => {
      result.current.addFavorite('/BMad:agents:pm');
      result.current.addFavorite('/BMad:agents:dev');
      result.current.addFavorite('/BMad:agents:qa');
    });

    act(() => {
      result.current.reorderFavorites([
        { command: '/BMad:agents:qa', scope: 'project' },
        { command: '/BMad:agents:pm', scope: 'project' },
        { command: '/BMad:agents:dev', scope: 'project' },
      ]);
    });

    expect(result.current.favoriteCommands).toEqual([
      { command: '/BMad:agents:qa', scope: 'project' },
      { command: '/BMad:agents:pm', scope: 'project' },
      { command: '/BMad:agents:dev', scope: 'project' },
    ]);
  });

  // TC7: Favorites are global (no per-project isolation)
  it('shares favorites globally across all hook instances', () => {
    const { result: result1 } = renderHook(() => useFavoriteCommands());
    const { result: result2 } = renderHook(() => useFavoriteCommands());

    act(() => {
      result1.current.addFavorite('/BMad:agents:pm');
    });

    expect(result1.current.favoriteCommands).toEqual([
      { command: '/BMad:agents:pm', scope: 'project' },
    ]);
    expect(result2.current.favoriteCommands).toEqual([
      { command: '/BMad:agents:pm', scope: 'project' },
    ]);
  });

  // TC8: isFavorite returns correct boolean
  it('isFavorite returns true for favorited commands and false otherwise', () => {
    const { result } = renderHook(() => useFavoriteCommands());

    act(() => {
      result.current.addFavorite('/BMad:agents:pm');
    });

    expect(result.current.isFavorite('/BMad:agents:pm')).toBe(true);
    expect(result.current.isFavorite('/BMad:agents:dev')).toBe(false);
  });

  // TC9: reorderFavorites input validation edge cases
  describe('reorderFavorites input validation', () => {
    it('keeps existing list when empty array is passed', () => {
      const { result } = renderHook(() => useFavoriteCommands());

      act(() => {
        result.current.addFavorite('/BMad:agents:pm');
        result.current.addFavorite('/BMad:agents:dev');
      });

      act(() => {
        result.current.reorderFavorites([]);
      });

      // Empty array is a no-op
      expect(result.current.favoriteCommands).toEqual([
        { command: '/BMad:agents:pm', scope: 'project' },
        { command: '/BMad:agents:dev', scope: 'project' },
      ]);
    });
  });

  // TC10: addFavorite with global scope
  it('adds favorite with global scope', () => {
    const { result } = renderHook(() => useFavoriteCommands());

    act(() => {
      result.current.addFavorite('/my-global-skill', 'global');
    });

    expect(result.current.favoriteCommands).toEqual([
      { command: '/my-global-skill', scope: 'global' },
    ]);
  });

  // TC11: Backward compatibility — plain string entries are normalized
  it('normalizes plain string entries from server data', () => {
    // Simulate server returning old string[] format
    usePreferencesStore.setState({
      preferences: { commandFavorites: ['/BMad:agents:pm', '/BMad:agents:dev'] },
      loaded: true,
    });

    const { result } = renderHook(() => useFavoriteCommands());

    expect(result.current.favoriteCommands).toEqual([
      { command: '/BMad:agents:pm', scope: 'project' },
      { command: '/BMad:agents:dev', scope: 'project' },
    ]);
  });
});
