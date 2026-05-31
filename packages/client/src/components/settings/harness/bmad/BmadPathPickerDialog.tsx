/**
 * Story 31.1 (AC2.c): file/dir picker modal for BMad path widgets.
 *
 * Self-contained lazy tree over `fileSystemApi.listDirectory` — it reuses the
 * file-explorer *listing pattern* but keeps its own local state so it shares
 * nothing with the main File Explorer's `fileStore` (AC2.c: "state-sharing 0").
 * Selectors are namespaced (`bmad-path-picker-*`) so integration tests can
 * target this picker without colliding with Epic 11 J5's `file-tree` /
 * `[role="tree"]` selectors.
 *
 * The selected path is returned project-root-relative (e.g. `docs/stories`).
 */

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronDown, Folder, File as FileIcon, Loader2 } from 'lucide-react';
import type { DirectoryEntry } from '@hammoc/shared';
import { fileSystemApi } from '../../../../services/api/fileSystem';

interface BmadPathPickerDialogProps {
  projectSlug: string;
  /** Keypath of the field that opened the picker — only for the title hint. */
  keyId: string;
  onSelect: (relativePath: string) => void;
  onClose: () => void;
}

const HIDDEN = new Set(['.git', 'node_modules', '.next', '.cache', '__pycache__', '.DS_Store', 'dist', '.turbo']);

function sortEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function BmadPathPickerDialog({ projectSlug, keyId, onSelect, onClose }: BmadPathPickerDialogProps) {
  const { t } = useTranslation('settings');
  const [dirCache, setDirCache] = useState<Map<string, DirectoryEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string>('');

  const loadDir = useCallback(async (dirPath: string) => {
    setLoadingDirs((prev) => new Set(prev).add(dirPath));
    try {
      const res = await fileSystemApi.listDirectory(projectSlug, dirPath);
      setDirCache((prev) => {
        const next = new Map(prev);
        next.set(dirPath, res.entries);
        return next;
      });
    } catch {
      // Best-effort — a failed listing just shows no children.
    } finally {
      setLoadingDirs((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    }
  }, [projectSlug]);

  useEffect(() => {
    void loadDir('.');
  }, [loadDir]);

  const toggleDir = (dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
        if (!dirCache.has(dirPath)) void loadDir(dirPath);
      }
      return next;
    });
  };

  const renderDir = (basePath: string, depth: number): JSX.Element[] => {
    const entries = dirCache.get(basePath);
    if (!entries) return [];
    const rows: JSX.Element[] = [];
    for (const entry of sortEntries(entries)) {
      if (HIDDEN.has(entry.name)) continue;
      const fullPath = basePath === '.' ? entry.name : `${basePath}/${entry.name}`;
      const isDir = entry.type === 'directory';
      const isExpanded = expanded.has(fullPath);
      rows.push(
        <button
          key={fullPath}
          type="button"
          className={`flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-sm hover:bg-gray-700 ${
            selected === fullPath ? 'bg-blue-900/40 text-blue-200' : 'text-gray-200'
          }`}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          onClick={() => {
            setSelected(fullPath);
            if (isDir) toggleDir(fullPath);
          }}
          data-testid={`bmad-path-picker-entry-${fullPath}`}
        >
          {isDir ? (
            isExpanded ? <ChevronDown size={14} className="shrink-0 text-gray-500" /> : <ChevronRight size={14} className="shrink-0 text-gray-500" />
          ) : (
            <span className="w-[14px] shrink-0" />
          )}
          {isDir ? <Folder size={14} className="shrink-0 text-amber-400" /> : <FileIcon size={14} className="shrink-0 text-gray-400" />}
          <span className="truncate">{entry.name}</span>
          {loadingDirs.has(fullPath) && <Loader2 size={12} className="ml-1 shrink-0 animate-spin text-gray-500" />}
        </button>,
      );
      if (isDir && isExpanded) {
        rows.push(...renderDir(fullPath, depth + 1));
      }
    }
    return rows;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      data-testid="bmad-path-picker-dialog"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-700 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-100">
            {t('harness.bmad.widgets.path.pickerTitle', { key: keyId })}
          </h3>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2" data-testid="bmad-path-picker-tree">
          {dirCache.has('.') ? renderDir('.', 0) : (
            <div className="flex items-center gap-2 p-3 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              {t('harness.bmad.widgets.path.loading')}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-gray-700 px-4 py-3">
          <span className="truncate text-xs text-gray-400" data-testid="bmad-path-picker-selected">
            {selected || t('harness.bmad.widgets.path.noSelection')}
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="rounded px-3 py-1 text-sm text-gray-300 hover:bg-gray-700"
              onClick={onClose}
            >
              {t('harness.bmad.widgets.path.cancel')}
            </button>
            <button
              type="button"
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
              disabled={!selected}
              onClick={() => onSelect(selected)}
              data-testid="bmad-path-picker-confirm"
            >
              {t('harness.bmad.widgets.path.select')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
