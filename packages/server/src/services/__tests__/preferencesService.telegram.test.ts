/**
 * PreferencesService Telegram Tests
 * Story 10.4: Telegram settings read/write with env var fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import { preferencesService } from '../preferencesService.js';

vi.spyOn(fs, 'readFile');
vi.spyOn(fs, 'writeFile');
vi.spyOn(fs, 'mkdir');

// Mock config
vi.mock('../../config/index.js', () => ({
  config: {
    telegram: {
      botToken: '',
      chatId: '',
      enabled: false,
    },
  },
}));

describe('PreferencesService - Telegram', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getTelegramSettings', () => {
    it('TC-S1: returns defaults when not configured', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({}));

      const result = await preferencesService.getTelegramSettings();

      expect(result.maskedBotToken).toBe('');
      expect(result.chatId).toBe('');
      expect(result.enabled).toBe(false);
      expect(result.notifyPermission).toBe(true);
      expect(result.notifyComplete).toBe(true);
      expect(result.notifyError).toBe(true);
      expect(result.hasBotToken).toBe(false);
      expect(result.hasChatId).toBe(false);
    });

    it('TC-S2: masks bot token correctly (last 4 chars)', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({ telegram: { botToken: '1234567890:ABCdefGhIjKlmnop1234', chatId: '999' } }),
      );

      const result = await preferencesService.getTelegramSettings();

      expect(result.maskedBotToken).toBe('••••••••1234');
      expect(result.hasBotToken).toBe(true);
    });

    it('TC-S3: falls back to env vars when preferences not set', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'env-token-ABCD';
      process.env.TELEGRAM_CHAT_ID = 'env-chat-id';

      // Re-import to get updated config mock
      const { config } = await import('../../config/index.js');
      (config as { telegram: { botToken: string; chatId: string; enabled: boolean } }).telegram.botToken = 'env-token-ABCD';
      (config as { telegram: { botToken: string; chatId: string; enabled: boolean } }).telegram.chatId = 'env-chat-id';

      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({}));

      const result = await preferencesService.getTelegramSettings();

      expect(result.maskedBotToken).toBe('••••••••ABCD');
      expect(result.chatId).toBe('env-chat-id');
      expect(result.envOverrides).toContain('botToken');
      expect(result.envOverrides).toContain('chatId');
      expect(result.hasBotToken).toBe(true);
      expect(result.hasChatId).toBe(true);

      // Cleanup
      (config as { telegram: { botToken: string; chatId: string; enabled: boolean } }).telegram.botToken = '';
      (config as { telegram: { botToken: string; chatId: string; enabled: boolean } }).telegram.chatId = '';
    });

    it('TC-S5: enabled requires botToken + chatId + enabled=true', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({ telegram: { botToken: 'tok1234', chatId: '999', enabled: true } }),
      );

      const result = await preferencesService.getTelegramSettings();
      expect(result.enabled).toBe(true);

      // Without enabled flag
      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({ telegram: { botToken: 'tok1234', chatId: '999' } }),
      );

      const result2 = await preferencesService.getTelegramSettings();
      expect(result2.enabled).toBe(false);
    });

    it('TC-S6: envOverrides only includes env var fields', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'some-token';
      delete process.env.TELEGRAM_CHAT_ID;

      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({}));

      const result = await preferencesService.getTelegramSettings();

      expect(result.envOverrides).toEqual(['botToken']);
    });
  });

  describe('updateTelegramSettings', () => {
    it('TC-S4: null value removes field from preferences', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({ telegram: { botToken: 'tok1234', chatId: '999', enabled: true } }),
      );
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined);
      // Second read for getTelegramSettings()
      vi.mocked(fs.readFile).mockResolvedValueOnce(
        JSON.stringify({ telegram: { chatId: '999', enabled: true } }),
      );

      await preferencesService.updateTelegramSettings({ botToken: null });

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written.telegram.botToken).toBeUndefined();
      expect(written.telegram.chatId).toBe('999');
    });
  });
});
