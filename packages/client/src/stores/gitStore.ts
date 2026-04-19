/**
 * Git Store - Zustand store for Git repository state
 * [Source: Story 16.3 - Task 2]
 */

import { create } from 'zustand';
import type {
  GitStatusResponse,
  GitCommitInfo,
  GitBranchesResponse,
} from '@hammoc/shared';
import { gitApi } from '../services/api/git';
import { ApiError } from '../services/api/client';
import i18n from '../i18n';

interface GitStore {
  // State
  status: GitStatusResponse | null;
  commits: GitCommitInfo[];
  branches: GitBranchesResponse | null;
  isLoading: boolean;
  error: string | null;
  // Actions
  fetchStatus: (projectSlug: string) => Promise<void>;
  fetchLog: (projectSlug: string, limit?: number) => Promise<void>;
  fetchBranches: (projectSlug: string) => Promise<void>;
  fetchDiff: (projectSlug: string, file: string, staged?: boolean) => Promise<{ diff: string; isBinary: boolean }>;
  stageFiles: (projectSlug: string, files: string[]) => Promise<void>;
  unstageFiles: (projectSlug: string, files: string[]) => Promise<void>;
  commit: (projectSlug: string, message: string) => Promise<void>;
  push: (projectSlug: string) => Promise<void>;
  pull: (projectSlug: string) => Promise<void>;
  checkout: (projectSlug: string, branch: string) => Promise<void>;
  createBranch: (projectSlug: string, name: string, startPoint?: string) => Promise<void>;
  initRepo: (projectSlug: string) => Promise<void>;
  refreshAll: (projectSlug: string) => Promise<void>;
  resetData: () => void;
  clearError: () => void;
}

let _errorTimerId: ReturnType<typeof setTimeout> | null = null;

function setErrorWithAutoClear(set: (partial: Partial<GitStore>) => void, message: string) {
  if (_errorTimerId) clearTimeout(_errorTimerId);
  set({ error: message, isLoading: false });
  _errorTimerId = setTimeout(() => {
    set({ error: null });
    _errorTimerId = null;
  }, 5000);
}

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return i18n.t('notification:git.operationError');
}

export const useGitStore = create<GitStore>((set, get) => ({
  // State
  status: null,
  commits: [],
  branches: null,
  isLoading: false,
  error: null,

  // Actions
  fetchStatus: async (projectSlug: string) => {
    try {
      const status = await gitApi.getStatus(projectSlug);
      set({ status });
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
    }
  },

  fetchLog: async (projectSlug: string, limit = 20) => {
    try {
      const response = await gitApi.getLog(projectSlug, limit);
      set({ commits: response.commits });
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
    }
  },

  fetchBranches: async (projectSlug: string) => {
    try {
      const branches = await gitApi.getBranches(projectSlug);
      set({ branches });
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
    }
  },

  fetchDiff: async (projectSlug: string, file: string, staged = false) => {
    try {
      const response = await gitApi.getDiff(projectSlug, file, staged);
      return { diff: response.diff ?? '', isBinary: response.isBinary ?? false };
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
      return { diff: '', isBinary: false };
    }
  },

  stageFiles: async (projectSlug: string, files: string[]) => {
    set({ isLoading: true });
    try {
      await gitApi.stage(projectSlug, files);
      await get().refreshAll(projectSlug);
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
    }
  },

  unstageFiles: async (projectSlug: string, files: string[]) => {
    set({ isLoading: true });
    try {
      await gitApi.unstage(projectSlug, files);
      await get().refreshAll(projectSlug);
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
    }
  },

  commit: async (projectSlug: string, message: string) => {
    set({ isLoading: true });
    try {
      await gitApi.commit(projectSlug, message);
      await get().refreshAll(projectSlug);
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
    }
  },

  push: async (projectSlug: string) => {
    set({ isLoading: true });
    try {
      await gitApi.push(projectSlug);
      await get().refreshAll(projectSlug);
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
    }
  },

  pull: async (projectSlug: string) => {
    set({ isLoading: true });
    try {
      await gitApi.pull(projectSlug);
      await get().refreshAll(projectSlug);
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
    }
  },

  checkout: async (projectSlug: string, branch: string) => {
    set({ isLoading: true });
    try {
      await gitApi.checkout(projectSlug, branch);
      await get().refreshAll(projectSlug);
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
    }
  },

  createBranch: async (projectSlug: string, name: string, startPoint?: string) => {
    set({ isLoading: true });
    try {
      await gitApi.createBranch(projectSlug, name, startPoint);
      await get().refreshAll(projectSlug);
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
    }
  },

  initRepo: async (projectSlug: string) => {
    set({ isLoading: true });
    try {
      await gitApi.init(projectSlug);
      await get().refreshAll(projectSlug);
    } catch (err) {
      setErrorWithAutoClear(set, getErrorMessage(err));
    }
  },

  refreshAll: async (projectSlug: string) => {
    try {
      await Promise.all([
        get().fetchStatus(projectSlug),
        get().fetchBranches(projectSlug),
        get().fetchLog(projectSlug),
      ]);
    } finally {
      set({ isLoading: false });
    }
  },

  resetData: () => {
    if (_errorTimerId) {
      clearTimeout(_errorTimerId);
      _errorTimerId = null;
    }
    set({ status: null, commits: [], branches: null, error: null, isLoading: false });
  },

  clearError: () => {
    if (_errorTimerId) {
      clearTimeout(_errorTimerId);
      _errorTimerId = null;
    }
    set({ error: null });
  },
}));
