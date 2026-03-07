/**
 * User Preferences Types
 * Server-side persistent settings (replaces localStorage)
 */

import type { PermissionMode } from './sdk.js';

/** Supported i18n languages (Epic 22) */
export const SUPPORTED_LANGUAGES = ['en', 'ko', 'zh-CN', 'ja', 'es', 'pt'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

/**
 * Global user preferences stored at ~/.bmad-studio/preferences.json
 */
export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  layoutMode?: 'narrow' | 'wide';
  diffLayout?: 'side-by-side' | 'inline';
  permissionMode?: PermissionMode | 'latest';
  /** Stores the actual last-used mode when permissionMode is 'latest' */
  lastPermissionMode?: PermissionMode;
  commandFavorites?: string[];
  starFavorites?: Record<string, string[]>; // agentId → commands
  defaultModel?: string; // model ID (e.g. 'sonnet', 'claude-opus-4-6') or '' for CLI default
  chatTimeoutMs?: number; // chat response timeout, default 300000 (5 min)
  markdownDefaultMode?: 'edit' | 'preview'; // default editor mode for markdown files
  fileExplorerViewMode?: 'list' | 'grid'; // default file explorer view mode
  telegram?: TelegramSettings;
  // Advanced settings
  customSystemPrompt?: string;      // replaces default Claude Code system prompt
  maxThinkingTokens?: number;       // SDK maxThinkingTokens
  maxTurns?: number;                // SDK maxTurns (conversation turn limit)
  maxBudgetUsd?: number;            // SDK maxBudgetUsd (cost limit per query)
  // Terminal settings (Story 17.5)
  terminalEnabled?: boolean;        // Enable/disable terminal feature (default: true)
  // i18n settings (Epic 22)
  language?: SupportedLanguage;     // User's preferred language
}

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

/**
 * Per-session prompt history stored at {projectPath}/.bmad-studio/prompt-history/{sessionId}.json
 */
export interface PromptHistoryData {
  history: string[];
}
