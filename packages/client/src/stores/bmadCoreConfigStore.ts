/**
 * Story 31.1: BMad core-config editor store (Epic 31).
 *
 * Holds the parsed known/unknown key partition + raw text + mtime for one
 * project's `.bmad-core/core-config.yaml`, and drives the form ⇄ raw toggle,
 * debounced AST patches, and the external-change / STALE_WRITE reload flow.
 *
 * `BMAD_KNOWN_KEYS_MATRIX` is the single source of truth for the 18-key form
 * (group + widget per key); `BMAD_REQUIRED_KEYS` is the Task 0.5 seed from
 * spike § 11 (the scalar keys whose empty value would break BMad agent load).
 */

import { create } from 'zustand';
import type {
  BmadCoreConfigKnownKeys,
  HarnessStructuredPatchOp,
  HarnessExternalChangeEvent,
} from '@hammoc/shared';
import { ApiError } from '../services/api/client';
import {
  readBmadConfig,
  patchBmadConfig,
  writeRawBmadConfig,
} from '../services/api/bmadCoreConfigApi';

// ---------------------------------------------------------------------------
// 18-key matrix — single source of truth for group + widget per key (AC2).
// ---------------------------------------------------------------------------

export type BmadWidgetType = 'boolean' | 'path' | 'string' | 'glob' | 'array';
export type BmadGroup = 'general' | 'qa' | 'prd' | 'architecture' | 'brownfieldEpic';

export interface BmadKeyDef {
  /** Dot-path id — i18n key fragment + `data-testid` segment, e.g. "prd.epicFilePattern". */
  id: string;
  /** AST path used by the patch op + optimistic local update, e.g. ['prd','epicFilePattern']. */
  path: string[];
  group: BmadGroup;
  widget: BmadWidgetType;
}

/** The 5 groups in render order — `general` first, then the 4 nested groups. */
export const BMAD_GROUPS: BmadGroup[] = ['general', 'qa', 'prd', 'architecture', 'brownfieldEpic'];

export const BMAD_KNOWN_KEYS_MATRIX: BmadKeyDef[] = [
  { id: 'markdownExploder', path: ['markdownExploder'], group: 'general', widget: 'boolean' },
  { id: 'qa.qaLocation', path: ['qa', 'qaLocation'], group: 'qa', widget: 'path' },
  { id: 'prd.prdFile', path: ['prd', 'prdFile'], group: 'prd', widget: 'path' },
  { id: 'prd.prdVersion', path: ['prd', 'prdVersion'], group: 'prd', widget: 'string' },
  { id: 'prd.prdSharded', path: ['prd', 'prdSharded'], group: 'prd', widget: 'boolean' },
  { id: 'prd.prdShardedLocation', path: ['prd', 'prdShardedLocation'], group: 'prd', widget: 'path' },
  { id: 'prd.epicFilePattern', path: ['prd', 'epicFilePattern'], group: 'prd', widget: 'glob' },
  { id: 'architecture.architectureFile', path: ['architecture', 'architectureFile'], group: 'architecture', widget: 'path' },
  { id: 'architecture.architectureVersion', path: ['architecture', 'architectureVersion'], group: 'architecture', widget: 'string' },
  { id: 'architecture.architectureSharded', path: ['architecture', 'architectureSharded'], group: 'architecture', widget: 'boolean' },
  { id: 'architecture.architectureShardedLocation', path: ['architecture', 'architectureShardedLocation'], group: 'architecture', widget: 'path' },
  { id: 'customTechnicalDocuments', path: ['customTechnicalDocuments'], group: 'general', widget: 'array' },
  { id: 'devLoadAlwaysFiles', path: ['devLoadAlwaysFiles'], group: 'general', widget: 'array' },
  { id: 'brownfieldEpic.updateOnCreate', path: ['brownfieldEpic', 'updateOnCreate'], group: 'brownfieldEpic', widget: 'array' },
  { id: 'brownfieldEpic.doNotUpdate', path: ['brownfieldEpic', 'doNotUpdate'], group: 'brownfieldEpic', widget: 'array' },
  { id: 'devDebugLog', path: ['devDebugLog'], group: 'general', widget: 'path' },
  { id: 'devStoryLocation', path: ['devStoryLocation'], group: 'general', widget: 'path' },
  { id: 'slashPrefix', path: ['slashPrefix'], group: 'general', widget: 'string' },
];

/**
 * Keys whose empty/blank value would break BMad agent load (spike § 11 — Task
 * 0.5 seed). Only scalar keys where emptiness is fatal: `devLoadAlwaysFiles` is
 * load-bearing too but an empty array is functionally valid, so it is excluded
 * to avoid a false-positive warning. The warning is advisory — save still
 * proceeds on user confirmation (AC6.c).
 */
export const BMAD_REQUIRED_KEYS: string[] = ['devStoryLocation', 'qa.qaLocation', 'slashPrefix'];

export function isRequiredBmadKey(id: string): boolean {
  return BMAD_REQUIRED_KEYS.includes(id);
}

/** The discriminated watcher path the server emits for this file (Task A.4). */
export const BMAD_CONFIG_EXTERNAL_PATH = '../.bmad-core/core-config.yaml';

// ---------------------------------------------------------------------------
// Path helpers — immutable nested get/set/delete over the known-keys object.
// ---------------------------------------------------------------------------

export function getAtPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Immutably set `value` at `path` (creating intermediate objects). `undefined` deletes the leaf. */
function setAtPath<T extends Record<string, unknown>>(obj: T, path: string[], value: unknown): T {
  if (path.length === 0) return obj;
  const [head, ...rest] = path;
  const clone: Record<string, unknown> = { ...obj };
  if (rest.length === 0) {
    if (value === undefined) {
      delete clone[head];
    } else {
      clone[head] = value;
    }
  } else {
    const child = (clone[head] && typeof clone[head] === 'object' && !Array.isArray(clone[head]))
      ? (clone[head] as Record<string, unknown>)
      : {};
    clone[head] = setAtPath(child, rest, value);
  }
  return clone as T;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface StaleConflict {
  /** Server's current mtime — used as `expectedMtime` for an "overwrite" retry. */
  currentMtime: string;
  /** Pending form ops captured at conflict time (form-mode save). */
  pendingOps?: HarnessStructuredPatchOp[];
  /** Pending raw draft captured at conflict time (raw-mode save). */
  pendingRaw?: string;
}

export interface BmadCoreConfigState {
  projectSlug?: string;
  rawContent?: string;
  mtime?: string;
  knownKeys: BmadCoreConfigKnownKeys;
  unknownKeys: Record<string, unknown>;
  isLoading: boolean;
  error?: { code: string; message: string };
  mode: 'form' | 'raw';
  /** Unsaved raw-editor text (raw mode). undefined ⇔ no pending raw edit. */
  dirtyRawDraft?: string;
  /** True while a debounced form patch is queued/in-flight (drives a subtle "saving" hint). */
  isSaving: boolean;
  /** Set when a write returned HARNESS_STALE_WRITE — drives the reload/overwrite modal. */
  staleConflict?: StaleConflict;
  /** Set when the watcher reports an external change while the panel is open (AC3.d). */
  externalChangePending: boolean;

  load: (projectSlug: string) => Promise<void>;
  setMode: (mode: 'form' | 'raw') => void;
  /** Optimistic + debounced AST patch of a single known key (AC2.b, AC3.a). */
  patchKey: (path: string[], value: unknown) => void;
  /** Save the raw-editor draft verbatim (AC5.b). */
  writeRaw: (draft: string) => Promise<void>;
  setDirtyRawDraft: (draft: string | undefined) => void;
  /** Route a watcher event; no-op unless it targets this project's core-config.yaml. */
  handleExternalChange: (payload: HarnessExternalChangeEvent, projectSlug?: string) => void;
  /** Resolve a STALE_WRITE conflict: reload fresh, or overwrite with the server mtime. */
  resolveStale: (action: 'reload' | 'overwrite') => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const DEBOUNCE_MS = 300;

// Module-level debounce state (kept out of the store so it never triggers a
// re-render). Pending ops are keyed by their JSON path so a rapid sequence of
// edits to the same key collapses into one op.
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let pendingOps = new Map<string, HarnessStructuredPatchOp>();

function clearDebounce(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  pendingOps = new Map();
}

export const useBmadCoreConfigStore = create<BmadCoreConfigState>((set, get) => {
  async function flushPending(): Promise<void> {
    const { projectSlug, mtime } = get();
    const ops = Array.from(pendingOps.values());
    pendingOps = new Map();
    debounceTimer = undefined;
    if (!projectSlug || ops.length === 0) {
      set({ isSaving: false });
      return;
    }
    try {
      const { mtime: nextMtime } = await patchBmadConfig(projectSlug, ops, mtime);
      set({ mtime: nextMtime, isSaving: false, error: undefined });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
        const currentMtime = (err.details as { currentMtime?: string })?.currentMtime ?? '';
        set({
          isSaving: false,
          staleConflict: { currentMtime, pendingOps: ops },
        });
        return;
      }
      set({
        isSaving: false,
        error: { code: err instanceof ApiError ? err.code : 'UNKNOWN_ERROR', message: (err as Error).message },
      });
    }
  }

  return {
    knownKeys: {},
    unknownKeys: {},
    isLoading: false,
    mode: 'form',
    isSaving: false,
    externalChangePending: false,

    async load(projectSlug: string) {
      clearDebounce();
      set({ projectSlug, isLoading: true, error: undefined, externalChangePending: false });
      try {
        const res = await readBmadConfig(projectSlug);
        set({
          rawContent: res.content,
          mtime: res.mtime,
          knownKeys: res.knownKeys,
          unknownKeys: res.unknownKeys,
          isLoading: false,
          dirtyRawDraft: undefined,
          staleConflict: undefined,
          externalChangePending: false,
        });
      } catch (err) {
        set({
          isLoading: false,
          error: { code: err instanceof ApiError ? err.code : 'UNKNOWN_ERROR', message: (err as Error).message },
        });
      }
    },

    setMode(mode) {
      set({ mode });
    },

    patchKey(path, value) {
      // Optimistic local update so the widget reflects the change immediately.
      set((s) => ({
        knownKeys: setAtPath(s.knownKeys as Record<string, unknown>, path, value) as BmadCoreConfigKnownKeys,
        isSaving: true,
        error: undefined,
      }));
      pendingOps.set(path.join('.'), { path, value });
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void flushPending();
      }, DEBOUNCE_MS);
    },

    async writeRaw(draft) {
      const { projectSlug, mtime } = get();
      if (!projectSlug) return;
      clearDebounce();
      set({ isSaving: true, error: undefined });
      try {
        const { mtime: nextMtime } = await writeRawBmadConfig(projectSlug, draft, mtime);
        // Re-load so the form partition reflects the raw edit on next form toggle.
        set({ mtime: nextMtime, rawContent: draft, dirtyRawDraft: undefined, isSaving: false });
        await get().load(projectSlug);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
          const currentMtime = (err.details as { currentMtime?: string })?.currentMtime ?? '';
          set({ isSaving: false, staleConflict: { currentMtime, pendingRaw: draft } });
          return;
        }
        set({
          isSaving: false,
          error: { code: err instanceof ApiError ? err.code : 'UNKNOWN_ERROR', message: (err as Error).message },
        });
      }
    },

    setDirtyRawDraft(draft) {
      set({ dirtyRawDraft: draft });
    },

    handleExternalChange(payload, projectSlug) {
      const slug = projectSlug ?? get().projectSlug;
      if (!slug) return;
      if (payload.projectSlug && payload.projectSlug !== slug) return;
      if (payload.path !== BMAD_CONFIG_EXTERNAL_PATH) return;
      // Flag it — the panel surfaces a "file changed externally, reload?" banner.
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
      // overwrite — retry the captured write using the server's current mtime.
      set({ staleConflict: undefined, isSaving: true });
      try {
        if (staleConflict.pendingRaw !== undefined) {
          const { mtime: nextMtime } = await writeRawBmadConfig(projectSlug, staleConflict.pendingRaw, staleConflict.currentMtime);
          set({ mtime: nextMtime, isSaving: false });
          await get().load(projectSlug);
        } else if (staleConflict.pendingOps) {
          const { mtime: nextMtime } = await patchBmadConfig(projectSlug, staleConflict.pendingOps, staleConflict.currentMtime);
          set({ mtime: nextMtime, isSaving: false, error: undefined });
        } else {
          set({ isSaving: false });
        }
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
        rawContent: undefined,
        mtime: undefined,
        knownKeys: {},
        unknownKeys: {},
        isLoading: false,
        error: undefined,
        mode: 'form',
        dirtyRawDraft: undefined,
        isSaving: false,
        staleConflict: undefined,
        externalChangePending: false,
      });
    },
  };
});
