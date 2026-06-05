/**
 * User Preferences Types
 * Server-side persistent settings (replaces localStorage)
 */

import type { PermissionMode, ThinkingEffort, EngineMode } from './sdk.js';
import type { LintRuleId } from './harness.js';
import type { ObservabilityTokenizer } from './observability.js';

/** Supported i18n languages (Epic 22) */
export const SUPPORTED_LANGUAGES = ['en', 'ko', 'zh-CN', 'ja', 'es', 'pt'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

/**
 * Global user preferences stored at ~/.hammoc/preferences.json
 */
/** Favorite command entry with optional scope info */
export interface CommandFavoriteEntry {
  command: string;
  scope?: 'project' | 'global'; // undefined defaults to 'project'
}

/**
 * Global user preferences stored at ~/.hammoc/preferences.json
 */
export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  layoutMode?: 'narrow' | 'wide';
  diffLayout?: 'side-by-side' | 'inline';
  permissionMode?: PermissionMode | 'latest';
  /** Stores the actual last-used mode when permissionMode is 'latest' */
  lastPermissionMode?: PermissionMode;
  // Conversation engine (Epic 33). 'sdk' (default) | 'cli'. Fallback = DEFAULT_ENGINE_MODE.
  // Only consumed when the operator billing gate (ENGINE_MODE_TOGGLE_ENABLED) is ON;
  // otherwise the effective engine is forced to 'sdk' regardless of this value.
  engineMode?: EngineMode;
  // CLI engine mode sub-settings (Epic 33.2). Stored globally; consumed by the CLI
  // engine only when the billing gate is ON and CLI mode is selected (Story 33.3).
  cliShowThinkingSummaries?: boolean;   // surface claude thinking summaries (default ON)
  cliShowGenerationProgress?: boolean;  // show the "↓ N tokens · Ns" indicator (default ON)
  cliSyntheticTyping?: boolean;         // client-side per-block typewriter animation (default OFF)
  cliBinaryPath?: string;               // manual claude binary path override ('' = auto-detect)
  commandFavorites?: Array<string | CommandFavoriteEntry>;
  starFavorites?: Record<string, string[]>; // agentId → commands
  defaultModel?: string; // model ID (e.g. 'sonnet', 'claude-opus-4-6') or '' for CLI default
  chatTimeoutMs?: number; // chat response timeout, default 300000 (5 min)
  markdownDefaultMode?: 'edit' | 'preview'; // default editor mode for markdown files
  fileExplorerViewMode?: 'list' | 'grid'; // default file explorer view mode
  telegram?: TelegramSettings;
  webPush?: WebPushSettings;
  // Advanced settings
  customSystemPrompt?: string;      // replaces default Claude Code system prompt
  maxThinkingTokens?: number;       // SDK maxThinkingTokens
  maxTurns?: number;                // SDK maxTurns (conversation turn limit)
  maxBudgetUsd?: number;            // SDK maxBudgetUsd (cost limit per query)
  defaultEffort?: ThinkingEffort;   // SDK effort (thinking effort level)
  // Controls SDK `thinking.display` for adaptive-thinking models (Opus 4.7+, Opus 4.6, Sonnet 4.6).
  // true  → `display: 'summarized'` — thinking summary streams to the UI (Hammoc renders ThinkingBlock)
  // false → `display: 'omitted'` — thinking is skipped from the stream, faster time-to-first-text
  // Opus 4.7 API default is 'omitted'; Hammoc defaults this to true so ThinkingBlock stays visible.
  showThinkingBlocks?: boolean;
  // i18n settings (Epic 22)
  language?: SupportedLanguage;     // User's preferred language
  // Permission sync policy across browsers
  permissionSyncPolicy?: PermissionSyncPolicy;
  // Quick panel settings
  panelDefaultOpen?: boolean;       // Auto-open panel on desktop (default: true)
  panelDefaultSide?: 'left' | 'right' | 'last'; // Default panel side (default: 'right')
  // Allowed read paths outside project root (absolute paths only)
  // Default: [~/.claude] — set broader paths (e.g. home dir) to expand access
  allowedReadPaths?: string[];
  // Auto-approve CLI safety checks in Bypass mode (default: false)
  // When enabled, safety check prompts from the CLI are auto-approved without user confirmation
  autoApproveSafetyChecks?: boolean;
  // File checkpointing (enables rewind/restore of file changes)
  enableChatCheckpointing?: boolean;   // default: true (browser chat sessions)
  enableQueueCheckpointing?: boolean;  // default: false (queue runner — can increase JSONL size)
  // Story 30.2 — per-rule on/off toggles for the static harness lint.
  // Keys absent from disk fall back to LINT_RULE_DEFAULTS (mcp/command-not-on-path
  // is opt-in OFF; the other six rules default ON).
  harnessLintRules?: Partial<Record<LintRuleId, boolean>>;
  // Story 31.3 — observability server-side approximation tokenizer (AC-B4).
  // Global preference; the panel toggle writes here. Absent → 'size/4'.
  // Per spike #1 only 'size/4' is currently selectable.
  observabilityTokenizer?: ObservabilityTokenizer;
}

/** Controls when permission mode changes are broadcast to other browsers viewing the same session */
export type PermissionSyncPolicy = 'streaming' | 'always';

/** Default values for global settings */
export const DEFAULT_PREFERENCES: Required<Pick<UserPreferences, 'theme' | 'defaultModel' | 'permissionMode' | 'chatTimeoutMs' | 'fileExplorerViewMode' | 'showThinkingBlocks'>> = {
  theme: 'dark',
  defaultModel: '',
  permissionMode: 'default',
  chatTimeoutMs: 300000,
  fileExplorerViewMode: 'grid',
  showThinkingBlocks: true,
};

/** API response type — includes server-only metadata */
export interface PreferencesApiResponse extends UserPreferences {
  _overrides?: string[]; // fields overridden by environment variables
  // Epic 33 — operator billing gate (ENGINE_MODE_TOGGLE_ENABLED). Server-only metadata,
  // not persisted. false/absent → client hides the engine-mode toggle (default SDK only).
  _engineModeToggleEnabled?: boolean;
}

/** Telegram notification settings stored in preferences */
export interface TelegramSettings {
  botToken?: string;
  chatId?: string;
  enabled?: boolean;
  /** Base URL for access links in notifications (e.g. "http://192.168.1.100:3000") */
  baseUrl?: string;
  notifyPermission?: boolean;
  notifyComplete?: boolean;
  notifyError?: boolean;
  notifyQueueStart?: boolean;
  notifyQueueComplete?: boolean;
  notifyQueueError?: boolean;
  notifyQueueInputRequired?: boolean;
  /** Send notifications even when the session is visible (socket connected) */
  alwaysNotify?: boolean;
}

/** GET /api/preferences/telegram response type */
export interface TelegramSettingsApiResponse {
  maskedBotToken: string;
  chatId: string;
  enabled: boolean;
  baseUrl: string;
  notifyPermission: boolean;
  notifyComplete: boolean;
  notifyError: boolean;
  notifyQueueStart: boolean;
  notifyQueueComplete: boolean;
  notifyQueueError: boolean;
  notifyQueueInputRequired: boolean;
  alwaysNotify: boolean;
  envOverrides: string[];
  hasBotToken: boolean;
  hasChatId: boolean;
}

/** PATCH /api/preferences/telegram request body */
export interface UpdateTelegramSettingsRequest {
  botToken?: string | null;
  chatId?: string | null;
  enabled?: boolean;
  baseUrl?: string | null;
  notifyPermission?: boolean;
  notifyComplete?: boolean;
  notifyError?: boolean;
  notifyQueueStart?: boolean;
  notifyQueueComplete?: boolean;
  notifyQueueError?: boolean;
  notifyQueueInputRequired?: boolean;
  alwaysNotify?: boolean;
}

/** Web Push notification settings stored in preferences */
export interface WebPushSettings {
  enabled?: boolean;
}

/** GET /api/preferences/webpush response type */
export interface WebPushSettingsApiResponse {
  enabled: boolean;
  vapidPublicKey: string;
  subscriptionCount: number;
}

/** POST /api/preferences/webpush/subscribe request body */
export interface WebPushSubscribeRequest {
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  userAgent?: string;
}

/**
 * Per-session prompt history stored at {projectPath}/.hammoc/prompt-history/{sessionId}.json
 */
export interface PromptHistoryData {
  history: string[];
}
