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

    const { result } = renderHook(() => useSlashCommands('test-slug'));

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
});
