/**
 * Story 28.2: Harness skill store.
 *
 * Holds the merged 3-source card list for the "Harness Workbench → Skills"
 * panel and the in-flight error/loading flags. Editing is intentionally NOT
 * routed through the store — the SkillEditor component owns its own
 * draft state and calls `updateSkill`/`writeBundleFile` directly so the
 * store stays small and the editor's debounce loop does not have to
 * round-trip through Zustand selectors. After a successful save the
 * component triggers `load()` on the store to pick up new mtimes / merged
 * source layouts.
 *
 * External-change events come from the existing `harness:external-change`
 * channel introduced in Story 28.0.5. Unlike Story 28.1 (which only
 * subscribes to user scope), the SkillPanel subscribes to both user and
 * project scope, so this store's `pathMatchesTrackedFile` helper accepts
 * both scopes.
 */

import { create } from 'zustand';
import type {
  HarnessExternalChangeEvent,
  HarnessSkillCard,
  HarnessSkillCopyRequest,
  HarnessSkillCopyResponse,
  HarnessSkillMalformedEntry,
} from '@hammoc/shared';
import { ApiError } from '../services/api/client';
import { copySkill, listSkills } from '../services/api/harnessSkillsApi';

interface HarnessSkillStoreState {
  cards: HarnessSkillCard[];
  malformed: HarnessSkillMalformedEntry[];
  /** Slug threaded through the most recent `load` call. */
  lastProjectSlug?: string;
  isLoading: boolean;
  error?: { code: string; message: string };

  load(projectSlug?: string): Promise<void>;
  copy(req: HarnessSkillCopyRequest): Promise<HarnessSkillCopyResponse>;
  handleExternalChange(payload: HarnessExternalChangeEvent): void;
  reset(): void;
}

/**
 * Tracks SKILL.md and any file under the four bundle directories. Both user
 * and project scope are watched so external edits to either tree refresh the
 * panel.
 */
function pathMatchesTrackedFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  if (/^skills\/[^/]+\/SKILL\.md$/.test(normalized)) return true;
  if (/^skills\/[^/]+\/(references|examples|scripts|assets)\/.+/.test(normalized)) return true;
  return false;
}

export const useHarnessSkillStore = create<HarnessSkillStoreState>((set, get) => ({
  cards: [],
  malformed: [],
  isLoading: false,

  async load(projectSlug?: string) {
    set({ isLoading: true, error: undefined, lastProjectSlug: projectSlug });
    try {
      const res = await listSkills(projectSlug);
      set({
        cards: res.cards,
        malformed: res.malformed,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: { code: toErrorCode(err), message: toErrorMessage(err) },
      });
    }
  },

  async copy(req: HarnessSkillCopyRequest): Promise<HarnessSkillCopyResponse> {
    set({ error: undefined });
    try {
      const res = await copySkill(req);
      // Refetch with the last-known slug so the new card is visible immediately.
      await get().load(get().lastProjectSlug);
      return res;
    } catch (err) {
      set({ error: { code: toErrorCode(err), message: toErrorMessage(err) } });
      throw err;
    }
  },

  handleExternalChange(payload: HarnessExternalChangeEvent) {
    if (payload.scope !== 'user' && payload.scope !== 'project') return;
    if (!pathMatchesTrackedFile(payload.path)) return;
    void get().load(get().lastProjectSlug);
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
