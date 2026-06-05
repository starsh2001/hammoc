/**
 * DirectoryBrowserDialog - Modal that lets the user pick a host directory visually
 * (Epic 34, Story 34.2).
 *
 * Chrome (breadcrumb + "My PC" → drive-roots switch + toolbar + "Select path" +
 * mobile bottom-sheet) lives here; the actual tree lives in DirectoryPickerTree.
 * It is a *secondary* input for NewProjectDialog's path field — it never replaces
 * typing and never registers a project itself; it just hands an absolute path back
 * via onSelect.
 *
 * Open sequence (the documented 2-call flow that realizes AC2 "start expanded at
 * home"): the dialog calls browse() once to learn os.homedir() (the no-arg call
 * returns drive roots + the home field), then sets currentPath=home so the tree
 * loads home's children. The view is fully determined by currentPath alone
 * (null = drive-roots / "My PC"; a string = that directory).
 *
 * Light local state only — no Zustand store, no path history/cache/favorites
 * (out of scope, AC9). State resets every open.
 * [Source: docs/stories/34.2.story.md#Task 3; docs/stories/34.1.story.md#API 계약 상세]
 */

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FolderTree, FolderPlus, Pencil, ChevronRight, Loader2, AlertCircle } from 'lucide-react';

import { systemBrowseApi } from '../../services/api/systemBrowse.js';
import {
  DirectoryPickerTree,
  type DirectoryPickerTreeHandle,
} from './DirectoryPickerTree.js';

interface DirectoryBrowserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Confirmed absolute path (fired by "Select path"). */
  onSelect: (absolutePath: string) => void;
}

interface Crumb {
  label: string;
  path: string;
}

/**
 * Decompose an absolute path into clickable breadcrumb segments. The separator is
 * inferred from the path itself (Windows drive letter / backslash → '\', else
 * POSIX '/') so this stays correct cross-platform without a platform flag.
 */
function buildBreadcrumb(abs: string): Crumb[] {
  const isWindows = /^[A-Za-z]:/.test(abs) || abs.includes('\\');
  if (isWindows) {
    const parts = abs.split('\\').filter(Boolean); // ['C:', 'Users', 'me']
    const crumbs: Crumb[] = [];
    let acc = '';
    parts.forEach((part, i) => {
      acc = i === 0 ? `${part}\\` : `${acc}${acc.endsWith('\\') ? '' : '\\'}${part}`;
      crumbs.push({ label: part, path: acc });
    });
    return crumbs;
  }
  const parts = abs.split('/').filter(Boolean); // ['home', 'me']
  const crumbs: Crumb[] = [{ label: '/', path: '/' }];
  let acc = '';
  parts.forEach((part) => {
    acc = `${acc}/${part}`;
    crumbs.push({ label: part, path: acc });
  });
  return crumbs;
}

export function DirectoryBrowserDialog({ isOpen, onClose, onSelect }: DirectoryBrowserDialogProps) {
  const { t } = useTranslation('common');
  // currentPath: null = drive-roots ("My PC") view; a string = that directory.
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const treeRef = useRef<DirectoryPickerTreeHandle>(null);

  // Open sequence: learn home via a one-off browse(), then start expanded at home.
  const initialize = useCallback(async () => {
    setInitializing(true);
    setInitError(null);
    setSelectedPath(null);
    try {
      const res = await systemBrowseApi.browse();
      setCurrentPath(res.home); // start expanded at home (AC2)
    } catch (err) {
      setInitError(err instanceof Error ? err.message : String(err));
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setInitializing(true);
      setInitError(null);
      setSelectedPath(null);
      try {
        const res = await systemBrowseApi.browse();
        if (!cancelled) setCurrentPath(res.home);
      } catch (err) {
        if (!cancelled) setInitError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Navigating to a different root drops the previous selection.
  useEffect(() => {
    setSelectedPath(null);
  }, [currentPath]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Consume Esc/Enter so the parent NewProjectDialog neither closes nor submits
      // while this nested modal is open (nested-modal key isolation).
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.stopPropagation();
      }
    },
    [onClose],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleConfirmSelection = useCallback(() => {
    const chosen = selectedPath ?? currentPath;
    if (!chosen) return; // drive-roots view with nothing selected
    onSelect(chosen);
    onClose();
  }, [selectedPath, currentPath, onSelect, onClose]);

  if (!isOpen) return null;

  const isDriveRootsView = currentPath === null;
  const crumbs = currentPath ? buildBreadcrumb(currentPath) : [];
  const effectivePath = selectedPath ?? currentPath ?? '';
  // mkdir is impossible at the drive-roots level itself; allowed once a drive/dir is in play.
  const newFolderDisabled = isDriveRootsView && !selectedPath;
  const renameDisabled = !selectedPath;
  const selectDisabled = !effectivePath;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="directory-browser-title"
    >
      <div
        className="w-full bg-white dark:bg-[#263240] shadow-xl flex flex-col
                   rounded-t-2xl max-h-[90vh]
                   sm:rounded-lg sm:max-w-lg sm:mx-4
                   animate-slide-up sm:animate-none"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-300 dark:border-[#3a4d5e] flex-shrink-0">
          <h2
            id="directory-browser-title"
            className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <FolderTree className="w-5 h-5" aria-hidden="true" />
            {t('directoryBrowser.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-[#253040] rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label={t('directoryBrowser.closeAria')}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Breadcrumb + toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-[#3a4d5e] flex-shrink-0">
          <nav
            aria-label={t('directoryBrowser.breadcrumbAria')}
            className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0 text-sm"
          >
            <button
              onClick={() => setCurrentPath(null)}
              className={`px-1.5 py-0.5 rounded whitespace-nowrap hover:bg-gray-100 dark:hover:bg-[#253040] ${
                isDriveRootsView
                  ? 'font-semibold text-gray-900 dark:text-white'
                  : 'text-blue-600 dark:text-blue-400'
              }`}
            >
              {t('directoryBrowser.myPc')}
            </button>
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <Fragment key={crumb.path}>
                  <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" aria-hidden="true" />
                  <button
                    onClick={() => setCurrentPath(crumb.path)}
                    className={`px-1.5 py-0.5 rounded whitespace-nowrap hover:bg-gray-100 dark:hover:bg-[#253040] ${
                      isLast
                        ? 'font-semibold text-gray-900 dark:text-white'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {crumb.label}
                  </button>
                </Fragment>
              );
            })}
          </nav>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => treeRef.current?.beginCreate()}
              disabled={newFolderDisabled}
              className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040] rounded-lg disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
              title={t('directoryBrowser.newFolder')}
            >
              <FolderPlus className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('directoryBrowser.newFolder')}</span>
            </button>
            <button
              onClick={() => treeRef.current?.beginRename()}
              disabled={renameDisabled}
              className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040] rounded-lg disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
              title={t('directoryBrowser.rename')}
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('directoryBrowser.rename')}</span>
            </button>
          </div>
        </div>

        {/* Tree area (scrollable) */}
        <div className="flex-1 overflow-y-auto min-h-[240px] py-1">
          {initializing ? (
            <div className="flex items-center gap-2 p-4 text-sm text-gray-500 dark:text-gray-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('directoryBrowser.loading')}</span>
            </div>
          ) : initError ? (
            <div className="p-4">
              <div className="flex items-center gap-1.5 text-sm text-red-500 dark:text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{initError || t('directoryBrowser.loadError')}</span>
                <button
                  className="text-sm text-blue-500 dark:text-blue-400 hover:underline cursor-pointer ml-2"
                  onClick={initialize}
                >
                  {t('button.retry')}
                </button>
              </div>
            </div>
          ) : (
            <DirectoryPickerTree
              ref={treeRef}
              rootPath={currentPath}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            />
          )}
        </div>

        {/* Footer: selected-path preview + actions */}
        <div className="flex flex-col gap-2 p-4 border-t border-gray-300 dark:border-[#3a4d5e] flex-shrink-0">
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            <span className="font-medium">{t('directoryBrowser.selectedLabel')}</span>{' '}
            <span className="font-mono text-gray-700 dark:text-gray-200">
              {effectivePath || '—'}
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040] rounded-lg min-h-[44px] min-w-[80px]"
            >
              {t('button.cancel')}
            </button>
            <button
              onClick={handleConfirmSelection}
              disabled={selectDisabled}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700
                         disabled:opacity-50 disabled:cursor-not-allowed
                         min-h-[44px] min-w-[80px]"
            >
              {t('directoryBrowser.selectPath')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
