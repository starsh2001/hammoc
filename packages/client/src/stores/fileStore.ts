/**
 * File Store - Zustand store for file editor state
 * [Source: Story 11.3 - Task 2]
 */

import { create } from 'zustand';
import { fileSystemApi } from '../services/api/fileSystem';
import { isMarkdownPath } from '../utils/languageDetect';
import { usePreferencesStore } from './preferencesStore';

interface FileState {
  openFile: { projectSlug: string; path: string } | null;
  content: string;
  originalContent: string;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isTruncated: boolean;
  isMarkdownPreview: boolean;
  error: string | null;
  pendingNavigation: { projectSlug: string; path: string; targetLine?: number } | null;
  /** Line number to scroll to after file loads */
  targetLine: number | null;
  /** Recent files per session — keyed by sessionId, value is array of file paths (max 5) */
  recentFiles: Record<string, string[]>;
}

interface FileActions {
  openFileInEditor: (projectSlug: string, path: string, targetLine?: number) => Promise<void>;
  saveFile: () => Promise<boolean>;
  requestFileNavigation: (projectSlug: string, path: string, targetLine?: number) => void;
  confirmPendingNavigation: () => void;
  cancelPendingNavigation: () => void;
  closeEditor: () => void;
  setContent: (content: string) => void;
  resetError: () => void;
  toggleMarkdownPreview: () => void;
  /** Track a file as recently opened for a specific session */
  addRecentFile: (sessionId: string, path: string) => void;
}

type FileStore = FileState & FileActions;

const initialState: FileState = {
  openFile: null,
  content: '',
  originalContent: '',
  isDirty: false,
  isLoading: false,
  isSaving: false,
  isTruncated: false,
  isMarkdownPreview: false,
  error: null,
  pendingNavigation: null,
  targetLine: null,
  recentFiles: {},
};

export const useFileStore = create<FileStore>((set, get) => ({
  ...initialState,

  openFileInEditor: async (projectSlug, path, targetLine) => {
    const defaultPreview = isMarkdownPath(path)
      && usePreferencesStore.getState().preferences.markdownDefaultMode === 'preview';
    set({
      openFile: { projectSlug, path },
      isLoading: true,
      error: null,
      isTruncated: false,
      isMarkdownPreview: defaultPreview,
      content: '',
      originalContent: '',
      isDirty: false,
      targetLine: targetLine ?? null,
    });
    try {
      const response = await fileSystemApi.readFile(projectSlug, path);
      if (response.isBinary) {
        set({ error: '바이너리 파일은 편집할 수 없습니다.', isLoading: false });
        return;
      }
      const fileContent = response.content ?? '';
      set({
        content: fileContent,
        originalContent: fileContent,
        isLoading: false,
        isTruncated: response.isTruncated,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  saveFile: async () => {
    const { openFile, content } = get();
    if (!openFile) return false;
    set({ isSaving: true });
    try {
      await fileSystemApi.writeFile(openFile.projectSlug, openFile.path, content);
      set({ originalContent: content, isDirty: false, isSaving: false });
      return true;
    } catch {
      set({ isSaving: false });
      return false;
    }
  },

  requestFileNavigation: (projectSlug, path, targetLine) => {
    if (get().isDirty) {
      set({ pendingNavigation: { projectSlug, path, targetLine } });
    } else {
      get().openFileInEditor(projectSlug, path, targetLine);
    }
  },

  confirmPendingNavigation: () => {
    const { pendingNavigation } = get();
    if (pendingNavigation) {
      set({ pendingNavigation: null });
      get().openFileInEditor(pendingNavigation.projectSlug, pendingNavigation.path, pendingNavigation.targetLine);
    }
  },

  cancelPendingNavigation: () => {
    set({ pendingNavigation: null });
  },

  closeEditor: () => {
    const { recentFiles } = get();
    set({ ...initialState, recentFiles });
  },

  setContent: (content) => {
    set({ content, isDirty: content !== get().originalContent });
  },

  resetError: () => set({ error: null }),

  toggleMarkdownPreview: () => {
    set({ isMarkdownPreview: !get().isMarkdownPreview });
  },

  addRecentFile: (sessionId, path) => {
    const current = get().recentFiles[sessionId] ?? [];
    // Remove if already exists (move to top), then prepend
    const filtered = current.filter((f) => f !== path);
    const updated = [path, ...filtered].slice(0, 5);
    set({ recentFiles: { ...get().recentFiles, [sessionId]: updated } });
  },
}));
