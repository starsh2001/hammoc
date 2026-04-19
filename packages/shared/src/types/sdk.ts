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
  /** When resuming, resume messages up to this assistant UUID — creates a new branch */
  resumeSessionAt?: string;
  /** When true, resumed sessions will fork to a new session ID rather than continuing the previous session. Use with `resume`. */
  forkSession?: boolean;
  /** Enable file checkpointing to track file changes during the session */
  enableFileCheckpointing?: boolean;
  /** User message UUID for rewindFiles call on server (restores files to that point) */
  rewindToMessageUuid?: string;
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
 * See: https://github.com/anthropics/claude-code/issues/24208
 */
const NATIVE_1M_MODELS = ['claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6', 'opus', 'sonnet'];

/**
 * True when the model is known to natively support a 1M token context window.
 */
export function isNative1MModel(model?: string): boolean {
  if (!model) return false;
  const base = model.replace(/\[1m\]$/i, '');
  return NATIVE_1M_MODELS.some(m => base === m || base.startsWith(`${m}-`));
}

/**
 * Appends the `[1m]` suffix that the Claude Code CLI uses to opt a model into
 * its native 1M context window. Without this suffix, the SDK's internal
 * auto-compact logic caps the effective window at ~200K regardless of the
 * model's real capacity or the `autoCompactWindow` setting.
 */
export function withNative1MSuffix(model?: string): string | undefined {
  if (!model) return model;
  if (/\[1m\]$/i.test(model)) return model;
  if (!isNative1MModel(model)) return model;
  return `${model}[1m]`;
}

/**
 * Correct SDK-reported contextWindow for known 1M models.
 * Returns max(reported, 1M) when the model is known to support 1M natively.
 */
export function correctContextWindow(reported: number, model?: string): number {
  if (isNative1MModel(model)) {
    return Math.max(reported, 1_000_000);
  }
  return reported;
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
 * Claude Code authenticated account information.
 * Mirrors the SDK's AccountInfo type from the control-initialize response.
 */
export interface AccountInfo {
  email?: string;
  organization?: string;
  subscriptionType?: string;
  tokenSource?: string;
  apiKeySource?: string;
  apiProvider?: 'firstParty' | 'bedrock' | 'vertex' | 'foundry' | 'anthropicAws' | 'mantle';
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
