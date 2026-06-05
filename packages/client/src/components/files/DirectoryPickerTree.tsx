/**
 * DirectoryPickerTree - Folder-only, lazy-loading tree for the directory browser
 * (Epic 34, Story 34.2).
 *
 * This is NOT FileTree. FileTree is coupled to fileSystemApi + fileStore + project
 * RELATIVE paths + file entries, none of which fit a pre-project, ABSOLUTE-path,
 * folder-only picker. So we reuse only FileTree's *visual tokens* (icons/colors/
 * indent/hover/chevron — AC5) and its exported `InlineInput` (new folder / rename —
 * AC6), and write the tree logic fresh against systemBrowseApi.
 *
 * Surface = select + expand + new-folder + rename ONLY. There is intentionally no
 * delete (no context menu, no delete handler, no FileTreeContextMenu/DeleteConfirm
 * import) — the server exposes no delete route either.
 *
 * The component fetches the root level itself. The dialog drives the breadcrumb
 * purely from the rootPath it passes in (null = drive-roots view), so no metadata
 * callback is needed. New-folder / rename are triggered from the dialog toolbar
 * through the imperative handle.
 * [Source: docs/stories/34.2.story.md#Task 2; packages/client/src/components/files/FileTree.tsx]
 */

import {
  forwardRef,
  useImperativeHandle,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, FolderOpen, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import type { BrowseEntry } from '@hammoc/shared';

import { systemBrowseApi } from '../../services/api/systemBrowse.js';
import { InlineInput } from './FileTree.js';

/** Cache/expansion key for the drive-roots (null rootPath) view. Real absolute paths are never empty. */
const DRIVE_ROOTS_KEY = '';

/** basename of an absolute path, cross-platform (handles both `/` and `\`). */
function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

/** Parent directory of an absolute path, cross-platform. Drive/POSIX roots map to themselves. */
function parentDir(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  if (idx < 0) return p;
  const head = p.slice(0, idx);
  if (head === '') return '/'; // POSIX root: dirname('/home') -> '/'
  if (/^[A-Za-z]:$/.test(head)) return `${head}\\`; // Windows drive root: dirname('C:\\Users') -> 'C:\\'
  return head;
}

export interface DirectoryPickerTreeHandle {
  /** Begin an inline "new folder" input under the selected dir (or the root). No-op in drive-roots view with no selection. */
  beginCreate: () => void;
  /** Begin an inline "rename" input on the selected node. No-op when nothing is selected. */
  beginRename: () => void;
}

interface InlineState {
  mode: 'create' | 'rename';
  /** Absolute parent: the dir to create under, or dirname(target) for rename (used for reload). */
  parentPath: string;
  /** Absolute path being renamed (rename mode only). */
  targetPath?: string;
  initialValue: string;
}

interface DirectoryPickerTreeProps {
  /** Absolute path whose children form depth-0; null = drive-roots ("My PC") view. */
  rootPath: string | null;
  /** Currently selected absolute path (highlight). */
  selectedPath: string | null;
  /** Fires when a row is clicked (selection). */
  onSelect: (path: string) => void;
}

export const DirectoryPickerTree = forwardRef<DirectoryPickerTreeHandle, DirectoryPickerTreeProps>(
  function DirectoryPickerTree({ rootPath, selectedPath, onSelect }, ref) {
    const { t } = useTranslation('common');
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
    const [dirCache, setDirCache] = useState<Map<string, BrowseEntry[]>>(new Map());
    const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
    const [dirErrors, setDirErrors] = useState<Map<string, string>>(new Map());
    const [inlineInput, setInlineInput] = useState<InlineState | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const rootKey = rootPath ?? DRIVE_ROOTS_KEY;

    /** Load child directories of an absolute dir (deeper expansion). */
    const loadChildren = useCallback(async (absPath: string) => {
      setLoadingDirs((p) => new Set(p).add(absPath));
      setDirErrors((p) => {
        const n = new Map(p);
        n.delete(absPath);
        return n;
      });
      try {
        const res = await systemBrowseApi.browse(absPath);
        setDirCache((p) => new Map(p).set(absPath, res.entries));
      } catch (err) {
        setDirErrors((p) => new Map(p).set(absPath, err instanceof Error ? err.message : String(err)));
      } finally {
        setLoadingDirs((p) => {
          const n = new Set(p);
          n.delete(absPath);
          return n;
        });
      }
    }, []);

    /** Load depth-0 (root). rootPath null = drive roots. */
    const loadRoot = useCallback(async () => {
      setLoadingDirs((p) => new Set(p).add(rootKey));
      setDirErrors((p) => {
        const n = new Map(p);
        n.delete(rootKey);
        return n;
      });
      try {
        const res = await systemBrowseApi.browse(rootPath ?? undefined);
        setDirCache((p) => new Map(p).set(rootKey, res.entries));
      } catch (err) {
        setDirErrors((p) => new Map(p).set(rootKey, err instanceof Error ? err.message : String(err)));
      } finally {
        setLoadingDirs((p) => {
          const n = new Set(p);
          n.delete(rootKey);
          return n;
        });
      }
    }, [rootPath, rootKey]);

    // Reset all per-tree state and reload depth-0 whenever the root changes (no
    // cross-subtree cache leakage; the epic requires no persistence anyway).
    useEffect(() => {
      setExpandedDirs(new Set());
      setDirCache(new Map());
      setDirErrors(new Map());
      setLoadingDirs(new Set());
      setInlineInput(null);
      setActionError(null);
      loadRoot();
    }, [rootPath]);

    /** Row click → select + toggle expansion (lazy-load on first expand). */
    const toggleSelect = useCallback(
      (entry: BrowseEntry) => {
        onSelect(entry.path);
        setActionError(null);
        const expandable = entry.hasChildren || dirCache.has(entry.path);
        if (!expandable) return;
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          if (next.has(entry.path)) {
            next.delete(entry.path);
          } else {
            next.add(entry.path);
            if (!dirCache.has(entry.path)) loadChildren(entry.path);
          }
          return next;
        });
      },
      [onSelect, dirCache, loadChildren],
    );

    const retry = useCallback(
      (key: string) => {
        if (key === rootKey) loadRoot();
        else loadChildren(key);
      },
      [rootKey, loadRoot, loadChildren],
    );

    const handleInlineConfirm = useCallback(
      async (value: string) => {
        const input = inlineInput;
        setInlineInput(null);
        if (!input) return;
        const name = value.trim();
        if (!name) return;
        try {
          if (input.mode === 'create') {
            await systemBrowseApi.mkdir(input.parentPath, name);
          } else if (input.targetPath) {
            if (name === input.initialValue) return; // unchanged → skip API
            await systemBrowseApi.rename(input.targetPath, name);
          }
          // Reload the affected parent so the new/renamed folder appears.
          if (input.parentPath === rootPath) await loadRoot();
          else await loadChildren(input.parentPath);
        } catch (err) {
          setActionError(err instanceof Error ? err.message : String(err));
        }
      },
      [inlineInput, rootPath, loadRoot, loadChildren],
    );

    const handleInlineCancel = useCallback(() => setInlineInput(null), []);

    useImperativeHandle(
      ref,
      () => ({
        beginCreate: () => {
          setActionError(null);
          const target = selectedPath ?? rootPath;
          if (!target) return; // drive-roots view, nothing selected → cannot mkdir
          if (target !== rootPath) {
            // Expand the target so its children area (where the input renders) is visible.
            setExpandedDirs((prev) => {
              if (prev.has(target)) return prev;
              const next = new Set(prev).add(target);
              if (!dirCache.has(target)) loadChildren(target);
              return next;
            });
          }
          setInlineInput({ mode: 'create', parentPath: target, initialValue: '' });
        },
        beginRename: () => {
          setActionError(null);
          if (!selectedPath) return;
          setInlineInput({
            mode: 'rename',
            parentPath: parentDir(selectedPath),
            targetPath: selectedPath,
            initialValue: basename(selectedPath),
          });
        },
      }),
      [selectedPath, rootPath, dirCache, loadChildren],
    );

    const rootEntries = dirCache.get(rootKey);
    const rootLoading = loadingDirs.has(rootKey);
    const rootError = dirErrors.get(rootKey);

    return (
      <div role="tree" aria-label={t('directoryBrowser.treeAria')} className="outline-none">
        {rootLoading && !rootEntries && (
          <div className="flex items-center gap-2 p-3 text-sm text-gray-500 dark:text-gray-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('directoryBrowser.loading')}</span>
          </div>
        )}

        {rootError && !rootEntries && (
          <div className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{rootError}</span>
              <button
                className="text-xs text-blue-500 dark:text-blue-400 hover:underline cursor-pointer ml-2"
                onClick={() => retry(rootKey)}
              >
                {t('button.retry')}
              </button>
            </div>
          </div>
        )}

        {/* New-folder input at the root level (create whose parent is the current root). */}
        {inlineInput?.mode === 'create' && inlineInput.parentPath === rootPath && (
          <InlineInput
            initialValue={inlineInput.initialValue}
            entryType="directory"
            depth={0}
            onConfirm={handleInlineConfirm}
            onCancel={handleInlineCancel}
          />
        )}

        {rootEntries?.map((entry) => (
          <PickerTreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            expandedDirs={expandedDirs}
            dirCache={dirCache}
            loadingDirs={loadingDirs}
            dirErrors={dirErrors}
            selectedPath={selectedPath}
            inlineInput={inlineInput}
            onToggleSelect={toggleSelect}
            onRetry={retry}
            onInlineConfirm={handleInlineConfirm}
            onInlineCancel={handleInlineCancel}
          />
        ))}

        {rootEntries && rootEntries.length === 0 && !rootLoading && !rootError && !inlineInput && (
          <div className="text-xs text-gray-500 dark:text-gray-400 italic py-2 px-3">
            {t('directoryBrowser.emptyFolder')}
          </div>
        )}

        {actionError && (
          <div
            className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400 px-3 py-2"
            role="alert"
          >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
      </div>
    );
  },
);

// --- PickerTreeNode (recursive) ---

interface PickerTreeNodeProps {
  entry: BrowseEntry;
  depth: number;
  expandedDirs: Set<string>;
  dirCache: Map<string, BrowseEntry[]>;
  loadingDirs: Set<string>;
  dirErrors: Map<string, string>;
  selectedPath: string | null;
  inlineInput: InlineState | null;
  onToggleSelect: (entry: BrowseEntry) => void;
  onRetry: (key: string) => void;
  onInlineConfirm: (value: string) => void;
  onInlineCancel: () => void;
}

function PickerTreeNode({
  entry,
  depth,
  expandedDirs,
  dirCache,
  loadingDirs,
  dirErrors,
  selectedPath,
  inlineInput,
  onToggleSelect,
  onRetry,
  onInlineConfirm,
  onInlineCancel,
}: PickerTreeNodeProps) {
  const { t } = useTranslation('common');
  const isExpanded = expandedDirs.has(entry.path);
  const isLoading = loadingDirs.has(entry.path);
  const error = dirErrors.get(entry.path);
  const isSelected = selectedPath === entry.path;
  const isRenaming = inlineInput?.mode === 'rename' && inlineInput.targetPath === entry.path;
  const children = dirCache.get(entry.path);
  const expandable = entry.hasChildren || children !== undefined;

  // Rename in place — the node briefly becomes the inline input.
  if (isRenaming) {
    return (
      <InlineInput
        initialValue={inlineInput!.initialValue}
        entryType="directory"
        depth={depth}
        onConfirm={onInlineConfirm}
        onCancel={onInlineCancel}
      />
    );
  }

  const highlightClass = isSelected
    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
    : '';
  const childIndent = `${(depth + 1) * 16 + 8}px`;

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={expandable ? isExpanded : undefined}
        aria-selected={isSelected}
        className={`group flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer select-none transition-colors hover:bg-gray-100 dark:hover:bg-[#253040]/50 ${highlightClass}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onToggleSelect(entry)}
      >
        {expandable ? (
          isLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin flex-shrink-0" />
          ) : (
            <ChevronRight
              className={`w-3.5 h-3.5 text-gray-500 dark:text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            />
          )
        ) : (
          <span className="w-3.5 h-3.5 flex-shrink-0" />
        )}

        {isExpanded ? (
          <FolderOpen className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
        ) : (
          <Folder className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
        )}

        <span
          className={`text-sm truncate ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}
        >
          {entry.name}
        </span>
      </div>

      {isExpanded && (
        <div role="group">
          {error && (
            <div
              className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400"
              style={{ paddingLeft: childIndent }}
            >
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
              <button
                className="text-xs text-blue-500 dark:text-blue-400 hover:underline cursor-pointer ml-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(entry.path);
                }}
              >
                {t('button.retry')}
              </button>
            </div>
          )}

          {isLoading && !children && (
            <div
              className="flex items-center gap-1.5 text-xs text-gray-400 py-1"
              style={{ paddingLeft: childIndent }}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t('directoryBrowser.loading')}</span>
            </div>
          )}

          {/* New-folder input at the top of this dir's children. */}
          {inlineInput?.mode === 'create' && inlineInput.parentPath === entry.path && (
            <InlineInput
              initialValue={inlineInput.initialValue}
              entryType="directory"
              depth={depth + 1}
              onConfirm={onInlineConfirm}
              onCancel={onInlineCancel}
            />
          )}

          {children && children.length === 0 && !error && !(inlineInput?.mode === 'create' && inlineInput.parentPath === entry.path) && (
            <div className="text-xs text-gray-500 dark:text-gray-400 italic py-1" style={{ paddingLeft: childIndent }}>
              {t('directoryBrowser.emptyFolder')}
            </div>
          )}

          {children?.map((child) => (
            <PickerTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              expandedDirs={expandedDirs}
              dirCache={dirCache}
              loadingDirs={loadingDirs}
              dirErrors={dirErrors}
              selectedPath={selectedPath}
              inlineInput={inlineInput}
              onToggleSelect={onToggleSelect}
              onRetry={onRetry}
              onInlineConfirm={onInlineConfirm}
              onInlineCancel={onInlineCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
}
