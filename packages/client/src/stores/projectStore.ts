/**
 * Project Store - Zustand store for project list state
 * [Source: Story 3.2 - Task 2]
 * [Extended: Story 3.6 - Task 5: Project creation state]
 */

import { create } from 'zustand';
import type {
  ProjectInfo,
  CreateProjectResponse,
  ValidatePathResponse,
} from '@bmad-studio/shared';
import { projectsApi } from '../services/api/projects';
import { ApiError } from '../services/api/client';

interface ProjectState {
  projects: ProjectInfo[];
  isLoading: boolean;
  error: string | null;
  // Story 3.6 - Project creation state
  isCreating: boolean;
  createError: string | null;
  pathValidation: ValidatePathResponse | null;
  isValidating: boolean;
  // BMad versions
  bmadVersions: string[];
  isFetchingVersions: boolean;
  // Hidden projects (server-based via .bmad-studio/settings.json)
  showHidden: boolean;
}

interface ProjectActions {
  fetchProjects: () => Promise<void>;
  clearError: () => void;
  deleteProject: (projectSlug: string, deleteFiles?: boolean) => Promise<boolean>;
  setupBmad: (projectSlug: string, bmadVersion?: string) => Promise<{ success: boolean; error?: string }>;
  // Story 3.6 - Project creation actions
  createProject: (path: string, setupBmad: boolean, bmadVersion?: string) => Promise<CreateProjectResponse | null>;
  validatePath: (path: string) => Promise<ValidatePathResponse>;
  clearCreateError: () => void;
  clearPathValidation: () => void;
  abortCreation: () => void;
  fetchBmadVersions: () => Promise<void>;
  // Hidden projects (server-based)
  hideProject: (projectSlug: string) => Promise<void>;
  unhideProject: (projectSlug: string) => Promise<void>;
  setShowHidden: (show: boolean) => void;
}

type ProjectStore = ProjectState & ProjectActions;

// AbortController for cancellable requests
let createAbortController: AbortController | null = null;

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // State
  projects: [],
  isLoading: false,
  error: null,
  // Story 3.6 - Project creation state
  isCreating: false,
  createError: null,
  pathValidation: null,
  isValidating: false,
  // BMad versions
  bmadVersions: [],
  isFetchingVersions: false,
  // Hidden projects
  showHidden: false,

  // Actions
  fetchProjects: async () => {
    // Only show loading skeleton when there are no cached projects.
    // Otherwise keep stale data visible while revalidating.
    set({ isLoading: get().projects.length === 0, error: null });
    try {
      const { projects } = await projectsApi.list();
      set({ projects, isLoading: false });
    } catch (err) {
      if (err instanceof ApiError) {
        set({ error: err.message, isLoading: false });
      } else {
        set({ error: '프로젝트 목록을 불러오는 중 오류가 발생했습니다.', isLoading: false });
      }
    }
  },

  clearError: () => set({ error: null }),

  deleteProject: async (projectSlug: string, deleteFiles = false) => {
    try {
      await projectsApi.delete(projectSlug, deleteFiles);
      // Remove from local state immediately for instant UI feedback
      set((state) => ({
        projects: state.projects.filter((p) => p.projectSlug !== projectSlug),
      }));
      return true;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : '프로젝트 삭제 중 오류가 발생했습니다.';
      set({ error: message });
      return false;
    }
  },

  setupBmad: async (projectSlug: string, bmadVersion?: string) => {
    try {
      await projectsApi.setupBmad(projectSlug, bmadVersion);
      // Update local state immediately for instant UI feedback
      set((state) => ({
        projects: state.projects.map((p) =>
          p.projectSlug === projectSlug ? { ...p, isBmadProject: true } : p,
        ),
      }));
      return { success: true };
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'BMad 설정 중 오류가 발생했습니다.';
      // Do NOT set global error — it triggers full-page error screen
      // Return error message so caller can show specific toast
      return { success: false, error: message };
    }
  },

  // Story 3.6 - Project creation actions
  createProject: async (path: string, setupBmad: boolean, bmadVersion?: string) => {
    // Create new AbortController for this request
    createAbortController = new AbortController();
    const signal = createAbortController.signal;

    set({ isCreating: true, createError: null });
    try {
      const result = await projectsApi.create({ path, setupBmad, bmadVersion }, { signal });

      // Check if aborted
      if (signal.aborted) {
        return null;
      }

      // Refresh project list
      await get().fetchProjects();

      set({ isCreating: false });
      createAbortController = null;
      return result;
    } catch (err) {
      // Don't show error if request was aborted
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null;
      }

      const message =
        err instanceof ApiError ? err.message : '프로젝트 생성 중 오류가 발생했습니다.';
      set({ createError: message, isCreating: false });
      createAbortController = null;
      return null;
    }
  },

  validatePath: async (path: string) => {
    set({ isValidating: true });
    try {
      const result = await projectsApi.validatePath(path);
      set({ pathValidation: result, isValidating: false });
      return result;
    } catch (err) {
      const errorResult: ValidatePathResponse = {
        valid: false,
        exists: false,
        isProject: false,
        error: '경로 검증 중 오류가 발생했습니다.',
      };
      set({ pathValidation: errorResult, isValidating: false });
      return errorResult;
    }
  },

  clearCreateError: () => set({ createError: null }),
  clearPathValidation: () => set({ pathValidation: null }),

  abortCreation: () => {
    if (createAbortController) {
      createAbortController.abort();
      createAbortController = null;
      set({ isCreating: false, createError: '프로젝트 생성이 취소되었습니다.' });
    }
  },

  fetchBmadVersions: async () => {
    set({ isFetchingVersions: true });
    try {
      const { versions } = await projectsApi.bmadVersions();
      set({ bmadVersions: versions, isFetchingVersions: false });
    } catch {
      set({ bmadVersions: [], isFetchingVersions: false });
    }
  },

  hideProject: async (projectSlug: string) => {
    // Optimistic update
    set((state) => ({
      projects: state.projects.map((p) =>
        p.projectSlug === projectSlug ? { ...p, hidden: true } : p,
      ),
    }));
    try {
      await projectsApi.updateSettings(projectSlug, { hidden: true });
    } catch {
      // Revert on failure
      set((state) => ({
        projects: state.projects.map((p) =>
          p.projectSlug === projectSlug ? { ...p, hidden: undefined } : p,
        ),
      }));
    }
  },

  unhideProject: async (projectSlug: string) => {
    // Optimistic update
    set((state) => ({
      projects: state.projects.map((p) =>
        p.projectSlug === projectSlug ? { ...p, hidden: undefined } : p,
      ),
    }));
    try {
      await projectsApi.updateSettings(projectSlug, { hidden: false });
    } catch {
      // Revert on failure
      set((state) => ({
        projects: state.projects.map((p) =>
          p.projectSlug === projectSlug ? { ...p, hidden: true } : p,
        ),
      }));
    }
  },

  setShowHidden: (show: boolean) => set({ showHidden: show }),
}));
