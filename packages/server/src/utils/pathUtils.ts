/**
 * Path Utilities
 * Binary file detection, MIME type mapping, file size constants, and protected path validation.
 * [Source: Story 11.1 - Task 3, Story 11.2 - Task 2]
 */

import fs from 'fs/promises';
import path from 'path';

/** Directories protected from deletion without force flag */
export const PROTECTED_DIRECTORIES = ['.git', 'node_modules', '.bmad-core'] as const;

/**
 * Checks if the given relative path is under a protected directory.
 * Protected directories require force=true for deletion.
 * @param relativePath Relative path to check
 * @returns true if the path is under a protected directory
 */
export function isProtectedPath(relativePath: string): boolean {
  const normalized = path.normalize(relativePath);
  const firstSegment = normalized.split(path.sep)[0];
  return PROTECTED_DIRECTORIES.includes(firstSegment as typeof PROTECTED_DIRECTORIES[number]);
}

/** Maximum file size for full content response (1MB) */
export const MAX_FILE_SIZE = 1 * 1024 * 1024;

/** Number of bytes to read for binary detection */
const BINARY_CHECK_BYTES = 8192;

/**
 * Extensions whose magic bytes do not contain null (0x00) and therefore
 * evade the null-byte heuristic below. Detected by extension up front.
 */
const BINARY_EXTENSIONS = new Set([
  // Archives
  '.zip', '.gz', '.tar', '.tgz', '.bz2', '.7z', '.rar', '.xz',
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  // Executables / libraries
  '.exe', '.dll', '.so', '.dylib', '.class', '.jar', '.wasm',
  // Databases
  '.db', '.sqlite', '.sqlite3', '.mdb',
  // Media (some already detected by null bytes, but listing for clarity)
  '.mp3', '.mp4', '.avi', '.mov', '.wav', '.ogg', '.flac', '.webm',
  '.webp', '.ico', '.bmp', '.tiff', '.heic',
  // Fonts
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
]);

/**
 * Detect if a file is binary.
 * 1. Extension allowlist for formats whose headers lack null bytes (e.g. ZIP, PDF).
 * 2. Fallback: read first 8192 bytes and check for null byte presence.
 * @param filePath Absolute path to the file
 * @returns true if the file appears to be binary
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return true;
  }

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
