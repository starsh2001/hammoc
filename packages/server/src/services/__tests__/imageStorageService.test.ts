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

const mockToFile = vi.fn().mockResolvedValue({});
const mockResize = vi.fn().mockReturnValue({ toFile: mockToFile });
vi.mock('sharp', () => ({
  default: vi.fn().mockImplementation(() => ({
    resize: mockResize,
  })),
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
    it('stores images and returns correct ImageRef with thumbnailUrl', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      // Original file does not exist, thumbnail does not exist
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.writeFile.mockResolvedValue();
      mockToFile.mockResolvedValue({});

      const images = [
        { mimeType: 'image/png', data: 'aGVsbG8=', name: 'test.png' },
      ];

      const result = await imageStorageService.storeImages('proj1', 'sess1', images);

      expect(result).toHaveLength(1);
      const hash = expectedHash('aGVsbG8=');
      expect(result[0].url).toBe(`/api/projects/proj1/sessions/sess1/images/${hash}.png`);
      expect(result[0].thumbnailUrl).toBe(`/api/projects/proj1/sessions/sess1/images/${hash}_thumb.png`);
      expect(result[0].mimeType).toBe('image/png');
      expect(result[0].name).toBe('test.png');
      // Original write + thumbnail via sharp
      expect(mockFs.writeFile).toHaveBeenCalledOnce();
      expect(mockToFile).toHaveBeenCalledOnce();
    });

    it('skips thumbnail write when thumbnail already exists', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      // Original: not exists (ENOENT), Thumbnail: exists (resolves)
      mockFs.access
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValue();

      const images = [
        { mimeType: 'image/png', data: 'aGVsbG8=', name: 'test.png' },
      ];

      const result = await imageStorageService.storeImages('proj1', 'sess1', images);

      expect(result).toHaveLength(1);
      const hash = expectedHash('aGVsbG8=');
      expect(result[0].thumbnailUrl).toBe(`/api/projects/proj1/sessions/sess1/images/${hash}_thumb.png`);
      // Original written, but sharp NOT called (thumbnail already exists)
      expect(mockFs.writeFile).toHaveBeenCalledOnce();
      expect(mockToFile).not.toHaveBeenCalled();
    });

    it('returns ImageRef without thumbnailUrl when thumbnail generation fails', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.writeFile.mockResolvedValue();
      mockToFile.mockRejectedValue(new Error('sharp error'));

      const images = [
        { mimeType: 'image/png', data: 'aGVsbG8=', name: 'test.png' },
      ];

      const result = await imageStorageService.storeImages('proj1', 'sess1', images);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBeTruthy();
      expect(result[0].thumbnailUrl).toBeUndefined();
    });

    it('deduplicates: same image twice produces same URLs', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      // Track written paths to simulate dedup: first access rejects, subsequent resolves
      const writtenPaths = new Set<string>();
      mockFs.access.mockImplementation(async (p: unknown) => {
        if (writtenPaths.has(String(p))) return undefined;
        throw new Error('ENOENT');
      });
      mockFs.writeFile.mockImplementation(async (p: unknown) => {
        writtenPaths.add(String(p));
      });
      mockToFile.mockImplementation(async (p: unknown) => {
        writtenPaths.add(String(p));
        return {};
      });

      const img = { mimeType: 'image/jpeg', data: 'd29ybGQ=', name: 'photo.jpg' };
      const result = await imageStorageService.storeImages('proj1', 'sess1', [img, img]);

      expect(result).toHaveLength(2);
      expect(result[0].url).toBe(result[1].url);
      expect(result[0].thumbnailUrl).toBe(result[1].thumbnailUrl);
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
      mockToFile.mockResolvedValue({});

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

    it('returns path for valid thumbnail filename', () => {
      const result = imageStorageService.getImagePath('proj1', 'sess1', 'a1b2c3d4e5f6a7b8_thumb.png');
      expect(result).toBe(path.join('/mock/projects/proj1', 'images', 'sess1', 'a1b2c3d4e5f6a7b8_thumb.png'));
    });

    it('accepts valid extensions: jpg, jpeg, gif, webp', () => {
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8.jpg')).toBeTruthy();
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8.jpeg')).toBeTruthy();
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8.gif')).toBeTruthy();
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8.webp')).toBeTruthy();
    });

    it('accepts thumbnail variants of all extensions', () => {
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8_thumb.jpg')).toBeTruthy();
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8_thumb.jpeg')).toBeTruthy();
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8_thumb.gif')).toBeTruthy();
      expect(imageStorageService.getImagePath('p', 's', 'a1b2c3d4e5f6a7b8_thumb.webp')).toBeTruthy();
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
