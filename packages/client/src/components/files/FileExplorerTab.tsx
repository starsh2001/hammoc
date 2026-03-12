/**
 * FileExplorerTab - File explorer tab for project view
 * [Source: Story 13.2 - Task 2]
 * [Extended: Story 13.3 - Task 5 — CRUD callbacks and toast integration]
 * [Extended: Copy/Cut/Paste, Download, Upload support]
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ChevronRight, Search, X, Eye, EyeOff, File, Folder, FolderRoot, Loader2, List, LayoutGrid, Upload } from 'lucide-react';

import type { FileSearchResult } from '@hammoc/shared';
import { useFileStore } from '../../stores/fileStore.js';
import { useImageViewerStore } from '../../stores/imageViewerStore.js';
import { usePreferencesStore } from '../../stores/preferencesStore.js';
import { isImagePath } from '../../utils/languageDetect.js';

const HIDDEN_PATTERNS = ['.env', '.git', 'node_modules', '.next', '.cache', '__pycache__', '.DS_Store', 'dist', '.turbo'];
import { useToast } from '../../hooks/useToast.js';
import { ToastContainer } from '../common/Toast.js';
import { fileSystemApi } from '../../services/api/fileSystem.js';
import { FileTree } from './FileTree.js';
import { FileGridView } from './FileGridView.js';

interface ClipboardState {
  path: string;
  operation: 'copy' | 'cut';
}

export function FileExplorerTab() {
  const { t } = useTranslation('common');
  const { projectSlug } = useParams<{ projectSlug: string }>();

  const CRUD_ERROR_I18N_KEYS: Record<string, string> = {
    FILE_ALREADY_EXISTS: 'files.crudErrors.alreadyExists',
    PARENT_NOT_FOUND: 'files.crudErrors.parentNotFound',
    PROTECTED_PATH: 'files.crudErrors.protectedPath',
    RENAME_TARGET_EXISTS: 'files.crudErrors.targetExists',
    COPY_TARGET_EXISTS: 'files.crudErrors.targetExists',
    PATH_TRAVERSAL: 'files.crudErrors.outsideRoot',
  };

  const getCrudErrorMessage = useCallback((err: unknown, fallbackPrefix: string): string => {
    const apiErr = err as { code?: string; message?: string };
    if (apiErr.code && CRUD_ERROR_I18N_KEYS[apiErr.code]) {
      return `${fallbackPrefix}: ${t(CRUD_ERROR_I18N_KEYS[apiErr.code])}`;
    }
    return `${fallbackPrefix}: ${(err as Error).message}`;
  }, [t]);
  const [filterText, setFilterText] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const defaultViewMode = usePreferencesStore((s) => s.preferences.fileExplorerViewMode ?? 'grid');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(defaultViewMode);
  const [currentPath, setCurrentPath] = useState('.');
  const { toasts, showToast, removeToast } = useToast();

  // Clipboard state for copy/cut/paste
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Refresh key to force child component remount after upload
  const [refreshKey, setRefreshKey] = useState(0);

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
      if (isImagePath(path)) {
        useImageViewerStore.getState().openImageViewer(projectSlug!, path);
      } else {
        useFileStore.getState().requestFileNavigation(projectSlug!, path);
      }
    },
    [projectSlug],
  );

  const handleSearchResultClick = useCallback(
    (result: FileSearchResult) => {
      if (result.type === 'file') {
        if (isImagePath(result.path)) {
          useImageViewerStore.getState().openImageViewer(projectSlug!, result.path);
        } else {
          useFileStore.getState().requestFileNavigation(projectSlug!, result.path);
        }
      }
      setFilterText('');
    },
    [projectSlug],
  );

  const handleCreateEntry = useCallback(async (parentPath: string, type: 'file' | 'directory', name: string) => {
    try {
      const fullPath = parentPath === '.' ? name : `${parentPath}/${name}`;
      await fileSystemApi.createEntry(projectSlug!, fullPath, type);
      showToast({ message: type === 'directory' ? t('files.toast.folderCreated', { name }) : t('files.toast.fileCreated', { name }), type: 'success' });
    } catch (err) {
      showToast({ message: getCrudErrorMessage(err, t('files.toast.createFailed')), type: 'error' });
      throw err;
    }
  }, [projectSlug, showToast]);

  const handleDeleteEntry = useCallback(async (path: string) => {
    try {
      const name = path.includes('/') ? path.split('/').pop()! : path;
      await fileSystemApi.deleteEntry(projectSlug!, path);
      showToast({ message: t('files.toast.deleted', { name }), type: 'success' });
    } catch (err) {
      showToast({ message: getCrudErrorMessage(err, t('files.toast.deleteFailed')), type: 'error' });
      throw err;
    }
  }, [projectSlug, showToast]);

  const handleRenameEntry = useCallback(async (path: string, newName: string) => {
    try {
      const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '.';
      const newPath = parentPath === '.' ? newName : `${parentPath}/${newName}`;
      await fileSystemApi.renameEntry(projectSlug!, path, newPath);
      showToast({ message: t('files.toast.renamed', { name: newName }), type: 'success' });
    } catch (err) {
      showToast({ message: getCrudErrorMessage(err, t('files.toast.renameFailed')), type: 'error' });
      throw err;
    }
  }, [projectSlug, showToast]);

  // --- Copy / Cut / Paste handlers ---

  const handleCopy = useCallback((path: string) => {
    setClipboard({ path, operation: 'copy' });
    const name = path.includes('/') ? path.split('/').pop()! : path;
    showToast({ message: t('files.toast.copied', { name }), type: 'success' });
  }, [showToast, t]);

  const handleCut = useCallback((path: string) => {
    setClipboard({ path, operation: 'cut' });
    const name = path.includes('/') ? path.split('/').pop()! : path;
    showToast({ message: t('files.toast.cut', { name }), type: 'success' });
  }, [showToast, t]);

  const handlePaste = useCallback(async (targetDir: string): Promise<{ sourceDir?: string }> => {
    if (!clipboard || !projectSlug) return {};
    const sourceName = clipboard.path.includes('/') ? clipboard.path.split('/').pop()! : clipboard.path;
    const sourceParent = clipboard.path.includes('/')
      ? clipboard.path.substring(0, clipboard.path.lastIndexOf('/'))
      : '.';

    // Skip if cutting to the same directory
    if (clipboard.operation === 'cut' && sourceParent === targetDir) return {};

    // Auto-generate unique name when copying to the same directory
    let destName = sourceName;
    if (clipboard.operation === 'copy' && sourceParent === targetDir) {
      // Handle compound extensions like .tar.gz, .tar.bz2, etc.
      const compoundExtMatch = sourceName.match(/^(.+?)(\.tar\.\w+)$/);
      let baseName: string;
      let ext: string;
      if (compoundExtMatch) {
        baseName = compoundExtMatch[1];
        ext = compoundExtMatch[2];
      } else {
        const dotIdx = sourceName.lastIndexOf('.');
        baseName = dotIdx > 0 ? sourceName.substring(0, dotIdx) : sourceName;
        ext = dotIdx > 0 ? sourceName.substring(dotIdx) : '';
      }

      // Find a unique name by checking existing entries
      const listing = await fileSystemApi.listDirectory(projectSlug, targetDir);
      const existingNames = new Set(listing.entries.map(e => e.name));
      destName = `${baseName} - Copy${ext}`;
      let counter = 2;
      while (existingNames.has(destName)) {
        destName = `${baseName} - Copy (${counter})${ext}`;
        counter++;
      }
    }

    const destinationPath = targetDir === '.' ? destName : `${targetDir}/${destName}`;
    const isCut = clipboard.operation === 'cut';

    try {
      if (!isCut) {
        await fileSystemApi.copyEntry(projectSlug, clipboard.path, destinationPath);
        showToast({ message: t('files.toast.pasted', { name: destName }), type: 'success' });
      } else {
        // Cut = move (rename to new location)
        await fileSystemApi.renameEntry(projectSlug, clipboard.path, destinationPath);
        showToast({ message: t('files.toast.moved', { name: destName }), type: 'success' });
        setClipboard(null);
      }
      return isCut && sourceParent !== targetDir ? { sourceDir: sourceParent } : {};
    } catch (err) {
      showToast({ message: getCrudErrorMessage(err, t('files.toast.pasteFailed')), type: 'error' });
      throw err;
    }
  }, [clipboard, projectSlug, showToast, t]);

  // --- Download handler ---

  const handleDownload = useCallback(async (path: string) => {
    if (!projectSlug) return;
    try {
      const url = fileSystemApi.getDownloadUrl(projectSlug, path);
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = path.includes('/') ? path.split('/').pop()! : path;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      showToast({ message: t('files.toast.downloadFailed'), type: 'error' });
    }
  }, [projectSlug, showToast, t]);

  // --- Upload handler ---

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !projectSlug) return;

    setIsUploading(true);
    try {
      const result = await fileSystemApi.uploadFiles(projectSlug, currentPath, Array.from(files));
      const count = result.files.length;
      showToast({
        message: count === 1
          ? t('files.toast.uploaded', { name: result.files[0].path.split('/').pop()! })
          : t('files.toast.uploadedMultiple', { count }),
        type: 'success',
      });
      // Force child components to refresh directory listing
      setRefreshKey((k) => k + 1);
    } catch (err) {
      showToast({ message: getCrudErrorMessage(err, t('files.toast.uploadFailed')), type: 'error' });
    } finally {
      setIsUploading(false);
      // Reset file input so the same file can be uploaded again
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [projectSlug, currentPath, showToast, t]);

  const segments = (() => {
    if (currentPath === '.') {
      return [{ name: t('files.root'), path: '.' }];
    }
    const parts = currentPath.split('/');
    const result = [{ name: t('files.root'), path: '.' }];
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
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-300">
        {t('files.projectNotFound')}
      </div>
    );
  }

  const isSearching = searchResults !== null || searchLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Toolbar — matches sessions / queue runner style */}
      <div className="sticky top-0 z-[5] bg-white dark:bg-[#1c2129] border-b border-gray-200 dark:border-[#253040]">
        <div className="flex items-center justify-between px-4 py-2 gap-3">
          {/* Breadcrumb — left side */}
          {!isSearching ? (
            <nav aria-label={t('files.breadcrumb')} className="flex-shrink min-w-0">
              <ol className="flex items-center gap-0.5 text-xs">
                {segments.map((seg, i) => (
                  <li key={seg.path} className="flex items-center gap-0.5 min-w-0">
                    {i > 0 && (
                      <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0" aria-hidden="true" />
                    )}
                    {i === segments.length - 1 ? (
                      <span className="inline-flex items-center gap-1 font-medium text-gray-800 dark:text-gray-200 truncate" aria-current="page">
                        {i === 0 && <FolderRoot className="w-3.5 h-3.5 text-gray-400 dark:text-gray-400 flex-shrink-0" />}
                        {seg.name}
                      </span>
                    ) : (
                      <button
                        onClick={() => setCurrentPath(seg.path)}
                        className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-300
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
                placeholder={t('files.searchPlaceholder')}
                className="w-36 sm:w-44 pl-8 pr-7 py-1.5 text-xs bg-gray-100 dark:bg-[#263240] dark:text-white
                  border border-gray-200 dark:border-[#253040] rounded-lg
                  focus:outline-none focus:ring-1 focus:ring-blue-500 focus:w-56
                  dark:placeholder-gray-400 transition-all"
              />
              {filterText && (
                <button
                  onClick={() => setFilterText('')}
                  className="absolute right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  aria-label={t('files.clearSearch')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="w-px h-5 bg-gray-200 dark:bg-[#253040] mx-1" />

            {/* Upload button */}
            <button
              onClick={handleUploadClick}
              disabled={isUploading}
              title={t('files.upload')}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors
                text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#253040] disabled:opacity-50"
              aria-label={t('files.upload')}
            >
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            </button>

            {/* Hidden files toggle */}
            <button
              onClick={() => setShowHidden((prev) => !prev)}
              title={showHidden ? t('files.hideHidden') : t('files.showHidden')}
              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                showHidden
                  ? 'bg-blue-100 dark:bg-blue-600 text-blue-700 dark:text-white'
                  : 'text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#253040]'
              }`}
              aria-label={showHidden ? t('files.hideHidden') : t('files.showHidden')}
            >
              {showHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>

            {/* View mode toggle */}
            <button
              onClick={() => setViewMode((prev) => (prev === 'list' ? 'grid' : 'list'))}
              title={viewMode === 'list' ? t('files.gridView') : t('files.listView')}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors
                text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#253040]"
              aria-label={viewMode === 'list' ? t('files.gridView') : t('files.listView')}
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
              <div className="flex items-center gap-2 px-2 py-4 text-sm text-gray-500 dark:text-gray-300 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('files.searching')}</span>
              </div>
            ) : searchResults && searchResults.length === 0 ? (
              <div className="px-2 py-4 text-sm text-gray-500 dark:text-gray-300 text-center">
                {t('files.noResults')}
              </div>
            ) : (
              searchResults?.map((result) => (
                <button
                  key={result.path}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-[#253040]/50 text-left"
                  onClick={() => handleSearchResultClick(result)}
                >
                  {result.type === 'directory' ? (
                    <Folder className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                  ) : (
                    <File className="w-4 h-4 text-gray-500 dark:text-gray-300 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-gray-900 dark:text-white">{result.name}</span>
                    {result.path !== result.name && (
                      <span className="text-xs text-gray-400 dark:text-gray-400 ml-2 truncate">
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
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onDownload={handleDownload}
            hasClipboard={clipboard !== null}
            cutPath={clipboard?.operation === 'cut' ? clipboard.path : undefined}
            refreshTrigger={refreshKey}
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
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onDownload={handleDownload}
            hasClipboard={clipboard !== null}
            cutPath={clipboard?.operation === 'cut' ? clipboard.path : undefined}
            refreshTrigger={refreshKey}
          />
        )}
      </div>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
