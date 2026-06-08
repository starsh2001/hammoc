/**
 * SDK Types for ChatService
 * These types wrap the @anthropic-ai/claude-agent-sdk types for use in the application
 */

import type { ImageAttachment } from './message.js';

/**
 * Configuration for initializing ChatService
 */
export interface ChatServiceConfig {
  /** Working directory for the Claude session */
  workingDirectory?: string;
  /** Permission mode for tool usage */
  permissionMode?: PermissionMode;
  /**
   * Epic 33 (CLI mode): manual override for the `claude` binary path. Only the CLI
   * engine consumes it (passed through to the spawn → binary resolver). An empty
   * string or `undefined` means auto-detect. The SDK engine ignores this field.
   */
  cliBinaryPath?: string;
  /**
   * Epic 33 (CLI mode): when true (default), request Claude's thinking summaries by
   * injecting `--settings '{"showThinkingSummaries":true}'` into the interactive spawn.
   * Session-scoped — it never modifies the global ~/.claude/settings.json. The SDK engine
   * ignores this field (it sets `thinking.display` on the query directly instead).
   */
  cliShowThinkingSummaries?: boolean;
}

/**
 * Options for sending a chat message
 */
export interface ChatOptions {
  /** List of tools that are allowed to be used */
  allowedTools?: string[];
  /** List of tools that are disallowed */
  disallowedTools?: string[];
  /** Maximum number of turns before stopping */
  maxTurns?: number;
  /** Abort controller for cancellation */
  abortController?: AbortController;
  /** Model to use for the query */
  model?: string;
  /** Session ID to resume (pass the session ID string to resume) */
  resume?: string;
  /** Pre-allocated session ID for new sessions (must be a valid UUID) */
  sessionId?: string;
  /** Image attachments to include in the message (Story 5.5) */
  images?: ImageAttachment[];
  /** Custom system prompt (replaces Claude Code default when set) */
  customSystemPrompt?: string;
  /** Max thinking tokens for reasoning */
  maxThinkingTokens?: number;
  /** Max budget in USD per query */
  maxBudgetUsd?: number;
  /** Thinking effort level for the model */
  effort?: ThinkingEffort;
  /**
   * Explicit thinking configuration forwarded to the Anthropic SDK.
   * Preferred over `maxThinkingTokens` for adaptive-thinking models (Opus 4.7/4.6, Sonnet 4.6).
   * `display: 'summarized'` keeps thinking blocks visible in the UI; `'omitted'` hides them.
   */
  thinking?: {
    type: 'adaptive' | 'enabled' | 'disabled';
    display?: 'summarized' | 'omitted';
    budgetTokens?: number;
  };
  /** When resuming, resume messages up to this assistant UUID — creates a new branch */
  resumeSessionAt?: string;
  /** When true, resumed sessions will fork to a new session ID rather than continuing the previous session. Use with `resume`. */
  forkSession?: boolean;
  /** Enable file checkpointing to track file changes during the session */
  enableFileCheckpointing?: boolean;
  /** User message UUID for rewindFiles call on server (restores files to that point) */
  rewindToMessageUuid?: string;
  /**
   * CLI engine only: absolute filesystem paths of image attachments already saved
   * to disk. The interactive PTY text channel cannot carry binary image data the way
   * SDK mode's base64 content blocks do, so the CLI engine passes attachments *by
   * reference*: it grants read access to these files via `--add-dir` and appends an
   * explicit "read these files" instruction to the injected prompt, letting the model
   * open them with its Read tool. The SDK engine ignores this field (it embeds the
   * `images` base64 blocks directly).
   */
  attachedImagePaths?: string[];
}

/**
 * Response from a chat message
 */
export interface ChatResponse {
  /** Unique identifier for the response */
  id: string;
  /** Session ID */
  sessionId: string;
  /** Response content */
  content: string;
  /** Whether the response is complete */
  done: boolean;
  /** Whether this is an error response */
  isError: boolean;
  /** Usage statistics */
  usage?: ChatUsage;
}

/**
 * Rate limit window info (for subscription users via OAuth beta header)
 */
interface RateLimitWindow {
  utilization: number;
  reset: string | null;
  status: string;
}

/**
 * Subscription rate limit info from anthropic-ratelimit-unified-* headers
 */
export interface SubscriptionRateLimit {
  fiveHour?: RateLimitWindow;
  sevenDay?: RateLimitWindow;
  overallStatus?: string;
}

/**
 * API health status from periodic probe
 */
export interface ApiHealthStatus {
  /** Whether the Anthropic API is reachable */
  healthy: boolean;
  /** ISO timestamp of last health check */
  lastCheckedAt: string;
  /** Human-readable error message if unhealthy */
  error?: string;
}

/**
 * Usage statistics for a chat response
 */
export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalCostUSD: number;
  contextWindow: number;
  /** Primary model used (extracted from result modelUsage) */
  model?: string;
  /** Subscription rate limit info (optional, only available with OAuth) */
  rateLimit?: SubscriptionRateLimit;
}

/**
 * Context usage thresholds for visual indicators (percentage)
 */
export const CONTEXT_USAGE_THRESHOLDS = {
  WARNING: 50,
  DANGER: 80,
  CRITICAL: 90,
} as const;

/**
 * Token reserves for effective context limit calculation.
 * effectiveLimit = contextWindow - OUTPUT_TOKEN_RESERVE - SAFETY_BUFFER
 */
export const CONTEXT_TOKEN_RESERVES = {
  OUTPUT_TOKEN_RESERVE: 20000,
  SAFETY_BUFFER: 13000,
} as const;

/**
 * Models whose native context window is 1M but SDK may under-report as 200K.
 * Capability gate — includes Sonnet 4.6, which *can* run at 1M but only as a
 * paid usage-credit opt-in (not part of the subscription). Use this to decide
 * whether to offer a 1M control for a model at all.
 * See: https://github.com/anthropics/claude-code/issues/24208
 */
const NATIVE_1M_MODELS = ['claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6', 'opus', 'sonnet'];

/**
 * Models that auto-upgrade to 1M context for free on a Max subscription (Opus
 * family). Sonnet is deliberately excluded: its 1M window bills to usage credits,
 * so it must be an explicit opt-in rather than a silent default — otherwise
 * selecting Sonnet trips a "usage credits required for 1M context" gate.
 */
const AUTO_NATIVE_1M_MODELS = ['claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'opus'];

/** True when the model id already carries the `[1m]` opt-in suffix. */
export function hasNative1MSuffix(model?: string): boolean {
  return !!model && /\[1m\]$/i.test(model);
}

/** Strip a trailing `[1m]` opt-in suffix, returning the bare model id. */
export function stripNative1MSuffix(model: string): string {
  return model.replace(/\[1m\]$/i, '');
}

/**
 * True when the model is known to natively support a 1M token context window
 * (capability check — includes Sonnet). Use to decide whether to offer 1M at all.
 */
export function isNative1MModel(model?: string): boolean {
  if (!model) return false;
  const base = stripNative1MSuffix(model);
  return NATIVE_1M_MODELS.some(m => base === m || base.startsWith(`${m}-`));
}

/**
 * True when the model auto-upgrades to 1M for free on a Max subscription (Opus
 * family only). Sonnet returns false — its 1M is a paid opt-in.
 */
export function isAutoNative1MModel(model?: string): boolean {
  if (!model) return false;
  const base = stripNative1MSuffix(model);
  return AUTO_NATIVE_1M_MODELS.some(m => base === m || base.startsWith(`${m}-`));
}

/**
 * Resolve the model id actually sent to an engine, applying the `[1m]` suffix
 * that opts into the native 1M context window. Without the suffix the SDK's
 * internal auto-compact logic caps the effective window at ~200K.
 *
 * - Already suffixed (explicit opt-in): kept as-is, for any 1M-capable model.
 * - Opus family: auto-upgraded to 1M (free on Max).
 * - Sonnet / non-1M without opt-in: left bare (200K) — forcing Sonnet to 1M would
 *   otherwise trigger a "usage credits required" gate for subscription users.
 *
 * This is the single source of truth for the suffix and must be called at the
 * engine boundary only; everywhere else the model id stays bare.
 */
export function resolveEffectiveModel(model?: string): string | undefined {
  if (!model) return model;
  if (hasNative1MSuffix(model)) return model;
  if (isAutoNative1MModel(model)) return `${model}[1m]`;
  return model;
}

/** True when the effective sent model runs at 1M (opt-in suffix or Opus auto). */
export function effectiveModelIs1M(model?: string): boolean {
  return hasNative1MSuffix(model) || isAutoNative1MModel(model);
}

/**
 * Correct the SDK-reported contextWindow. The SDK under-reports 1M models as
 * 200K, so when the request actually ran at 1M (`is1M`) bump the floor to 1M.
 * When it didn't (e.g. Sonnet at its 200K default) trust the report, keeping the
 * usage meter honest. `is1M` must be derived from the *effective sent* model
 * (see {@link effectiveModelIs1M}), not the SDK-reported usage key which is bare.
 */
export function correctContextWindow(reported: number, is1M: boolean): number {
  return is1M ? Math.max(reported, 1_000_000) : reported;
}

/**
 * Calculate effective context limit (usable input tokens after reserves)
 */
export function getEffectiveContextLimit(contextWindow: number): number {
  if (contextWindow <= 0) return 0;
  return Math.max(1, contextWindow - CONTEXT_TOKEN_RESERVES.OUTPUT_TOKEN_RESERVE - CONTEXT_TOKEN_RESERVES.SAFETY_BUFFER);
}

/**
 * Calculate context usage percentage based on effective limit
 */
export function getContextUsagePercent(totalInputTokens: number, contextWindow: number): number {
  if (contextWindow <= 0) return 0;
  const effectiveLimit = getEffectiveContextLimit(contextWindow);
  if (effectiveLimit <= 0) return 0;
  return Math.min(100, Math.round((totalInputTokens / effectiveLimit) * 100));
}


/**
 * Estimate token count from text content.
 * Uses ~4 chars/token for ASCII and ~2 chars/token for non-ASCII (CJK, etc.)
 */
export function estimateTokenCount(text: string): number {
  let asciiChars = 0;
  let nonAsciiChars = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 127) {
      asciiChars++;
    } else {
      // Astral code points (emoji, etc.) use more bytes → weight as 2 non-ASCII units
      nonAsciiChars += cp > 0xFFFF ? 2 : 1;
    }
  }
  return Math.ceil(asciiChars / 4) + Math.ceil(nonAsciiChars / 2);
}

/** Approximate token cost per image attachment (~1600 tokens for typical image) */
export const IMAGE_TOKEN_ESTIMATE = 1600;

/**
 * Thinking effort level for the model's reasoning depth
 */
export type ThinkingEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Permission modes for tool usage
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';

/**
 * Conversation engine implementation behind the ChatEngine seam (Epic 32).
 * `'sdk'` = Claude Agent SDK engine (current default). `'cli'` = Claude Code CLI
 * (PTY + session JSONL) engine, introduced in a follow-up story. Defined in shared
 * so the Epic 33 settings schema can reference it; the ChatEngine interface itself
 * lives server-side (it depends on the SDK `CanUseTool` type).
 */
export type EngineMode = 'sdk' | 'cli';

/**
 * Default conversation engine. Until Epic 33 wires mode selection into settings,
 * every conversation path passes this constant to the engine factory.
 */
export const DEFAULT_ENGINE_MODE: EngineMode = 'sdk';

/**
 * Claude Code authenticated account information.
 * Mirrors the SDK's AccountInfo type from the control-initialize response.
 */
export interface AccountInfo {
  email?: string;
  organization?: string;
  subscriptionType?: string;
  tokenSource?: string;
  apiKeySource?: string;
  apiProvider?: 'firstParty' | 'bedrock' | 'vertex' | 'foundry' | 'anthropicAws' | 'mantle' | 'gateway';
}

/**
 * In-memory account info snapshot.
 */
export interface AccountInfoResponse {
  account: AccountInfo | null;
  /** Unix ms when the value was last fetched from the SDK, or null if never */
  fetchedAt: number | null;
}

/**
 * Stream chunk for real-time message streaming
 */
export interface StreamChunk {
  sessionId: string;
  messageId: string;
  content: string;
  done: boolean;
}

/**
 * Tool call information
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Server timestamp (ms) for timer preservation on reconnect */
  startedAt?: number;
}

/**
 * Permission request for tool approval
 */
export interface PermissionRequest {
  id: string;
  sessionId: string;
  toolCall: ToolCall;
  requiresApproval: boolean;
  /**
   * When true, the client renders this permission as an INDEPENDENT card (like an
   * AskUserQuestion card) instead of attaching it to a preceding tool segment. Set by
   * the CLI engine path, which emits no `tool:call` event, so there is no tool card to
   * attach to. SDK mode leaves this unset (falsy) and keeps the tool-attached behavior.
   */
  standalone?: boolean;
}

/**
 * Message in a chat session
 */
export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  streaming?: boolean;
  /** Usage data included in message:complete for reliable delivery */
  usage?: ChatUsage;
}
