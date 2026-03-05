/**
 * Preferences Service
 * Manages global user preferences stored at ~/.bmad-studio/preferences.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_PREFERENCES } from '@bmad-studio/shared';
import type { UserPreferences, TelegramSettings, TelegramSettingsApiResponse, UpdateTelegramSettingsRequest } from '@bmad-studio/shared';
import { config } from '../config/index.js';

class PreferencesService {
  private getDataDir(): string {
    return path.join(os.homedir(), '.bmad-studio');
  }

  private getPreferencesPath(): string {
    return path.join(this.getDataDir(), 'preferences.json');
  }

  async readPreferences(): Promise<UserPreferences> {
    try {
      const content = await fs.readFile(this.getPreferencesPath(), 'utf-8');
      return JSON.parse(content) as UserPreferences;
    } catch {
      // File doesn't exist — create with defaults (write directly to avoid recursion)
      const dataDir = this.getDataDir();
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(this.getPreferencesPath(), JSON.stringify(DEFAULT_PREFERENCES, null, 2), 'utf-8');
      return { ...DEFAULT_PREFERENCES };
    }
  }

  /**
   * Returns preferences with environment variable overrides applied.
   * Env vars take precedence over file values.
   */
  async getEffectivePreferences(): Promise<UserPreferences> {
    const prefs = await this.readPreferences();
    if (process.env.CHAT_TIMEOUT_MS) {
      prefs.chatTimeoutMs = parseInt(process.env.CHAT_TIMEOUT_MS, 10);
    }
    if (process.env.TERMINAL_ENABLED === 'false') {
      prefs.terminalEnabled = false;
    }
    return prefs;
  }

  /**
   * Check if terminal feature is enabled.
   * Priority: TERMINAL_ENABLED env var (if 'false') > preferences.json > default (true)
   * Story 17.5: Terminal Security
   */
  async getTerminalEnabled(): Promise<boolean> {
    if (process.env.TERMINAL_ENABLED === 'false') return false;
    const prefs = await this.readPreferences();
    return prefs.terminalEnabled !== false;
  }

  async writePreferences(partial: Partial<UserPreferences>): Promise<UserPreferences> {
    const dataDir = this.getDataDir();
    await fs.mkdir(dataDir, { recursive: true });

    const existing = await this.readPreferences();
    const merged = { ...existing, ...partial };
    await fs.writeFile(this.getPreferencesPath(), JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  }

  /**
   * Returns Telegram settings with env var fallback and masking.
   * Priority: preferences.json > environment variables
   */
  async getTelegramSettings(): Promise<TelegramSettingsApiResponse> {
    const prefs = await this.readPreferences();
    const telegram: TelegramSettings = prefs.telegram ?? {};

    const envOverrides: string[] = [];
    if (process.env.TELEGRAM_BOT_TOKEN) envOverrides.push('botToken');
    if (process.env.TELEGRAM_CHAT_ID) envOverrides.push('chatId');

    const effectiveBotToken = telegram.botToken ?? config.telegram.botToken;
    const effectiveChatId = telegram.chatId ?? config.telegram.chatId;

    const hasBotToken = !!effectiveBotToken;
    const hasChatId = !!effectiveChatId;
    const enabled = (telegram.enabled ?? false) && hasBotToken && hasChatId;

    return {
      maskedBotToken: effectiveBotToken
        ? '••••••••' + effectiveBotToken.slice(-4)
        : '',
      chatId: effectiveChatId,
      enabled,
      baseUrl: telegram.baseUrl ?? '',
      notifyPermission: telegram.notifyPermission ?? true,
      notifyComplete: telegram.notifyComplete ?? true,
      notifyError: telegram.notifyError ?? true,
      notifyQueueStart: telegram.notifyQueueStart ?? true,
      notifyQueueComplete: telegram.notifyQueueComplete ?? true,
      notifyQueueError: telegram.notifyQueueError ?? true,
      notifyQueueInputRequired: telegram.notifyQueueInputRequired ?? true,
      alwaysNotify: telegram.alwaysNotify ?? false,
      envOverrides,
      hasBotToken,
      hasChatId,
    };
  }

  /**
   * Updates Telegram settings in preferences.json.
   * null values remove the field from preferences (reverts to env var).
   */
  async updateTelegramSettings(update: UpdateTelegramSettingsRequest): Promise<TelegramSettingsApiResponse> {
    const prefs = await this.readPreferences();
    const existing: TelegramSettings = prefs.telegram ?? {};
    const merged: Record<string, unknown> = { ...existing };

    for (const [key, value] of Object.entries(update)) {
      if (value === null) {
        delete merged[key];
      } else if (value !== undefined) {
        merged[key] = value;
      }
    }

    await this.writePreferences({ telegram: Object.keys(merged).length > 0 ? merged as TelegramSettings : undefined });

    return this.getTelegramSettings();
  }
}

export const preferencesService = new PreferencesService();
