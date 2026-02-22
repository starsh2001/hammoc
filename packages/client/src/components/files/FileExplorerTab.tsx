/**
 * FileExplorerTab - File explorer tab for project view
 * [Source: Story 13.2 - Task 2]
 * [Extended: Story 13.3 - Task 5 — CRUD callbacks and toast integration]
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronRight, Search, X, Eye, EyeOff, File, Folder, Loader2 } from 'lucide-react';

import type { FileSearchResult } from '@bmad-studio/shared';
import { useFileStore } from '../../stores/fileStore.js';

const HIDDEN_PATTERNS = ['.env', '.git', 'node_modules', '.next', '.cache', '__pycache__', '.DS_Store', 'dist', '.turbo'];
import { useToast } from '../../hooks/useToast.js';
import { ToastContainer } from '../common/Toast.js';
import { fileSystemApi } from '../../services/api/fileSystem.js';
import { FileTree } from './FileTree.js';

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
      {/* Breadcrumb */}
      {!isSearching && (
        <nav aria-label="Breadcrumb" className="flex-shrink-0 px-4 py-2">
          <ol className="flex items-center gap-1 text-sm">
            {segments.map((seg, i) => (
              <li key={seg.path} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                )}
                {i === segments.length - 1 ? (
                  <span className="font-medium text-gray-900 dark:text-white" aria-current="page">
                    {seg.name}
                  </span>
                ) : (
                  <button
                    onClick={() => setCurrentPath(seg.path)}
                    className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                  >
                    {seg.name}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* Toolbar */}
      <div className="flex-shrink-0 px-4 py-2 flex items-center gap-2">
        {/* Search input */}
        <div className="relative flex items-center flex-1">
          <Search className="absolute left-3 w-4 h-4 text-gray-400" aria-hidden="true" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="파일 검색..."
            className="w-full pl-9 pr-8 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 dark:text-white border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:placeholder-white"
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              className="absolute right-2 w-4 h-4 text-gray-400 hover:text-gray-600 cursor-pointer"
              aria-label="검색어 지우기"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Hidden files toggle */}
        <button
          onClick={() => setShowHidden((prev) => !prev)}
          className={`p-1.5 rounded-lg transition-colors ${
            showHidden
              ? 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          aria-label={showHidden ? '숨김 파일 숨기기' : '숨김 파일 표시'}
        >
          {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
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
