/**
 * Story 30.1 (Task 3): client store for harness share-scope verdicts.
 *
 * Owns two pieces of state:
 *   - `mode`  — Mode A / Mode B classification for the project as a whole
 *   - `cards` — per-path verdict (`shared` / `local` / `fullyIgnored`) for
 *               every harness file the panels know about
 *
 * `handleExternalChange` is the bridge from the existing `harness:external-change`
 * socket event (Story 28.0.5) — when the discriminated path `'../.gitignore'`
 * arrives the entire scope is recomputed because every other verdict depends
 * on `.gitignore`. Other harness file changes (created/deleted) re-evaluate
 * just that single path so the badge tracks file-creation flows like the
 * Task 6.4 auto-`*.local.*` sibling generation.
 */

import { create } from 'zustand';
import type { HarnessExternalChangeEvent, ShareMode, ShareScope } from '@hammoc/shared';
import { ApiError } from '../services/api/client';
import { fetchShareScope } from '../services/api/harnessShareScopeApi';

/**
 * Default path set evaluated by the workbench. Every `.gitignore` reload
 * fetches verdicts for these paths so the share badge can render
 * synchronously across the Task 5 panels without per-card round trips.
 *
 * Panels that hold dynamic file lists (e.g. agents, commands, skills) call
 * `evaluateMore()` with their actual paths after their own load completes.
 */
const PROBE_PATHS: readonly string[] = [
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.claude/.mcp.json',
  '.mcp.json',
  '.claude/CLAUDE.md',
  'CLAUDE.md',
];

const GITIGNORE_DISCRIMINATOR = '../.gitignore';

interface ShareScopeStoreState {
  mode: ShareMode;
  cards: Record<string, ShareScope>;
  isLoading: boolean;
  error: string | null;
  /** Tracked so the prefetch callback can detect slug switches. */
  lastProjectSlug?: string;

  load(projectSlug: string): Promise<void>;
  /** Evaluate additional paths and merge them into `cards`. */
  evaluateMore(projectSlug: string, paths: string[]): Promise<void>;
  /** Lookup a single path's verdict without subscribing the whole tree. */
  getScope(path: string): ShareScope | undefined;
  /** Wired to `harness:external-change` — see file header for the reload rules. */
  handleExternalChange(payload: HarnessExternalChangeEvent, projectSlug: string): void;
  reset(): void;
}

function knownPathsForProject(state: ShareScopeStoreState): string[] {
  const known = Object.keys(state.cards);
  if (known.length === 0) return [...PROBE_PATHS];
  // `Set` dedupe protects against the probe paths overlapping with paths the
  // panels added via `evaluateMore`.
  return Array.from(new Set([...PROBE_PATHS, ...known]));
}

export const useHarnessShareScopeStore = create<ShareScopeStoreState>((set, get) => ({
  mode: 'unknown',
  cards: {},
  isLoading: false,
  error: null,

  async load(projectSlug) {
    set({ isLoading: true, error: null, lastProjectSlug: projectSlug });
    try {
      const result = await fetchShareScope(projectSlug, [...PROBE_PATHS]);
      set({
        mode: result.mode,
        cards: result.cards,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
      // On error, leave the existing `cards` alone (the UI prefers stale
      // verdicts to flickering empty badges) and fall back to `unknown` mode.
      set((s) => ({
        mode: s.cards && Object.keys(s.cards).length > 0 ? s.mode : 'unknown',
        isLoading: false,
        error: message,
      }));
    }
  },

  async evaluateMore(projectSlug, paths) {
    const newPaths = paths.filter((p) => !(p in get().cards));
    if (newPaths.length === 0) return;
    try {
      const result = await fetchShareScope(projectSlug, newPaths);
      set((s) => ({ cards: { ...s.cards, ...result.cards }, mode: result.mode }));
    } catch {
      // Silent — leave existing cards intact. Caller (panel mount) can retry.
    }
  },

  getScope(path) {
    return get().cards[path];
  },

  handleExternalChange(payload, projectSlug) {
    if (payload.scope !== 'project' || payload.projectSlug !== projectSlug) return;

    // `.gitignore` change → recompute the entire share-scope (every verdict
    // depends on it). This is the only path that requires a full reload.
    if (payload.path === GITIGNORE_DISCRIMINATOR) {
      void (async () => {
        const reload = await fetchShareScope(projectSlug, knownPathsForProject(get()));
        set({ mode: reload.mode, cards: reload.cards });
      })();
      return;
    }

    // Other harness files: only re-evaluate the single path. This catches
    // flows like Task 6.4 ("Move to local") that just created a new
    // `*.local.json` sibling — the new file needs its badge immediately.
    if (payload.type === 'created' || payload.type === 'modified' || payload.type === 'deleted') {
      void (async () => {
        try {
          const result = await fetchShareScope(projectSlug, [payload.path]);
          set((s) => ({
            cards: { ...s.cards, ...result.cards },
            // Defer mode updates to the canonical reload path — recomputing
            // mode from a single-path query is wasteful and also redundant.
            mode: s.mode,
          }));
        } catch {
          // Silent — drop the event; next manual reload will recover.
        }
      })();
    }
  },

  reset() {
    set({ mode: 'unknown', cards: {}, isLoading: false, error: null, lastProjectSlug: undefined });
  },
}));
