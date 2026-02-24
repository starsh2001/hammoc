/**
 * FileExplorerTab - File explorer tab for project view
 * [Source: Story 13.2 - Task 2]
 * [Extended: Story 13.3 - Task 5 — CRUD callbacks and toast integration]
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronRight, Search, X, Eye, EyeOff, File, Folder, FolderRoot, Loader2, List, LayoutGrid } from 'lucide-react';

import type { FileSearchResult } from '@bmad-studio/shared';
import { useFileStore } from '../../stores/fileStore.js';
import { usePreferencesStore } from '../../stores/preferencesStore.js';

const HIDDEN_PATTERNS = ['.env', '.git', 'node_modules', '.next', '.cache', '__pycache__', '.DS_Store', 'dist', '.turbo'];
import { useToast } from '../../hooks/useToast.js';
import { ToastContainer } from '../common/Toast.js';
import { fileSystemApi } from '../../services/api/fileSystem.js';
import { FileTree } from './FileTree.js';
import { FileGridView } from './FileGridView.js';

const CRUD_ERROR_MESSAGES: Record<string, string> = {
  FILE_ALREADY_EXISTS: '파일 또는 디렉토리가 이미 존재합니다.',
  PARENT_NOT_FOUND: '상위 디렉토리가 존재하지 않습니다.',
  PROTECTED_PATH: '보호된 경로는 삭제할 수 없습니다.',
  RENAME_TARGET_EXISTS: '대상 경로에 파일이 이미 존재합니다.',
  PATH_TRAVERSAL: '프로젝트 루트 외부 경로에 접근할 수 없습니다.',
};

function getCrudErrorMessage(err: unknown, fallbackPrefix: string): string {
  const apiErr = err as { code?: string; message?: string };
  if (apiErr.code && CRUD_ERROR_MESSAGES[apiErr.code]) {
    return `${fallbackPrefix}: ${CRUD_ERROR_MESSAGES[apiErr.code]}`;
  }
  return `${fallbackPrefix}: ${(err as Error).message}`;
}

export function FileExplorerTab() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const [filterText, setFilterText] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const defaultViewMode = usePreferencesStore((s) => s.preferences.fileExplorerViewMode ?? 'grid');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(defaultViewMode);
  const [currentPath, setCurrentPath] = useState('.');
  const { toasts, showToast, removeToast } = useToast();

  // Server search state
  const [searchResults, setSearchResults] = useState<FileSearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Debounced server search
  useEffect(() => {
    if (!filterText.trim() || !projectSlug) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fileSystemApi.searchFiles(projectSlug, filterText.trim(), showHidden);
        const results = showHidden
          ? response.results
          : response.results.filter((r) => {
              const parts = r.path.split('/');
              return !parts.some((part) => HIDDEN_PATTERNS.includes(part));
            });
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [filterText, projectSlug, showHidden]);

  const handleFileSelect = useCallback(
    (path: string) => {
      useFileStore.getState().requestFileNavigation(projectSlug!, path);
    },
    [projectSlug],
  );

  const handleSearchResultClick = useCallback(
    (result: FileSearchResult) => {
      if (result.type === 'file') {
        useFileStore.getState().requestFileNavigation(projectSlug!, result.path);
      }
      setFilterText('');
    },
    [projectSlug],
  );

  const handleCreateEntry = useCallback(async (parentPath: string, type: 'file' | 'directory', name: string) => {
    try {
      const fullPath = parentPath === '.' ? name : `${parentPath}/${name}`;
      await fileSystemApi.createEntry(projectSlug!, fullPath, type);
      showToast({ message: type === 'directory' ? `'${name}' 폴더가 생성되었습니다.` : `'${name}' 파일이 생성되었습니다.`, type: 'success' });
    } catch (err) {
      showToast({ message: getCrudErrorMessage(err, '생성 실패'), type: 'error' });
      throw err;
    }
  }, [projectSlug, showToast]);

  const handleDeleteEntry = useCallback(async (path: string) => {
    try {
      const name = path.includes('/') ? path.split('/').pop()! : path;
      await fileSystemApi.deleteEntry(projectSlug!, path);
      showToast({ message: `'${name}'이(가) 삭제되었습니다.`, type: 'success' });
    } catch (err) {
      showToast({ message: getCrudErrorMessage(err, '삭제 실패'), type: 'error' });
      throw err;
    }
  }, [projectSlug, showToast]);

  const handleRenameEntry = useCallback(async (path: string, newName: string) => {
    try {
      const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '.';
      const newPath = parentPath === '.' ? newName : `${parentPath}/${newName}`;
      await fileSystemApi.renameEntry(projectSlug!, path, newPath);
      showToast({ message: `'${newName}'(으)로 이름이 변경되었습니다.`, type: 'success' });
    } catch (err) {
      showToast({ message: getCrudErrorMessage(err, '이름 변경 실패'), type: 'error' });
      throw err;
    }
  }, [projectSlug, showToast]);

  const segments = (() => {
    if (currentPath === '.') {
      return [{ name: 'Root', path: '.' }];
    }
    const parts = currentPath.split('/');
    const result = [{ name: 'Root', path: '.' }];
    for (let i = 0; i < parts.length; i++) {
      result.push({
        name: parts[i],
        path: parts.slice(0, i + 1).join('/'),
      });
    }
    return result;
  })();

  if (!projectSlug) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        프로젝트를 찾을 수 없습니다.
      </div>
    );
  }

  const isSearching = searchResults !== null || searchLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar — matches sessions / queue runner style */}
      <div className="sticky top-0 z-[5] bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 py-2 gap-3">
          {/* Breadcrumb — left side */}
          {!isSearching ? (
            <nav aria-label="Breadcrumb" className="flex-shrink min-w-0">
              <ol className="flex items-center gap-0.5 text-xs">
                {segments.map((seg, i) => (
                  <li key={seg.path} className="flex items-center gap-0.5 min-w-0">
                    {i > 0 && (
                      <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0" aria-hidden="true" />
                    )}
                    {i === segments.length - 1 ? (
                      <span className="inline-flex items-center gap-1 font-medium text-gray-800 dark:text-gray-200 truncate" aria-current="page">
                        {i === 0 && <FolderRoot className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />}
                        {seg.name}
                      </span>
                    ) : (
                      <button
                        onClick={() => setCurrentPath(seg.path)}
                        className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400
                          hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                      >
                        {i === 0 && <FolderRoot className="w-3.5 h-3.5 flex-shrink-0" />}
                        {seg.name}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          ) : (
            <div />
          )}

          {/* Actions — right side */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Search input */}
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="검색..."
                className="w-36 sm:w-44 pl-8 pr-7 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 dark:text-white
                  border border-gray-200 dark:border-gray-700 rounded-lg
                  focus:outline-none focus:ring-1 focus:ring-blue-500 focus:w-56
                  dark:placeholder-gray-400 transition-all"
              />
              {filterText && (
                <button
                  onClick={() => setFilterText('')}
                  className="absolute right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  aria-label="검색어 지우기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

            {/* Hidden files toggle */}
            <button
              onClick={() => setShowHidden((prev) => !prev)}
              title={showHidden ? '숨김 파일 숨기기' : '숨김 파일 표시'}
              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                showHidden
                  ? 'bg-blue-100 dark:bg-blue-600 text-blue-700 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              aria-label={showHidden ? '숨김 파일 숨기기' : '숨김 파일 표시'}
            >
              {showHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>

            {/* View mode toggle */}
            <button
              onClick={() => setViewMode((prev) => (prev === 'list' ? 'grid' : 'list'))}
              title={viewMode === 'list' ? '그리드 뷰' : '리스트 뷰'}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors
                text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              aria-label={viewMode === 'list' ? '그리드 뷰' : '리스트 뷰'}
            >
              {viewMode === 'list' ? <LayoutGrid className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Content: Search results or FileTree */}
      <div className="flex-1 overflow-auto min-h-0">
        {isSearching ? (
          <div className="px-2">
            {searchLoading ? (
              <div className="flex items-center gap-2 px-2 py-4 text-sm text-gray-500 dark:text-gray-400 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>검색 중...</span>
              </div>
            ) : searchResults && searchResults.length === 0 ? (
              <div className="px-2 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                검색 결과가 없습니다.
              </div>
            ) : (
              searchResults?.map((result) => (
                <button
                  key={result.path}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/50 text-left"
                  onClick={() => handleSearchResultClick(result)}
                >
                  {result.type === 'directory' ? (
                    <Folder className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                  ) : (
                    <File className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-gray-900 dark:text-white">{result.name}</span>
                    {result.path !== result.name && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 truncate">
                        {result.path.substring(0, result.path.length - result.name.length - 1)}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <FileGridView
            projectSlug={projectSlug}
            currentPath={currentPath}
            showHidden={showHidden}
            onFileSelect={handleFileSelect}
            onNavigate={setCurrentPath}
            enableContextMenu={true}
            onCreateEntry={handleCreateEntry}
            onDeleteEntry={handleDeleteEntry}
            onRenameEntry={handleRenameEntry}
          />
        ) : (
          <FileTree
            projectSlug={projectSlug}
            basePath="."
            onFileSelect={handleFileSelect}
            showHidden={showHidden}
            onNavigate={setCurrentPath}
            enableContextMenu={true}
            onCreateEntry={handleCreateEntry}
            onDeleteEntry={handleDeleteEntry}
            onRenameEntry={handleRenameEntry}
          />
        )}
      </div>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
