/**
 * File Store - Zustand store for file editor state
 * [Source: Story 11.3 - Task 2]
 */

import { create } from 'zustand';
import { fileSystemApi } from '../services/api/fileSystem';
import { ApiError } from '../services/api/client';
import { isMarkdownPath } from '../utils/languageDetect';
import { usePreferencesStore } from './preferencesStore';
import i18n from '../i18n';

/**
 * Status of the file currently open in the editor relative to disk.
 * - 'synced'        — disk and editor agree on mtime
 * - 'externalChange' — watcher reported a modification we have not yet acknowledged
 * - 'externalDelete' — watcher reported the file was deleted on disk
 * - 'saveConflict'   — the last save returned 409 STALE_WRITE; user must resolve
 */
export type ExternalChangeStatus = 'synced' | 'externalChange' | 'externalDelete' | 'saveConflict';

interface FileState {
  openFile: { projectSlug: string; path: string } | null;
  content: string;
  originalContent: string;
  /** Mtime reported for openFile when it was last loaded from disk. Null for new/unknown. */
  mtime: string | null;
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
  /** Status of the open file vs. disk — drives the editor banner */
  externalStatus: ExternalChangeStatus;
  /** Mtime seen from the most recent external-change signal (server event or save conflict) */
  externalMtime: string | null;
  /** Size in bytes for the currently open file (known for binary and text) */
  fileSize: number | null;
}

interface FileActions {
  openFileInEditor: (projectSlug: string, path: string, targetLine?: number) => Promise<void>;
  /**
   * Save the current buffer to disk. By default sends the tracked mtime so
   * the server can reject stale writes. Pass { overwrite: true } to bypass
   * the mtime check (used by the "덮어쓰기" option in the conflict banner).
   */
  saveFile: (options?: { overwrite?: boolean }) => Promise<boolean>;
  requestFileNavigation: (projectSlug: string, path: string, targetLine?: number) => void;
  confirmPendingNavigation: () => void;
  cancelPendingNavigation: () => void;
  closeEditor: () => void;
  setContent: (content: string) => void;
  resetError: () => void;
  toggleMarkdownPreview: () => void;
  /** Track a file as recently opened for a specific session */
  addRecentFile: (sessionId: string, path: string) => void;
  /** Called by the socket listener when the server reports an external change */
  notifyExternalChange: (projectSlug: string, path: string, type: 'modified' | 'deleted', mtime?: string) => void;
  /** Re-read the current open file from disk, discarding local changes */
  reloadFromDisk: () => Promise<void>;
  /** Dismiss the external-change banner without reloading (keeps local edits) */
  dismissExternalChange: () => void;
}

type FileStore = FileState & FileActions;

const initialState: FileState = {
  openFile: null,
  content: '',
  originalContent: '',
  mtime: null,
  isDirty: false,
  isLoading: false,
  isSaving: false,
  isTruncated: false,
  isMarkdownPreview: false,
  error: null,
  pendingNavigation: null,
  targetLine: null,
  recentFiles: {},
  externalStatus: 'synced',
  externalMtime: null,
  fileSize: null,
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
      mtime: null,
      isDirty: false,
      targetLine: targetLine ?? null,
      externalStatus: 'synced',
      externalMtime: null,
      fileSize: null,
    });
    try {
      const response = await fileSystemApi.readFile(projectSlug, path);
      if (response.isBinary) {
        set({
          error: i18n.t('notification:file.binaryNotEditable'),
          isLoading: false,
          fileSize: response.size,
        });
        return;
      }
      const fileContent = response.content ?? '';
      set({
        content: fileContent,
        originalContent: fileContent,
        mtime: response.mtime,
        isLoading: false,
        isTruncated: response.isTruncated,
        fileSize: response.size,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  saveFile: async (options = {}) => {
    const { openFile, content, mtime } = get();
    if (!openFile) return false;
    set({ isSaving: true });
    try {
      const expectedMtime = options.overwrite ? undefined : (mtime ?? undefined);
      const response = await fileSystemApi.writeFile(openFile.projectSlug, openFile.path, content, expectedMtime);
      set({
        originalContent: content,
        isDirty: false,
        isSaving: false,
        mtime: response.mtime,
        // A successful save clears any pending external-change or conflict flag.
        externalStatus: 'synced',
        externalMtime: null,
      });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STALE_WRITE') {
        const details = err.details as { currentMtime?: string } | undefined;
        set({
          isSaving: false,
          externalStatus: 'saveConflict',
          externalMtime: details?.currentMtime ?? null,
        });
        return false;
      }
      set({ isSaving: false });
      return false;
    }
  },

  notifyExternalChange: (projectSlug, path, type, mtime) => {
    const { openFile, mtime: currentMtime } = get();
    if (!openFile || openFile.projectSlug !== projectSlug || openFile.path !== path) return;
    // Ignore stale events where the disk mtime equals what we already have on record.
    if (type === 'modified' && mtime && mtime === currentMtime) return;
    set({
      externalStatus: type === 'deleted' ? 'externalDelete' : 'externalChange',
      externalMtime: mtime ?? null,
    });
  },

  reloadFromDisk: async () => {
    const { openFile } = get();
    if (!openFile) return;
    // Reuse openFileInEditor — it resets dirty state and refreshes mtime.
    await get().openFileInEditor(openFile.projectSlug, openFile.path);
  },

  dismissExternalChange: () => {
    const { externalStatus } = get();
    // After the file was deleted externally, "dismiss" implies the user wants
    // to keep editing and re-create the file on next save. Drop the tracked
    // mtime so the stale-write guard accepts the write.
    if (externalStatus === 'externalDelete') {
      set({ externalStatus: 'synced', externalMtime: null, mtime: null });
    } else {
      set({ externalStatus: 'synced', externalMtime: null });
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
