/**
 * Story 31.2 (Task C.1 / AC4.a): resolve byte sizes for the declared reference
 * files by reusing `fileSystemApi.listDirectory` — each entry already carries a
 * `size` (bytes), so no new API is needed and the file contents are never
 * transferred. Sizes are grouped by parent directory so N files under the same
 * folder cost a single listing. Used by both `FileListEditor` (per-file display)
 * and `ContextBuilderPanel` (total → AC4.c threshold).
 */

import { useEffect, useMemo, useState } from 'react';
import { fileSystemApi } from '../../../../services/api/fileSystem';

export interface ReferenceFileSizes {
  /** path → bytes. Missing entries (deleted/moved files) are absent. */
  sizes: Map<string, number>;
  totalBytes: number;
  loading: boolean;
}

/** Human-readable byte formatter (B / KB / MB) — small + local to avoid coupling. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function useReferenceFileSizes(projectSlug: string, files: string[]): ReferenceFileSizes {
  const [sizes, setSizes] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const key = files.join('|');

  useEffect(() => {
    if (files.length === 0) {
      setSizes(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);

    // Group requested files by their parent directory.
    const byDir = new Map<string, string[]>();
    for (const f of files) {
      const slash = f.lastIndexOf('/');
      const dir = slash >= 0 ? f.slice(0, slash) : '.';
      const base = slash >= 0 ? f.slice(slash + 1) : f;
      const list = byDir.get(dir) ?? [];
      list.push(base);
      byDir.set(dir, list);
    }

    void (async () => {
      const next = new Map<string, number>();
      await Promise.all(
        [...byDir.entries()].map(async ([dir, bases]) => {
          try {
            const res = await fileSystemApi.listDirectory(projectSlug, dir);
            const byName = new Map(res.entries.map((e) => [e.name, e]));
            for (const base of bases) {
              const entry = byName.get(base);
              const full = dir === '.' ? base : `${dir}/${base}`;
              if (entry && entry.type === 'file') next.set(full, entry.size);
            }
          } catch {
            // Best-effort — a failed listing just omits those sizes.
          }
        }),
      );
      if (!cancelled) {
        setSizes(next);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `key` captures the file-list identity; projectSlug re-runs on project switch.
  }, [projectSlug, key]);

  const totalBytes = useMemo(() => {
    let sum = 0;
    for (const v of sizes.values()) sum += v;
    return sum;
  }, [sizes]);

  return { sizes, totalBytes, loading };
}
