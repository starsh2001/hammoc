/**
 * useBoard Hook Tests
 * [Source: Story 21.2 - Task 12]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBoard } from '../useBoard';
import { useBoardStore } from '../../stores/boardStore';
import { DEFAULT_BOARD_CONFIG } from '@hammoc/shared';

vi.mock('../../services/api/board', () => ({
  boardApi: {
    getBoard: vi.fn(),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    deleteIssue: vi.fn(),
  },
}));

vi.mock('../../services/api/projects', () => ({
  projectsApi: {
    updateSettings: vi.fn().mockResolvedValue({}),
  },
}));

import { boardApi } from '../../services/api/board';

const mockItems = [
  { id: 'issue-1', type: 'issue' as const, title: 'Bug', status: 'Open' as const },
  { id: 'story-1', type: 'story' as const, title: 'Feature', status: 'InProgress' as const },
  { id: 'epic-1', type: 'epic' as const, title: 'Epic', status: 'Open' as const },
  { id: 'story-2', type: 'story' as const, title: 'Story 2', status: 'Done' as const },
  { id: 'story-3', type: 'story' as const, title: 'Blocked Story', status: 'Blocked' as const },
];

describe('useBoard', () => {
  beforeEach(() => {
    useBoardStore.setState({
      items: [],
      boardConfig: DEFAULT_BOARD_CONFIG,
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
    vi.mocked(boardApi.getBoard).mockResolvedValue({ items: mockItems, config: DEFAULT_BOARD_CONFIG });

    renderHook(() => useBoard('test-project'));

    await waitFor(() => {
      expect(boardApi.getBoard).toHaveBeenCalledWith('test-project');
    });
  });

  it('should not call fetchBoard when projectSlug is undefined', () => {
    renderHook(() => useBoard(undefined));

    expect(boardApi.getBoard).not.toHaveBeenCalled();
  });

  it('should group items by column in itemsByColumn', async () => {
    vi.mocked(boardApi.getBoard).mockResolvedValue({ items: mockItems, config: DEFAULT_BOARD_CONFIG });

    const { result } = renderHook(() => useBoard('test-project'));

    await waitFor(() => {
      expect(result.current.items).toHaveLength(5);
    });

    expect(result.current.itemsByColumn.Open).toHaveLength(2);       // Open issue + Open epic
    expect(result.current.itemsByColumn.ToDo).toHaveLength(1);       // Blocked story
    expect(result.current.itemsByColumn.Doing).toHaveLength(1);      // InProgress story
    expect(result.current.itemsByColumn.Review).toHaveLength(0);
    expect(result.current.itemsByColumn.Close).toHaveLength(1);      // Done story
  });

  it('should expose viewMode from store', () => {
    const { result } = renderHook(() => useBoard(undefined));
    expect(result.current.viewMode).toBe('kanban');
  });
});
