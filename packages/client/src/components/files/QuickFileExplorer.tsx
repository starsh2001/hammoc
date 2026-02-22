/**
 * QuickFileExplorer - Slide-over panel for quick file browsing from chat
 * [Source: Story 14.1 - Task 1, Story 14.2 - Tasks 2-3]
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, File, Folder, Loader2, Clock } from 'lucide-react';
import type { FileSearchResult } from '@bmad-studio/shared';

import { FileTree } from './FileTree.js';
import { useFileStore } from '../../stores/fileStore.js';
import { fileSystemApi } from '../../services/api/fileSystem.js';

interface QuickFileExplorerProps {
  isOpen: boolean;
  projectSlug: string;
  sessionId: string;
  onClose: () => void;
}

export function QuickFileExplorer({
  isOpen,
  projectSlug,
  sessionId,
  onClose,
}: QuickFileExplorerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Search state
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<FileSearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Recent files from store
  const recentFiles = useFileStore((state) => state.recentFiles[sessionId] ?? []);

  // Handle open/close with animation + focus save/restore
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setIsVisible(true);
      requestAnimationFrame(() => setIsAnimating(true));
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setIsVisible(false);
        previousFocusRef.current?.focus();
        previousFocusRef.current = null;
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Reset search and auto-focus search input when panel opens
  useEffect(() => {
    if (isOpen) {
      setSearchText('');
      setSearchResults(null);
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isOpen]);

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

  const handleTransitionEnd = useCallback(() => {
    if (!isOpen) setIsVisible(false);
  }, [isOpen]);

  // Focus trap and Escape key handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && panelRef.current) {
        const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleFileSelect = useCallback(
    (path: string) => {
      useFileStore.getState().requestFileNavigation(projectSlug, path);
      useFileStore.getState().addRecentFile(sessionId, path);
      onClose();
    },
    [projectSlug, sessionId, onClose]
  );

  const handleSearchResultClick = useCallback(
    (result: FileSearchResult) => {
      if (result.type === 'file') {
        useFileStore.getState().requestFileNavigation(projectSlug, result.path);
        useFileStore.getState().addRecentFile(sessionId, result.path);
        onClose();
      }
      setSearchText('');
    },
    [projectSlug, sessionId, onClose]
  );

  if (!isVisible) return null;

  const isSearching = searchResults !== null || searchLoading;

  return (
    <>
      {/* Backdrop overlay - desktop only */}
      <div
        data-testid="file-explorer-backdrop"
        className={`hidden md:block fixed inset-0 z-40 bg-black/30
                    transition-opacity duration-300 ease-in-out
                    ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        data-testid="quick-file-explorer-panel"
        role="dialog"
        aria-label="퀵 파일 탐색기"
        aria-modal="true"
        className={`fixed inset-0 z-50 bg-white dark:bg-gray-900
                    md:inset-auto md:top-0 md:right-0 md:bottom-0 md:w-80
                    md:bg-white md:dark:bg-gray-800
                    md:border-l md:border-gray-200 md:dark:border-gray-700 md:shadow-xl
                    md:transition-transform md:duration-300 md:ease-in-out
                    ${isAnimating ? 'md:translate-x-0' : 'md:translate-x-full'}
                    flex flex-col`}
        onTransitionEnd={handleTransitionEnd}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3
                        border-b border-gray-200 dark:border-gray-700"
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            파일 탐색기
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                       text-gray-700 dark:text-gray-300
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="닫기"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-gray-400" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="파일 검색..."
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
                aria-label="검색어 지우기"
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
                  <span>검색 중...</span>
                </div>
              ) : searchResults && searchResults.length === 0 ? (
                <div className="px-2 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  검색 결과가 없습니다.
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
                    최근 열기
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
    </>
  );
}
