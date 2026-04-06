/**
 * User Preferences Types
 * Server-side persistent settings (replaces localStorage)
 */

import type { PermissionMode, ThinkingEffort } from './sdk.js';

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
}

/** Controls when permission mode changes are broadcast to other browsers viewing the same session */
export type PermissionSyncPolicy = 'streaming' | 'always';

/** Default values for global settings */
export const DEFAULT_PREFERENCES: Required<Pick<UserPreferences, 'theme' | 'defaultModel' | 'permissionMode' | 'chatTimeoutMs' | 'fileExplorerViewMode'>> = {
  theme: 'dark',
  defaultModel: '',
  permissionMode: 'default',
  chatTimeoutMs: 300000,
  fileExplorerViewMode: 'grid',
};

/** API response type — includes server-only metadata */
export interface PreferencesApiResponse extends UserPreferences {
  _overrides?: string[]; // fields overridden by environment variables
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
