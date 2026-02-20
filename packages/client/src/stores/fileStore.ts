/**
 * File Store - Zustand store for file editor state
 * [Source: Story 11.3 - Task 2]
 */

import { create } from 'zustand';
import { fileSystemApi } from '../services/api/fileSystem';

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
}

interface FileActions {
  openFileInEditor: (projectSlug: string, path: string) => Promise<void>;
  saveFile: () => Promise<boolean>;
  closeEditor: () => void;
  setContent: (content: string) => void;
  resetError: () => void;
  toggleMarkdownPreview: () => void;
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
};

export const useFileStore = create<FileStore>((set, get) => ({
  ...initialState,

  openFileInEditor: async (projectSlug, path) => {
    set({
      openFile: { projectSlug, path },
      isLoading: true,
      error: null,
      isTruncated: false,
      isMarkdownPreview: false,
      content: '',
      originalContent: '',
      isDirty: false,
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

  closeEditor: () => {
    set({ ...initialState });
  },

  setContent: (content) => {
    set({ content, isDirty: content !== get().originalContent });
  },

  resetError: () => set({ error: null }),

  toggleMarkdownPreview: () => {
    set({ isMarkdownPreview: !get().isMarkdownPreview });
  },
}));
