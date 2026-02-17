/**
 * NotificationService Tests
 * Story 10.4: sendTest, reload, per-type filtering
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally before any imports
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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

// Mock preferencesService
const mockReadPreferences = vi.fn();
vi.mock('../preferencesService.js', () => ({
  preferencesService: {
    readPreferences: () => mockReadPreferences(),
  },
}));

// Import after mocks
import { notificationService } from '../notificationService.js';

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadPreferences.mockResolvedValue({});
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  describe('sendTest', () => {
    it('TC-N1: returns error when botToken/chatId not set', async () => {
      mockReadPreferences.mockResolvedValueOnce({});

      const result = await notificationService.sendTest();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bot Token');
    });

    it('TC-N2: returns success when Telegram API succeeds', async () => {
      mockReadPreferences.mockResolvedValueOnce({
        telegram: { botToken: 'test-token', chatId: '12345' },
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      const result = await notificationService.sendTest();

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('bottest-token/sendMessage'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('TC-N3: returns error description on Telegram API failure', async () => {
      mockReadPreferences.mockResolvedValueOnce({
        telegram: { botToken: 'bad-token', chatId: '12345' },
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ description: 'Unauthorized' }),
      });

      const result = await notificationService.sendTest();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('TC-N4: overrides take precedence over preferences and env', async () => {
      mockReadPreferences.mockResolvedValueOnce({
        telegram: { botToken: 'saved-token', chatId: 'saved-id' },
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      await notificationService.sendTest({ botToken: 'override-token', chatId: 'override-id' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('botoverride-token/sendMessage'),
        expect.objectContaining({
          body: expect.stringContaining('override-id'),
        }),
      );
    });
  });

  describe('reload', () => {
    it('TC-N5: reloads settings from preferences', async () => {
      mockReadPreferences.mockResolvedValueOnce({
        telegram: {
          botToken: 'reloaded-token',
          chatId: 'reloaded-id',
          enabled: true,
          notifyPermission: false,
          notifyComplete: true,
          notifyError: false,
        },
      });

      await notificationService.reload();

      // notifyInputRequired should not send (notifyPermission=false)
      await notificationService.notifyInputRequired('sess-1', 'Bash');
      expect(mockFetch).not.toHaveBeenCalled();

      // notifyComplete should send (notifyComplete=true, enabled=true)
      await notificationService.notifyComplete('sess-1');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('per-type filtering', () => {
    it('TC-N6: notifyInputRequired does not send when shouldNotifyPermission is false', async () => {
      mockReadPreferences.mockResolvedValueOnce({
        telegram: {
          botToken: 'tok', chatId: 'cid', enabled: true,
          notifyPermission: false,
        },
      });
      await notificationService.reload();

      await notificationService.notifyInputRequired('sess', 'Bash');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('TC-N7: notifyComplete does not send when shouldNotifyComplete is false', async () => {
      mockReadPreferences.mockResolvedValueOnce({
        telegram: {
          botToken: 'tok', chatId: 'cid', enabled: true,
          notifyComplete: false,
        },
      });
      await notificationService.reload();

      await notificationService.notifyComplete('sess');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('TC-N8: notifyError does not send when shouldNotifyError is false', async () => {
      mockReadPreferences.mockResolvedValueOnce({
        telegram: {
          botToken: 'tok', chatId: 'cid', enabled: true,
          notifyError: false,
        },
      });
      await notificationService.reload();

      await notificationService.notifyError('sess', 'some error');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
