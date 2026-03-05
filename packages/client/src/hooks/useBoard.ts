/**
 * useBoard - Board data hook with auto-fetch and grouped items
 * [Source: Story 21.2 - Task 3]
 */

import { useEffect, useMemo, useCallback } from 'react';
import type { BoardItem, BoardConfig, CreateIssueRequest, UpdateIssueRequest } from '@bmad-studio/shared';
import { useBoardStore } from '../stores/boardStore';
import { projectsApi } from '../services/api/projects';

interface UseBoardReturn {
  items: BoardItem[];
  boardConfig: BoardConfig;
  viewMode: 'kanban' | 'list';
  visibleColumns: number;
  isLoading: boolean;
  error: string | null;
  itemsByColumn: Record<string, BoardItem[]>;
  setViewMode: (mode: 'kanban' | 'list') => void;
  setVisibleColumns: (count: number) => void;
  createIssue: (data: CreateIssueRequest) => Promise<BoardItem | undefined>;
  updateIssue: (issueId: string, data: UpdateIssueRequest) => Promise<void>;
  deleteIssue: (issueId: string) => Promise<void>;
  updateBoardConfig: (config: BoardConfig) => Promise<void>;
  resetBoardConfig: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useBoard(projectSlug: string | undefined): UseBoardReturn {
  const items = useBoardStore((s) => s.items);
  const boardConfig = useBoardStore((s) => s.boardConfig);
  const viewMode = useBoardStore((s) => s.viewMode);
  const visibleColumns = useBoardStore((s) => s.visibleColumns);
  const isLoading = useBoardStore((s) => s.isLoading);
  const error = useBoardStore((s) => s.error);
  const fetchBoard = useBoardStore((s) => s.fetchBoard);
  const setViewMode = useBoardStore((s) => s.setViewMode);
  const setVisibleColumns = useBoardStore((s) => s.setVisibleColumns);
  const setBoardConfig = useBoardStore((s) => s.setBoardConfig);
  const storeCreateIssue = useBoardStore((s) => s.createIssue);
  const storeUpdateIssue = useBoardStore((s) => s.updateIssue);
  const storeDeleteIssue = useBoardStore((s) => s.deleteIssue);

  useEffect(() => {
    if (projectSlug) {
      fetchBoard(projectSlug);
    }
  }, [projectSlug, fetchBoard]);

  const itemsByColumn = useMemo(() => {
    const grouped: Record<string, BoardItem[]> = {};
    for (const col of boardConfig.columns) {
      grouped[col.id] = [];
    }
    for (const item of items) {
      const columnId = boardConfig.statusToColumn[item.status] ?? boardConfig.columns[0]?.id;
      if (columnId && grouped[columnId]) {
        grouped[columnId].push(item);
      } else {
        // Fallback to first column
        const fallback = boardConfig.columns[0]?.id;
        if (fallback && grouped[fallback]) {
          grouped[fallback].push(item);
        }
      }
    }
    return grouped;
  }, [items, boardConfig]);

  const createIssue = useCallback(
    async (data: CreateIssueRequest) => {
      if (projectSlug) return storeCreateIssue(projectSlug, data);
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

  const updateBoardConfig = useCallback(
    async (config: BoardConfig) => {
      if (!projectSlug) return;
      await projectsApi.updateSettings(projectSlug, { boardConfig: config });
      setBoardConfig(config);
    },
    [projectSlug, setBoardConfig],
  );

  const resetBoardConfig = useCallback(async () => {
    if (!projectSlug) return;
    await projectsApi.updateSettings(projectSlug, { boardConfig: null });
    await fetchBoard(projectSlug);
  }, [projectSlug, fetchBoard]);

  const refresh = useCallback(async () => {
    if (projectSlug) await fetchBoard(projectSlug);
  }, [projectSlug, fetchBoard]);

  return {
    items,
    boardConfig,
    viewMode,
    visibleColumns,
    isLoading,
    error,
    itemsByColumn,
    setViewMode,
    setVisibleColumns,
    createIssue,
    updateIssue,
    deleteIssue,
    updateBoardConfig,
    resetBoardConfig,
    refresh,
  };
}
