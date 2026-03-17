/**
 * FileTree - Recursive directory tree component with lazy loading
 * [Source: Story 13.1 - Task 2, 3]
 * [Extended: Story 13.3 - Task 2, 3, 4 — Context menu, inline input, delete dialog]
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Folder,
  FolderOpen,
  File,
  ChevronRight,
  Loader2,
  AlertCircle,
  MoreVertical,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  Copy,
  Scissors,
  ClipboardPaste,
  Download,
} from 'lucide-react';
import type { DirectoryEntry } from '@hammoc/shared';

import { fileSystemApi } from '../../services/api/fileSystem.js';
import { useFileStore } from '../../stores/fileStore.js';

export const HIDDEN_PATTERNS = ['.env', '.git', 'node_modules', '.next', '.cache', '__pycache__', '.DS_Store', 'dist', '.turbo'];

export function sortEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

function buildFlatList(
  basePath: string,
  dirCache: Map<string, DirectoryEntry[]>,
  expandedDirs: Set<string>,
  showHidden: boolean,
): string[] {
  const result: string[] = [];
  const entries = dirCache.get(basePath);
  if (!entries) return result;

  const sorted = sortEntries(entries);
  const filtered = showHidden
    ? sorted
    : sorted.filter((e) => !HIDDEN_PATTERNS.includes(e.name));

  for (const entry of filtered) {
    const fullPath = basePath === '.' ? entry.name : `${basePath}/${entry.name}`;
    result.push(fullPath);
    if (entry.type === 'directory' && expandedDirs.has(fullPath)) {
      result.push(...buildFlatList(fullPath, dirCache, expandedDirs, showHidden));
    }
  }
  return result;
}

// --- Context Menu State ---

interface ContextMenuState {
  x: number;
  y: number;
  targetPath: string;
  targetType: 'file' | 'directory';
  parentPath: string;
}

// --- Inline Input State ---

interface InlineInputState {
  mode: 'create' | 'rename';
  parentPath: string;
  targetPath?: string;
  entryType: 'file' | 'directory';
  initialValue: string;
}

// --- Delete Confirm State ---

interface DeleteConfirmState {
  path: string;
  name: string;
  type: 'file' | 'directory';
}

// --- FileTreeContextMenu Component ---

export interface FileTreeContextMenuProps {
  x: number;
  y: number;
  targetType: 'file' | 'directory';
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onDownload?: () => void;
  hasClipboard?: boolean;
}

export function FileTreeContextMenu({
  x,
  y,
  targetType,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onDownload,
  hasClipboard = false,
}: FileTreeContextMenuProps) {
  const { t } = useTranslation('common');
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const adjustedX = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 8 : x;
    const adjustedY = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 8 : y;
    setAdjustedPos({ x: Math.max(8, adjustedX), y: Math.max(8, adjustedY) });
  }, [x, y]);

  // Close on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleContextMenu = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onClose]);

  type MenuItem = { icon: typeof FilePlus; label: string; action: () => void; danger: boolean; disabled?: boolean } | { type: 'separator' };

  const menuItems: MenuItem[] = [
    { icon: FilePlus, label: t('files.newFile'), action: onNewFile, danger: false },
    { icon: FolderPlus, label: t('files.newFolder'), action: onNewFolder, danger: false },
    { type: 'separator' as const },
    ...(onCopy ? [{ icon: Copy, label: t('files.copy'), action: onCopy, danger: false }] : []),
    ...(onCut ? [{ icon: Scissors, label: t('files.cut'), action: onCut, danger: false }] : []),
    ...(onPaste ? [{ icon: ClipboardPaste, label: t('files.paste'), action: onPaste, danger: false, disabled: !hasClipboard }] : []),
    ...((onCopy || onCut || onPaste) ? [{ type: 'separator' as const }] : []),
    ...(onDownload && targetType === 'file' ? [{ icon: Download, label: t('files.download'), action: onDownload, danger: false }] : []),
    ...(onDownload && targetType === 'file' ? [{ type: 'separator' as const }] : []),
    { icon: Pencil, label: t('files.rename'), action: onRename, danger: false },
    { icon: Trash2, label: t('button.delete'), action: onDelete, danger: true },
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const buttons = menuRef.current?.querySelectorAll('[role="menuitem"]');
      if (!buttons || buttons.length === 0) return;
      const current = document.activeElement;
      const idx = Array.from(buttons).indexOf(current as Element);
      let next: number;
      if (e.key === 'ArrowDown') {
        next = idx < buttons.length - 1 ? idx + 1 : 0;
      } else {
        next = idx > 0 ? idx - 1 : buttons.length - 1;
      }
      (buttons[next] as HTMLElement).focus();
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 bg-white dark:bg-[#263240] border border-gray-200 dark:border-[#253040] rounded-lg shadow-lg py-1 min-w-[160px]"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
      onKeyDown={handleKeyDown}
    >
      {menuItems.map((item, i) => {
        if ('type' in item) {
          return <hr key={`sep-${i}`} className="border-t border-gray-200 dark:border-[#253040] my-1" />;
        }
        const Icon = item.icon;
        const isDisabled = 'disabled' in item && item.disabled;
        return (
          <button
            key={item.label}
            role="menuitem"
            tabIndex={isDisabled ? -1 : 0}
            autoFocus={i === 0}
            disabled={isDisabled}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm w-full ${
              isDisabled
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : item.danger
                  ? 'text-red-500 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-[#253040] cursor-pointer'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040] cursor-pointer'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (!isDisabled) item.action();
            }}
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// --- InlineInput Component ---

export interface InlineInputProps {
  initialValue: string;
  entryType: 'file' | 'directory';
  depth: number;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function InlineInput({ initialValue, entryType, depth, onConfirm, onCancel }: InlineInputProps) {
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
    <div
      className="flex items-center gap-1.5 px-2 py-1"
      style={{ paddingLeft: `${depth * 16 + 8 + 20}px` }}
    >
      {entryType === 'directory' ? (
        <Folder className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
      ) : (
        <File className="w-4 h-4 text-gray-500 dark:text-gray-300 flex-shrink-0" />
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="text-sm bg-white dark:bg-[#1c2129] dark:text-white border border-blue-500 rounded px-1 py-0 outline-none flex-1 h-5 leading-5"
        aria-label={initialValue ? t('files.renameAria') : t('files.newItemAria')}
      />
    </div>
  );
}

// --- DeleteConfirmDialog Component ---

export interface DeleteConfirmDialogProps {
  name: string;
  type: 'file' | 'directory';
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ name, type, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const { t } = useTranslation('common');
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-[#263240] rounded-lg shadow-xl p-6 max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <Trash2 className="w-5 h-5 text-red-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('files.deleteConfirmTitle')}</h3>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-200 mb-1">
          {t('files.deleteConfirmMessage', { name, type: t(type === 'directory' ? 'files.folder' : 'files.file') })}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-300 mb-6">
          {t('files.cannotUndo')}
        </p>
        <div className="flex justify-end gap-3">
          <button
            autoFocus
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-[#253040] rounded-lg hover:bg-gray-200 dark:hover:bg-[#2d3a4a]"
          >
            {t('button.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg"
          >
            {t('button.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- FileTree Component ---

interface FileTreeProps {
  projectSlug: string;
  basePath?: string;
  onFileSelect: (path: string) => void;
  showHidden?: boolean;
  enableContextMenu?: boolean;
  onNavigate?: (path: string) => void;
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

export function FileTree({
  projectSlug,
  basePath = '.',
  onFileSelect,
  showHidden = false,
  enableContextMenu = false,
  onNavigate,
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
}: FileTreeProps) {
  const { t } = useTranslation('common');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirCache, setDirCache] = useState<Map<string, DirectoryEntry[]>>(new Map());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [dirErrors, setDirErrors] = useState<Map<string, string>>(new Map());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineInput, setInlineInput] = useState<InlineInputState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);

  const openFilePath = useFileStore((state) => state.openFile?.path ?? null);

  const loadDirectory = useCallback(
    async (path: string) => {
      setLoadingDirs((prev) => new Set(prev).add(path));
      setDirErrors((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
      try {
        const response = await fileSystemApi.listDirectory(projectSlug, path);
        setDirCache((prev) => new Map(prev).set(path, response.entries));
      } catch (err) {
        setDirErrors((prev) => new Map(prev).set(path, (err as Error).message));
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }
    },
    [projectSlug],
  );

  useEffect(() => {
    loadDirectory(basePath);
  }, [basePath, loadDirectory]);

  // Reload all cached directories when refreshTrigger changes (e.g. after upload)
  useEffect(() => {
    if (refreshTrigger === undefined || refreshTrigger === 0) return;
    loadDirectory(basePath);
    expandedDirs.forEach((dir) => loadDirectory(dir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const toggleDir = useCallback(
    (path: string) => {
      const willExpand = !expandedDirs.has(path);
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
          if (!dirCache.has(path)) {
            loadDirectory(path);
          }
        }
        return next;
      });
      if (willExpand) {
        onNavigate?.(path);
      }
    },
    [dirCache, expandedDirs, loadDirectory, onNavigate],
  );

  const retryLoadDirectory = useCallback(
    (path: string) => {
      setDirErrors((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
      loadDirectory(path);
    },
    [loadDirectory],
  );

  // --- Context menu handlers ---

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, path: string, entryType: 'file' | 'directory') => {
      if (!enableContextMenu) return;
      e.preventDefault();
      e.stopPropagation();
      const parentPath = entryType === 'directory'
        ? path
        : path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '.';
      setContextMenu({ x: e.clientX, y: e.clientY, targetPath: path, targetType: entryType, parentPath });
    },
    [enableContextMenu],
  );

  const handleMenuButtonClick = useCallback(
    (e: React.MouseEvent, path: string, entryType: 'file' | 'directory') => {
      if (!enableContextMenu) return;
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const parentPath = entryType === 'directory'
        ? path
        : path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '.';
      setContextMenu({ x: rect.right, y: rect.bottom, targetPath: path, targetType: entryType, parentPath });
    },
    [enableContextMenu],
  );

  // --- Inline input handlers ---

  const handleNewEntry = useCallback((type: 'file' | 'directory') => {
    if (!contextMenu) return;
    const parentPath = contextMenu.parentPath;
    if (!expandedDirs.has(parentPath) && parentPath !== '.') {
      toggleDir(parentPath);
    }
    setInlineInput({ mode: 'create', parentPath, entryType: type, initialValue: '' });
    setContextMenu(null);
  }, [contextMenu, expandedDirs, toggleDir]);

  const handleStartRename = useCallback(() => {
    if (!contextMenu) return;
    const targetPath = contextMenu.targetPath;
    const name = targetPath.includes('/') ? targetPath.split('/').pop()! : targetPath;
    const parentPath = targetPath.includes('/')
      ? targetPath.substring(0, targetPath.lastIndexOf('/'))
      : '.';
    setInlineInput({ mode: 'rename', parentPath, targetPath, entryType: contextMenu.targetType, initialValue: name });
    setContextMenu(null);
  }, [contextMenu]);

  const handleInlineInputConfirm = useCallback(async (value: string) => {
    if (!inlineInput || !value.trim()) {
      setInlineInput(null);
      return;
    }
    try {
      if (inlineInput.mode === 'create') {
        await onCreateEntry?.(inlineInput.parentPath, inlineInput.entryType, value.trim());
        await loadDirectory(inlineInput.parentPath);
      } else if (inlineInput.mode === 'rename' && inlineInput.targetPath) {
        // Skip API call if name unchanged
        if (value.trim() !== inlineInput.initialValue) {
          await onRenameEntry?.(inlineInput.targetPath, value.trim());
          await loadDirectory(inlineInput.parentPath);
        }
      }
    } catch {
      // Error handling is done in parent via callback
    }
    setInlineInput(null);
  }, [inlineInput, onCreateEntry, onRenameEntry, loadDirectory]);

  const handleInlineInputCancel = useCallback(() => {
    setInlineInput(null);
  }, []);

  // --- Delete handlers ---

  const handleStartDelete = useCallback(() => {
    if (!contextMenu) return;
    const name = contextMenu.targetPath.includes('/')
      ? contextMenu.targetPath.split('/').pop()!
      : contextMenu.targetPath;
    setDeleteConfirm({ path: contextMenu.targetPath, name, type: contextMenu.targetType });
    setContextMenu(null);
  }, [contextMenu]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    try {
      await onDeleteEntry?.(deleteConfirm.path);
      const parentPath = deleteConfirm.path.includes('/')
        ? deleteConfirm.path.substring(0, deleteConfirm.path.lastIndexOf('/'))
        : '.';
      await loadDirectory(parentPath);
    } catch {
      // Error handling is done in parent via callback
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, onDeleteEntry, loadDirectory]);

  const flattenedVisibleItems = useMemo(
    () => buildFlatList(basePath, dirCache, expandedDirs, showHidden),
    [basePath, dirCache, expandedDirs, showHidden],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Skip tree navigation when inline input (rename/create) is active
      if (inlineInput) return;

      const items = flattenedVisibleItems;
      if (items.length === 0) return;

      const currentIndex = focusedPath ? items.indexOf(focusedPath) : -1;

      const findEntry = (path: string): DirectoryEntry | undefined => {
        const parts = path.split('/');
        const name = parts[parts.length - 1];
        const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : basePath;
        const parentEntries = dirCache.get(parentPath);
        return parentEntries?.find((e) => e.name === name);
      };

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          setFocusedPath(items[nextIndex]);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          setFocusedPath(items[prevIndex]);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          if (focusedPath) {
            const entry = findEntry(focusedPath);
            if (entry?.type === 'directory' && !expandedDirs.has(focusedPath)) {
              toggleDir(focusedPath);
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (focusedPath) {
            const entry = findEntry(focusedPath);
            if (entry?.type === 'directory' && expandedDirs.has(focusedPath)) {
              toggleDir(focusedPath);
            } else {
              const parts = focusedPath.split('/');
              if (parts.length > 1) {
                const parentPath = parts.slice(0, -1).join('/');
                setFocusedPath(parentPath);
              }
            }
          }
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (focusedPath) {
            const entry = findEntry(focusedPath);
            if (entry?.type === 'directory') {
              toggleDir(focusedPath);
            } else if (entry?.type === 'file') {
              onFileSelect(focusedPath);
            }
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          if (items.length > 0) setFocusedPath(items[0]);
          break;
        }
        case 'End': {
          e.preventDefault();
          if (items.length > 0) setFocusedPath(items[items.length - 1]);
          break;
        }
      }
    },
    [flattenedVisibleItems, focusedPath, basePath, dirCache, expandedDirs, toggleDir, onFileSelect, inlineInput],
  );

  const rootEntries = dirCache.get(basePath);

  const filteredRootEntries = useMemo(() => {
    if (!rootEntries) return [];
    const sorted = sortEntries(rootEntries);
    return showHidden ? sorted : sorted.filter((e) => !HIDDEN_PATTERNS.includes(e.name));
  }, [rootEntries, showHidden]);

  if (loadingDirs.has(basePath) && !rootEntries) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-gray-500 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t('loadingStatus')}</span>
      </div>
    );
  }

  if (dirErrors.has(basePath) && !rootEntries) {
    return (
      <div className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{dirErrors.get(basePath)}</span>
          <button
            className="text-xs text-blue-500 dark:text-blue-400 hover:underline cursor-pointer ml-2"
            onClick={() => retryLoadDirectory(basePath)}
          >
            {t('button.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="tree"
      aria-label={t('files.fileTree')}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="outline-none"
    >
      {/* Root-level inline input for create mode */}
      {inlineInput?.mode === 'create' && inlineInput.parentPath === basePath && (
        <InlineInput
          initialValue={inlineInput.initialValue}
          entryType={inlineInput.entryType}
          depth={0}
          onConfirm={handleInlineInputConfirm}
          onCancel={handleInlineInputCancel}
        />
      )}

      {filteredRootEntries.map((entry) => {
        const fullPath = basePath === '.' ? entry.name : `${basePath}/${entry.name}`;
        return (
          <FileTreeNode
            key={entry.name}
            entry={entry}
            path={fullPath}
            depth={0}
            projectSlug={projectSlug}
            expandedDirs={expandedDirs}
            dirCache={dirCache}
            loadingDirs={loadingDirs}
            dirErrors={dirErrors}
            showHidden={showHidden}
            currentOpenPath={openFilePath}
            focusedPath={focusedPath}
            onToggleDir={toggleDir}
            onFileSelect={onFileSelect}
            onRetryLoad={retryLoadDirectory}
            enableContextMenu={enableContextMenu}
            onContextMenu={handleContextMenu}
            onMenuButtonClick={handleMenuButtonClick}
            inlineInput={inlineInput}
            onInlineConfirm={handleInlineInputConfirm}
            onInlineCancel={handleInlineInputCancel}
            cutPath={cutPath}
          />
        );
      })}

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
            const pasteDir = contextMenu.targetType === 'directory' ? contextMenu.targetPath : contextMenu.parentPath;
            onPaste(pasteDir).then((result) => {
              if (result?.sourceDir) loadDirectory(result.sourceDir);
            }).catch(() => {}).finally(() => loadDirectory(pasteDir));
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

// --- FileTreeNode ---

interface FileTreeNodeProps {
  entry: DirectoryEntry;
  path: string;
  depth: number;
  projectSlug: string;
  expandedDirs: Set<string>;
  dirCache: Map<string, DirectoryEntry[]>;
  loadingDirs: Set<string>;
  dirErrors: Map<string, string>;
  showHidden: boolean;
  currentOpenPath: string | null;
  focusedPath: string | null;
  onToggleDir: (path: string) => void;
  onFileSelect: (path: string) => void;
  onRetryLoad: (path: string) => void;
  enableContextMenu: boolean;
  onContextMenu: (e: React.MouseEvent, path: string, type: 'file' | 'directory') => void;
  onMenuButtonClick: (e: React.MouseEvent, path: string, type: 'file' | 'directory') => void;
  inlineInput: InlineInputState | null;
  onInlineConfirm: (value: string) => void;
  onInlineCancel: () => void;
  cutPath?: string;
}

function FileTreeNode({
  entry,
  path,
  depth,
  projectSlug,
  expandedDirs,
  dirCache,
  loadingDirs,
  dirErrors,
  showHidden,
  currentOpenPath,
  focusedPath,
  onToggleDir,
  onFileSelect,
  onRetryLoad,
  enableContextMenu,
  onContextMenu,
  onMenuButtonClick,
  inlineInput,
  onInlineConfirm,
  onInlineCancel,
  cutPath,
}: FileTreeNodeProps) {
  const { t } = useTranslation('common');
  const isDirectory = entry.type === 'directory';
  const isExpanded = expandedDirs.has(path);
  const isLoading = loadingDirs.has(path);
  const error = dirErrors.get(path);
  const isCurrentOpen = currentOpenPath === path;
  const isFocused = focusedPath === path;
  const isRenaming = inlineInput?.mode === 'rename' && inlineInput.targetPath === path;

  const childEntries = dirCache.get(path);

  const filteredChildren = useMemo(() => {
    if (!childEntries) return [];
    const sorted = sortEntries(childEntries);
    return showHidden ? sorted : sorted.filter((e) => !HIDDEN_PATTERNS.includes(e.name));
  }, [childEntries, showHidden]);

  const handleClick = () => {
    if (isDirectory) {
      onToggleDir(path);
    } else {
      onFileSelect(path);
    }
  };

  const isCut = cutPath === path;
  const highlightClass = isCurrentOpen
    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
    : '';
  const focusClass = isFocused ? 'ring-2 ring-blue-500 ring-inset' : '';
  const cutClass = isCut ? 'opacity-50' : '';

  if (isRenaming) {
    return (
      <div>
        <InlineInput
          initialValue={inlineInput!.initialValue}
          entryType={inlineInput!.entryType}
          depth={depth}
          onConfirm={onInlineConfirm}
          onCancel={onInlineCancel}
        />
        {isDirectory && isExpanded && (
          <div role="group">
            {filteredChildren.map((child) => {
              const childPath = `${path}/${child.name}`;
              return (
                <FileTreeNode
                  key={child.name}
                  entry={child}
                  path={childPath}
                  depth={depth + 1}
                  projectSlug={projectSlug}
                  expandedDirs={expandedDirs}
                  dirCache={dirCache}
                  loadingDirs={loadingDirs}
                  dirErrors={dirErrors}
                  showHidden={showHidden}
                  currentOpenPath={currentOpenPath}
                  focusedPath={focusedPath}
                  onToggleDir={onToggleDir}
                  onFileSelect={onFileSelect}
                  onRetryLoad={onRetryLoad}
                  enableContextMenu={enableContextMenu}
                  onContextMenu={onContextMenu}
                  onMenuButtonClick={onMenuButtonClick}
                  inlineInput={inlineInput}
                  onInlineConfirm={onInlineConfirm}
                  onInlineCancel={onInlineCancel}
                  cutPath={cutPath}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={isDirectory ? isExpanded : undefined}
        aria-selected={!isDirectory ? isCurrentOpen : undefined}
        className={`group flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer select-none transition-colors hover:bg-gray-100 dark:hover:bg-[#253040]/50 ${highlightClass} ${focusClass} ${cutClass}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, path, entry.type)}
      >
        {isDirectory && (
          isLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin flex-shrink-0" />
          ) : (
            <ChevronRight
              className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            />
          )
        )}
        {!isDirectory && <span className="w-3.5 h-3.5 flex-shrink-0" />}

        {isDirectory ? (
          isExpanded ? (
            <FolderOpen className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
          )
        ) : (
          <File className="w-4 h-4 text-gray-500 dark:text-gray-300 flex-shrink-0" />
        )}

        <span
          className={`text-sm truncate ${isCurrentOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}
        >
          {entry.name}
        </span>

        {enableContextMenu && (
          <button
            className="ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-[#2d3a4a] transition-opacity"
            onClick={(e) => onMenuButtonClick(e, path, entry.type)}
            aria-label={t('files.moreMenu')}
          >
            <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>

      {isDirectory && isExpanded && (
        <div role="group">
          {error && (
            <div
              className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
              <button
                className="text-xs text-blue-500 dark:text-blue-400 hover:underline cursor-pointer ml-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetryLoad(path);
                }}
              >
                {t('button.retry')}
              </button>
            </div>
          )}

          {isLoading && !childEntries && (
            <div
              className="flex items-center gap-1.5 text-xs text-gray-400 py-1"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t('loadingStatus')}</span>
            </div>
          )}

          {childEntries && filteredChildren.length === 0 && !error && (
            <div
              className="text-xs text-gray-400 dark:text-gray-400 italic py-1"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              {t('files.emptyFolder')}
            </div>
          )}

          {/* Inline input for create mode at top of children */}
          {inlineInput?.mode === 'create' && inlineInput.parentPath === path && (
            <InlineInput
              initialValue={inlineInput.initialValue}
              entryType={inlineInput.entryType}
              depth={depth + 1}
              onConfirm={onInlineConfirm}
              onCancel={onInlineCancel}
            />
          )}

          {filteredChildren.map((child) => {
            const childPath = `${path}/${child.name}`;
            return (
              <FileTreeNode
                key={child.name}
                entry={child}
                path={childPath}
                depth={depth + 1}
                projectSlug={projectSlug}
                expandedDirs={expandedDirs}
                dirCache={dirCache}
                loadingDirs={loadingDirs}
                dirErrors={dirErrors}
                showHidden={showHidden}
                currentOpenPath={currentOpenPath}
                focusedPath={focusedPath}
                onToggleDir={onToggleDir}
                onFileSelect={onFileSelect}
                onRetryLoad={onRetryLoad}
                enableContextMenu={enableContextMenu}
                onContextMenu={onContextMenu}
                onMenuButtonClick={onMenuButtonClick}
                inlineInput={inlineInput}
                onInlineConfirm={onInlineConfirm}
                onInlineCancel={onInlineCancel}
                cutPath={cutPath}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
