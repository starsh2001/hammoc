/**
 * FileGridView - Finder-style grid view for file explorer
 * Displays current directory contents as a card grid.
 * Folder click navigates into the folder (updates breadcrumb).
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, File, Loader2, AlertCircle, MoreVertical } from 'lucide-react';
import type { DirectoryEntry } from '@hammoc/shared';

import { fileSystemApi } from '../../services/api/fileSystem.js';
import { useFileStore } from '../../stores/fileStore.js';
import {
  HIDDEN_PATTERNS,
  sortEntries,
  FileTreeContextMenu,
  InlineInput,
  DeleteConfirmDialog,
} from './FileTree.js';

// --- Types ---

interface ContextMenuState {
  x: number;
  y: number;
  targetPath: string;
  targetType: 'file' | 'directory';
  parentPath: string;
}

interface InlineInputState {
  mode: 'create' | 'rename';
  parentPath: string;
  targetPath?: string;
  entryType: 'file' | 'directory';
  initialValue: string;
}

interface DeleteConfirmState {
  path: string;
  name: string;
  type: 'file' | 'directory';
}

// --- Component ---

// --- Grid-specific inline rename (card layout: icon above, input below) ---

interface GridInlineRenameProps {
  entryType: 'file' | 'directory';
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

function GridInlineRename({ entryType, initialValue, onConfirm, onCancel }: GridInlineRenameProps) {
  const { t } = useTranslation('common');
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    if (initialValue) {
      const dotIndex = initialValue.lastIndexOf('.');
      const end = dotIndex > 0 ? dotIndex : initialValue.length;
      inputRef.current.setSelectionRange(0, end);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    if (value.trim()) {
      onConfirm(value);
    } else {
      onCancel();
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 p-2 rounded-lg">
      {entryType === 'directory' ? (
        <Folder className="w-8 h-8 text-blue-500 dark:text-blue-400" />
      ) : (
        <File className="w-8 h-8 text-gray-400 dark:text-gray-400" />
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="text-xs text-center w-full bg-white dark:bg-[#1c2129] dark:text-white border border-blue-500 rounded px-1 py-0 outline-none h-4 leading-4"
        aria-label={t('files.renameAria')}
      />
    </div>
  );
}

// --- Component ---

interface FileGridViewProps {
  projectSlug: string;
  currentPath: string;
  showHidden: boolean;
  onFileSelect: (path: string) => void;
  onNavigate: (path: string) => void;
  enableContextMenu?: boolean;
  onCreateEntry?: (parentPath: string, type: 'file' | 'directory', name: string) => Promise<void>;
  onDeleteEntry?: (path: string) => Promise<void>;
  onRenameEntry?: (path: string, newName: string) => Promise<void>;
  onCopy?: (path: string) => void;
  onCut?: (path: string) => void;
  onPaste?: (targetDir: string) => Promise<{ sourceDir?: string }>;
  onDownload?: (path: string) => void;
  hasClipboard?: boolean;
  cutPath?: string;
  refreshTrigger?: number;
}

export function FileGridView({
  projectSlug,
  currentPath,
  showHidden,
  onFileSelect,
  onNavigate,
  enableContextMenu = false,
  onCreateEntry,
  onDeleteEntry,
  onRenameEntry,
  onCopy,
  onCut,
  onPaste,
  onDownload,
  hasClipboard = false,
  cutPath,
  refreshTrigger,
}: FileGridViewProps) {
  const { t } = useTranslation('common');
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSpinner, setShowSpinner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineInput, setInlineInput] = useState<InlineInputState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);

  const openFilePath = useFileStore((state) => state.openFile?.path ?? null);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEntries([]);
    try {
      const response = await fileSystemApi.listDirectory(projectSlug, currentPath);
      setEntries(response.entries);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectSlug, currentPath]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  // Reload directory when refreshTrigger changes (e.g. after upload)
  useEffect(() => {
    if (refreshTrigger === undefined || refreshTrigger === 0) return;
    loadDirectory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // Delay spinner to avoid flash on fast loads
  useEffect(() => {
    if (!loading) {
      setShowSpinner(false);
      return;
    }
    const timer = setTimeout(() => setShowSpinner(true), 300);
    return () => clearTimeout(timer);
  }, [loading]);

  const filteredEntries = useMemo(() => {
    const sorted = sortEntries(entries);
    return showHidden ? sorted : sorted.filter((e) => !HIDDEN_PATTERNS.includes(e.name));
  }, [entries, showHidden]);

  // --- Item click ---

  const handleItemClick = useCallback(
    (entry: DirectoryEntry) => {
      const fullPath = currentPath === '.' ? entry.name : `${currentPath}/${entry.name}`;
      if (entry.type === 'directory') {
        onNavigate(fullPath);
      } else {
        onFileSelect(fullPath);
      }
    },
    [currentPath, onNavigate, onFileSelect],
  );

  // --- Context menu ---

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: DirectoryEntry) => {
      if (!enableContextMenu) return;
      e.preventDefault();
      e.stopPropagation();
      const fullPath = currentPath === '.' ? entry.name : `${currentPath}/${entry.name}`;
      const parentPath = entry.type === 'directory' ? fullPath : currentPath;
      setContextMenu({ x: e.clientX, y: e.clientY, targetPath: fullPath, targetType: entry.type, parentPath });
    },
    [enableContextMenu, currentPath],
  );

  const handleMenuButtonClick = useCallback(
    (e: React.MouseEvent, entry: DirectoryEntry) => {
      if (!enableContextMenu) return;
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const fullPath = currentPath === '.' ? entry.name : `${currentPath}/${entry.name}`;
      const parentPath = entry.type === 'directory' ? fullPath : currentPath;
      setContextMenu({ x: rect.right, y: rect.bottom, targetPath: fullPath, targetType: entry.type, parentPath });
    },
    [enableContextMenu, currentPath],
  );

  // --- Background context menu (create in current dir) ---

  const handleBackgroundContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!enableContextMenu) return;
      // Only trigger if clicking on the grid background, not on items
      if ((e.target as HTMLElement).closest('[data-grid-item]')) return;
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, targetPath: currentPath, targetType: 'directory', parentPath: currentPath });
    },
    [enableContextMenu, currentPath],
  );

  // --- Inline input ---

  const handleNewEntry = useCallback((type: 'file' | 'directory') => {
    if (!contextMenu) return;
    setInlineInput({ mode: 'create', parentPath: contextMenu.parentPath, entryType: type, initialValue: '' });
    setContextMenu(null);
  }, [contextMenu]);

  const handleStartRename = useCallback(() => {
    if (!contextMenu) return;
    const name = contextMenu.targetPath.includes('/') ? contextMenu.targetPath.split('/').pop()! : contextMenu.targetPath;
    setInlineInput({ mode: 'rename', parentPath: currentPath, targetPath: contextMenu.targetPath, entryType: contextMenu.targetType, initialValue: name });
    setContextMenu(null);
  }, [contextMenu, currentPath]);

  const handleInlineInputConfirm = useCallback(async (value: string) => {
    if (!inlineInput || !value.trim()) {
      setInlineInput(null);
      return;
    }
    try {
      if (inlineInput.mode === 'create') {
        await onCreateEntry?.(inlineInput.parentPath, inlineInput.entryType, value.trim());
        await loadDirectory();
      } else if (inlineInput.mode === 'rename' && inlineInput.targetPath) {
        if (value.trim() !== inlineInput.initialValue) {
          await onRenameEntry?.(inlineInput.targetPath, value.trim());
          await loadDirectory();
        }
      }
    } catch {
      // Error handling done in parent
    }
    setInlineInput(null);
  }, [inlineInput, onCreateEntry, onRenameEntry, loadDirectory]);

  // --- Delete ---

  const handleStartDelete = useCallback(() => {
    if (!contextMenu) return;
    const name = contextMenu.targetPath.includes('/') ? contextMenu.targetPath.split('/').pop()! : contextMenu.targetPath;
    setDeleteConfirm({ path: contextMenu.targetPath, name, type: contextMenu.targetType });
    setContextMenu(null);
  }, [contextMenu]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    try {
      await onDeleteEntry?.(deleteConfirm.path);
      await loadDirectory();
    } catch {
      // Error handling done in parent
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, onDeleteEntry, loadDirectory]);

  // --- Render ---

  if (loading && entries.length === 0) {
    if (!showSpinner) return null;
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-gray-500 dark:text-gray-300 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t('loadingStatus')}</span>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{error}</span>
          <button
            className="text-xs text-blue-500 dark:text-blue-400 hover:underline cursor-pointer ml-2"
            onClick={loadDirectory}
          >
            {t('button.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-2 min-h-0"
      onContextMenu={handleBackgroundContextMenu}
    >
      {/* Inline input for create at top */}
      {inlineInput?.mode === 'create' && (
        <div className="mb-2">
          <InlineInput
            initialValue={inlineInput.initialValue}
            entryType={inlineInput.entryType}
            depth={0}
            onConfirm={handleInlineInputConfirm}
            onCancel={() => setInlineInput(null)}
          />
        </div>
      )}

      {filteredEntries.length === 0 && !inlineInput ? (
        <div className="text-sm text-gray-400 dark:text-gray-400 italic text-center py-8">
          {t('files.emptyFolder')}
        </div>
      ) : (
        <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-1">
          {/* ".." parent directory entry */}
          {currentPath !== '.' && (
            <div
              data-grid-item
              role="button"
              tabIndex={0}
              className="group relative flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-[#253040]/50"
              onClick={() => {
                const parentPath = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : '.';
                onNavigate(parentPath);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const parentPath = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : '.';
                  onNavigate(parentPath);
                }
              }}
            >
              <Folder className="w-8 h-8 text-blue-500 dark:text-blue-400" />
              <span className="text-xs text-center w-full truncate text-gray-500 dark:text-gray-300">{t('files.parentDir')}</span>
            </div>
          )}
          {filteredEntries.map((entry) => {
            const fullPath = currentPath === '.' ? entry.name : `${currentPath}/${entry.name}`;
            const isCurrentOpen = openFilePath === fullPath;
            const isRenaming = inlineInput?.mode === 'rename' && inlineInput.targetPath === fullPath;

            if (isRenaming) {
              return (
                <GridInlineRename
                  key={entry.name}
                  entryType={entry.type}
                  initialValue={inlineInput!.initialValue}
                  onConfirm={handleInlineInputConfirm}
                  onCancel={() => setInlineInput(null)}
                />
              );
            }

            return (
              <div
                key={entry.name}
                data-grid-item
                role="button"
                tabIndex={0}
                className={`group relative flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-[#253040]/50 ${
                  isCurrentOpen ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700' : ''
                } ${cutPath === fullPath ? 'opacity-50' : ''}`}
                onClick={() => handleItemClick(entry)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleItemClick(entry); }}
                onContextMenu={(e) => handleContextMenu(e, entry)}
              >
                {entry.type === 'directory' ? (
                  <Folder className="w-8 h-8 text-blue-500 dark:text-blue-400" />
                ) : (
                  <File className="w-8 h-8 text-gray-400 dark:text-gray-400" />
                )}
                <span className={`text-xs text-center w-full truncate ${
                  isCurrentOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'
                }`}>
                  {entry.name}
                </span>

                {enableContextMenu && (
                  <button
                    className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-[#2d3a4a] transition-opacity"
                    onClick={(e) => handleMenuButtonClick(e, entry)}
                    aria-label={t('files.moreMenu')}
                  >
                    <MoreVertical className="w-3 h-3 text-gray-400" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <FileTreeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetType={contextMenu.targetType}
          onNewFile={() => handleNewEntry('file')}
          onNewFolder={() => handleNewEntry('directory')}
          onRename={() => handleStartRename()}
          onDelete={() => handleStartDelete()}
          onClose={() => setContextMenu(null)}
          onCopy={onCopy ? () => { onCopy(contextMenu.targetPath); setContextMenu(null); } : undefined}
          onCut={onCut ? () => { onCut(contextMenu.targetPath); setContextMenu(null); } : undefined}
          onPaste={onPaste ? () => {
            const pasteDir = contextMenu.targetType === 'directory' ? contextMenu.targetPath : currentPath;
            onPaste(pasteDir).catch(() => {}).finally(() => loadDirectory());
            setContextMenu(null);
          } : undefined}
          onDownload={onDownload ? () => { onDownload(contextMenu.targetPath); setContextMenu(null); } : undefined}
          hasClipboard={hasClipboard}
        />
      )}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <DeleteConfirmDialog
          name={deleteConfirm.name}
          type={deleteConfirm.type}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
