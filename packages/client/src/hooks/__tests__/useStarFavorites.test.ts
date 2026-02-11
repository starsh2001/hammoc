/**
 * useStarFavorites Tests
 * [Source: Story 9.10 - Task 2]
 * Updated: Now backed by preferencesStore (global, keyed by agentId only)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStarFavorites } from '../useStarFavorites';
import { usePreferencesStore } from '../../stores/preferencesStore';

const AGENT_ID = 'sm';

describe('useStarFavorites', () => {
  beforeEach(() => {
    localStorage.clear();
    usePreferencesStore.setState({ preferences: {}, loaded: true });
  });

  // TC1: Initial state returns empty array
  it('returns empty array on initial state', () => {
    const { result } = renderHook(() => useStarFavorites(AGENT_ID));
    expect(result.current.starFavorites).toEqual([]);
  });

  // TC2: addStarFavorite updates store and state
  it('updates store and state when addStarFavorite is called', () => {
    const { result } = renderHook(() => useStarFavorites(AGENT_ID));

    act(() => {
      result.current.addStarFavorite('help');
    });

    expect(result.current.starFavorites).toEqual(['help']);
    expect(usePreferencesStore.getState().preferences.starFavorites?.[AGENT_ID]).toEqual(['help']);
  });

  // TC3: removeStarFavorite removes from store and updates state
  it('removes from store and updates state when removeStarFavorite is called', () => {
    const { result } = renderHook(() => useStarFavorites(AGENT_ID));

    act(() => {
      result.current.addStarFavorite('help');
      result.current.addStarFavorite('draft');
    });

    act(() => {
      result.current.removeStarFavorite('help');
    });

    expect(result.current.starFavorites).toEqual(['draft']);
  });

  // TC4: Maximum 10 star favorites — rejects addition at limit
  it('rejects addition when 10 star favorites already exist', () => {
    const { result } = renderHook(() => useStarFavorites(AGENT_ID));

    for (let i = 0; i < 10; i++) {
      act(() => {
        result.current.addStarFavorite(`cmd-${i}`);
      });
    }

    expect(result.current.starFavorites).toHaveLength(10);

    act(() => {
      result.current.addStarFavorite('cmd-overflow');
    });

    expect(result.current.starFavorites).toHaveLength(10);
    expect(result.current.starFavorites).not.toContain('cmd-overflow');
  });

  // TC5: Duplicate command addition is ignored
  it('ignores duplicate command addition', () => {
    const { result } = renderHook(() => useStarFavorites(AGENT_ID));

    act(() => {
      result.current.addStarFavorite('help');
      result.current.addStarFavorite('draft');
    });

    act(() => {
      result.current.addStarFavorite('help');
    });

    expect(result.current.starFavorites).toEqual(['help', 'draft']);
  });

  // TC6: reorderStarFavorites changes order
  it('reorders star favorites', () => {
    const { result } = renderHook(() => useStarFavorites(AGENT_ID));

    act(() => {
      result.current.addStarFavorite('help');
      result.current.addStarFavorite('draft');
      result.current.addStarFavorite('exit');
    });

    act(() => {
      result.current.reorderStarFavorites(['exit', 'help', 'draft']);
    });

    expect(result.current.starFavorites).toEqual(['exit', 'help', 'draft']);
  });

  // TC7: Agent-specific favorites are isolated
  it('isolates favorites per agentId', () => {
    const { result: result1 } = renderHook(() => useStarFavorites('sm'));
    const { result: result2 } = renderHook(() => useStarFavorites('dev'));

    act(() => {
      result1.current.addStarFavorite('help');
    });

    expect(result1.current.starFavorites).toEqual(['help']);
    expect(result2.current.starFavorites).toEqual([]);
  });

  // TC8: agentId null — empty array, all mutations are no-ops
  it('returns empty array and mutations are no-ops when agentId is null', () => {
    const { result } = renderHook(() => useStarFavorites(null));

    expect(result.current.starFavorites).toEqual([]);

    act(() => {
      result.current.addStarFavorite('help');
    });
    expect(result.current.starFavorites).toEqual([]);

    act(() => {
      result.current.removeStarFavorite('help');
    });
    expect(result.current.starFavorites).toEqual([]);

    act(() => {
      result.current.reorderStarFavorites(['help']);
    });
    expect(result.current.starFavorites).toEqual([]);
  });

  // TC9: Reloads favorites when agentId changes
  it('reloads favorites when agentId changes', () => {
    // Pre-populate store with dev agent favorites
    usePreferencesStore.setState({
      preferences: { starFavorites: { dev: ['exit', 'explain'] } },
      loaded: true,
    });

    const { result, rerender } = renderHook(
      ({ agent }) => useStarFavorites(agent),
      { initialProps: { agent: 'sm' as string | null | undefined } }
    );

    expect(result.current.starFavorites).toEqual([]);

    rerender({ agent: 'dev' });

    expect(result.current.starFavorites).toEqual(['exit', 'explain']);
  });

  // TC10: isStarFavorite returns correct boolean
  it('isStarFavorite returns true for favorited commands and false otherwise', () => {
    const { result } = renderHook(() => useStarFavorites(AGENT_ID));

    act(() => {
      result.current.addStarFavorite('help');
    });

    expect(result.current.isStarFavorite('help')).toBe(true);
    expect(result.current.isStarFavorite('draft')).toBe(false);
  });

  // TC11: reorderStarFavorites input validation
  describe('reorderStarFavorites input validation', () => {
    it('ignores new items not in existing star favorites', () => {
      const { result } = renderHook(() => useStarFavorites(AGENT_ID));

      act(() => {
        result.current.addStarFavorite('help');
        result.current.addStarFavorite('draft');
      });

      act(() => {
        result.current.reorderStarFavorites(['draft', 'help', 'nonexistent']);
      });

      expect(result.current.starFavorites).toEqual(['draft', 'help']);
    });

    it('retains missing items from existing star favorites at the end', () => {
      const { result } = renderHook(() => useStarFavorites(AGENT_ID));

      act(() => {
        result.current.addStarFavorite('help');
        result.current.addStarFavorite('draft');
        result.current.addStarFavorite('exit');
      });

      act(() => {
        result.current.reorderStarFavorites(['exit', 'help']);
      });

      expect(result.current.starFavorites).toEqual(['exit', 'help', 'draft']);
    });
  });

  // TC12: reorderStarFavorites empty array — keeps existing list
  it('keeps existing list when empty array is passed to reorderStarFavorites', () => {
    const { result } = renderHook(() => useStarFavorites(AGENT_ID));

    act(() => {
      result.current.addStarFavorite('help');
      result.current.addStarFavorite('draft');
    });

    act(() => {
      result.current.reorderStarFavorites([]);
    });

    expect(result.current.starFavorites).toEqual(['help', 'draft']);
  });
});
