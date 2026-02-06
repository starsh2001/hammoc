/**
 * useSlashCommands Hook Tests
 * [Source: Story 5.1 - Task 2]
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSlashCommands } from '../useSlashCommands';
import type { SlashCommand } from '@bmad-studio/shared';

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
  beforeEach(() => {
    mockList.mockResolvedValue({ commands: mockCommands });
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
    const { result } = renderHook(() => useSlashCommands('test-slug'));

    expect(result.current.isLoading).toBe(true);
  });

  it('should fallback to empty array on API error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockList.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSlashCommands('test-slug'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.commands).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
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
