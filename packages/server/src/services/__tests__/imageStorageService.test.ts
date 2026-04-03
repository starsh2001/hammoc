import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  createReadStream: vi.fn(),
}));
vi.mock('../sessionService.js', () => ({
  sessionService: {
    getProjectDir: vi.fn((slug: string) => `/mock/projects/${slug}`),
  },
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { imageStorageService } from '../imageStorageService.js';

const mockFs = vi.mocked(fs);
const mockExistsSync = vi.mocked(existsSync);

// Helper: compute expected hash for a given base64 string
function expectedHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

describe('imageStorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('storeImages', () => {
    it('stores images and returns correct ImageRef URLs', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      // File does not exist → will be written
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.writeFile.mockResolvedValue();

      const images = [
        { mimeType: 'image/png', data: 'aGVsbG8=', name: 'test.png' },
      ];

      const result = await imageStorageService.storeImages('proj1', 'sess1', images);

      expect(result).toHaveLength(1);
      const hash = expectedHash('aGVsbG8=');
      expect(result[0].url).toBe(`/api/projects/proj1/sessions/sess1/images/${hash}.png`);
      expect(result[0].mimeType).toBe('image/png');
      expect(result[0].name).toBe('test.png');
      expect(mockFs.writeFile).toHaveBeenCalledOnce();
    });

    it('deduplicates: same image twice produces single write, same URL', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      // First call: file not exists; second call: file exists (dedup)
      mockFs.access
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValue();

      const img = { mimeType: 'image/jpeg', data: 'd29ybGQ=', name: 'photo.jpg' };
      const result = await imageStorageService.storeImages('proj1', 'sess1', [img, img]);

      expect(result).toHaveLength(2);
      expect(result[0].url).toBe(result[1].url);
      // Only one write (second was deduped)
      expect(mockFs.writeFile).toHaveBeenCalledOnce();
    });

    it('skips unsupported mimeType', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);

      const images = [
        { mimeType: 'image/bmp', data: 'dGVzdA==', name: 'test.bmp' },
      ];

      const result = await imageStorageService.storeImages('proj1', 'sess1', images);
      expect(result).toHaveLength(0);
    });

    it('handles disk write error gracefully (partial success)', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.writeFile
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('ENOSPC'));

      const images = [
        { mimeType: 'image/png', data: 'aW1n', name: 'ok.png' },
        { mimeType: 'image/png', data: 'ZmFpbA==', name: 'fail.png' },
      ];

      const result = await imageStorageService.storeImages('proj1', 'sess1', images);
      // Only first succeeds
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ok.png');
    });
  });

  describe('getImagePath', () => {
    it('returns path for valid filename', () => {
      const result = imageStorageService.getImagePath('proj1', 'sess1', 'a1b2c3d4e5f6a7b8.png');
      expect(result).toBe(path.join('/mock/projects/proj1', 'images', 'sess1', 'a1b2c3d4e5f6a7b8.png'));
    });

    it('accepts valid extensions: jpg, jpeg, gif, webp', () => {
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8.jpg')).toBeTruthy();
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8.jpeg')).toBeTruthy();
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8.gif')).toBeTruthy();
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8.webp')).toBeTruthy();
    });

    it('rejects invalid filename format', () => {
      expect(imageStorageService.getImagePath('p', 's', 'invalid.png')).toBeNull();
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8.bmp')).toBeNull();
      expect(imageStorageService.getImagePath('p', 's', '../../../etc/passwd')).toBeNull();
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8.png.exe')).toBeNull();
      expect(imageStorageService.getImagePath('p', 's', '')).toBeNull();
    });

    it('prevents path traversal attacks', () => {
      expect(imageStorageService.getImagePath('p', 's', '../../secret.png')).toBeNull();
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8/../../../etc/passwd')).toBeNull();
    });
  });

  describe('deleteSessionImages', () => {
    it('deletes session image directory', async () => {
      mockFs.rm.mockResolvedValue();

      await imageStorageService.deleteSessionImages('proj1', 'sess1');

      expect(mockFs.rm).toHaveBeenCalledWith(
        path.join('/mock/projects/proj1', 'images', 'sess1'),
        { recursive: true, force: true },
      );
    });

    it('silently ignores non-existent directory', async () => {
      mockFs.rm.mockRejectedValue(new Error('ENOENT'));

      // Should not throw
      await expect(
        imageStorageService.deleteSessionImages('proj1', 'nonexistent'),
      ).resolves.toBeUndefined();
    });
  });
});
