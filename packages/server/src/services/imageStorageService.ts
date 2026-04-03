/**
 * Image Storage Service
 * Story 27.2: Store uploaded images as files and serve via URL references
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { ImageAttachment, ImageRef } from '@hammoc/shared';
import { sessionService } from './sessionService.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('imageStorageService');

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const VALID_FILENAME_RE = /^[a-f0-9]{16}\.(png|jpg|jpeg|gif|webp)$/;

class ImageStorageService {
  /**
   * Store uploaded images as files and return URL-based references.
   * Dedup: if file already exists (same hash), skip write and return existing URL.
   * Partial success: if a disk write fails, log warning and skip the failed image.
   */
  async storeImages(
    projectSlug: string,
    sessionId: string,
    images: ImageAttachment[],
  ): Promise<ImageRef[]> {
    const projectDir = sessionService.getProjectDir(projectSlug);
    const imageDir = path.join(projectDir, 'images', sessionId);
    await fs.mkdir(imageDir, { recursive: true });

    const results: ImageRef[] = [];

    for (const img of images) {
      try {
        const ext = MIME_TO_EXT[img.mimeType];
        if (!ext) {
          logger.warn(`Unsupported mimeType: ${img.mimeType}, skipping image`);
          continue;
        }

        const hash = crypto.createHash('sha256').update(img.data).digest('hex').substring(0, 16);
        const filename = `${hash}${ext}`;
        const filePath = path.join(imageDir, filename);

        // Dedup: skip write if file already exists
        try {
          await fs.access(filePath);
        } catch {
          // File doesn't exist, write it
          const buffer = Buffer.from(img.data, 'base64');
          await fs.writeFile(filePath, buffer);
        }

        results.push({
          url: `/api/projects/${projectSlug}/sessions/${sessionId}/images/${filename}`,
          mimeType: img.mimeType,
          name: img.name,
        });
      } catch (err) {
        logger.warn(`Failed to store image for project=${projectSlug} session=${sessionId}: ${err}`);
      }
    }

    return results;
  }

  /**
   * Get absolute filesystem path for an image.
   * Validates filename format to prevent path traversal.
   * Returns null if filename is invalid.
   */
  getImagePath(projectSlug: string, sessionId: string, filename: string): string | null {
    if (!VALID_FILENAME_RE.test(filename)) {
      return null;
    }
    const projectDir = sessionService.getProjectDir(projectSlug);
    return path.join(projectDir, 'images', sessionId, filename);
  }

  /**
   * Delete all images for a session.
   * Silently ignores if directory doesn't exist.
   */
  async deleteSessionImages(projectSlug: string, sessionId: string): Promise<void> {
    const projectDir = sessionService.getProjectDir(projectSlug);
    const imageDir = path.join(projectDir, 'images', sessionId);
    try {
      await fs.rm(imageDir, { recursive: true, force: true });
    } catch {
      // Silently ignore — directory may not exist
    }
  }
}

export const imageStorageService = new ImageStorageService();
