/**
 * User Preferences Types
 * Server-side persistent settings (replaces localStorage)
 */

import type { PermissionMode } from './sdk.js';

/**
 * Global user preferences stored at ~/.bmad-studio/preferences.json
 */
export interface UserPreferences {
  theme?: 'light' | 'dark';
  layoutMode?: 'narrow' | 'wide';
  diffLayout?: 'side-by-side' | 'inline';
  permissionMode?: PermissionMode;
  commandFavorites?: string[];
  starFavorites?: Record<string, string[]>; // agentId → commands
}

/**
 * Per-session prompt history stored at {projectPath}/.bmad-studio/prompt-history/{sessionId}.json
 */
export interface PromptHistoryData {
  history: string[];
}
