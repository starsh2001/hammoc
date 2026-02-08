/**
 * Notification Service — Telegram alerts for background streaming events
 * Sends notifications only when the client socket is disconnected.
 */

import { config } from '../config/index.js';

class NotificationService {
  private enabled: boolean;
  private apiUrl: string;
  private chatId: string;

  constructor() {
    this.enabled = config.telegram.enabled;
    this.apiUrl = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    this.chatId = config.telegram.chatId;
  }

  /** Send a Telegram message (best-effort, silent fail) */
  async send(message: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
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
    const emoji = toolName === 'AskUserQuestion' ? '❓' : '🔐';
    const label = toolName === 'AskUserQuestion' ? 'Question' : 'Permission';
    const detail = prompt ? `\n${prompt}` : '';
    await this.send(`${emoji} <b>${label} Required</b>\nSession: <code>${sessionId}</code>${detail}`);
  }

  /** Notify that streaming completed successfully */
  async notifyComplete(sessionId: string): Promise<void> {
    await this.send(`✅ <b>Complete</b>\nSession: <code>${sessionId}</code>`);
  }

  /** Notify that an error occurred during streaming */
  async notifyError(sessionId: string, error: string): Promise<void> {
    await this.send(`❌ <b>Error</b>\nSession: <code>${sessionId}</code>\n${error}`);
  }
}

export const notificationService = new NotificationService();
