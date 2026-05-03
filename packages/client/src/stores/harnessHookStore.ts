/**
 * Story 28.4: Harness Hook store.
 *
 * Holds the merged 9-event card map for the "Harness Workbench → Hook" panel
 * and the cached spike result (`promptTypeSupport`) plus the two-file
 * STALE_WRITE guard data (`backupMtimeByScope`).
 *
 * Editing happens directly in HookEditor (300ms debounce) — the store is
 * only responsible for list state, copy orchestration, the AC5 toggle helper
 * (which auto-fills the two mtime guards), and the freshSpawn banner.
 */

import { create } from 'zustand';
import type {
  HarnessExternalChangeEvent,
  HarnessHookCard,
  HarnessHookCopyRequest,
  HarnessHookCopyResponse,
  HarnessHookEvent,
  HarnessHookListResponse,
  HarnessHookMalformedEntry,
} from '@hammoc/shared';
import { HARNESS_HOOK_EVENTS } from '@hammoc/shared';
import { ApiError } from '../services/api/client';
import { copyHook, listHooks, updateHook } from '../services/api/harnessHooksApi';

interface HarnessHookStoreState {
  cardsByEvent: HarnessHookListResponse['cardsByEvent'];
  malformed: HarnessHookMalformedEntry[];
  promptTypeSupport: HarnessHookListResponse['promptTypeSupport'];
  /** S3 — backup file mtimes for the AC5 two-file STALE_WRITE guard. */
  backupMtimeByScope: HarnessHookListResponse['backupMtimeByScope'];
  lastProjectSlug?: string;
  isLoading: boolean;
  error?: { code: string; message: string; details?: Record<string, unknown> };
  /** AC5 — toggle takes effect on next user message; banner asks user to start a fresh session. */
  bannerVisible: boolean;

  load(projectSlug?: string): Promise<void>;
  copy(req: HarnessHookCopyRequest): Promise<HarnessHookCopyResponse>;
  /** AC5 toggle helper — auto-fills `expectedMtime` and `expectedBackupMtime`. */
  toggleEnabled(card: HarnessHookCard, nextEnabled: boolean): Promise<void>;
  handleExternalChange(payload: HarnessExternalChangeEvent): void;
  showFreshSpawnBanner(): void;
  dismissBanner(): void;
  reset(): void;
}

const TRACKED_FILE_PATTERNS: RegExp[] = [
  /^settings\.json$/,
  /^hooks\.disabled\.json$/,
];

function pathMatchesTrackedFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  return TRACKED_FILE_PATTERNS.some((re) => re.test(normalized));
}

function emptyCardsByEvent(): HarnessHookListResponse['cardsByEvent'] {
  const out: Partial<Record<HarnessHookEvent, HarnessHookCard[]>> = {};
  for (const e of HARNESS_HOOK_EVENTS) out[e] = [];
  return out as HarnessHookListResponse['cardsByEvent'];
}

export const useHarnessHookStore = create<HarnessHookStoreState>((set, get) => ({
  cardsByEvent: emptyCardsByEvent(),
  malformed: [],
  promptTypeSupport: 'unknown',
  backupMtimeByScope: {},
  isLoading: false,
  bannerVisible: false,

  async load(projectSlug?: string) {
    set({ isLoading: true, error: undefined, lastProjectSlug: projectSlug });
    try {
      const res = await listHooks(projectSlug);
      set({
        cardsByEvent: res.cardsByEvent,
        malformed: res.malformed,
        promptTypeSupport: res.promptTypeSupport,
        backupMtimeByScope: res.backupMtimeByScope ?? {},
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: {
          code: toErrorCode(err),
          message: toErrorMessage(err),
          details: toErrorDetails(err),
        },
      });
    }
  },

  async copy(req: HarnessHookCopyRequest): Promise<HarnessHookCopyResponse> {
    set({ error: undefined });
    try {
      const res = await copyHook(req);
      await get().load(get().lastProjectSlug);
      return res;
    } catch (err) {
      set({
        error: {
          code: toErrorCode(err),
          message: toErrorMessage(err),
          details: toErrorDetails(err),
        },
      });
      throw err;
    }
  },

  async toggleEnabled(card: HarnessHookCard, nextEnabled: boolean): Promise<void> {
    if (card.scope === 'plugin') {
      throw new Error('plugin-scope hooks are read-only');
    }
    set({ error: undefined });
    const scope = card.scope as 'project' | 'user';
    const expectedBackupMtime = get().backupMtimeByScope[scope];
    try {
      const res = await updateHook(card, {
        enabled: nextEnabled,
        expectedMtime: card.mtime,
        expectedBackupMtime,
      });
      // Persist new backup mtime so the next toggle has a fresh guard.
      if (res.backupMtime !== undefined) {
        set((state) => ({
          backupMtimeByScope: {
            ...state.backupMtimeByScope,
            [scope]: res.backupMtime,
          },
        }));
      }
      get().showFreshSpawnBanner();
      await get().load(get().lastProjectSlug);
    } catch (err) {
      set({
        error: {
          code: toErrorCode(err),
          message: toErrorMessage(err),
          details: toErrorDetails(err),
        },
      });
      throw err;
    }
  },

  handleExternalChange(payload: HarnessExternalChangeEvent) {
    if (payload.scope !== 'user' && payload.scope !== 'project') return;
    if (!pathMatchesTrackedFile(payload.path)) return;
    void get().load(get().lastProjectSlug);
  },

  showFreshSpawnBanner() {
    set({ bannerVisible: true });
  },

  dismissBanner() {
    set({ bannerVisible: false });
  },

  reset() {
    set({
      cardsByEvent: emptyCardsByEvent(),
      malformed: [],
      promptTypeSupport: 'unknown',
      backupMtimeByScope: {},
      lastProjectSlug: undefined,
      isLoading: false,
      error: undefined,
      bannerVisible: false,
    });
  },
}));

function toErrorCode(err: unknown): string {
  if (err instanceof ApiError) return err.code;
  return 'UNKNOWN_ERROR';
}

function toErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function toErrorDetails(err: unknown): Record<string, unknown> | undefined {
  if (err instanceof ApiError && err.details) {
    return err.details as Record<string, unknown>;
  }
  return undefined;
}
