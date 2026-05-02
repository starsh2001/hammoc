/**
 * Story 28.3: Harness MCP store.
 *
 * Holds the merged 3-source card list for the "Harness Workbench → MCP"
 * panel along with the cached spike outcomes (`userFileKind` /
 * `disableStrategy`) that drive empty-state and toggle copy in the UI.
 *
 * Editing is intentionally NOT routed through the store — the McpEditor
 * component owns its own draft state and calls the harness MCP API directly
 * so the editor's debounce loop does not have to round-trip through Zustand
 * selectors. After a successful save the component triggers `load()` on the
 * store to pick up new mtimes / merged source layouts.
 *
 * External-change events come from the existing `harness:external-change`
 * channel (Story 28.0.5) — Story 28.3 expands the watcher in
 * fileWatcherService to also cover `<projectRoot>/.mcp.json` (which sits
 * outside `.claude/`). The path matchers below recognise four file forms
 * (`.mcp.json` user, `.mcp.json` project, `settings.json` user,
 * `mcp.disabled.json`) so any edit to those files refreshes the panel.
 */

import { create } from 'zustand';
import type {
  HarnessExternalChangeEvent,
  HarnessMcpCard,
  HarnessMcpCopyRequest,
  HarnessMcpCopyResponse,
  HarnessMcpListResponse,
  HarnessMcpMalformedEntry,
} from '@hammoc/shared';
import { ApiError } from '../services/api/client';
import { copyMcp, listMcps } from '../services/api/harnessMcpsApi';

interface HarnessMcpStoreState {
  cards: HarnessMcpCard[];
  malformed: HarnessMcpMalformedEntry[];
  userFileKind: HarnessMcpListResponse['userFileKind'];
  disableStrategy: HarnessMcpListResponse['disableStrategy'];
  /** Slug threaded through the most recent `load` call. */
  lastProjectSlug?: string;
  isLoading: boolean;
  error?: { code: string; message: string };
  /**
   * Story 28.3 AC2: Spike A v1.2 결과 fresh-spawn 이므로 토글이 다음 user 메시지부터
   * 적용된다. 토글 직후 inline banner 를 띄워 사용자에게 새 세션 CTA 를 안내한다.
   */
  bannerVisible: boolean;

  load(projectSlug?: string): Promise<void>;
  copy(req: HarnessMcpCopyRequest): Promise<HarnessMcpCopyResponse>;
  handleExternalChange(payload: HarnessExternalChangeEvent): void;
  showFreshSpawnBanner(): void;
  dismissBanner(): void;
  reset(): void;
}

const TRACKED_FILE_PATTERNS: RegExp[] = [
  /^\.mcp\.json$/,
  /^settings\.json$/,
  /^mcp\.disabled\.json$/,
];

function pathMatchesTrackedFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  return TRACKED_FILE_PATTERNS.some((re) => re.test(normalized));
}

export const useHarnessMcpStore = create<HarnessMcpStoreState>((set, get) => ({
  cards: [],
  malformed: [],
  userFileKind: 'mcp.json',
  disableStrategy: 'backup',
  isLoading: false,
  bannerVisible: false,

  async load(projectSlug?: string) {
    set({ isLoading: true, error: undefined, lastProjectSlug: projectSlug });
    try {
      const res = await listMcps(projectSlug);
      set({
        cards: res.cards,
        malformed: res.malformed,
        userFileKind: res.userFileKind,
        disableStrategy: res.disableStrategy,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: { code: toErrorCode(err), message: toErrorMessage(err) },
      });
    }
  },

  async copy(req: HarnessMcpCopyRequest): Promise<HarnessMcpCopyResponse> {
    set({ error: undefined });
    try {
      const res = await copyMcp(req);
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

  showFreshSpawnBanner() {
    set({ bannerVisible: true });
  },

  dismissBanner() {
    set({ bannerVisible: false });
  },

  reset() {
    set({
      cards: [],
      malformed: [],
      userFileKind: 'mcp.json',
      disableStrategy: 'backup',
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
