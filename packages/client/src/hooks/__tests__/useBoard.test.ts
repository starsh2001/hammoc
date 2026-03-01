/**
 * useBoard Hook Tests
 * [Source: Story 21.2 - Task 12]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBoard } from '../useBoard';
import { useBoardStore } from '../../stores/boardStore';

vi.mock('../../services/api/board', () => ({
  boardApi: {
    getBoard: vi.fn(),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    deleteIssue: vi.fn(),
  },
}));

import { boardApi } from '../../services/api/board';

const mockItems = [
  { id: 'issue-1', type: 'issue' as const, title: 'Bug', status: 'Open' as const },
  { id: 'story-1', type: 'story' as const, title: 'Feature', status: 'InProgress' as const },
  { id: 'epic-1', type: 'epic' as const, title: 'Epic', status: 'Open' as const },
  { id: 'story-2', type: 'story' as const, title: 'Story 2', status: 'Done' as const },
];

describe('useBoard', () => {
  beforeEach(() => {
    useBoardStore.setState({
      items: [],
      isLoading: false,
      error: null,
      viewMode: 'kanban',
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call fetchBoard on mount when projectSlug is provided', async () => {
    vi.mocked(boardApi.getBoard).mockResolvedValue({ items: mockItems });

    renderHook(() => useBoard('test-project'));

    await waitFor(() => {
      expect(boardApi.getBoard).toHaveBeenCalledWith('test-project');
    });
  });

  it('should not call fetchBoard when projectSlug is undefined', () => {
    renderHook(() => useBoard(undefined));

    expect(boardApi.getBoard).not.toHaveBeenCalled();
  });

  it('should group items by status in itemsByStatus', async () => {
    vi.mocked(boardApi.getBoard).mockResolvedValue({ items: mockItems });

    const { result } = renderHook(() => useBoard('test-project'));

    await waitFor(() => {
      expect(result.current.items).toHaveLength(4);
    });

    expect(result.current.itemsByStatus.Open).toHaveLength(2);
    expect(result.current.itemsByStatus.InProgress).toHaveLength(1);
    expect(result.current.itemsByStatus.Done).toHaveLength(1);
    expect(result.current.itemsByStatus.Draft).toHaveLength(0);
    expect(result.current.itemsByStatus.Approved).toHaveLength(0);
    expect(result.current.itemsByStatus.Review).toHaveLength(0);
    expect(result.current.itemsByStatus.Closed).toHaveLength(0);
  });

  it('should expose viewMode from store', () => {
    const { result } = renderHook(() => useBoard(undefined));
    expect(result.current.viewMode).toBe('kanban');
  });
});
