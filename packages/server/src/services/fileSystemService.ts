/**
 * File System Service
 * Provides file reading and directory listing within project boundaries.
 * [Source: Story 11.1 - Task 4]
 */

import fs, { constants as fsConstants } from 'fs/promises';
import { createReadStream } from 'fs';
import type { ReadStream } from 'fs';
import path from 'path';
import os from 'os';
import { validateProjectPath, validateReadPath } from '../middleware/pathGuard.js';
import { preferencesService } from './preferencesService.js';
import { isBinaryFile, getMimeType, MAX_FILE_SIZE, isProtectedPath } from '../utils/pathUtils.js';
import type {
  FileReadResponse,
  DirectoryListResponse,
  DirectoryTreeEntry,
  DirectoryTreeResponse,
  FileWriteResponse,
  FileCreateResponse,
  FileDeleteResponse,
  FileRenameResponse,
  FileSearchResult,
  FileSearchResponse,
  FileCopyResponse,
  FileUploadResponse,
} from '@hammoc/shared';


/**
 * FileSystemService - Read files and list directories within project roots
 */
class FileSystemService {
  private _cachedAllowedRoots: string[] | null = null;
  private _cachedAllowedRootsExpiry = 0;
  private static readonly CACHE_TTL_MS = 30_000; // 30 seconds

  /**
   * Get allowed read roots from preferences with caching.
   * Default: ~/.claude (least-privilege; user can expand via preferences).
   */
  private async getAllowedReadRoots(): Promise<string[]> {
    const now = Date.now();
    if (this._cachedAllowedRoots && now < this._cachedAllowedRootsExpiry) {
      return this._cachedAllowedRoots;
    }

    let roots: string[];
    try {
      const prefs = await preferencesService.readPreferences();
      if (prefs.allowedReadPaths && prefs.allowedReadPaths.length > 0) {
        roots = prefs.allowedReadPaths;
      } else {
        roots = [path.join(os.homedir(), '.claude')];
      }
    } catch {
      roots = [path.join(os.homedir(), '.claude')];
    }

    this._cachedAllowedRoots = roots;
    this._cachedAllowedRootsExpiry = now + FileSystemService.CACHE_TTL_MS;
    return roots;
  }

  /**
   * Read a file's content within a project root.
   * Binary files return metadata only (content: null).
   * Large files (> 1MB) are truncated.
   * @param projectRoot Absolute path to the project root
   * @param relativePath Relative path to the file
   * @returns FileReadResponse
   */
  async readFile(projectRoot: string, relativePath: string): Promise<FileReadResponse> {
    // 1. Validate path (allows read access to whitelisted directories)
    const allowedRoots = await this.getAllowedReadRoots();
    const absolutePath = validateReadPath(projectRoot, relativePath, allowedRoots);

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
   * Build a full recursive directory tree.
   * Skips heavy/hidden directories like .git, node_modules, etc.
   * @param projectRoot Absolute path to the project root
   * @param relativePath Relative path to start from
   * @returns DirectoryTreeResponse
   */
  async listDirectoryTree(projectRoot: string, relativePath: string): Promise<DirectoryTreeResponse> {
    const absolutePath = validateProjectPath(projectRoot, relativePath);

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

    const tree = await this.buildTree(absolutePath);
    return { path: relativePath, tree };
  }

  /** Directories too large to recurse into (listed as entries but with empty children in tree, skipped in search). */
  private static readonly SKIP_DIRS = new Set([
    'node_modules', '.git', '.next', '.cache', '__pycache__', 'dist', '.turbo',
  ]);

  /**
   * Recursively build a tree of DirectoryTreeEntry from the filesystem.
   */
  private async buildTree(absolutePath: string): Promise<DirectoryTreeEntry[]> {
    const dirEntries = await fs.readdir(absolutePath);
    const results: DirectoryTreeEntry[] = [];

    for (const name of dirEntries) {
      try {
        const entryPath = path.join(absolutePath, name);
        const entryStat = await fs.stat(entryPath);

        if (entryStat.isDirectory()) {
          const children = FileSystemService.SKIP_DIRS.has(name)
            ? []
            : await this.buildTree(entryPath);
          results.push({ name, type: 'directory', children });
        } else {
          results.push({ name, type: 'file' });
        }
      } catch {
        // Skip entries that can't be stat'd (e.g., broken symlinks)
        continue;
      }
    }

    // Sort: directories first, then alphabetical
    results.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return results;
  }

  /**
   * Search files and directories by name within a project root.
   * Recursively searches directories for files matching the query.
   * When includeHidden is false (default), SKIP_DIRS are not recursed into.
   * When includeHidden is true, all directories are searched.
   * @param projectRoot Absolute path to the project root
   * @param query Search query (case-insensitive name match)
   * @param maxResults Maximum number of results to return
   * @param includeHidden Whether to search inside SKIP_DIRS
   * @returns FileSearchResponse
   */
  async searchFiles(projectRoot: string, query: string, maxResults: number = 100, includeHidden: boolean = false): Promise<FileSearchResponse> {
    const lowerQuery = query.toLowerCase();
    const results: FileSearchResult[] = [];
    await this.searchRecursive(projectRoot, '', lowerQuery, results, maxResults, includeHidden);
    return { query, results };
  }

  private async searchRecursive(
    absoluteBase: string,
    relativePath: string,
    query: string,
    results: FileSearchResult[],
    maxResults: number,
    includeHidden: boolean,
  ): Promise<void> {
    if (results.length >= maxResults) return;

    const currentAbsolute = relativePath
      ? path.join(absoluteBase, relativePath)
      : absoluteBase;

    let dirEntries: string[];
    try {
      dirEntries = await fs.readdir(currentAbsolute);
    } catch {
      return;
    }

    for (const name of dirEntries) {
      if (results.length >= maxResults) return;

      try {
        const entryAbsolute = path.join(currentAbsolute, name);
        const entryStat = await fs.stat(entryAbsolute);
        const entryRelative = relativePath ? `${relativePath}/${name}` : name;
        const entryType: 'file' | 'directory' = entryStat.isDirectory() ? 'directory' : 'file';

        if (name.toLowerCase().includes(query)) {
          results.push({ path: entryRelative, name, type: entryType });
        }

        if (entryStat.isDirectory() && (includeHidden || !FileSystemService.SKIP_DIRS.has(name))) {
          await this.searchRecursive(absoluteBase, entryRelative, query, results, maxResults, includeHidden);
        }
      } catch {
        continue;
      }
    }
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

  /**
   * Copy a file or directory within a project root.
   * @param projectRoot Absolute path to the project root
   * @param sourcePath Source relative path
   * @param destinationPath Destination relative path
   * @returns FileCopyResponse
   */
  async copyEntry(projectRoot: string, sourcePath: string, destinationPath: string): Promise<FileCopyResponse> {
    const sourceAbsolute = validateProjectPath(projectRoot, sourcePath);
    const destAbsolute = validateProjectPath(projectRoot, destinationPath);

    // Check source exists
    let sourceStat;
    try {
      sourceStat = await fs.stat(sourceAbsolute);
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

    // Directory-specific checks
    if (sourceStat.isDirectory()) {
      // Prevent copying a directory into itself or its subdirectory (infinite recursion)
      const normalizedSrc = sourceAbsolute.replace(/\\/g, '/').replace(/\/$/, '');
      const normalizedDest = destAbsolute.replace(/\\/g, '/').replace(/\/$/, '');
      if (normalizedDest.startsWith(normalizedSrc + '/')) {
        const err = new Error('Cannot copy a directory into itself');
        (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
        throw err;
      }

      // Limit directory copy size to prevent HTTP timeout on large trees
      const MAX_COPY_ENTRIES = 1000;
      let count = 0;
      const countEntries = async (dir: string): Promise<void> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          count++;
          if (count > MAX_COPY_ENTRIES) {
            const err = new Error('Directory too large to copy (max 1000 entries)');
            (err as NodeJS.ErrnoException).code = 'COPY_TOO_LARGE';
            throw err;
          }
          if (entry.isDirectory()) {
            await countEntries(path.join(dir, entry.name));
          }
        }
      };
      await countEntries(sourceAbsolute);
    }

    // Check destination parent directory exists
    const destParentDir = path.dirname(destAbsolute);
    try {
      const parentStat = await fs.stat(destParentDir);
      if (!parentStat.isDirectory()) {
        const err = new Error('Destination parent path is not a directory');
        (err as NodeJS.ErrnoException).code = 'PARENT_NOT_FOUND';
        throw err;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const err = new Error('Destination parent directory not found');
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

    // Use force: false to atomically prevent overwriting (no TOCTOU race)
    // Skip symlinks that point outside the project root to prevent data exfiltration
    const normalizedRoot = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');
    const symlinkFilter = async (src: string): Promise<boolean> => {
      const srcStat = await fs.lstat(src);
      if (srcStat.isSymbolicLink()) {
        const realTarget = await fs.realpath(src);
        const normalizedTarget = realTarget.replace(/\\/g, '/');
        if (!normalizedTarget.startsWith(normalizedRoot + '/') && normalizedTarget !== normalizedRoot) {
          return false;
        }
      }
      return true;
    };

    try {
      await fs.cp(sourceAbsolute, destAbsolute, { recursive: true, force: false, errorOnExist: true, filter: symlinkFilter });
      return { success: true, sourcePath, destinationPath };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ERR_FS_CP_EEXIST') {
        const err = new Error('Destination already exists');
        (err as NodeJS.ErrnoException).code = 'COPY_TARGET_EXISTS';
        throw err;
      }
      const err = new Error('File system write error');
      (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
      throw err;
    }
  }

  /**
   * Save uploaded files to a directory within a project root.
   * @param projectRoot Absolute path to the project root
   * @param targetDir Target directory relative path
   * @param files Array of multer-uploaded files
   * @returns FileUploadResponse
   */
  async uploadFiles(
    projectRoot: string,
    targetDir: string,
    files: Array<{ originalname: string; path: string; size: number }>,
  ): Promise<FileUploadResponse> {
    // Collect temp paths upfront so finally always cleans up, even on early validation throws
    const tempPaths = files.map(f => f.path);

    try {
      const targetAbsolute = validateProjectPath(projectRoot, targetDir);

      // Check target directory exists
      try {
        const stat = await fs.stat(targetAbsolute);
        if (!stat.isDirectory()) {
          const err = new Error('Target is not a directory');
          (err as NodeJS.ErrnoException).code = 'NOT_A_DIRECTORY';
          throw err;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          const err = new Error('Directory not found');
          (err as NodeJS.ErrnoException).code = 'DIRECTORY_NOT_FOUND';
          throw err;
        }
        if ((error as NodeJS.ErrnoException).code === 'NOT_A_DIRECTORY' ||
            (error as NodeJS.ErrnoException).code === 'DIRECTORY_NOT_FOUND') {
          throw error;
        }
        const err = new Error('File system write error');
        (err as NodeJS.ErrnoException).code = 'FS_WRITE_ERROR';
        throw err;
      }

      // Pass 1: Validate all files before writing any
      const filesToMove: Array<{ relativePath: string; destPath: string; tempPath: string; size: number }> = [];
      const destPathSet = new Set<string>();

      for (const file of files) {
        // Sanitize filename: strip directory components to prevent path traversal
        const safeName = path.basename(file.originalname);
        const relativePath = targetDir === '.' ? safeName : `${targetDir}/${safeName}`;
        // Validate each file path stays within project root and use the validated absolute path
        const destPath = validateProjectPath(projectRoot, relativePath);

        // Reject duplicate destinations within the same batch
        if (destPathSet.has(destPath)) {
          const err = new Error('File already exists');
          (err as NodeJS.ErrnoException).code = 'FILE_ALREADY_EXISTS';
          throw err;
        }
        destPathSet.add(destPath);

        filesToMove.push({ relativePath, destPath, tempPath: file.path, size: file.size });
      }

      // Pass 2: Copy temp files to destination atomically (COPYFILE_EXCL prevents overwrite)
      const uploadedFiles: Array<{ path: string; size: number }> = [];
      const copiedPaths: string[] = [];

      try {
        for (const file of filesToMove) {
          // COPYFILE_EXCL fails if dest exists (atomic create-or-fail, no TOCTOU race)
          // copyFile works across filesystems unlike rename (avoids EXDEV)
          // Note: concurrent readers may see partial content during write; full atomicity
          // would require write-to-temp + link(), but cross-platform cost outweighs the risk.
          await fs.copyFile(file.tempPath, file.destPath, fsConstants.COPYFILE_EXCL);
          copiedPaths.push(file.destPath);
          uploadedFiles.push({ path: file.relativePath, size: file.size });
        }
      } catch (error) {
        // Rollback: remove files that were already copied
        for (const copiedPath of copiedPaths) {
          try { await fs.unlink(copiedPath); } catch { /* best-effort */ }
        }
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          const err = new Error('File already exists');
          (err as NodeJS.ErrnoException).code = 'FILE_ALREADY_EXISTS';
          throw err;
        }
        const err = new Error('File upload error');
        (err as NodeJS.ErrnoException).code = 'UPLOAD_ERROR';
        throw err;
      }

      return { success: true, files: uploadedFiles };
    } finally {
      // Always clean up multer temp files
      for (const tempPath of tempPaths) {
        try { await fs.unlink(tempPath); } catch { /* already moved or doesn't exist */ }
      }
    }
  }

  /**
   * Get a readable stream for a file (for raw binary serving).
   * Returns the stream along with file size and MIME type.
   * @param projectRoot Absolute path to the project root
   * @param relativePath Relative path to the file
   * @returns Object with stream, size, and mimeType
   */
  async readFileRaw(projectRoot: string, relativePath: string): Promise<{ stream: ReadStream; size: number; mimeType: string }> {
    const allowedRoots = await this.getAllowedReadRoots();
    const absolutePath = validateReadPath(projectRoot, relativePath, allowedRoots);

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

    const mimeType = getMimeType(absolutePath);
    const stream = createReadStream(absolutePath);
    return { stream, size: stat.size, mimeType };
  }
}

export const fileSystemService = new FileSystemService();
