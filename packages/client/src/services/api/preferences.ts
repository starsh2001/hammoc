/**
 * Preferences API - Global user preferences endpoints
 */

import { api } from './client';
import type {
  UserPreferences,
  PreferencesApiResponse,
  TelegramSettingsApiResponse,
  UpdateTelegramSettingsRequest,
  WebPushSettingsApiResponse,
  WebPushSubscribeRequest,
} from '@hammoc/shared';

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

  // ── Web Push ──────────────────────────────────────────────────────

  /** Get Web Push settings (enabled state, VAPID public key, subscription count) */
  getWebPush: () => api.get<WebPushSettingsApiResponse>('/preferences/webpush'),

  /** Update Web Push settings (enable/disable) */
  updateWebPush: (data: { enabled?: boolean }) =>
    api.patch<WebPushSettingsApiResponse>('/preferences/webpush', data),

  /** Register a push subscription on the server */
  subscribeWebPush: (data: WebPushSubscribeRequest) =>
    api.post<{ success: boolean; subscriptionCount: number }>('/preferences/webpush/subscribe', data),

  /** Remove a push subscription from the server */
  unsubscribeWebPush: (endpoint: string) =>
    api.delete<{ success: boolean; subscriptionCount: number }>('/preferences/webpush/subscribe', { endpoint }),

  /** Send a test Web Push notification */
  testWebPush: () =>
    api.post<{ success: boolean; error?: string }>('/preferences/webpush/test'),

  /** Get default system prompt template (no project required) */
  getSystemPromptTemplate: () =>
    api.get<{
      template: string;
      variables: readonly { name: string; description: string }[];
    }>('/preferences/system-prompt'),
};
