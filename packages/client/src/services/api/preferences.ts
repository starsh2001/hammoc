/**
 * Preferences API - Global user preferences endpoints
 */

import { api } from './client';
import type {
  UserPreferences,
  PreferencesApiResponse,
  TelegramSettingsApiResponse,
  UpdateTelegramSettingsRequest,
} from '@bmad-studio/shared';

export const preferencesApi = {
  /** Get all preferences (includes _overrides metadata) */
  get: () => api.get<PreferencesApiResponse>('/preferences'),

  /** Update preferences (merge) */
  update: (data: Partial<UserPreferences>) => api.patch<UserPreferences>('/preferences', data),

  /** Get Telegram settings (masked token, env override info) */
  getTelegram: () => api.get<TelegramSettingsApiResponse>('/preferences/telegram'),

  /** Update Telegram settings */
  updateTelegram: (data: UpdateTelegramSettingsRequest) =>
    api.patch<TelegramSettingsApiResponse>('/preferences/telegram', data),

  /** Send test Telegram notification (optional overrides for unsaved values) */
  testTelegram: (overrides?: { botToken?: string; chatId?: string }) =>
    api.post<{ success: boolean; error?: string }>('/preferences/telegram/test', overrides),
};
