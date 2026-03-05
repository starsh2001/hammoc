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
import { notificationService, formatAskQuestionPrompt } from '../notificationService.js';

describe('formatAskQuestionPrompt', () => {
  it('returns question with numbered options', () => {
    const result = formatAskQuestionPrompt({
      questions: [{
        question: 'Which DB?',
        options: [
          { label: 'PostgreSQL' },
          { label: 'MySQL' },
          { label: 'SQLite' },
        ],
      }],
    });
    expect(result).toBe('Which DB?\n1. PostgreSQL\n2. MySQL\n3. SQLite');
  });

  it('returns question only when no options', () => {
    const result = formatAskQuestionPrompt({
      questions: [{ question: 'What is your name?' }],
    });
    expect(result).toBe('What is your name?');
  });

  it('returns empty string when questions array is empty', () => {
    expect(formatAskQuestionPrompt({ questions: [] })).toBe('');
  });

  it('returns empty string when questions is undefined', () => {
    expect(formatAskQuestionPrompt({})).toBe('');
  });
});

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

    it('TC-N7a: notifyComplete includes truncated lastContent when provided', async () => {
      mockReadPreferences.mockResolvedValueOnce({
        telegram: {
          botToken: 'tok', chatId: 'cid', enabled: true,
          notifyComplete: true,
        },
      });
      await notificationService.reload();

      await notificationService.notifyComplete('sess', 'Hello, this is the last response.');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain('Hello, this is the last response.');
      expect(body.text).toContain('<pre>');
    });

    it('TC-N7b: notifyComplete truncates long lastContent at 500 chars', async () => {
      mockReadPreferences.mockResolvedValueOnce({
        telegram: {
          botToken: 'tok', chatId: 'cid', enabled: true,
          notifyComplete: true,
        },
      });
      await notificationService.reload();

      const longContent = 'A'.repeat(600);
      await notificationService.notifyComplete('sess', longContent);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // 500 chars + ellipsis
      expect(body.text).toContain('A'.repeat(500) + '…');
      expect(body.text).not.toContain('A'.repeat(501));
    });

    it('TC-N7c: notifyComplete escapes HTML in lastContent', async () => {
      mockReadPreferences.mockResolvedValueOnce({
        telegram: {
          botToken: 'tok', chatId: 'cid', enabled: true,
          notifyComplete: true,
        },
      });
      await notificationService.reload();

      await notificationService.notifyComplete('sess', 'Use <script> & "quotes"');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain('&lt;script&gt;');
      expect(body.text).toContain('&amp;');
      expect(body.text).not.toContain('<script>');
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

    it('TC-N9: notifyInputRequired includes options from AskUserQuestion', async () => {
      mockReadPreferences.mockResolvedValueOnce({
        telegram: {
          botToken: 'tok', chatId: 'cid', enabled: true,
          notifyPermission: true,
        },
      });
      await notificationService.reload();

      const prompt = formatAskQuestionPrompt({
        questions: [{
          question: 'Which approach?',
          options: [
            { label: 'Option A', description: 'First approach' },
            { label: 'Option B', description: 'Second approach' },
          ],
        }],
      });

      await notificationService.notifyInputRequired('sess', 'AskUserQuestion', prompt);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain('Which approach?');
      expect(body.text).toContain('1. Option A');
      expect(body.text).toContain('2. Option B');
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
