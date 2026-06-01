/**
 * Story 31.2: SessionStart context-builder store (Epic 31).
 *
 * Holds one project's context-builder manifest + derived artifact state, and
 * drives the optimistic + debounced whole-manifest save, the disable/cleanup
 * action, and the external-change / STALE_WRITE reload flow. Mirrors the
 * staleConflict / handleExternalChange / resolveStale structure of Story 31.1's
 * `bmadCoreConfigStore`, but the SSoT here is a single JSON manifest object
 * (not per-key AST patches), so the whole manifest is saved on each mutation.
 *
 * Single sources of truth exported here:
 *   - CONTEXT_BUILDER_VARIABLES  — built-in variable widget definitions
 *   - approximateTokens()        — AC4.b isolation point (char/4 fallback today;
 *                                  swap the body to the Story 31.3 tokenizer later)
 *   - the SessionStart hook output caps from spike § 13
 */

import { create } from 'zustand';
import {
  createDefaultContextBuilderManifest,
  CONTEXT_BUILDER_VARIABLE_IDS,
  type ContextBuilderManifest,
  type ContextBuilderVariableId,
  type HarnessExternalChangeEvent,
} from '@hammoc/shared';
import { ApiError } from '../services/api/client';
import {
  readContextBuilder,
  saveContextBuilder,
  disableContextBuilder,
} from '../services/api/contextBuilderApi';

// ---------------------------------------------------------------------------
// Built-in variable definitions — single source of truth for the toggle list.
// Each id maps to i18n `settings.harness.contextBuilder.variable.<id>.{label,description}`.
// ---------------------------------------------------------------------------

export interface ContextBuilderVariableDef {
  id: ContextBuilderVariableId;
  /** True for variables that carry a numeric count input (recentCommits → N). */
  hasCount?: boolean;
}

export const CONTEXT_BUILDER_VARIABLES: ContextBuilderVariableDef[] = [
  { id: 'gitBranch' },
  { id: 'activeBmadStory' },
  { id: 'recentCommits', hasCount: true },
  { id: 'today' },
  { id: 'uncommittedCount' },
];

// Defensive: keep the widget list in lockstep with the shared id list.
void CONTEXT_BUILDER_VARIABLE_IDS;

// ---------------------------------------------------------------------------
// SessionStart hook output caps (spike § 13, 2026-06-01).
//
// Official docs: hook output strings (additionalContext / systemMessage / plain
// stdout) are HARD-CAPPED at 10,000 CHARACTERS. Beyond that the text spills to a
// file + preview and is NOT injected directly. We warn at 80% (8,000) so the
// user trims before hitting the spill. The display unit is bytes (AC4.a); for
// CJK content bytes OVER-estimate chars, so a byte-based threshold is
// conservative (over-warns) — safe.
// ---------------------------------------------------------------------------

export const CONTEXT_BUILDER_HARD_CAP_CHARS = 10000;
export const CONTEXT_BUILDER_SOFT_LIMIT_CHARS = 8000;

export type AssembledSizeLevel = 'ok' | 'warn' | 'over';

/** Classify an assembled-size estimate (chars or bytes-as-proxy) against the caps. */
export function assembledSizeLevel(totalChars: number): AssembledSizeLevel {
  if (totalChars >= CONTEXT_BUILDER_HARD_CAP_CHARS) return 'over';
  if (totalChars >= CONTEXT_BUILDER_SOFT_LIMIT_CHARS) return 'warn';
  return 'ok';
}

/**
 * AC4.b isolation point. Today: a char/4 heuristic (always prefix `~` and show
 * the "근사치" notice in the UI). When Story 31.3's `@anthropic-ai/tokenizer`
 * util lands, replace ONLY this function body with the real tokenizer call and
 * flip `TOKEN_APPROXIMATION_IS_HEURISTIC` to false — call sites stay unchanged.
 */
export function approximateTokens(charCount: number): number {
  return Math.ceil(Math.max(0, charCount) / 4);
}

/** True while `approximateTokens` is the char/4 heuristic (drives the `~`/notice). */
export const TOKEN_APPROXIMATION_IS_HEURISTIC = true;

/** The discriminated watcher path the server emits for the manifest (Task A.4). */
export const CONTEXT_BUILDER_EXTERNAL_PATH = '../.hammoc/context-builder.json';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface ContextBuilderStaleConflict {
  /** Server's current mtime — used as `expectedMtime` for an "overwrite" retry. */
  currentMtime: string;
  /** The manifest captured at conflict time (re-applied on overwrite). */
  pendingManifest: ContextBuilderManifest;
}

export interface ContextBuilderState {
  projectSlug?: string;
  manifest: ContextBuilderManifest;
  mtime?: string;
  scriptExists: boolean;
  entryRegistered: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error?: { code: string; message: string };
  staleConflict?: ContextBuilderStaleConflict;
  externalChangePending: boolean;
  /** AC5.c — indices of acknowledged commands the server flagged (non-blocking notice). */
  secretWarningCommandIndices: number[];

  load: (projectSlug: string) => Promise<void>;
  /** Apply an updater to the manifest, optimistically, then debounce-save the whole object. */
  mutate: (updater: (m: ContextBuilderManifest) => ContextBuilderManifest) => void;
  setEnabled: (on: boolean) => void;
  toggleVariable: (id: ContextBuilderVariableId, on: boolean) => void;
  setRecentCommitsCount: (n: number) => void;
  addFile: (path: string) => void;
  removeFile: (path: string) => void;
  addCustomCommand: (command: string, acknowledged: boolean) => void;
  updateCustomCommand: (index: number, patch: Partial<{ command: string; acknowledged: boolean }>) => void;
  removeCustomCommand: (index: number) => void;
  /** AC1.f — disable + cleanup (retains the declaration as `enabled: false`). */
  disable: () => Promise<void>;
  handleExternalChange: (payload: HarnessExternalChangeEvent, projectSlug?: string) => void;
  resolveStale: (action: 'reload' | 'overwrite') => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const DEBOUNCE_MS = 300;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function clearDebounce(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
}

export const useContextBuilderStore = create<ContextBuilderState>((set, get) => {
  async function flushSave(): Promise<void> {
    debounceTimer = undefined;
    const { projectSlug, manifest, mtime } = get();
    if (!projectSlug) {
      set({ isSaving: false });
      return;
    }
    try {
      const res = await saveContextBuilder(projectSlug, manifest, mtime);
      set({
        mtime: res.mtime,
        scriptExists: manifest.enabled && res.scriptPath.length > 0,
        entryRegistered: manifest.enabled,
        secretWarningCommandIndices: res.secretWarningCommandIndices ?? [],
        isSaving: false,
        error: undefined,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
        const currentMtime = (err.details as { currentMtime?: string })?.currentMtime ?? '';
        set({ isSaving: false, staleConflict: { currentMtime, pendingManifest: manifest } });
        return;
      }
      set({
        isSaving: false,
        error: { code: err instanceof ApiError ? err.code : 'UNKNOWN_ERROR', message: (err as Error).message },
      });
    }
  }

  function scheduleSave(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void flushSave();
    }, DEBOUNCE_MS);
  }

  return {
    manifest: createDefaultContextBuilderManifest(),
    scriptExists: false,
    entryRegistered: false,
    isLoading: false,
    isSaving: false,
    externalChangePending: false,
    secretWarningCommandIndices: [],

    async load(projectSlug) {
      clearDebounce();
      set({ projectSlug, isLoading: true, error: undefined, externalChangePending: false });
      try {
        const res = await readContextBuilder(projectSlug);
        set({
          manifest: res.manifest,
          mtime: res.mtime,
          scriptExists: res.scriptExists,
          entryRegistered: res.entryRegistered,
          isLoading: false,
          staleConflict: undefined,
          externalChangePending: false,
          secretWarningCommandIndices: [],
        });
      } catch (err) {
        set({
          isLoading: false,
          error: { code: err instanceof ApiError ? err.code : 'UNKNOWN_ERROR', message: (err as Error).message },
        });
      }
    },

    mutate(updater) {
      set((s) => ({ manifest: updater(s.manifest), isSaving: true, error: undefined }));
      scheduleSave();
    },

    setEnabled(on) {
      if (!on) {
        void get().disable();
        return;
      }
      get().mutate((m) => ({ ...m, enabled: true }));
    },

    toggleVariable(id, on) {
      get().mutate((m) => ({ ...m, variables: { ...m.variables, [id]: on } }));
    },

    setRecentCommitsCount(n) {
      const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
      get().mutate((m) => ({ ...m, recentCommitsCount: safe }));
    },

    addFile(path) {
      const trimmed = path.trim();
      if (!trimmed) return;
      get().mutate((m) => (m.files.includes(trimmed) ? m : { ...m, files: [...m.files, trimmed] }));
    },

    removeFile(path) {
      get().mutate((m) => ({ ...m, files: m.files.filter((f) => f !== path) }));
    },

    addCustomCommand(command, acknowledged) {
      const trimmed = command.trim();
      if (!trimmed) return;
      get().mutate((m) => ({ ...m, customCommands: [...m.customCommands, { command: trimmed, acknowledged }] }));
    },

    updateCustomCommand(index, patch) {
      get().mutate((m) => ({
        ...m,
        customCommands: m.customCommands.map((c, i) => (i === index ? { ...c, ...patch } : c)),
      }));
    },

    removeCustomCommand(index) {
      get().mutate((m) => ({ ...m, customCommands: m.customCommands.filter((_, i) => i !== index) }));
    },

    async disable() {
      clearDebounce();
      const { projectSlug, mtime } = get();
      if (!projectSlug) return;
      set({ isSaving: true, error: undefined });
      try {
        await disableContextBuilder(projectSlug, mtime);
        set((s) => ({
          manifest: { ...s.manifest, enabled: false },
          scriptExists: false,
          entryRegistered: false,
          isSaving: false,
        }));
        await get().load(projectSlug);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
          const currentMtime = (err.details as { currentMtime?: string })?.currentMtime ?? '';
          set({ isSaving: false, staleConflict: { currentMtime, pendingManifest: { ...get().manifest, enabled: false } } });
          return;
        }
        set({
          isSaving: false,
          error: { code: err instanceof ApiError ? err.code : 'UNKNOWN_ERROR', message: (err as Error).message },
        });
      }
    },

    handleExternalChange(payload, projectSlug) {
      const slug = projectSlug ?? get().projectSlug;
      if (!slug) return;
      if (payload.projectSlug && payload.projectSlug !== slug) return;
      if (payload.path !== CONTEXT_BUILDER_EXTERNAL_PATH) return;
      set({ externalChangePending: true });
    },

    async resolveStale(action) {
      const { projectSlug, staleConflict } = get();
      if (!projectSlug || !staleConflict) return;
      if (action === 'reload') {
        set({ staleConflict: undefined });
        await get().load(projectSlug);
        return;
      }
      // overwrite — re-save the captured manifest using the server's current mtime.
      set({ staleConflict: undefined, isSaving: true });
      try {
        const res = await saveContextBuilder(projectSlug, staleConflict.pendingManifest, staleConflict.currentMtime);
        set({
          manifest: staleConflict.pendingManifest,
          mtime: res.mtime,
          scriptExists: staleConflict.pendingManifest.enabled && res.scriptPath.length > 0,
          entryRegistered: staleConflict.pendingManifest.enabled,
          secretWarningCommandIndices: res.secretWarningCommandIndices ?? [],
          isSaving: false,
          error: undefined,
        });
      } catch (err) {
        set({
          isSaving: false,
          error: { code: err instanceof ApiError ? err.code : 'UNKNOWN_ERROR', message: (err as Error).message },
        });
      }
    },

    clearError() {
      set({ error: undefined });
    },

    reset() {
      clearDebounce();
      set({
        projectSlug: undefined,
        manifest: createDefaultContextBuilderManifest(),
        mtime: undefined,
        scriptExists: false,
        entryRegistered: false,
        isLoading: false,
        isSaving: false,
        error: undefined,
        staleConflict: undefined,
        externalChangePending: false,
        secretWarningCommandIndices: [],
      });
    },
  };
});
