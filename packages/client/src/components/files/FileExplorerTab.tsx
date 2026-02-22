/**
 * FileExplorerTab - File explorer tab for project view
 * [Source: Story 13.2 - Task 2]
 */

import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronRight, Search, X, Eye, EyeOff } from 'lucide-react';

import { useFileStore } from '../../stores/fileStore.js';
import { FileTree } from './FileTree.js';

export function FileExplorerTab() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const [filterText, setFilterText] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [currentPath, setCurrentPath] = useState('.');

  const handleFileSelect = useCallback(
    (path: string) => {
      useFileStore.getState().requestFileNavigation(projectSlug!, path);
    },
    [projectSlug],
  );

  const segments = useMemo(() => {
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
  }, [currentPath]);

  if (!projectSlug) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        프로젝트를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
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
            className="w-full pl-9 pr-8 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {/* FileTree */}
      <div className="flex-1 overflow-auto min-h-0">
        <FileTree
          projectSlug={projectSlug}
          basePath="."
          onFileSelect={handleFileSelect}
          showHidden={showHidden}
          filterText={filterText}
          onNavigate={setCurrentPath}
        />
      </div>
    </div>
  );
}
