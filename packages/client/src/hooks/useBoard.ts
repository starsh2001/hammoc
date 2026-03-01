/**
 * useBoard - Board data hook with auto-fetch and grouped items
 * [Source: Story 21.2 - Task 3]
 */

import { useEffect, useMemo, useCallback } from 'react';
import type { BoardItem, BoardItemStatus, CreateIssueRequest, UpdateIssueRequest } from '@bmad-studio/shared';
import { useBoardStore } from '../stores/boardStore';
import { BOARD_COLUMNS } from '../components/board/constants';

interface UseBoardReturn {
  items: BoardItem[];
  viewMode: 'kanban' | 'list';
  isLoading: boolean;
  error: string | null;
  itemsByStatus: Record<BoardItemStatus, BoardItem[]>;
  setViewMode: (mode: 'kanban' | 'list') => void;
  createIssue: (data: CreateIssueRequest) => Promise<void>;
  updateIssue: (issueId: string, data: UpdateIssueRequest) => Promise<void>;
  deleteIssue: (issueId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useBoard(projectSlug: string | undefined): UseBoardReturn {
  const items = useBoardStore((s) => s.items);
  const viewMode = useBoardStore((s) => s.viewMode);
  const isLoading = useBoardStore((s) => s.isLoading);
  const error = useBoardStore((s) => s.error);
  const fetchBoard = useBoardStore((s) => s.fetchBoard);
  const setViewMode = useBoardStore((s) => s.setViewMode);
  const storeCreateIssue = useBoardStore((s) => s.createIssue);
  const storeUpdateIssue = useBoardStore((s) => s.updateIssue);
  const storeDeleteIssue = useBoardStore((s) => s.deleteIssue);

  useEffect(() => {
    if (projectSlug) {
      fetchBoard(projectSlug);
    }
  }, [projectSlug, fetchBoard]);

  const itemsByStatus = useMemo(() => {
    const grouped = {} as Record<BoardItemStatus, BoardItem[]>;
    for (const status of BOARD_COLUMNS) {
      grouped[status] = [];
    }
    for (const item of items) {
      if (grouped[item.status]) {
        grouped[item.status].push(item);
      }
    }
    return grouped;
  }, [items]);

  const createIssue = useCallback(
    async (data: CreateIssueRequest) => {
      if (projectSlug) await storeCreateIssue(projectSlug, data);
    },
    [projectSlug, storeCreateIssue],
  );

  const updateIssue = useCallback(
    async (issueId: string, data: UpdateIssueRequest) => {
      if (projectSlug) await storeUpdateIssue(projectSlug, issueId, data);
    },
    [projectSlug, storeUpdateIssue],
  );

  const deleteIssue = useCallback(
    async (issueId: string) => {
      if (projectSlug) await storeDeleteIssue(projectSlug, issueId);
    },
    [projectSlug, storeDeleteIssue],
  );

  const refresh = useCallback(async () => {
    if (projectSlug) await fetchBoard(projectSlug);
  }, [projectSlug, fetchBoard]);

  return {
    items,
    viewMode,
    isLoading,
    error,
    itemsByStatus,
    setViewMode,
    createIssue,
    updateIssue,
    deleteIssue,
    refresh,
  };
}
