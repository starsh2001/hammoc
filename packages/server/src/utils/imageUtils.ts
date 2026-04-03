/**
 * Shared image utilities for hash computation, MIME mapping, and path/URL construction.
 * Used by imageStorageService and historyParser to ensure consistent behavior.
 */

import crypto from 'crypto';
import path from 'path';

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

export function getExtensionFromMimeType(mimeType: string): string | undefined {
  return MIME_TO_EXT[mimeType];
}

export function computeImageHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

export function buildImageFilename(data: string, mimeType: string): string | null {
  const ext = MIME_TO_EXT[mimeType];
  if (!ext) return null;
  return `${computeImageHash(data)}${ext}`;
}

export function buildImageUrl(projectSlug: string, sessionId: string, filename: string): string {
  return `/api/projects/${projectSlug}/sessions/${sessionId}/images/${filename}`;
}

export function getImageDir(projectDir: string, sessionId: string): string {
  return path.join(projectDir, 'images', sessionId);
}
