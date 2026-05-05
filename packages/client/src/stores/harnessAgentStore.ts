/**
 * Story 28.6: Harness sub-agent store.
 *
 * Holds the merged card list of `.claude/agents/*.md` files for the Harness
 * Workbench "Agents" panel. Editing happens directly in `AgentEditor` (300ms
 * debounce); the store is only responsible for list state and copy
 * orchestration.
 *
 * Differences from 28.5 (commands):
 *   - no `paletteVisibleCount` (agents are not exposed via the chat slash palette)
 *   - no `copyDirectory` (single-file copy only — flat-only directory)
 *   - no `invalidateSlashCommandsCache` calls (agents are Task-tool-only)
 */

import { create } from 'zustand';
import type {
  HarnessAgentCard,
  HarnessAgentCopyRequest,
  HarnessAgentCopyResponse,
  HarnessAgentListResponse,
  HarnessAgentMalformedEntry,
  HarnessExternalChangeEvent,
} from '@hammoc/shared';
import { ApiError } from '../services/api/client';
import { copyAgent, listAgents } from '../services/api/harnessAgentsApi';

interface HarnessAgentStoreState {
  cards: HarnessAgentCard[];
  malformed: HarnessAgentMalformedEntry[];
  lastProjectSlug?: string;
  isLoading: boolean;
  error?: { code: string; message: string; details?: Record<string, unknown> };

  load(projectSlug?: string): Promise<void>;
  copy(req: HarnessAgentCopyRequest): Promise<HarnessAgentCopyResponse>;
  handleExternalChange(payload: HarnessExternalChangeEvent): void;
  reset(): void;
}

/**
 * Tracked path patterns — only `.claude/agents/<file>.md` (flat-only) match.
 * Subdirectory paths are intentionally rejected per AC1.a.
 */
const TRACKED_FILE_PATTERNS: RegExp[] = [/^agents\/[^/]+\.md$/];

function pathMatchesTrackedFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  return TRACKED_FILE_PATTERNS.some((re) => re.test(normalized));
}

export const useHarnessAgentStore = create<HarnessAgentStoreState>((set, get) => ({
  cards: [],
  malformed: [],
  isLoading: false,

  async load(projectSlug?: string) {
    // Stale-while-revalidate: keep cached cards on screen when re-entering the
    // panel for the same project; only show the loading skeleton on first load,
    // project change, or recovery from an error.
    const state = get();
    const isWarmCache = state.lastProjectSlug === projectSlug && !state.error;
    if (isWarmCache) {
      set({ error: undefined, lastProjectSlug: projectSlug });
    } else {
      set({
        cards: [],
        malformed: [],
        isLoading: true,
        error: undefined,
        lastProjectSlug: projectSlug,
      });
    }
    try {
      const res: HarnessAgentListResponse = await listAgents(projectSlug);
      set({
        cards: res.cards,
        malformed: res.malformed,
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

  async copy(req: HarnessAgentCopyRequest): Promise<HarnessAgentCopyResponse> {
    set({ error: undefined });
    try {
      const res = await copyAgent(req);
      const slug = get().lastProjectSlug;
      await get().load(slug);
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

  handleExternalChange(payload: HarnessExternalChangeEvent) {
    if (payload.scope !== 'user' && payload.scope !== 'project') return;
    if (!pathMatchesTrackedFile(payload.path)) return;
    void (async () => {
      const slug = get().lastProjectSlug;
      await get().load(slug);
    })();
  },

  reset() {
    set({
      cards: [],
      malformed: [],
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
