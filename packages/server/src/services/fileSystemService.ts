/**
 * File System Service
 * Provides file reading and directory listing within project boundaries.
 * [Source: Story 11.1 - Task 4]
 */

import fs from 'fs/promises';
import path from 'path';
import { validateProjectPath } from '../middleware/pathGuard.js';
import { isBinaryFile, getMimeType, MAX_FILE_SIZE } from '../utils/pathUtils.js';
import type { FileReadResponse, DirectoryListResponse } from '@bmad-studio/shared';

/**
 * FileSystemService - Read files and list directories within project roots
 */
class FileSystemService {
  /**
   * Read a file's content within a project root.
   * Binary files return metadata only (content: null).
   * Large files (> 1MB) are truncated.
   * @param projectRoot Absolute path to the project root
   * @param relativePath Relative path to the file
   * @returns FileReadResponse
   */
  async readFile(projectRoot: string, relativePath: string): Promise<FileReadResponse> {
    // 1. Validate path stays within project root
    const absolutePath = validateProjectPath(projectRoot, relativePath);

    // 2. Check file exists and get stats
    let stat;
    try {
      stat = await fs.stat(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const err = new Error('File not found');
        (err as NodeJS.ErrnoException).code = 'FILE_NOT_FOUND';
        throw err;
      }
      throw error;
    }

    if (!stat.isFile()) {
      const err = new Error('Path is not a file');
      (err as NodeJS.ErrnoException).code = 'FILE_NOT_FOUND';
      throw err;
    }

    const size = stat.size;
    const mimeType = getMimeType(absolutePath);

    // 3. Check if binary
    if (size > 0) {
      const binary = await isBinaryFile(absolutePath);
      if (binary) {
        return { content: null, isBinary: true, isTruncated: false, size, mimeType };
      }
    }

    // 4. Read content (truncate if > 1MB)
    if (size > MAX_FILE_SIZE) {
      const handle = await fs.open(absolutePath, 'r');
      try {
        const buffer = Buffer.alloc(MAX_FILE_SIZE);
        await handle.read(buffer, 0, MAX_FILE_SIZE, 0);
        const content = buffer.toString('utf-8');
        return { content, isBinary: false, isTruncated: true, size, mimeType };
      } finally {
        await handle.close();
      }
    }

    // 5. Normal read
    const content = await fs.readFile(absolutePath, 'utf-8');
    return { content, isBinary: false, isTruncated: false, size, mimeType };
  }

  /**
   * List directory entries within a project root.
   * @param projectRoot Absolute path to the project root
   * @param relativePath Relative path to the directory
   * @returns DirectoryListResponse
   */
  async listDirectory(projectRoot: string, relativePath: string): Promise<DirectoryListResponse> {
    // 1. Validate path stays within project root
    const absolutePath = validateProjectPath(projectRoot, relativePath);

    // 2. Check directory exists
    let stat;
    try {
      stat = await fs.stat(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const err = new Error('Directory not found');
        (err as NodeJS.ErrnoException).code = 'DIRECTORY_NOT_FOUND';
        throw err;
      }
      throw error;
    }

    if (!stat.isDirectory()) {
      const err = new Error('Path is not a directory');
      (err as NodeJS.ErrnoException).code = 'NOT_A_DIRECTORY';
      throw err;
    }

    // 3. Read directory entries
    const dirEntries = await fs.readdir(absolutePath);
    const entries = [];

    for (const name of dirEntries) {
      try {
        const entryPath = path.join(absolutePath, name);
        const entryStat = await fs.stat(entryPath);
        entries.push({
          name,
          type: entryStat.isDirectory() ? 'directory' as const : 'file' as const,
          size: entryStat.isDirectory() ? 0 : entryStat.size,
          modifiedAt: entryStat.mtime.toISOString(),
        });
      } catch {
        // Skip entries that can't be stat'd (e.g., broken symlinks)
        continue;
      }
    }

    return { path: relativePath, entries };
  }
}

export const fileSystemService = new FileSystemService();
