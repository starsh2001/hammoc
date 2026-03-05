/**
 * QuickFileExplorer - Content-only panel for quick file browsing (rendered inside QuickPanel)
 * [Source: Story 14.1 - Task 1, Story 14.2 - Tasks 2-3, Story 19.1 - Task 5]
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Search, X, File, Folder, Loader2, Clock } from 'lucide-react';
import type { FileSearchResult } from '@bmad-studio/shared';

import { FileTree } from './FileTree.js';
import { useFileStore } from '../../stores/fileStore.js';
import { useImageViewerStore } from '../../stores/imageViewerStore.js';
import { fileSystemApi } from '../../services/api/fileSystem.js';
import { isImagePath } from '../../utils/languageDetect.js';

const EMPTY_RECENT_FILES: string[] = [];

interface QuickFileExplorerProps {
  projectSlug: string;
}

export function QuickFileExplorer({
  projectSlug,
}: QuickFileExplorerProps) {
  const { t } = useTranslation('common');
  const { sessionId } = useParams<{ sessionId: string }>();

  // Search state
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<FileSearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Recent files from store
  const recentFiles = useFileStore((state) => state.recentFiles[sessionId ?? ''] ?? EMPTY_RECENT_FILES);

  // Auto-focus search input on mount (mount = panel open)
  useEffect(() => {
    setSearchText('');
    setSearchResults(null);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  // Debounced search effect (300ms)
  useEffect(() => {
    if (!searchText.trim() || !projectSlug) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fileSystemApi.searchFiles(projectSlug, searchText.trim(), false);
        setSearchResults(response.results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchText, projectSlug]);

  const handleFileSelect = useCallback(
    (path: string) => {
      if (isImagePath(path)) {
        useImageViewerStore.getState().openImageViewer(projectSlug, path);
      } else {
        useFileStore.getState().requestFileNavigation(projectSlug, path);
      }
      if (sessionId) {
        useFileStore.getState().addRecentFile(sessionId, path);
      }
    },
    [projectSlug, sessionId]
  );

  const handleSearchResultClick = useCallback(
    (result: FileSearchResult) => {
      if (result.type === 'file') {
        if (isImagePath(result.path)) {
          useImageViewerStore.getState().openImageViewer(projectSlug, result.path);
        } else {
          useFileStore.getState().requestFileNavigation(projectSlug, result.path);
        }
        if (sessionId) {
          useFileStore.getState().addRecentFile(sessionId, result.path);
        }
      }
      setSearchText('');
    },
    [projectSlug, sessionId]
  );

  const isSearching = searchResults !== null || searchLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-gray-400" aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t('files.fileSearchPlaceholder')}
            className="w-full pl-9 pr-8 py-1.5 text-sm bg-gray-100 dark:bg-gray-800
                       dark:text-white border border-gray-200 dark:border-gray-700
                       rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500
                       dark:placeholder-gray-400"
          />
          {searchText && (
            <button
              onClick={() => setSearchText('')}
              className="absolute right-2 w-4 h-4 text-gray-400
                         hover:text-gray-600 cursor-pointer"
              aria-label={t('files.clearSearch')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          <div className="px-2">
            {searchLoading ? (
              <div className="flex items-center gap-2 px-2 py-4 text-sm text-gray-500 dark:text-gray-400 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('files.searching')}</span>
              </div>
            ) : searchResults && searchResults.length === 0 ? (
              <div className="px-2 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                {t('files.noResults')}
              </div>
            ) : (
              searchResults?.map((result) => {
                const isDir = result.type === 'directory';
                return (
                  <div
                    key={result.path}
                    role={isDir ? undefined : 'button'}
                    tabIndex={isDir ? undefined : 0}
                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left
                               transition-colors ${
                                 isDir
                                   ? 'opacity-50 cursor-default'
                                   : 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50'
                               }`}
                    onClick={() => !isDir && handleSearchResultClick(result)}
                    onKeyDown={(e) => {
                      if (!isDir && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        handleSearchResultClick(result);
                      }
                    }}
                  >
                    {isDir ? (
                      <Folder className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                    ) : (
                      <File className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <span className="text-sm text-gray-900 dark:text-white">{result.name}</span>
                      {result.path !== result.name && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 truncate block">
                          {result.path.substring(0, result.path.length - result.name.length - 1)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <>
            {/* Recent files section */}
            {recentFiles.length > 0 && (
              <div className="px-2 py-2 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium
                                text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('files.recentlyOpened')}
                </div>
                {recentFiles.map((filePath) => {
                  const fileName = filePath.includes('/') ? filePath.split('/').pop()! : filePath;
                  const dirPath = filePath.includes('/')
                    ? filePath.substring(0, filePath.lastIndexOf('/'))
                    : '';
                  return (
                    <button
                      key={filePath}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded cursor-pointer
                                 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/50 text-left"
                      onClick={() => handleFileSelect(filePath)}
                    >
                      <File className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <span className="text-sm text-gray-900 dark:text-white">{fileName}</span>
                        {dirPath && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 truncate block">
                            {dirPath}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* FileTree */}
            <FileTree
              projectSlug={projectSlug}
              basePath="."
              onFileSelect={handleFileSelect}
              showHidden={false}
              enableContextMenu={false}
            />
          </>
        )}
      </div>
    </div>
  );
}
