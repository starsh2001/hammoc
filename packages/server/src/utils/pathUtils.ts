/**
 * Path Utilities
 * Binary file detection, MIME type mapping, and file size constants.
 * [Source: Story 11.1 - Task 3]
 */

import fs from 'fs/promises';
import path from 'path';

/** Maximum file size for full content response (1MB) */
export const MAX_FILE_SIZE = 1 * 1024 * 1024;

/** Number of bytes to read for binary detection */
const BINARY_CHECK_BYTES = 8192;

/**
 * Detect if a file is binary by reading the first 8192 bytes
 * and checking for null byte presence.
 * @param filePath Absolute path to the file
 * @returns true if the file appears to be binary
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(BINARY_CHECK_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, BINARY_CHECK_BYTES, 0);

    // Check for null bytes in the read portion
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }

    return false;
  } finally {
    await handle.close();
  }
}

/** Extension to MIME type mapping */
const MIME_MAP: Record<string, string> = {
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.js': 'text/javascript',
  '.jsx': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.py': 'text/x-python',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.sh': 'text/x-shellscript',
  '.env': 'text/plain',
};

/**
 * Get MIME type based on file extension.
 * @param filePath File path (only extension is used)
 * @returns MIME type string
 */
export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}
