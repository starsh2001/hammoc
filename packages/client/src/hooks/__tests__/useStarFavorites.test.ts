/**
 * useStarFavorites Tests
 * [Source: Story 9.10 - Task 2]
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStarFavorites } from '../useStarFavorites';

const PROJECT_SLUG = 'test-project';
const AGENT_ID = 'sm';
const STORAGE_KEY = `bmad-star-favorites:${PROJECT_SLUG}:${AGENT_ID}`;

describe('useStarFavorites', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // TC1: Initial state returns empty array
  it('returns empty array on initial state', () => {
    const { result } = renderHook(() => useStarFavorites(PROJECT_SLUG, AGENT_ID));
    expect(result.current.starFavorites).toEqual([]);
  });

  // TC2: addStarFavorite saves to localStorage and updates state
  it('saves to localStorage and updates state when addStarFavorite is called', () => {
    const { result } = renderHook(() => useStarFavorites(PROJECT_SLUG, AGENT_ID));

    act(() => {
      result.current.addStarFavorite('help');
    });

    expect(result.current.starFavorites).toEqual(['help']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['help']);
  });

  // TC3: removeStarFavorite removes from localStorage and updates state
  it('removes from localStorage and updates state when removeStarFavorite is called', () => {
    const { result } = renderHook(() => useStarFavorites(PROJECT_SLUG, AGENT_ID));

    act(() => {
      result.current.addStarFavorite('help');
      result.current.addStarFavorite('draft');
    });

    act(() => {
      result.current.removeStarFavorite('help');
    });

    expect(result.current.starFavorites).toEqual(['draft']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['draft']);
  });

  // TC4: Maximum 10 star favorites — rejects addition at limit
  it('rejects addition when 10 star favorites already exist', () => {
    const { result } = renderHook(() => useStarFavorites(PROJECT_SLUG, AGENT_ID));

    // Add 10 favorites
    for (let i = 0; i < 10; i++) {
      act(() => {
        result.current.addStarFavorite(`cmd-${i}`);
      });
    }

    expect(result.current.starFavorites).toHaveLength(10);

    // 11th should be rejected
    act(() => {
      result.current.addStarFavorite('cmd-overflow');
    });

    expect(result.current.starFavorites).toHaveLength(10);
    expect(result.current.starFavorites).not.toContain('cmd-overflow');
  });

  // TC5: Duplicate command addition is ignored (existing position maintained)
  it('ignores duplicate command addition', () => {
    const { result } = renderHook(() => useStarFavorites(PROJECT_SLUG, AGENT_ID));

    act(() => {
      result.current.addStarFavorite('help');
      result.current.addStarFavorite('draft');
    });

    act(() => {
      result.current.addStarFavorite('help');
    });

    expect(result.current.starFavorites).toEqual(['help', 'draft']);
  });

  // TC6: reorderStarFavorites changes order and syncs to localStorage
  it('reorders star favorites and syncs to localStorage', () => {
    const { result } = renderHook(() => useStarFavorites(PROJECT_SLUG, AGENT_ID));

    act(() => {
      result.current.addStarFavorite('help');
      result.current.addStarFavorite('draft');
      result.current.addStarFavorite('exit');
    });

    act(() => {
      result.current.reorderStarFavorites(['exit', 'help', 'draft']);
    });

    expect(result.current.starFavorites).toEqual(['exit', 'help', 'draft']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['exit', 'help', 'draft']);
  });

  // TC7: Project+Agent-specific favorites are isolated
  it('isolates favorites per projectSlug and agentId combination', () => {
    const { result: result1 } = renderHook(() => useStarFavorites(PROJECT_SLUG, 'sm'));
    const { result: result2 } = renderHook(() => useStarFavorites(PROJECT_SLUG, 'dev'));

    act(() => {
      result1.current.addStarFavorite('help');
    });

    expect(result1.current.starFavorites).toEqual(['help']);
    expect(result2.current.starFavorites).toEqual([]);

    // Also verify different projects are isolated
    const { result: result3 } = renderHook(() => useStarFavorites('other-project', 'sm'));
    expect(result3.current.starFavorites).toEqual([]);
  });

  // TC8: agentId null — empty array, all mutations are no-ops
  it('returns empty array and mutations are no-ops when agentId is null', () => {
    const { result } = renderHook(() => useStarFavorites(PROJECT_SLUG, null));

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

    expect(localStorage.length).toBe(0);
  });

  // TC9: projectSlug undefined — empty array, all mutations are no-ops
  it('returns empty array and mutations are no-ops when projectSlug is undefined', () => {
    const { result } = renderHook(() => useStarFavorites(undefined, AGENT_ID));

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

    expect(localStorage.length).toBe(0);
  });

  // TC10: Invalid JSON in localStorage falls back to empty array
  it('returns empty array when localStorage contains invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-json{{{');

    const { result } = renderHook(() => useStarFavorites(PROJECT_SLUG, AGENT_ID));
    expect(result.current.starFavorites).toEqual([]);
  });

  // TC11: Reloads favorites when projectSlug changes
  it('reloads favorites when projectSlug changes', () => {
    localStorage.setItem(
      'bmad-star-favorites:project-b:sm',
      JSON.stringify(['draft'])
    );

    const { result, rerender } = renderHook(
      ({ slug, agent }) => useStarFavorites(slug, agent),
      { initialProps: { slug: 'project-a' as string | undefined, agent: 'sm' as string | null | undefined } }
    );

    expect(result.current.starFavorites).toEqual([]);

    rerender({ slug: 'project-b', agent: 'sm' });

    expect(result.current.starFavorites).toEqual(['draft']);
  });

  // TC12: Reloads favorites when agentId changes
  it('reloads favorites when agentId changes', () => {
    localStorage.setItem(
      `bmad-star-favorites:${PROJECT_SLUG}:dev`,
      JSON.stringify(['exit', 'explain'])
    );

    const { result, rerender } = renderHook(
      ({ slug, agent }) => useStarFavorites(slug, agent),
      { initialProps: { slug: PROJECT_SLUG as string | undefined, agent: 'sm' as string | null | undefined } }
    );

    expect(result.current.starFavorites).toEqual([]);

    rerender({ slug: PROJECT_SLUG, agent: 'dev' });

    expect(result.current.starFavorites).toEqual(['exit', 'explain']);
  });

  // TC13: isStarFavorite returns correct boolean
  it('isStarFavorite returns true for favorited commands and false otherwise', () => {
    const { result } = renderHook(() => useStarFavorites(PROJECT_SLUG, AGENT_ID));

    act(() => {
      result.current.addStarFavorite('help');
    });

    expect(result.current.isStarFavorite('help')).toBe(true);
    expect(result.current.isStarFavorite('draft')).toBe(false);
  });

  // TC14: reorderStarFavorites input validation — ignores non-existing items, preserves missing
  describe('reorderStarFavorites input validation', () => {
    it('ignores new items not in existing star favorites', () => {
      const { result } = renderHook(() => useStarFavorites(PROJECT_SLUG, AGENT_ID));

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
      const { result } = renderHook(() => useStarFavorites(PROJECT_SLUG, AGENT_ID));

      act(() => {
        result.current.addStarFavorite('help');
        result.current.addStarFavorite('draft');
        result.current.addStarFavorite('exit');
      });

      // Only reorder help and exit, missing draft
      act(() => {
        result.current.reorderStarFavorites(['exit', 'help']);
      });

      expect(result.current.starFavorites).toEqual(['exit', 'help', 'draft']);
    });
  });

  // TC15: reorderStarFavorites empty array — keeps existing list
  it('keeps existing list when empty array is passed to reorderStarFavorites', () => {
    const { result } = renderHook(() => useStarFavorites(PROJECT_SLUG, AGENT_ID));

    act(() => {
      result.current.addStarFavorite('help');
      result.current.addStarFavorite('draft');
    });

    act(() => {
      result.current.reorderStarFavorites([]);
    });

    expect(result.current.starFavorites).toEqual(['help', 'draft']);
  });

  // TC16: localStorage quota exceeded — in-memory state is still updated (save only fails)
  it('updates in-memory state even when localStorage quota is exceeded', () => {
    const { result } = renderHook(() => useStarFavorites(PROJECT_SLUG, AGENT_ID));

    // Mock localStorage.setItem to throw QuotaExceededError
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    act(() => {
      result.current.addStarFavorite('help');
    });

    // In-memory state should be updated
    expect(result.current.starFavorites).toEqual(['help']);
    // localStorage.setItem was called but threw
    expect(setItemSpy).toHaveBeenCalled();

    setItemSpy.mockRestore();
  });
});
