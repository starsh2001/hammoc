/**
 * Story 28.5: Harness slash-command store.
 *
 * Holds the merged tree of slash-command cards for the Harness Workbench
 * "Commands" panel and the palette-visible count. Editing happens directly in
 * `CommandEditor` (300ms debounce); the store is only responsible for list
 * state, copy / directory-copy orchestration, and dispatching the
 * `hammoc:slashCommandsChanged` event so the chat slash palette stays in sync
 * (AC2 — see `useSlashCommands.invalidateSlashCommandsCache`).
 */

import { create } from 'zustand';
import type {
  HarnessCommandCard,
  HarnessCommandCopyRequest,
  HarnessCommandCopyResponse,
  HarnessCommandDirectoryCopyRequest,
  HarnessCommandDirectoryCopyResponse,
  HarnessCommandListResponse,
  HarnessCommandMalformedEntry,
  HarnessExternalChangeEvent,
} from '@hammoc/shared';
import { ApiError } from '../services/api/client';
import {
  copyCommand,
  copyCommandDirectory,
  listCommands,
} from '../services/api/harnessCommandsApi';
import {
  invalidateSlashCommandsCache,
  SLASH_COMMANDS_CHANGED_EVENT,
} from '../hooks/useSlashCommands';

interface HarnessCommandStoreState {
  cards: HarnessCommandCard[];
  malformed: HarnessCommandMalformedEntry[];
  paletteVisibleCount: number;
  lastProjectSlug?: string;
  isLoading: boolean;
  error?: { code: string; message: string; details?: Record<string, unknown> };

  load(projectSlug?: string): Promise<void>;
  copy(req: HarnessCommandCopyRequest): Promise<HarnessCommandCopyResponse>;
  copyDirectory(
    req: HarnessCommandDirectoryCopyRequest,
  ): Promise<HarnessCommandDirectoryCopyResponse>;
  /** Components call this after `createCommand`/`updateCommand`/`deleteCommand` succeeds. */
  notifySlashCommandsChanged(): void;
  handleExternalChange(payload: HarnessExternalChangeEvent): void;
  reset(): void;
}

const TRACKED_FILE_PATTERNS: RegExp[] = [/^commands\/.*\.md$/];

function pathMatchesTrackedFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  return TRACKED_FILE_PATTERNS.some((re) => re.test(normalized));
}

function emitSlashCommandsChanged(projectSlug?: string): void {
  invalidateSlashCommandsCache(projectSlug);
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent(SLASH_COMMANDS_CHANGED_EVENT, { detail: { projectSlug } }),
    );
  }
}

export const useHarnessCommandStore = create<HarnessCommandStoreState>((set, get) => ({
  cards: [],
  malformed: [],
  paletteVisibleCount: 0,
  isLoading: false,

  async load(projectSlug?: string) {
    set({ isLoading: true, error: undefined, lastProjectSlug: projectSlug });
    try {
      const res: HarnessCommandListResponse = await listCommands(projectSlug);
      set({
        cards: res.cards,
        malformed: res.malformed,
        paletteVisibleCount: res.paletteVisibleCount,
        isLoading: false,
      });
      // Sync the chat slash palette so external workbench loads (e.g. the user
      // came back to a tab after editing files in their IDE) trigger a refetch.
      emitSlashCommandsChanged(projectSlug);
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

  async copy(req: HarnessCommandCopyRequest): Promise<HarnessCommandCopyResponse> {
    set({ error: undefined });
    try {
      const res = await copyCommand(req);
      const slug = get().lastProjectSlug;
      await get().load(slug);
      emitSlashCommandsChanged(slug);
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

  async copyDirectory(
    req: HarnessCommandDirectoryCopyRequest,
  ): Promise<HarnessCommandDirectoryCopyResponse> {
    set({ error: undefined });
    try {
      const res = await copyCommandDirectory(req);
      const slug = get().lastProjectSlug;
      await get().load(slug);
      emitSlashCommandsChanged(slug);
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

  notifySlashCommandsChanged() {
    emitSlashCommandsChanged(get().lastProjectSlug);
  },

  handleExternalChange(payload: HarnessExternalChangeEvent) {
    if (payload.scope !== 'user' && payload.scope !== 'project') return;
    if (!pathMatchesTrackedFile(payload.path)) return;
    void (async () => {
      const slug = get().lastProjectSlug;
      await get().load(slug);
      // load() already dispatches; emit here is redundant but keeps the
      // flow explicit for readers — guard rails for the Slash Palette
      // Integration AC2(d) "external change → palette also refreshes".
    })();
  },

  reset() {
    set({
      cards: [],
      malformed: [],
      paletteVisibleCount: 0,
      lastProjectSlug: undefined,
      isLoading: false,
      error: undefined,
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
