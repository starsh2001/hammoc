/**
 * Board Store - Zustand store for Project Board state
 * [Source: Story 21.2 - Task 2]
 */

import { create } from 'zustand';
import type {
  BoardItem,
  BoardItemStatus,
  BoardConfig,
  CreateIssueRequest,
  UpdateIssueRequest,
} from '@bmad-studio/shared';
import { DEFAULT_BOARD_CONFIG } from '@bmad-studio/shared';
import { boardApi } from '../services/api/board';
import { ApiError } from '../services/api/client';
import i18n from '../i18n';

interface BoardStore {
  // State
  items: BoardItem[];
  boardConfig: BoardConfig;
  viewMode: 'kanban' | 'list';
  visibleColumns: number;
  isLoading: boolean;
  error: string | null;
  // Actions
  fetchBoard: (projectSlug: string) => Promise<void>;
  createIssue: (projectSlug: string, data: CreateIssueRequest) => Promise<void>;
  updateIssue: (projectSlug: string, issueId: string, data: UpdateIssueRequest) => Promise<void>;
  deleteIssue: (projectSlug: string, issueId: string) => Promise<void>;
  setViewMode: (mode: 'kanban' | 'list') => void;
  setVisibleColumns: (count: number) => void;
  setBoardConfig: (config: BoardConfig) => void;
  getItemsByStatus: (status: BoardItemStatus) => BoardItem[];
  clearError: () => void;
}

let _errorTimerId: ReturnType<typeof setTimeout> | null = null;
let _fetchId = 0;

function clearErrorTimer() {
  if (_errorTimerId) {
    clearTimeout(_errorTimerId);
    _errorTimerId = null;
  }
}

function setErrorWithAutoClear(set: (partial: Partial<BoardStore>) => void, message: string) {
  clearErrorTimer();
  set({ error: message, isLoading: false });
  _errorTimerId = setTimeout(() => {
    set({ error: null });
    _errorTimerId = null;
  }, 5000);
}

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return i18n.t('notification:board.loadError');
}

function getInitialViewMode(): 'kanban' | 'list' {
  if (typeof window === 'undefined') return 'kanban';
  const stored = localStorage.getItem('bmad-board-viewMode');
  if (stored === 'kanban' || stored === 'list') return stored;
  return window.matchMedia('(max-width: 767px)').matches ? 'list' : 'kanban';
}

function getInitialVisibleColumns(): number {
  if (typeof window === 'undefined') return 5;
  const stored = localStorage.getItem('bmad-board-visibleColumns');
  if (stored) {
    const num = parseInt(stored, 10);
    if (num >= 2 && num <= 10) return num;
  }
  return 5;
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  // State
  items: [],
  boardConfig: DEFAULT_BOARD_CONFIG,
  viewMode: getInitialViewMode(),
  visibleColumns: getInitialVisibleColumns(),
  isLoading: false,
  error: null,

  // Actions
  fetchBoard: async (projectSlug: string) => {
    const currentFetchId = ++_fetchId;
    set({ isLoading: true, items: [], error: null });
    try {
      const response = await boardApi.getBoard(projectSlug);
      if (currentFetchId !== _fetchId) return;
      clearErrorTimer();
      set({
        items: response.items,
        boardConfig: response.config ?? DEFAULT_BOARD_CONFIG,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      if (currentFetchId !== _fetchId) return;
      setErrorWithAutoClear(set, getErrorMessage(err));
    }
  },

  createIssue: async (projectSlug: string, data: CreateIssueRequest) => {
    set({ isLoading: true });
    try {
      await boardApi.createIssue(projectSlug, data);
      await get().fetchBoard(projectSlug);
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
      throw err;
    }
  },

  updateIssue: async (projectSlug: string, issueId: string, data: UpdateIssueRequest) => {
    set({ isLoading: true });
    try {
      await boardApi.updateIssue(projectSlug, issueId, data);
      await get().fetchBoard(projectSlug);
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
      throw err;
    }
  },

  deleteIssue: async (projectSlug: string, issueId: string) => {
    set({ isLoading: true });
    try {
      await boardApi.deleteIssue(projectSlug, issueId);
      await get().fetchBoard(projectSlug);
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
      throw err;
    }
  },

  setViewMode: (mode: 'kanban' | 'list') => {
    localStorage.setItem('bmad-board-viewMode', mode);
    set({ viewMode: mode });
  },

  setVisibleColumns: (count: number) => {
    const clamped = Math.max(2, Math.min(10, count));
    localStorage.setItem('bmad-board-visibleColumns', String(clamped));
    set({ visibleColumns: clamped });
  },

  setBoardConfig: (config: BoardConfig) => {
    set({ boardConfig: config });
  },

  getItemsByStatus: (status: BoardItemStatus) =>
    get().items.filter((item) => item.status === status),

  clearError: () => {
    if (_errorTimerId) {
      clearTimeout(_errorTimerId);
      _errorTimerId = null;
    }
    set({ error: null });
  },
}));
