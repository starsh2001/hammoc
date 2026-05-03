/**
 * useSlashCommands Hook Tests
 * [Source: Story 5.1 - Task 2]
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSlashCommands } from '../useSlashCommands';
import type { SlashCommand, StarCommand } from '@hammoc/shared';

const mockList = vi.fn();

vi.mock('../../services/api/commands', () => ({
  commandsApi: {
    list: (...args: unknown[]) => mockList(...args),
  },
}));

const mockCommands: SlashCommand[] = [
  {
    command: '/BMad:agents:pm',
    name: 'PM',
    description: 'Product Manager',
    category: 'agent',
    icon: '\uD83D\uDCCB',
  },
  {
    command: '/BMad:tasks:create-doc',
    name: 'create-doc',
    description: 'create-doc task',
    category: 'task',
  },
];

describe('useSlashCommands', () => {
  const mockStarCommands: Record<string, StarCommand[]> = {
    pm: [{ agentId: 'pm', command: 'help', description: 'Show help' }],
    sm: [{ agentId: 'sm', command: 'draft', description: 'Draft story' }],
  };

  beforeEach(() => {
    mockList.mockResolvedValue({ commands: mockCommands, starCommands: mockStarCommands });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch commands when projectSlug is provided', async () => {
    const { result } = renderHook(() => useSlashCommands('test-slug'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockList).toHaveBeenCalledWith('test-slug');
    expect(result.current.commands).toEqual(mockCommands);
  });

  it('should return empty array when projectSlug is undefined', () => {
    const { result } = renderHook(() => useSlashCommands(undefined));

    expect(result.current.commands).toEqual([]);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('should show loading state during fetch', () => {
    // Use unique slug to avoid module-level cache
    const { result } = renderHook(() => useSlashCommands('test-slug-loading'));

    expect(result.current.isLoading).toBe(true);
  });

  it('should fallback to empty array on API error', async () => {
    mockList.mockRejectedValue(new Error('Network error'));

    // Use unique slug to avoid module-level cache
    const { result } = renderHook(() => useSlashCommands('test-slug-error'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.commands).toEqual([]);
    // Error is logged via debugLogger.error, not console.error
  });

  // TC12: starCommands is returned
  it('should return starCommands from API response', async () => {
    const { result } = renderHook(() => useSlashCommands('test-slug'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.starCommands).toEqual(mockStarCommands);
  });

  // TC13: API error returns empty starCommands
  it('should return empty starCommands on API error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockList.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSlashCommands('test-slug-star-error'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.starCommands).toEqual({});
    consoleSpy.mockRestore();
  });

  // TC14: no projectSlug returns empty starCommands
  it('should return empty starCommands when projectSlug is undefined', () => {
    const { result } = renderHook(() => useSlashCommands(undefined));

    expect(result.current.starCommands).toEqual({});
  });

  it('should refetch when projectSlug changes', async () => {
    const { result, rerender } = renderHook(
      ({ slug }: { slug?: string }) => useSlashCommands(slug),
      { initialProps: { slug: 'slug-1' } }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockList).toHaveBeenCalledWith('slug-1');

    rerender({ slug: 'slug-2' });

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith('slug-2');
    });
  });

  // Story 28.5: cache invalidation infrastructure
  describe('cache invalidation (Story 28.5)', () => {
    it('invalidateSlashCommandsCache(slug) clears the slug entry so a new mount re-fetches', async () => {
      const { invalidateSlashCommandsCache } = await import('../useSlashCommands');
      const { unmount } = renderHook(() => useSlashCommands('slug-invalidate-1'));
      await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
      unmount();
      invalidateSlashCommandsCache('slug-invalidate-1');
      // Second mount with the same slug should hit the cache MISS path.
      renderHook(() => useSlashCommands('slug-invalidate-1'));
      await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    });

    it('hammoc:slashCommandsChanged event with matching slug forces a re-fetch', async () => {
      const { SLASH_COMMANDS_CHANGED_EVENT } = await import('../useSlashCommands');
      const { result } = renderHook(() => useSlashCommands('slug-event-match'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const before = mockList.mock.calls.length;
      window.dispatchEvent(
        new CustomEvent(SLASH_COMMANDS_CHANGED_EVENT, {
          detail: { projectSlug: 'slug-event-match' },
        }),
      );
      await waitFor(() => expect(mockList.mock.calls.length).toBeGreaterThan(before));
    });

    it('hammoc:slashCommandsChanged event for a different slug is ignored', async () => {
      const { SLASH_COMMANDS_CHANGED_EVENT } = await import('../useSlashCommands');
      const { result } = renderHook(() => useSlashCommands('slug-event-iso'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const before = mockList.mock.calls.length;
      window.dispatchEvent(
        new CustomEvent(SLASH_COMMANDS_CHANGED_EVENT, {
          detail: { projectSlug: 'completely-different-slug' },
        }),
      );
      // Wait briefly — there should still only be the original load call.
      await new Promise((r) => setTimeout(r, 30));
      expect(mockList.mock.calls.length).toBe(before);
    });
  });
});
