/**
 * File System Service
 * Provides file reading and directory listing within project boundaries.
 * [Source: Story 11.1 - Task 4]
 */

import fs from 'fs/promises';
import path from 'path';
import { validateProjectPath } from '../middleware/pathGuard.js';
import { isBinaryFile, getMimeType, MAX_FILE_SIZE, isProtectedPath } from '../utils/pathUtils.js';
import type {
  FileReadResponse,
  DirectoryListResponse,
  FileWriteResponse,
  FileCreateResponse,
  FileDeleteResponse,
  FileRenameResponse,
} from '@bmad-studio/shared';

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
  /**
   * Write content to a file within a project root.
   * Creates the file if it doesn't exist, overwrites if it does.
   * @param projectRoot Absolute path to the project root
   * @param relativePath Relative path to the file
   * @param content File content to write
   * @returns FileWriteResponse
   */
  async writeFile(projectRoot: string, relativePath: string, content: string): Promise<FileWriteResponse> {
    const absolutePath = validateProjectPath(projectRoot, relativePath);

    // Check parent directory exists
    const parentDir = path.dirname(absolutePath);
    try {
      const parentStat = await fs.stat(parentDir);
      if (!parentStat.isDirectory()) {
        const err = new Error('Parent path is not a directory');
        (err as NodeJS.ErrnoException).code = 'PARENT_NOT_FOUND';
        throw err;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const err = new Error('Parent directory not found');
        (err as NodeJS.ErrnoException).code = 'PARENT_NOT_FOUND';
        throw err;
      }
      if ((error as NodeJS.ErrnoException).code === 'PARENT_NOT_FOUND') {
        throw error;
      }
      const err = new Error('File system write error');
      (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
      throw err;
    }

    try {
      await fs.writeFile(absolutePath, content, 'utf-8');
      const stat = await fs.stat(absolutePath);
      return { success: true, size: stat.size };
    } catch {
      const err = new Error('File system write error');
      (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
      throw err;
    }
  }

  /**
   * Create a new file or directory within a project root.
   * @param projectRoot Absolute path to the project root
   * @param relativePath Relative path for the new entry
   * @param type Entry type ('file' or 'directory')
   * @returns FileCreateResponse
   */
  async createEntry(projectRoot: string, relativePath: string, type: 'file' | 'directory'): Promise<FileCreateResponse> {
    const absolutePath = validateProjectPath(projectRoot, relativePath);

    // Check if already exists
    try {
      await fs.stat(absolutePath);
      // If stat succeeds, the entry already exists
      const err = new Error('Entry already exists');
      (err as NodeJS.ErrnoException).code = 'FILE_ALREADY_EXISTS';
      throw err;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'FILE_ALREADY_EXISTS') {
        throw error;
      }
      // ENOENT is expected — entry doesn't exist yet
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        const err = new Error('File system write error');
        (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
        throw err;
      }
    }

    // Check parent directory exists
    const parentDir = path.dirname(absolutePath);
    try {
      const parentStat = await fs.stat(parentDir);
      if (!parentStat.isDirectory()) {
        const err = new Error('Parent path is not a directory');
        (err as NodeJS.ErrnoException).code = 'PARENT_NOT_FOUND';
        throw err;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const err = new Error('Parent directory not found');
        (err as NodeJS.ErrnoException).code = 'PARENT_NOT_FOUND';
        throw err;
      }
      if ((error as NodeJS.ErrnoException).code === 'PARENT_NOT_FOUND') {
        throw error;
      }
      const err = new Error('File system write error');
      (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
      throw err;
    }

    try {
      if (type === 'directory') {
        await fs.mkdir(absolutePath);
      } else {
        await fs.writeFile(absolutePath, '', 'utf-8');
      }
      return { success: true, type, path: relativePath };
    } catch {
      const err = new Error('File system write error');
      (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
      throw err;
    }
  }

  /**
   * Delete a file or directory within a project root.
   * Protected directories require force=true.
   * @param projectRoot Absolute path to the project root
   * @param relativePath Relative path to delete
   * @param force Allow deletion of protected directories
   * @returns FileDeleteResponse
   */
  async deleteEntry(projectRoot: string, relativePath: string, force: boolean = false): Promise<FileDeleteResponse> {
    const absolutePath = validateProjectPath(projectRoot, relativePath);

    // Check existence
    let stat;
    try {
      stat = await fs.stat(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const err = new Error('File not found');
        (err as NodeJS.ErrnoException).code = 'FILE_NOT_FOUND';
        throw err;
      }
      const err = new Error('File system write error');
      (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
      throw err;
    }

    // Protected path check
    if (isProtectedPath(relativePath) && !force) {
      const err = new Error('Protected path requires force flag');
      (err as NodeJS.ErrnoException).code = 'PROTECTED_PATH';
      throw err;
    }

    try {
      if (stat.isDirectory()) {
        await fs.rm(absolutePath, { recursive: true });
      } else {
        await fs.unlink(absolutePath);
      }
      return { success: true, path: relativePath };
    } catch {
      const err = new Error('File system write error');
      (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
      throw err;
    }
  }

  /**
   * Rename a file or directory within a project root.
   * Both source and target paths are validated against traversal.
   * @param projectRoot Absolute path to the project root
   * @param relativePath Source relative path
   * @param newRelativePath Target relative path
   * @returns FileRenameResponse
   */
  async renameEntry(projectRoot: string, relativePath: string, newRelativePath: string): Promise<FileRenameResponse> {
    const sourceAbsolute = validateProjectPath(projectRoot, relativePath);
    const targetAbsolute = validateProjectPath(projectRoot, newRelativePath);

    // Check source exists
    try {
      await fs.stat(sourceAbsolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const err = new Error('Source not found');
        (err as NodeJS.ErrnoException).code = 'FILE_NOT_FOUND';
        throw err;
      }
      const err = new Error('File system write error');
      (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
      throw err;
    }

    // Check target doesn't exist
    try {
      await fs.stat(targetAbsolute);
      // If stat succeeds, target exists
      const err = new Error('Target already exists');
      (err as NodeJS.ErrnoException).code = 'RENAME_TARGET_EXISTS';
      throw err;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'RENAME_TARGET_EXISTS') {
        throw error;
      }
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        const err = new Error('File system write error');
        (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
        throw err;
      }
    }

    // Check target parent directory exists
    const targetParentDir = path.dirname(targetAbsolute);
    try {
      const parentStat = await fs.stat(targetParentDir);
      if (!parentStat.isDirectory()) {
        const err = new Error('Target parent path is not a directory');
        (err as NodeJS.ErrnoException).code = 'PARENT_NOT_FOUND';
        throw err;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const err = new Error('Target parent directory not found');
        (err as NodeJS.ErrnoException).code = 'PARENT_NOT_FOUND';
        throw err;
      }
      if ((error as NodeJS.ErrnoException).code === 'PARENT_NOT_FOUND') {
        throw error;
      }
      const err = new Error('File system write error');
      (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
      throw err;
    }

    try {
      await fs.rename(sourceAbsolute, targetAbsolute);
      return { success: true, oldPath: relativePath, newPath: newRelativePath };
    } catch {
      const err = new Error('File system write error');
      (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
      throw err;
    }
  }
}

export const fileSystemService = new FileSystemService();
