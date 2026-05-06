/**
 * Story 29.2: Snippet store for the Harness Workbench "Snippets" panel.
 *
 * Holds the merged card list across `project` / `user` / `bundled` scopes
 * (no dedupe — one card per (scope, name) pair). Editing of the active
 * snippet body happens in `SnippetEditor` with 300ms debounce; this store
 * exposes the load + per-card open + CRUD orchestration the panel needs.
 *
 * Phase-1 scope (story Task 3): no watcher integration. The list is
 * refreshed only via explicit `load()` calls — after a CRUD action, after a
 * conflict-modal resolve, or when the panel mounts.
 */

import { create } from 'zustand';
import type {
  SnippetCard,
  SnippetCopyRequest,
  SnippetCopyResponse,
  SnippetReadResponse,
  SnippetScope,
} from '@hammoc/shared';
import { ApiError } from '../services/api/client';
import {
  copySnippet,
  createSnippet,
  deleteSnippet,
  listSnippets,
  readSnippet,
  updateSnippet,
} from '../services/api/snippetsApi';

export interface SnippetStoreError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface ActiveSnippet extends SnippetReadResponse {
  /** Local draft body — may diverge from `content` while the user types. */
  draft: string;
  /** Echoed back so save() / remove() can re-target the same project scope. */
  projectSlug?: string;
}

interface SnippetStoreState {
  cards: SnippetCard[];
  active: ActiveSnippet | null;
  isLoading: boolean;
  isOpening: boolean;
  isSaving: boolean;
  saveAcked: boolean;
  error?: SnippetStoreError;
  lastProjectSlug?: string;

  load(projectSlug?: string): Promise<void>;
  open(card: { scope: SnippetScope; name: string; projectSlug?: string }): Promise<void>;
  closeActive(): void;
  setActiveDraft(content: string): void;
  /** Persist the current `active.draft`; returns the new mtime when successful. */
  save(workingDirectory?: string): Promise<{ ok: true } | { ok: false; error: SnippetStoreError }>;
  /** Bypass STALE_WRITE for the next save (used after the conflict modal "overwrite"). */
  forceOverwriteNext(currentMtime: string): void;
  create(input: {
    scope: 'project' | 'user';
    projectSlug?: string;
    name: string;
    content: string;
    workingDirectory?: string;
  }): Promise<void>;
  remove(input: {
    scope: 'project' | 'user';
    projectSlug?: string;
    name: string;
    expectedMtime?: string;
    workingDirectory?: string;
  }): Promise<void>;
  copy(req: SnippetCopyRequest, workingDirectory?: string): Promise<SnippetCopyResponse>;
  reset(): void;
}

function toError(err: unknown): SnippetStoreError {
  if (err instanceof ApiError) {
    return {
      code: err.code,
      message: err.message,
      details: (err.details as Record<string, unknown> | undefined) ?? undefined,
    };
  }
  return { code: 'UNKNOWN_ERROR', message: err instanceof Error ? err.message : String(err) };
}

export const useSnippetStore = create<SnippetStoreState>((set, get) => ({
  cards: [],
  active: null,
  isLoading: false,
  isOpening: false,
  isSaving: false,
  saveAcked: false,

  async load(projectSlug?: string) {
    const state = get();
    const isWarm = state.lastProjectSlug === projectSlug && !state.error;
    if (isWarm) {
      set({ error: undefined, lastProjectSlug: projectSlug });
    } else {
      set({
        cards: [],
        isLoading: true,
        error: undefined,
        lastProjectSlug: projectSlug,
      });
    }
    try {
      const res = await listSnippets(projectSlug);
      set({ cards: res.snippets, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: toError(err) });
    }
  },

  async open(card) {
    set({ isOpening: true, error: undefined, saveAcked: false });
    try {
      const res = await readSnippet({
        scope: card.scope,
        name: card.name,
        projectSlug: card.projectSlug,
      });
      set({
        active: { ...res, draft: res.content, projectSlug: card.projectSlug },
        isOpening: false,
      });
    } catch (err) {
      set({ isOpening: false, error: toError(err) });
    }
  },

  closeActive() {
    set({ active: null, saveAcked: false });
  },

  setActiveDraft(content: string) {
    const cur = get().active;
    if (!cur) return;
    set({ active: { ...cur, draft: content }, saveAcked: false });
  },

  async save(workingDirectory?: string) {
    const cur = get().active;
    if (!cur) return { ok: false as const, error: { code: 'NO_ACTIVE', message: 'No active snippet' } };
    if (cur.scope === 'bundled') {
      // Defensive — UI should not let you call save on a bundled snippet.
      return {
        ok: false as const,
        error: { code: 'HARNESS_BUNDLED_READONLY', message: 'bundled snippets are read-only' },
      };
    }
    set({ isSaving: true, error: undefined });
    try {
      const res = await updateSnippet(
        { scope: cur.scope, name: cur.name, projectSlug: cur.projectSlug },
        cur.draft,
        cur.mtime,
        workingDirectory ? { workingDirectory } : undefined,
      );
      set((s) => ({
        isSaving: false,
        saveAcked: true,
        active: s.active ? { ...s.active, content: cur.draft, mtime: res.mtime } : s.active,
      }));
      // Refresh the card list so the preview / mtime stays in sync.
      await get().load(get().lastProjectSlug);
      return { ok: true as const };
    } catch (err) {
      const error = toError(err);
      set({ isSaving: false, error });
      return { ok: false as const, error };
    }
  },

  forceOverwriteNext(currentMtime: string) {
    set((s) =>
      s.active ? { active: { ...s.active, mtime: currentMtime }, error: undefined } : s,
    );
  },

  async create(input) {
    set({ error: undefined });
    try {
      await createSnippet(
        { scope: input.scope, projectSlug: input.projectSlug, name: input.name },
        input.content,
        input.workingDirectory ? { workingDirectory: input.workingDirectory } : undefined,
      );
      await get().load(get().lastProjectSlug);
    } catch (err) {
      set({ error: toError(err) });
      throw err;
    }
  },

  async remove(input) {
    set({ error: undefined });
    try {
      await deleteSnippet(
        { scope: input.scope, projectSlug: input.projectSlug, name: input.name },
        input.expectedMtime,
        input.workingDirectory ? { workingDirectory: input.workingDirectory } : undefined,
      );
      // If the deleted snippet was active, drop it.
      const cur = get().active;
      if (
        cur &&
        cur.scope === input.scope &&
        cur.name === input.name &&
        cur.projectSlug === input.projectSlug
      ) {
        set({ active: null });
      }
      await get().load(get().lastProjectSlug);
    } catch (err) {
      set({ error: toError(err) });
      throw err;
    }
  },

  async copy(req, workingDirectory) {
    set({ error: undefined });
    try {
      const res = await copySnippet(
        req,
        workingDirectory ? { workingDirectory } : undefined,
      );
      await get().load(get().lastProjectSlug);
      return res;
    } catch (err) {
      set({ error: toError(err) });
      throw err;
    }
  },

  reset() {
    set({
      cards: [],
      active: null,
      isLoading: false,
      isOpening: false,
      isSaving: false,
      saveAcked: false,
      error: undefined,
      lastProjectSlug: undefined,
    });
  },
}));
