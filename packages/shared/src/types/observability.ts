// Story 31.3: Observability — MCP call log + token attribution (Epic 31).
//
// Single source of truth for the observability domain shared between the
// server (persistence + collection hook + count_tokens proxy + attribution)
// and the client (api → store → panel). Mirrors the type-locality convention
// of `harness.ts` / `contextBuilder` types.

// ---------------------------------------------------------------------------
// (A) MCP call log
// ---------------------------------------------------------------------------

/**
 * One persisted tool-call record (AC-A1.c). Collected read-only from the shared
 * stream callback builder (`buildStreamCallbacks`) on the browser + queue paths.
 *
 * **append lifecycle (S-A)** — a record is appended EXACTLY ONCE per call, at
 * `onToolResult` time (complete record with `durationMs`/`success` filled). An
 * orphan (onToolUse fired but onToolResult never arrived — session abort / tool
 * hang) is flushed ONCE at turn end with the nullable fields set to `null`.
 * Because the log is append-only JSONL, a `null` in `durationMs`/`resultBytes`/
 * `success` therefore unambiguously means "started-never-returned", and a single
 * call never produces two records.
 *
 * **secret policy** — argument/result BODIES are never stored; only their UTF-8
 * byte sizes (`argBytes`/`resultBytes`). File contents / secrets cannot leak.
 */
export interface McpCallRecord {
  /** toolUseId — also the orphan-flush key. */
  id: string;
  projectSlug: string;
  sessionId: string;
  /** `mcp__<server>__<tool>` → `<server>`; built-in tools (Read/Edit/Bash/…) → null. */
  serverName: string | null;
  /** Full tool name (`mcp__server__tool` or `Read`/`Edit`/…). */
  toolName: string;
  /** epoch ms — stamped at onToolUse. */
  startedAt: number;
  /** onToolResult − onToolUse, in ms. `null` ⟺ orphan (turn-end flush). */
  durationMs: number | null;
  /** `Buffer.byteLength(JSON.stringify(input), 'utf8')` — body discarded (UTF-8 bytes). */
  argBytes: number;
  /** Result size in UTF-8 bytes. `null` ⟺ orphan (result never arrived). */
  resultBytes: number | null;
  /** Tool success. `null` ⟺ orphan (result never arrived, turn-end flush). */
  success: boolean | null;
}

/** One aggregation row (grouped by serverName + toolName). */
export interface McpCallAggregate {
  serverName: string | null;
  toolName: string;
  count: number;
  /** Mean of non-null durationMs across the group (0 when all orphans). */
  avgDurationMs: number;
  /** Count of records whose `success === false`. */
  errorCount: number;
}

/** Filter/query for the MCP call log (AC-A2). */
export interface ObservabilityQuery {
  /** Filter by server name (`null` selects built-ins via the literal string "null"? — no: omitted = all). */
  server?: string;
  /** Filter by full tool name. */
  tool?: string;
  /** Filter to a single session. */
  sessionId?: string;
  /** Only records within the last N days (defaults to the retention window). */
  sinceDays?: number;
}

/** GET …/mcp-calls response — aggregates (for the chart) + a recent timeline. */
export interface ObservabilityMcpCallsResponse {
  aggregates: McpCallAggregate[];
  /** Most-recent-first slice of raw records (capped by the server). */
  timeline: McpCallRecord[];
}

// ---------------------------------------------------------------------------
// (B) Token attribution
// ---------------------------------------------------------------------------

/**
 * Measured harness element kinds (AC-B1.a). `'hook'` is intentionally absent
 * (S-2): arbitrary SessionStart hook runtime output is NOT measured (requires
 * executing the hook, out of scope). The Hammoc-managed context-builder
 * injection is represented by `'contextBuilder'` and estimated from the Story
 * 31.2 manifest WITHOUT execution.
 */
export type TokenAttributionKind =
  | 'claudeMd-project'
  | 'claudeMd-global'
  | 'skill'
  | 'contextBuilder';

/**
 * One harness element's token weight (AC-B1). `bytes` is UTF-8 bytes
 * (`Buffer.byteLength`); `approxTokens = ceil(bytes/4)` (the size-based
 * heuristic — see spike #1, §14). `exactTokens` is filled in lazily by the
 * "exact count" button (AC-B3). File-based kinds (`claudeMd-*`/`skill`) carry a
 * `path`; `contextBuilder` has none (assembled from the manifest, N-1).
 */
export interface TokenAttributionItem {
  kind: TokenAttributionKind;
  /** Human label (file name / skill name / "Context builder"). */
  label: string;
  /** Present for file-based kinds; absent for `contextBuilder`. */
  path?: string;
  /** UTF-8 byte size of the element's text. */
  bytes: number;
  /** ceil(bytes / 4) — always `~`-prefixed in the UI (heuristic). */
  approxTokens: number;
  /** Filled by the exact-count proxy (count_tokens); absent until requested. */
  exactTokens?: number;
  /** sha256 of the element's text — exact-count cache key + change detection. */
  contentHash: string;
}

/** GET …/token-attribution response. */
export interface TokenAttributionResponse {
  items: TokenAttributionItem[];
}

/** POST …/exact-count request (AC-B3). */
export interface ExactTokenCountRequest {
  kind: TokenAttributionKind;
  /** Required for file-based kinds; omitted for `contextBuilder`. */
  path?: string;
  /**
   * Optimistic cache-key hint echoed from the last token-attribution response.
   * The server RE-COMPUTES the sha from the real input before trusting it
   * (N-B), so a stale/forged value just forces a cache miss + recompute.
   */
  contentHash: string;
}

/** POST …/exact-count response (AC-B3). */
export interface ExactTokenCountResponse {
  /** Official token count (count_tokens input_tokens). 0 when `failed`. */
  tokens: number;
  /** True when served from the file-hash cache (no API call made). */
  cached: boolean;
  /** True when the count_tokens proxy failed — client keeps the approximation (AC-B3.c). */
  failed?: boolean;
}

// ---------------------------------------------------------------------------
// (B4) tokenizer preference (global, persisted to ~/.hammoc/preferences.json)
// ---------------------------------------------------------------------------

/**
 * Approximation tokenizer tier for the SERVER-side approximation (AC-B4). The
 * client inline hint is always byte `size/4` (AC-B2.b) and is NOT switched by
 * this preference.
 *
 * spike #1 (§14, 2026-06-02) measured `@anthropic-ai/tokenizer` at −25%~−45%
 * vs `count_tokens` for Latin text — it does not beat `size/4`, so the
 * `'anthropic-tokenizer'` tier is NOT adopted (Task A.4 skipped). The toggle
 * still renders (AC-B4.b) with `'size/4'` as the single active option; the
 * second option remains reserved should a future accurate tokenizer land.
 */
export type ObservabilityTokenizer = 'size/4' | 'anthropic-tokenizer';

export const OBSERVABILITY_TOKENIZER_DEFAULT: ObservabilityTokenizer = 'size/4';

/**
 * Tokenizer options the server reports as selectable. Per spike #1 only
 * `'size/4'` is active; the panel renders the rest disabled with a rationale
 * notice (AC-B4.b). This list is the single source of truth for "which tiers
 * exist" so the client never hard-codes the degrade branch.
 */
export const OBSERVABILITY_TOKENIZER_OPTIONS: readonly ObservabilityTokenizer[] = [
  'size/4',
] as const;

/** GET/PUT …/tokenizer-pref response (AC-B4). */
export interface ObservabilityTokenizerPrefResponse {
  tokenizer: ObservabilityTokenizer;
  /** The selectable tiers (mirrors OBSERVABILITY_TOKENIZER_OPTIONS). */
  options: ObservabilityTokenizer[];
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/** Default MCP-log retention window in days (AC-A3.b). */
export const OBSERVABILITY_RETENTION_DAYS = 30;

/** Max timeline records returned by …/mcp-calls (server-side cap). */
export const OBSERVABILITY_TIMELINE_CAP = 500;
