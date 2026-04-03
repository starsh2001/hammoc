/**
 * Image Storage Service
 * Story 27.2: Store uploaded images as files and serve via URL references
 */

import fs from 'fs/promises';
import path from 'path';
import type { ImageAttachment, ImageRef } from '@hammoc/shared';
import { sessionService } from './sessionService.js';
import { createLogger } from '../utils/logger.js';
import { buildImageFilename, buildImageUrl, getImageDir } from '../utils/imageUtils.js';

const logger = createLogger('imageStorageService');

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
    const imageDir = getImageDir(projectDir, sessionId);
    await fs.mkdir(imageDir, { recursive: true });

    const settled = await Promise.allSettled(
      images.map(async (img): Promise<ImageRef | null> => {
        const filename = buildImageFilename(img.data, img.mimeType);
        if (!filename) {
          logger.warn(`Unsupported mimeType: ${img.mimeType}, skipping image`);
          return null;
        }

        const filePath = path.join(imageDir, filename);

        // Dedup: skip write if file already exists
        try {
          await fs.access(filePath);
        } catch {
          const buffer = Buffer.from(img.data, 'base64');
          await fs.writeFile(filePath, buffer);
        }

        return {
          url: buildImageUrl(projectSlug, sessionId, filename),
          mimeType: img.mimeType,
          name: img.name,
        };
      }),
    );

    const results: ImageRef[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      } else if (result.status === 'rejected') {
        logger.warn(`Failed to store image for project=${projectSlug} session=${sessionId}: ${result.reason}`);
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
    return path.join(getImageDir(projectDir, sessionId), filename);
  }

  /**
   * Delete all images for a session.
   * Silently ignores if directory doesn't exist.
   */
  async deleteSessionImages(projectSlug: string, sessionId: string): Promise<void> {
    const projectDir = sessionService.getProjectDir(projectSlug);
    const imageDir = getImageDir(projectDir, sessionId);
    try {
      await fs.rm(imageDir, { recursive: true, force: true });
    } catch {
      // Silently ignore — directory may not exist
    }
  }
}

export const imageStorageService = new ImageStorageService();
