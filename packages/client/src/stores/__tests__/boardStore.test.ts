/**
 * boardStore Tests
 * [Source: Story 21.2 - Task 12]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBoardStore } from '../boardStore';

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
  { id: 'issue-1', type: 'issue' as const, title: 'Bug fix', status: 'Open' as const },
  { id: 'story-1', type: 'story' as const, title: 'Feature A', status: 'InProgress' as const },
  { id: 'epic-1', type: 'epic' as const, title: 'Epic 1', status: 'Open' as const },
];

describe('boardStore', () => {
  beforeEach(() => {
    useBoardStore.setState({
      items: [],
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('fetchBoard', () => {
    it('should fetch board items successfully', async () => {
      vi.mocked(boardApi.getBoard).mockResolvedValue({ items: mockItems });

      await useBoardStore.getState().fetchBoard('test-project');

      expect(boardApi.getBoard).toHaveBeenCalledWith('test-project');
      expect(useBoardStore.getState().items).toEqual(mockItems);
      expect(useBoardStore.getState().isLoading).toBe(false);
    });

    it('should set loading state during fetch', async () => {
      vi.mocked(boardApi.getBoard).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ items: [] }), 100)),
      );

      const fetchPromise = useBoardStore.getState().fetchBoard('test-project');
      expect(useBoardStore.getState().isLoading).toBe(true);

      vi.advanceTimersByTime(100);
      await fetchPromise;

      expect(useBoardStore.getState().isLoading).toBe(false);
    });

    it('should set error on fetch failure', async () => {
      vi.mocked(boardApi.getBoard).mockRejectedValue(new Error('Network error'));

      await useBoardStore.getState().fetchBoard('test-project');

      expect(useBoardStore.getState().error).toBeTruthy();
      expect(useBoardStore.getState().isLoading).toBe(false);
    });

    it('should auto-clear error after 5 seconds', async () => {
      vi.mocked(boardApi.getBoard).mockRejectedValue(new Error('Network error'));

      await useBoardStore.getState().fetchBoard('test-project');
      expect(useBoardStore.getState().error).toBeTruthy();

      vi.advanceTimersByTime(5000);
      expect(useBoardStore.getState().error).toBeNull();
    });
  });

  describe('createIssue', () => {
    it('should create issue and refresh board', async () => {
      vi.mocked(boardApi.createIssue).mockResolvedValue(mockItems[0]);
      vi.mocked(boardApi.getBoard).mockResolvedValue({ items: mockItems });

      await useBoardStore.getState().createIssue('test-project', { title: 'New issue' });

      expect(boardApi.createIssue).toHaveBeenCalledWith('test-project', { title: 'New issue' });
      expect(boardApi.getBoard).toHaveBeenCalledWith('test-project');
      expect(useBoardStore.getState().items).toEqual(mockItems);
    });
  });

  describe('setViewMode', () => {
    it('should update view mode', () => {
      useBoardStore.getState().setViewMode('list');
      expect(useBoardStore.getState().viewMode).toBe('list');

      useBoardStore.getState().setViewMode('kanban');
      expect(useBoardStore.getState().viewMode).toBe('kanban');
    });

    it('should persist view mode to localStorage', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

      useBoardStore.getState().setViewMode('list');

      expect(setItemSpy).toHaveBeenCalledWith('bmad-board-viewMode', 'list');
      setItemSpy.mockRestore();
    });
  });

  describe('getItemsByStatus', () => {
    it('should filter items by status', () => {
      useBoardStore.setState({ items: mockItems });

      const openItems = useBoardStore.getState().getItemsByStatus('Open');
      expect(openItems).toHaveLength(2);
      expect(openItems.every((item) => item.status === 'Open')).toBe(true);
    });

    it('should return empty array for status with no items', () => {
      useBoardStore.setState({ items: mockItems });

      const doneItems = useBoardStore.getState().getItemsByStatus('Done');
      expect(doneItems).toHaveLength(0);
    });
  });

  describe('deleteIssue', () => {
    it('should delete issue and refresh board', async () => {
      vi.mocked(boardApi.deleteIssue).mockResolvedValue({ message: 'Issue deleted' });
      vi.mocked(boardApi.getBoard).mockResolvedValue({ items: [] });

      await useBoardStore.getState().deleteIssue('test-project', 'issue-1');

      expect(boardApi.deleteIssue).toHaveBeenCalledWith('test-project', 'issue-1');
      expect(boardApi.getBoard).toHaveBeenCalledWith('test-project');
    });
  });

  describe('updateIssue', () => {
    it('should update issue and refresh board', async () => {
      vi.mocked(boardApi.updateIssue).mockResolvedValue(mockItems[0]);
      vi.mocked(boardApi.getBoard).mockResolvedValue({ items: mockItems });

      await useBoardStore.getState().updateIssue('test-project', 'issue-1', { title: 'Updated' });

      expect(boardApi.updateIssue).toHaveBeenCalledWith('test-project', 'issue-1', { title: 'Updated' });
      expect(boardApi.getBoard).toHaveBeenCalledWith('test-project');
    });
  });
});
