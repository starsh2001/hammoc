/**
 * FileTree - Recursive directory tree component with lazy loading
 * [Source: Story 13.1 - Task 2, 3]
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Folder,
  FolderOpen,
  File,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { DirectoryEntry } from '@bmad-studio/shared';

import { fileSystemApi } from '../../services/api/fileSystem.js';
import { useFileStore } from '../../stores/fileStore.js';

const HIDDEN_PATTERNS = ['.git', 'node_modules', '.next', '.cache', '__pycache__', '.DS_Store', '.env'];

function sortEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
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

interface FileTreeProps {
  projectSlug: string;
  basePath?: string;
  onFileSelect: (path: string) => void;
  showHidden?: boolean;
  enableContextMenu?: boolean;
}

export function FileTree({
  projectSlug,
  basePath = '.',
  onFileSelect,
  showHidden = false,
  enableContextMenu: _enableContextMenu = false,
}: FileTreeProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirCache, setDirCache] = useState<Map<string, DirectoryEntry[]>>(new Map());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [dirErrors, setDirErrors] = useState<Map<string, string>>(new Map());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

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

  const toggleDir = useCallback(
    (path: string) => {
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
    },
    [dirCache, loadDirectory],
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

  const flattenedVisibleItems = useMemo(
    () => buildFlatList(basePath, dirCache, expandedDirs, showHidden),
    [basePath, dirCache, expandedDirs, showHidden],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
    [flattenedVisibleItems, focusedPath, basePath, dirCache, expandedDirs, toggleDir, onFileSelect],
  );

  const rootEntries = dirCache.get(basePath);

  const filteredRootEntries = useMemo(() => {
    if (!rootEntries) return [];
    const sorted = sortEntries(rootEntries);
    return showHidden ? sorted : sorted.filter((e) => !HIDDEN_PATTERNS.includes(e.name));
  }, [rootEntries, showHidden]);

  if (loadingDirs.has(basePath) && !rootEntries) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading...</span>
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
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="tree"
      aria-label="File tree"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="outline-none"
    >
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
          />
        );
      })}
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
}: FileTreeNodeProps) {
  const isDirectory = entry.type === 'directory';
  const isExpanded = expandedDirs.has(path);
  const isLoading = loadingDirs.has(path);
  const error = dirErrors.get(path);
  const isCurrentOpen = currentOpenPath === path;
  const isFocused = focusedPath === path;

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

  const highlightClass = isCurrentOpen
    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
    : '';
  const focusClass = isFocused ? 'ring-2 ring-blue-500 ring-inset' : '';

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={isDirectory ? isExpanded : undefined}
        aria-selected={!isDirectory ? isCurrentOpen : undefined}
        className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/50 ${highlightClass} ${focusClass}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {isDirectory && (
          isLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin flex-shrink-0" />
          ) : (
            <ChevronRight
              className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
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
          <File className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
        )}

        <span
          className={`text-sm truncate ${isCurrentOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}
        >
          {entry.name}
        </span>
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
                Retry
              </button>
            </div>
          )}

          {isLoading && !childEntries && (
            <div
              className="flex items-center gap-1.5 text-xs text-gray-400 py-1"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Loading...</span>
            </div>
          )}

          {childEntries && filteredChildren.length === 0 && !error && (
            <div
              className="text-xs text-gray-400 dark:text-gray-500 italic py-1"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              Empty folder
            </div>
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
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
