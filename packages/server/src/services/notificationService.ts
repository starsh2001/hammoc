/**
 * Notification Service — Telegram alerts for background streaming events
 * Sends notifications only when the client socket is disconnected.
 * Supports dynamic reconfiguration via reload() for UI-driven settings changes.
 */

import { config } from '../config/index.js';
import { preferencesService } from './preferencesService.js';
import type { TelegramSettings } from '@bmad-studio/shared';

class NotificationService {
  private effectiveBotToken: string;
  private effectiveChatId: string;
  private enabled: boolean;
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

  /** Notify that user input is needed (permission or AskUserQuestion) */
  async notifyInputRequired(sessionId: string, toolName: string, prompt?: string): Promise<void> {
    if (!this.shouldNotifyPermission) return;
    const emoji = toolName === 'AskUserQuestion' ? '❓' : '🔐';
    const label = toolName === 'AskUserQuestion' ? 'Question' : 'Permission';
    const detail = prompt ? `\n${prompt}` : '';
    await this.send(`${emoji} <b>${label} Required</b>\nSession: <code>${sessionId}</code>${detail}`);
  }

  /** Notify that streaming completed successfully */
  async notifyComplete(sessionId: string): Promise<void> {
    if (!this.shouldNotifyComplete) return;
    await this.send(`✅ <b>Complete</b>\nSession: <code>${sessionId}</code>`);
  }

  /** Notify that an error occurred during streaming */
  async notifyError(sessionId: string, error: string): Promise<void> {
    if (!this.shouldNotifyError) return;
    await this.send(`❌ <b>Error</b>\nSession: <code>${sessionId}</code>\n${error}`);
  }

  /** Notify that queue execution has started */
  async notifyQueueStart(totalItems: number, sessionUrl: string): Promise<void> {
    if (!this.shouldNotifyQueueStart) return;
    await this.send(`🚀 <b>Queue Started</b>\n${totalItems} items to execute\n\n${sessionUrl}`);
  }

  /** Notify that queue execution completed all items */
  async notifyQueueComplete(sessionUrl: string): Promise<void> {
    if (!this.shouldNotifyQueueComplete) return;
    await this.send(`✅ <b>Queue Complete</b>\nAll items processed\n\n${sessionUrl}`);
  }

  /** Notify that queue paused due to error (QUEUE_STOP, SDK error, etc.) */
  async notifyQueueError(reason: string, sessionUrl: string): Promise<void> {
    if (!this.shouldNotifyQueueError) return;
    await this.send(`⚠️ <b>Queue Paused</b>\n${reason}\n\n${sessionUrl}`);
  }

  /** Notify that queue is waiting for user input (permission or AskUserQuestion) */
  async notifyQueueInputRequired(sessionUrl: string): Promise<void> {
    if (!this.shouldNotifyQueueInputRequired) return;
    await this.send(`❓ <b>Input Required</b>\nWaiting for user response\n\n${sessionUrl}`);
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
      return { success: false, error: 'Bot Token과 Chat ID가 모두 설정되어야 합니다.' };
    }

    try {
      const apiUrl = `https://api.telegram.org/bot${testBotToken}/sendMessage`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: testChatId,
          text: '🔔 <b>BMad Studio</b>\n테스트 알림입니다. Telegram 알림이 정상 작동합니다!',
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

export const notificationService = new NotificationService();
