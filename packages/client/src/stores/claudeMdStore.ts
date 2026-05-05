/**
 * Story 29.1: Two-column CLAUDE.md store.
 *
 * Holds the user-scope and project-scope CLAUDE.md content side by side. Both
 * columns share one store so the copy actions (AC3) — which read one column
 * and write the other — can run as plain method calls without prop drilling.
 *
 * Differences from the Epic 28 stores:
 *   - no card list; each scope is a single document
 *   - `exists` flag drives the empty-state CTA (AC4)
 *   - `staleBanner` carries fresh-from-disk content the user may opt into
 *     instead of overwriting
 */

import { create } from 'zustand';
import {
  appendMarkdownSections,
  splitMarkdownByH2,
  type HarnessExternalChangeEvent,
  type HarnessScope,
  type MarkdownH2Section,
} from '@hammoc/shared';
import { ApiError } from '../services/api/client';
import {
  createClaudeMd,
  readClaudeMd,
  writeClaudeMd,
} from '../services/api/claudeMdApi';

interface ColumnError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ClaudeMdStaleBanner {
  /** Content currently on disk — used by `applyReload`. */
  freshContent: string;
  /** Mtime currently on disk — used by `applyOverwrite` to bypass STALE_WRITE. */
  freshMtime: string;
}

export interface ClaudeMdColumnState {
  /** Current draft content (may diverge from `mtime`-stamped disk content while editing). */
  content: string;
  /** ISO mtime of the on-disk file last successfully read or written. Empty when `!exists`. */
  mtime: string;
  /** False when the disk file does not yet exist — drives the AC4 empty-state CTA. */
  exists: boolean;
  /**
   * Resolved absolute path of the file on disk. Populated from the read response
   * (200 body) AND the 404 error details so the empty-state "Create CLAUDE.md?"
   * confirm dialog can display the canonical location even before the file exists
   * (AC4.c). Empty string when the server has not yet been queried.
   */
  absolutePath: string;
  isLoading: boolean;
  /** True briefly after a successful save so the panel can flash the "Saved" indicator. */
  saveAcked: boolean;
  /** Set when an external change is detected and a save was rejected for staleness. */
  staleBanner: ClaudeMdStaleBanner | null;
  error?: ColumnError;
}

const EMPTY_COLUMN: ClaudeMdColumnState = {
  content: '',
  mtime: '',
  exists: false,
  absolutePath: '',
  isLoading: false,
  saveAcked: false,
  staleBanner: null,
};

interface ClaudeMdStoreState {
  user: ClaudeMdColumnState;
  project: ClaudeMdColumnState;
  /** Tracked so cross-store callers (HarnessWorkbenchSection prefetch) reset on slug change. */
  lastProjectSlug?: string;

  load(scope: HarnessScope, projectSlug?: string): Promise<void>;
  setDraft(scope: HarnessScope, content: string): void;
  save(scope: HarnessScope, projectSlug?: string): Promise<void>;
  create(scope: HarnessScope, projectSlug?: string): Promise<void>;
  /** AC2 reload — accept disk content and discard the local draft. */
  applyReload(scope: HarnessScope): void;
  /** AC2 overwrite — keep the local draft and bypass STALE_WRITE on the next save. */
  applyOverwrite(scope: HarnessScope, projectSlug?: string): Promise<void>;
  /** AC3 copy: append H2 sections from source to target (server-side round trip). */
  copyAppendSections(
    direction: 'toUser' | 'toProject',
    sections: MarkdownH2Section[],
    projectSlug: string,
  ): Promise<void>;
  /** AC3 copy: overwrite target with full source content. */
  copyOverwrite(
    direction: 'toUser' | 'toProject',
    projectSlug: string,
  ): Promise<void>;
  handleExternalChange(payload: HarnessExternalChangeEvent, projectSlug?: string): void;
  reset(): void;
}

function toColumnError(err: unknown): ColumnError {
  if (err instanceof ApiError) {
    return {
      code: err.code,
      message: err.message,
      details: err.details as Record<string, unknown> | undefined,
    };
  }
  return { code: 'UNKNOWN_ERROR', message: err instanceof Error ? err.message : String(err) };
}

function applyColumnPatch(
  state: ClaudeMdStoreState,
  scope: HarnessScope,
  patch: Partial<ClaudeMdColumnState>,
): Pick<ClaudeMdStoreState, 'user' | 'project'> {
  return scope === 'user'
    ? { user: { ...state.user, ...patch }, project: state.project }
    : { user: state.user, project: { ...state.project, ...patch } };
}

/**
 * AC2 (b) — does the watcher payload describe one of the two CLAUDE.md files?
 *   user      scope, path === 'CLAUDE.md'        → user column
 *   project   scope, path === '../CLAUDE.md'      → project column
 *                                                   (path prefix `../` distinguishes
 *                                                   it from the inner-`.claude/` sibling
 *                                                   that would also normalize to 'CLAUDE.md')
 */
function matchesClaudeMd(
  payload: HarnessExternalChangeEvent,
  projectSlug?: string,
): HarnessScope | null {
  if (payload.scope === 'user' && payload.path === 'CLAUDE.md') return 'user';
  if (
    payload.scope === 'project' &&
    payload.path === '../CLAUDE.md' &&
    (!projectSlug || payload.projectSlug === projectSlug)
  ) {
    return 'project';
  }
  return null;
}

export const useClaudeMdStore = create<ClaudeMdStoreState>((set, get) => ({
  user: { ...EMPTY_COLUMN },
  project: { ...EMPTY_COLUMN },

  async load(scope, projectSlug) {
    set((s) => applyColumnPatch(s, scope, { isLoading: true, error: undefined }));
    try {
      const res = await readClaudeMd({ scope, projectSlug });
      set((s) => ({
        ...applyColumnPatch(s, scope, {
          content: res.content ?? '',
          mtime: res.mtime,
          exists: true,
          absolutePath: res.absolutePath ?? '',
          isLoading: false,
          staleBanner: null,
          error: undefined,
        }),
        lastProjectSlug: projectSlug ?? s.lastProjectSlug,
      }));
    } catch (err) {
      // 404 means the file doesn't exist yet — that's the expected empty-state
      // (AC4), not an error condition. Surface it as `exists: false`. Note
      // that the server attaches `details.absolutePath` to the 404 (AC4.c) so
      // the create-confirm dialog can show the canonical location even though
      // the file is not yet on disk.
      if (err instanceof ApiError && err.code === 'HARNESS_FILE_NOT_FOUND') {
        const details = err.details as { absolutePath?: string } | undefined;
        set((s) => ({
          ...applyColumnPatch(s, scope, {
            content: '',
            mtime: '',
            exists: false,
            absolutePath: details?.absolutePath ?? '',
            isLoading: false,
            staleBanner: null,
            error: undefined,
          }),
          lastProjectSlug: projectSlug ?? s.lastProjectSlug,
        }));
        return;
      }
      set((s) => applyColumnPatch(s, scope, { isLoading: false, error: toColumnError(err) }));
    }
  },

  setDraft(scope, content) {
    set((s) => applyColumnPatch(s, scope, { content, saveAcked: false }));
  },

  async save(scope, projectSlug) {
    const col = get()[scope];
    set((s) => applyColumnPatch(s, scope, { error: undefined, saveAcked: false }));
    try {
      // expectedMtime is only sent when the file currently exists on disk —
      // a fresh-create (after the empty-state CTA) sends no guard so it can
      // succeed even if the file was made between mount and first save.
      const expectedMtime = col.exists ? col.mtime : undefined;
      const res = await writeClaudeMd({ scope, projectSlug }, col.content, expectedMtime);
      set((s) => applyColumnPatch(s, scope, {
        mtime: res.mtime,
        exists: true,
        staleBanner: null,
        saveAcked: true,
      }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
        // Re-read the disk version so the user can choose between
        // reload (apply disk) or overwrite (keep draft, bypass guard).
        try {
          const fresh = await readClaudeMd({ scope, projectSlug });
          set((s) => applyColumnPatch(s, scope, {
            staleBanner: { freshContent: fresh.content ?? '', freshMtime: fresh.mtime },
            error: undefined,
          }));
        } catch {
          // If even the re-read fails, fall through to error display.
          set((s) => applyColumnPatch(s, scope, { error: toColumnError(err) }));
        }
        return;
      }
      set((s) => applyColumnPatch(s, scope, { error: toColumnError(err) }));
    }
  },

  async create(scope, projectSlug) {
    set((s) => applyColumnPatch(s, scope, { isLoading: true, error: undefined }));
    try {
      const res = await createClaudeMd({ scope, projectSlug });
      set((s) => applyColumnPatch(s, scope, {
        content: '',
        mtime: res.mtime,
        exists: true,
        isLoading: false,
        staleBanner: null,
        error: undefined,
      }));
    } catch (err) {
      set((s) => applyColumnPatch(s, scope, { isLoading: false, error: toColumnError(err) }));
    }
  },

  applyReload(scope) {
    const col = get()[scope];
    if (!col.staleBanner) return;
    set((s) => applyColumnPatch(s, scope, {
      content: col.staleBanner!.freshContent,
      mtime: col.staleBanner!.freshMtime,
      staleBanner: null,
      saveAcked: false,
    }));
  },

  async applyOverwrite(scope, projectSlug) {
    const col = get()[scope];
    if (!col.staleBanner) return;
    // Bump our expected mtime to the disk's current mtime so the next save
    // bypasses the STALE_WRITE guard. The draft content is preserved.
    set((s) => applyColumnPatch(s, scope, {
      mtime: col.staleBanner!.freshMtime,
      staleBanner: null,
    }));
    await get().save(scope, projectSlug);
  },

  async copyAppendSections(direction, sections, projectSlug) {
    const targetScope: HarnessScope = direction === 'toUser' ? 'user' : 'project';
    const target = get()[targetScope];
    const targetSlug = targetScope === 'project' ? projectSlug : undefined;
    const merged = appendMarkdownSections(target.exists ? target.content : '', sections);
    set((s) => applyColumnPatch(s, targetScope, { content: merged, error: undefined }));
    try {
      const expectedMtime = target.exists ? target.mtime : undefined;
      const res = await writeClaudeMd({ scope: targetScope, projectSlug: targetSlug }, merged, expectedMtime);
      set((s) => applyColumnPatch(s, targetScope, {
        mtime: res.mtime,
        exists: true,
        saveAcked: true,
        staleBanner: null,
      }));
    } catch (err) {
      set((s) => applyColumnPatch(s, targetScope, { error: toColumnError(err) }));
      throw err;
    }
  },

  async copyOverwrite(direction, projectSlug) {
    const targetScope: HarnessScope = direction === 'toUser' ? 'user' : 'project';
    const source = get()[direction === 'toUser' ? 'project' : 'user'];
    const target = get()[targetScope];
    const targetSlug = targetScope === 'project' ? projectSlug : undefined;
    set((s) => applyColumnPatch(s, targetScope, { content: source.content, error: undefined }));
    try {
      const expectedMtime = target.exists ? target.mtime : undefined;
      const res = await writeClaudeMd({ scope: targetScope, projectSlug: targetSlug }, source.content, expectedMtime);
      set((s) => applyColumnPatch(s, targetScope, {
        mtime: res.mtime,
        exists: true,
        saveAcked: true,
        staleBanner: null,
      }));
    } catch (err) {
      set((s) => applyColumnPatch(s, targetScope, { error: toColumnError(err) }));
      throw err;
    }
  },

  handleExternalChange(payload, projectSlug) {
    const matched = matchesClaudeMd(payload, projectSlug);
    if (!matched) return;
    void (async () => {
      // Re-read the disk version. If the user has unsaved changes, surface
      // a staleBanner so they choose. Otherwise silently sync.
      const col = get()[matched];
      const slug = matched === 'project' ? projectSlug : undefined;
      try {
        if (payload.type === 'deleted') {
          set((s) => applyColumnPatch(s, matched, {
            content: '',
            mtime: '',
            exists: false,
            staleBanner: null,
          }));
          return;
        }
        const fresh = await readClaudeMd({ scope: matched, projectSlug: slug });
        const hasLocalEdits = col.content !== '' && col.exists && fresh.content !== col.content;
        if (hasLocalEdits) {
          set((s) => applyColumnPatch(s, matched, {
            staleBanner: { freshContent: fresh.content ?? '', freshMtime: fresh.mtime },
          }));
        } else {
          set((s) => applyColumnPatch(s, matched, {
            content: fresh.content ?? '',
            mtime: fresh.mtime,
            exists: true,
            staleBanner: null,
          }));
        }
      } catch {
        // Drop the event silently — the next manual save will re-encounter the staleness.
      }
    })();
  },

  reset() {
    set({
      user: { ...EMPTY_COLUMN },
      project: { ...EMPTY_COLUMN },
      lastProjectSlug: undefined,
    });
  },
}));

// Re-export so callers do not have to thread @hammoc/shared imports just for the helper.
export { splitMarkdownByH2 };
