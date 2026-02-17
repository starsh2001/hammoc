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
}

/** Default values for global settings */
export const DEFAULT_PREFERENCES: Required<Pick<UserPreferences, 'theme' | 'defaultModel' | 'permissionMode' | 'chatTimeoutMs'>> = {
  theme: 'dark',
  defaultModel: '',
  permissionMode: 'default',
  chatTimeoutMs: 300000,
};

/** API response type — includes server-only metadata */
export interface PreferencesApiResponse extends UserPreferences {
  _overrides?: string[]; // fields overridden by environment variables
}

/**
 * Per-session prompt history stored at {projectPath}/.bmad-studio/prompt-history/{sessionId}.json
 */
export interface PromptHistoryData {
  history: string[];
}
