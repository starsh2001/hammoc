/**
 * Notification Service — Telegram alerts for background streaming events
 * Sends notifications only when the client socket is disconnected.
 * Supports dynamic reconfiguration via reload() for UI-driven settings changes.
 */

import { config } from '../config/index.js';
import { preferencesService } from './preferencesService.js';
import { SUPPORTED_LANGUAGES } from '@bmad-studio/shared';
import type { TelegramSettings } from '@bmad-studio/shared';
import i18next from '../i18n.js';

class NotificationService {
  private effectiveBotToken: string;
  private effectiveChatId: string;
  private enabled: boolean;
  private baseUrl: string;
  private shouldNotifyPermission: boolean;
  private shouldNotifyComplete: boolean;
  private shouldNotifyError: boolean;
  private shouldNotifyQueueStart: boolean;
  private shouldNotifyQueueComplete: boolean;
  private shouldNotifyQueueError: boolean;
  private shouldNotifyQueueInputRequired: boolean;

  constructor() {
    // Initial config from env vars (preferences not yet loaded at startup)
    this.effectiveBotToken = config.telegram.botToken;
    this.effectiveChatId = config.telegram.chatId;
    this.enabled = config.telegram.enabled;
    this.baseUrl = '';
    this.shouldNotifyPermission = true;
    this.shouldNotifyComplete = true;
    this.shouldNotifyError = true;
    this.shouldNotifyQueueStart = true;
    this.shouldNotifyQueueComplete = true;
    this.shouldNotifyQueueError = true;
    this.shouldNotifyQueueInputRequired = true;
  }

  /**
   * Reload configuration from preferences + env vars.
   * Called after Telegram settings are updated via UI,
   * and once during server startup to load preferences.
   */
  async reload(): Promise<void> {
    try {
      const prefs = await preferencesService.readPreferences();
      const telegram: TelegramSettings = prefs.telegram ?? {};

      this.effectiveBotToken = telegram.botToken ?? config.telegram.botToken;
      this.effectiveChatId = telegram.chatId ?? config.telegram.chatId;
      this.enabled = (telegram.enabled ?? false) && !!this.effectiveBotToken && !!this.effectiveChatId;
      this.baseUrl = telegram.baseUrl ?? process.env.BASE_URL ?? '';
      this.shouldNotifyPermission = telegram.notifyPermission ?? true;
      this.shouldNotifyComplete = telegram.notifyComplete ?? true;
      this.shouldNotifyError = telegram.notifyError ?? true;
      this.shouldNotifyQueueStart = telegram.notifyQueueStart ?? true;
      this.shouldNotifyQueueComplete = telegram.notifyQueueComplete ?? true;
      this.shouldNotifyQueueError = telegram.notifyQueueError ?? true;
      this.shouldNotifyQueueInputRequired = telegram.notifyQueueInputRequired ?? true;
    } catch {
      // If preferences can't be read, keep current config
    }
  }

  /** Get the configured base URL for building access links */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** Send a Telegram message (best-effort, silent fail) */
  private async send(message: string): Promise<void> {
    if (!this.enabled || !this.effectiveBotToken || !this.effectiveChatId) return;
    try {
      const apiUrl = `https://api.telegram.org/bot${this.effectiveBotToken}/sendMessage`;
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.effectiveChatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });
    } catch {
      // Silent fail — notifications are best-effort
    }
  }

  /** Resolve the user's preferred language for Telegram messages */
  private async resolveLanguage(): Promise<string> {
    try {
      const prefs = await preferencesService.readPreferences();
      if (prefs.language && SUPPORTED_LANGUAGES.includes(prefs.language as typeof SUPPORTED_LANGUAGES[number])) {
        return prefs.language;
      }
    } catch { /* fallback to 'en' */ }
    return 'en';
  }

  /** Build an access link suffix if baseUrl is configured */
  private buildLink(): string {
    return this.baseUrl ? `\n\n🔗 ${this.baseUrl}` : '';
  }

  /** Escape HTML special characters for Telegram HTML parse_mode */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Notify that user input is needed (permission or AskUserQuestion) */
  async notifyInputRequired(sessionId: string, toolName: string, prompt?: string): Promise<void> {
    if (!this.shouldNotifyPermission) return;
    const lang = await this.resolveLanguage();
    const t = i18next.getFixedT(lang);
    const emoji = toolName === 'AskUserQuestion' ? '❓' : '🔐';
    const label = toolName === 'AskUserQuestion' ? t('notification.question.title') : t('notification.permission.title');
    const detail = prompt ? `\n${prompt}` : '';
    await this.send(`${emoji} <b>${label}</b>\nSession: <code>${sessionId}</code>${detail}${this.buildLink()}`);
  }

  /** Notify that streaming completed successfully, optionally including last assistant message */
  async notifyComplete(sessionId: string, lastContent?: string): Promise<void> {
    if (!this.shouldNotifyComplete) return;
    const lang = await this.resolveLanguage();
    const t = i18next.getFixedT(lang);
    let message = `✅ <b>${t('notification.complete.title')}</b>\nSession: <code>${sessionId}</code>`;
    if (lastContent) {
      const MAX_LEN = 500;
      const escaped = this.escapeHtml(lastContent);
      const truncated = escaped.length > MAX_LEN ? escaped.slice(0, MAX_LEN) + '…' : escaped;
      message += `\n\n<b>${t('notification.complete.lastMessage')}</b>\n<pre>${truncated}</pre>`;
    }
    message += this.buildLink();
    await this.send(message);
  }

  /** Notify that an error occurred during streaming */
  async notifyError(sessionId: string, error: string): Promise<void> {
    if (!this.shouldNotifyError) return;
    const lang = await this.resolveLanguage();
    const t = i18next.getFixedT(lang);
    await this.send(`❌ <b>${t('notification.error.title')}</b>\nSession: <code>${sessionId}</code>\n${error}${this.buildLink()}`);
  }

  /** Notify that queue execution has started */
  async notifyQueueStart(totalItems: number, sessionUrl: string): Promise<void> {
    if (!this.shouldNotifyQueueStart) return;
    const lang = await this.resolveLanguage();
    const t = i18next.getFixedT(lang);
    await this.send(`🚀 <b>${t('notification.queueStart.title')}</b>\n${t('notification.queueStart.body', { value: totalItems })}\n\n${sessionUrl}`);
  }

  /** Notify that queue execution completed all items */
  async notifyQueueComplete(sessionUrl: string): Promise<void> {
    if (!this.shouldNotifyQueueComplete) return;
    const lang = await this.resolveLanguage();
    const t = i18next.getFixedT(lang);
    await this.send(`✅ <b>${t('notification.queueComplete.title')}</b>\n${t('notification.queueComplete.body')}\n\n${sessionUrl}`);
  }

  /** Notify that queue paused due to error (QUEUE_STOP, SDK error, etc.) */
  async notifyQueueError(reason: string, sessionUrl: string): Promise<void> {
    if (!this.shouldNotifyQueueError) return;
    const lang = await this.resolveLanguage();
    const t = i18next.getFixedT(lang);
    await this.send(`⚠️ <b>${t('notification.queuePaused.title')}</b>\n${reason}\n\n${sessionUrl}`);
  }

  /** Notify that queue is waiting for user input (permission or AskUserQuestion) */
  async notifyQueueInputRequired(sessionUrl: string): Promise<void> {
    if (!this.shouldNotifyQueueInputRequired) return;
    const lang = await this.resolveLanguage();
    const t = i18next.getFixedT(lang);
    await this.send(`❓ <b>${t('notification.inputRequired.title')}</b>\n${t('notification.inputRequired.body')}\n\n${sessionUrl}`);
  }

  /**
   * Send a test Telegram message.
   * Accepts optional overrides to test with unsaved values.
   * Priority: overrides > preferences > env vars
   */
  async sendTest(overrides?: { botToken?: string; chatId?: string }): Promise<{ success: boolean; error?: string }> {
    const prefs = await preferencesService.readPreferences();
    const telegram = prefs.telegram ?? {};

    const testBotToken = overrides?.botToken ?? telegram.botToken ?? config.telegram.botToken;
    const testChatId = overrides?.chatId ?? telegram.chatId ?? config.telegram.chatId;

    if (!testBotToken || !testChatId) {
      const lang = await this.resolveLanguage();
      const t = i18next.getFixedT(lang);
      return { success: false, error: t('notification.error.configRequired') };
    }

    try {
      const lang = await this.resolveLanguage();
      const t = i18next.getFixedT(lang);
      const apiUrl = `https://api.telegram.org/bot${testBotToken}/sendMessage`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: testChatId,
          text: `🔔 <b>BMad Studio</b>\n${t('notification.test.message')}`,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const desc = (body as Record<string, string>).description || `HTTP ${response.status}`;
        return { success: false, error: desc };
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }
}

/**
 * Extract question text with options from AskUserQuestion tool input.
 * Used by websocket.ts and queueService.ts to build Telegram notification prompts.
 */
export function formatAskQuestionPrompt(input: Record<string, unknown>): string {
  const questions = input.questions as Array<{
    question: string;
    options?: Array<{ label: string; description?: string }>;
  }> | undefined;
  const q = questions?.[0];
  if (!q) return '';
  let prompt = q.question;
  if (q.options?.length) {
    prompt += '\n' + q.options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
  }
  return prompt;
}

export const notificationService = new NotificationService();
