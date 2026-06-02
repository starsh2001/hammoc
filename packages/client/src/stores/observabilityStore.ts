/**
 * Story 31.3: Observability store (Zustand).
 *
 * Holds the MCP-call aggregates/timeline + filter state, the token-attribution
 * items, a client-side exact-count cache (keyed by the server-provided content
 * hash), and the global tokenizer preference. MCP log data is append-only
 * server-side, so there is no STALE_WRITE concurrency here (unlike 31.2's
 * manifest save) — reads simply re-fetch.
 *
 * The two AC-B1.c percentages are derived by PURE helpers exported below
 * (window-relative via the shared `getContextUsagePercent`, and harness-total
 * relative). Components pass the current context-window size in; the store does
 * not depend on chatStore (keeps it decoupled + unit-testable).
 */

import { create } from 'zustand';
import {
  getContextUsagePercent,
  type McpCallAggregate,
  type McpCallRecord,
  type ObservabilityQuery,
  type TokenAttributionItem,
  type ExactTokenCountResponse,
  type ObservabilityTokenizer,
  OBSERVABILITY_TOKENIZER_DEFAULT,
  OBSERVABILITY_TOKENIZER_OPTIONS,
} from '@hammoc/shared';
import {
  fetchMcpCalls,
  fetchTokenAttribution,
  fetchExactCount,
  fetchTokenizerPref,
  saveTokenizerPref,
} from '../services/api/observabilityApi';

/** Conservative fallback when no session has reported a context window yet. */
export const DEFAULT_CONTEXT_WINDOW = 200_000;

/** AC-B1.c (i) — element's share of the (effective) context window. */
export function windowPercent(tokens: number, contextWindow: number): number {
  return getContextUsagePercent(tokens, contextWindow > 0 ? contextWindow : DEFAULT_CONTEXT_WINDOW);
}

/** AC-B1.c (ii) — element's share of the harness system-prompt total. */
export function harnessSharePercent(tokens: number, totalTokens: number): number {
  if (totalTokens <= 0) return 0;
  return Math.round((tokens / totalTokens) * 100);
}

/**
 * Effective token count for an element: the exact count when it has been
 * fetched, otherwise the byte-based approximation (AC-B3.c fallback). `isExact`
 * drives the `~` prefix in the UI.
 */
export function effectiveTokens(
  item: TokenAttributionItem,
  exactByHash: Record<string, ExactTokenCountResponse>,
): { tokens: number; isExact: boolean } {
  const exact = exactByHash[item.contentHash];
  if (exact && !exact.failed) return { tokens: exact.tokens, isExact: true };
  return { tokens: item.approxTokens, isExact: false };
}

interface ObservabilityState {
  projectSlug?: string;

  // ---- MCP call log ----
  aggregates: McpCallAggregate[];
  timeline: McpCallRecord[];
  filter: ObservabilityQuery;
  mcpLoading: boolean;
  mcpError?: string;

  // ---- token attribution ----
  attribution: TokenAttributionItem[];
  attrLoading: boolean;
  attrError?: string;
  /** contentHash → exact count result (client memoize). */
  exactByHash: Record<string, ExactTokenCountResponse>;
  /** contentHash → in-flight flag. */
  exactPending: Record<string, boolean>;

  // ---- tokenizer pref (AC-B4) ----
  tokenizer: ObservabilityTokenizer;
  tokenizerOptions: ObservabilityTokenizer[];

  // ---- actions ----
  loadMcpCalls: (projectSlug: string) => Promise<void>;
  setFilter: (patch: Partial<ObservabilityQuery>) => void;
  loadTokenAttribution: (projectSlug: string) => Promise<void>;
  requestExactCount: (projectSlug: string, item: TokenAttributionItem) => Promise<void>;
  loadTokenizerPref: () => Promise<void>;
  updateTokenizer: (tokenizer: ObservabilityTokenizer) => Promise<void>;
  reset: () => void;
}

export const useObservabilityStore = create<ObservabilityState>((set, get) => ({
  aggregates: [],
  timeline: [],
  filter: {},
  mcpLoading: false,
  attribution: [],
  attrLoading: false,
  exactByHash: {},
  exactPending: {},
  tokenizer: OBSERVABILITY_TOKENIZER_DEFAULT,
  tokenizerOptions: [...OBSERVABILITY_TOKENIZER_OPTIONS],

  async loadMcpCalls(projectSlug) {
    set({ mcpLoading: true, mcpError: undefined, projectSlug });
    try {
      const res = await fetchMcpCalls(projectSlug, get().filter);
      set({ aggregates: res.aggregates, timeline: res.timeline, mcpLoading: false });
    } catch (err) {
      set({ mcpLoading: false, mcpError: (err as Error).message });
    }
  },

  setFilter(patch) {
    const filter = { ...get().filter, ...patch };
    // Drop empty-string filters so they don't over-constrain the query.
    for (const k of ['server', 'tool', 'sessionId'] as const) {
      if (filter[k] === '') delete filter[k];
    }
    set({ filter });
    const slug = get().projectSlug;
    if (slug) void get().loadMcpCalls(slug);
  },

  async loadTokenAttribution(projectSlug) {
    set({ attrLoading: true, attrError: undefined, projectSlug });
    try {
      const res = await fetchTokenAttribution(projectSlug);
      set({ attribution: res.items, attrLoading: false });
    } catch (err) {
      set({ attrLoading: false, attrError: (err as Error).message });
    }
  },

  async requestExactCount(projectSlug, item) {
    const { exactByHash, exactPending } = get();
    // Already counted (success OR recorded failure) or in-flight → no-op.
    if (exactByHash[item.contentHash] || exactPending[item.contentHash]) return;
    set({ exactPending: { ...exactPending, [item.contentHash]: true } });
    try {
      const res = await fetchExactCount(projectSlug, {
        kind: item.kind,
        path: item.path,
        contentHash: item.contentHash,
      });
      set((s) => ({
        exactByHash: { ...s.exactByHash, [item.contentHash]: res },
        exactPending: { ...s.exactPending, [item.contentHash]: false },
      }));
    } catch (err) {
      // Treat a thrown request like a non-blocking failure (AC-B3.c).
      set((s) => ({
        exactByHash: { ...s.exactByHash, [item.contentHash]: { tokens: 0, cached: false, failed: true } },
        exactPending: { ...s.exactPending, [item.contentHash]: false },
        attrError: (err as Error).message,
      }));
    }
  },

  async loadTokenizerPref() {
    try {
      const res = await fetchTokenizerPref();
      set({ tokenizer: res.tokenizer, tokenizerOptions: res.options });
    } catch {
      // keep defaults on failure.
    }
  },

  async updateTokenizer(tokenizer) {
    const prev = get().tokenizer;
    set({ tokenizer }); // optimistic
    try {
      const res = await saveTokenizerPref(tokenizer);
      set({ tokenizer: res.tokenizer, tokenizerOptions: res.options });
    } catch {
      set({ tokenizer: prev }); // revert on failure
    }
  },

  reset() {
    set({
      projectSlug: undefined,
      aggregates: [],
      timeline: [],
      filter: {},
      mcpLoading: false,
      mcpError: undefined,
      attribution: [],
      attrLoading: false,
      attrError: undefined,
      exactByHash: {},
      exactPending: {},
    });
  },
}));
