/**
 * PreferencesService Tests
 * Story 10.2: Default preferences, env var overrides
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import { preferencesService } from '../preferencesService.js';

// Spy on fs methods instead of mocking the whole module
vi.spyOn(fs, 'readFile');
vi.spyOn(fs, 'writeFile');
vi.spyOn(fs, 'mkdir');

describe('PreferencesService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CHAT_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('readPreferences', () => {
    it('TC-S1: creates file with defaults when file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined);

      const prefs = await preferencesService.readPreferences();

      expect(prefs.theme).toBe('dark');
      expect(prefs.defaultModel).toBe('');
      expect(prefs.permissionMode).toBe('default');
      expect(prefs.chatTimeoutMs).toBe(300000);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('TC-S2: reads existing preferences correctly', async () => {
      const stored = { theme: 'light', defaultModel: 'opus', chatTimeoutMs: 60000 };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(stored));

      const prefs = await preferencesService.readPreferences();

      expect(prefs.theme).toBe('light');
      expect(prefs.defaultModel).toBe('opus');
      expect(prefs.chatTimeoutMs).toBe(60000);
    });

    it('TC-S3: partial update merges with existing values', async () => {
      const existing = { theme: 'dark', defaultModel: 'opus' };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(existing));
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined);

      const result = await preferencesService.writePreferences({ chatTimeoutMs: 60000 });

      expect(result.theme).toBe('dark');
      expect(result.defaultModel).toBe('opus');
      expect(result.chatTimeoutMs).toBe(60000);
    });
  });

  describe('getEffectivePreferences', () => {
    it('TC-S4: env var overrides file value for chatTimeoutMs', async () => {
      const stored = { theme: 'dark', chatTimeoutMs: 300000 };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(stored));
      process.env.CHAT_TIMEOUT_MS = '120000';

      const prefs = await preferencesService.getEffectivePreferences();

      expect(prefs.chatTimeoutMs).toBe(120000);
    });

    it('returns file value when no env var is set', async () => {
      const stored = { theme: 'dark', chatTimeoutMs: 180000 };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(stored));

      const prefs = await preferencesService.getEffectivePreferences();

      expect(prefs.chatTimeoutMs).toBe(180000);
    });
  });
});
