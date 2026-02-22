/**
 * User Preferences Types
 * Server-side persistent settings (replaces localStorage)
 */

import type { PermissionMode } from './sdk.js';

/**
 * Global user preferences stored at ~/.bmad-studio/preferences.json
 */
export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  layoutMode?: 'narrow' | 'wide';
  diffLayout?: 'side-by-side' | 'inline';
  permissionMode?: PermissionMode;
  commandFavorites?: string[];
  starFavorites?: Record<string, string[]>; // agentId → commands
  defaultModel?: string; // model ID (e.g. 'sonnet', 'claude-opus-4-6') or '' for CLI default
  chatTimeoutMs?: number; // chat response timeout, default 300000 (5 min)
  markdownDefaultMode?: 'edit' | 'preview'; // default editor mode for markdown files
  fileExplorerViewMode?: 'list' | 'grid'; // default file explorer view mode
  telegram?: TelegramSettings;
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
  notifyPermission?: boolean;
  notifyComplete?: boolean;
  notifyError?: boolean;
}

/** GET /api/preferences/telegram response type */
export interface TelegramSettingsApiResponse {
  maskedBotToken: string;
  chatId: string;
  enabled: boolean;
  notifyPermission: boolean;
  notifyComplete: boolean;
  notifyError: boolean;
  envOverrides: string[];
  hasBotToken: boolean;
  hasChatId: boolean;
}

/** PATCH /api/preferences/telegram request body */
export interface UpdateTelegramSettingsRequest {
  botToken?: string | null;
  chatId?: string | null;
  enabled?: boolean;
  notifyPermission?: boolean;
  notifyComplete?: boolean;
  notifyError?: boolean;
}

/** POST /api/preferences/telegram/test request body */
export interface TelegramTestRequest {
  botToken?: string;
  chatId?: string;
}

/**
 * Per-session prompt history stored at {projectPath}/.bmad-studio/prompt-history/{sessionId}.json
 */
export interface PromptHistoryData {
  history: string[];
}
