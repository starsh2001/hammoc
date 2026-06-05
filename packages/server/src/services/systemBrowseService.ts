/**
 * System Browse Service
 * Directory-only browsing across the whole host filesystem (Epic 34, Story 34.1).
 *
 * KEY DIFFERENCE from fileSystemService: there is NO project boundary. This API
 * runs *before* a project is registered, so it accepts arbitrary ABSOLUTE paths
 * (drive roots through any directory). It therefore does NOT use
 * validateProjectPath / validateReadPath. Instead it carries its own guard
 * (assertSafeAbsolutePath) that blocks null bytes / UNC-device paths and enforces
 * absoluteness. The write surface is folder create/rename ONLY — there is no
 * delete method (destructive actions removed from the surface entirely).
 *
 * The guard / realpath / EACCES-skip / errno-mapping idioms are borrowed 1:1
 * from fileSystemService and pathGuard; only the boundary model differs.
 * [Source: docs/prd/epic-34-directory-browser.md#Story 34.1;
 *          packages/server/src/services/fileSystemService.ts:162-176, 266-335, 765;
 *          packages/server/src/middleware/pathGuard.ts:34-58]
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type {
  BrowseEntry,
  BrowseResponse,
  MkdirResponse,
  RenameResponse,
} from '@hammoc/shared';

/**
 * Windows reserved device names (case-insensitive) — cannot be used as a folder
 * name on Windows even with an extension (e.g. CON.txt). Rejected everywhere for
 * cross-platform consistency.
 */
const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

/** Printable characters not allowed in a folder name (Windows-strict, safe for POSIX). */
const RESERVED_PRINTABLE_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

/**
 * True if a name contains a reserved printable char OR any control character
 * (0x00–0x1F). Char-code scan avoids a control-char regex literal entirely.
 */
function hasReservedChar(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    const ch = name[i]!;
    if (RESERVED_PRINTABLE_CHARS.has(ch)) return true;
    if (name.charCodeAt(i) < 0x20) return true; // control characters
  }
  return false;
}

/** OS errno codes that mean "write refused" → mapped to PERMISSION_DENIED (AC9). */
function isWriteDeniedErrno(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EACCES' || code === 'EPERM' || code === 'EROFS';
}

class SystemBrowseService {
  /**
   * Build a domain error whose `code` the controller maps to an HTTP status +
   * i18n message (same idiom as fileSystemService: `(err).code = 'CODE'`).
   */
  private makeError(code: string, message: string): NodeJS.ErrnoException {
    const err = new Error(message) as NodeJS.ErrnoException;
    err.code = code;
    return err;
  }

  /**
   * Guard an incoming absolute path. Blocks null bytes and UNC/device paths,
   * enforces absoluteness, and normalizes via path.resolve. Throws INVALID_PATH.
   * Mirrors the null-byte / UNC checks from pathGuard, minus the project-root
   * containment (this API has no project boundary).
   */
  private assertSafeAbsolutePath(input: string): string {
    if (typeof input !== 'string' || input.length === 0) {
      throw this.makeError('INVALID_PATH', 'Path is required');
    }
    // Null byte
    if (input.includes('\0')) {
      throw this.makeError('INVALID_PATH', 'Invalid path: null byte detected');
    }
    // UNC / device paths (\\server\share, //server, \\?\...) — block network/device access
    if (input.startsWith('\\\\') || input.startsWith('//')) {
      throw this.makeError('INVALID_PATH', 'Invalid path: UNC paths are not allowed');
    }
    // Must be absolute (relative paths are meaningless without a project root)
    if (!path.isAbsolute(input)) {
      throw this.makeError('INVALID_PATH', 'Invalid path: must be absolute');
    }
    const resolved = path.resolve(input);
    // Double-check the resolved form isn't UNC (e.g. mixed-separator input)
    const normalizedForUNC = resolved.replace(/\//g, '\\');
    if (normalizedForUNC.startsWith('\\\\')) {
      throw this.makeError('INVALID_PATH', 'Invalid path: UNC paths are not allowed');
    }
    return resolved;
  }

  /**
   * Validate and normalize a single folder name (for mkdir/rename).
   * Strips directory components via basename (traversal guard), then rejects
   * empty / dot names, reserved characters, and Windows reserved device names.
   * If basename(name) !== name the input contained a path separator → traversal
   * attempt → INVALID_NAME. (fileSystemService:765 basename idiom.)
   */
  private sanitizeEntryName(name: string): string {
    if (typeof name !== 'string') {
      throw this.makeError('INVALID_NAME', 'Name is required');
    }
    const base = path.basename(name);
    // Any directory component (a/b, ../x) makes basename differ from the input.
    if (base !== name) {
      throw this.makeError('INVALID_NAME', 'Name must not contain path separators');
    }
    if (base === '' || base === '.' || base === '..') {
      throw this.makeError('INVALID_NAME', 'Invalid name');
    }
    if (hasReservedChar(base)) {
      throw this.makeError('INVALID_NAME', 'Name contains reserved characters');
    }
    // Reserved device name check uses the stem before the first dot (CON, CON.txt).
    const stem = base.split('.')[0]!.toUpperCase();
    if (WINDOWS_RESERVED_NAMES.has(stem)) {
      throw this.makeError('INVALID_NAME', 'Name is a reserved device name');
    }
    return base;
  }

  /**
   * Parent path for breadcrumb / up navigation. At a filesystem root (C:\, /)
   * path.dirname returns the same path → return null so the client maps it to
   * the "My PC" drive-roots view.
   */
  private parentOf(abs: string): string | null {
    const parent = path.dirname(abs);
    return parent === abs ? null : parent;
  }

  /**
   * Whether a directory has at least one child directory (tree-chevron signal).
   * depth-1 guarded readdir, short-circuits on the first directory found. There
   * is NO recursion anywhere in this service, so symlink cycles can never blow
   * the stack — a stronger guarantee than searchFiles' visited-set, achieved
   * structurally. EACCES/EPERM (or any read failure) → false.
   */
  private async hasChildDirectory(absDir: string): Promise<boolean> {
    let dirents;
    try {
      dirents = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      // EACCES/EPERM/ENOENT/etc. — treat as "no expandable children"
      return false;
    }
    for (const dirent of dirents) {
      try {
        if (dirent.isDirectory()) return true;
        if (dirent.isSymbolicLink()) {
          // readdir() reports the link itself; resolve to see if it targets a dir.
          const target = await fs.realpath(path.join(absDir, dirent.name));
          const st = await fs.stat(target);
          if (st.isDirectory()) return true;
        }
      } catch {
        // broken symlink / unreadable entry — skip
        continue;
      }
    }
    return false;
  }

  /**
   * List the child DIRECTORIES of an absolute path (files excluded, AC1).
   * - ENOENT → NOT_FOUND, non-directory → NOT_A_DIRECTORY
   * - per-entry try/catch: EACCES/EPERM and broken symlinks are skipped so the
   *   listing returns a partial result instead of failing (AC4)
   * - symlinks are resolved via realpath and evaluated as directory-or-not (AC3);
   *   no recursion means cycles cannot cause infinite descent
   */
  async listDirectory(absolutePath: string): Promise<BrowseResponse> {
    const abs = this.assertSafeAbsolutePath(absolutePath);

    let stat;
    try {
      stat = await fs.stat(abs);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') throw this.makeError('NOT_FOUND', 'Path not found');
      if (isWriteDeniedErrno(error)) throw this.makeError('PERMISSION_DENIED', 'Permission denied');
      throw this.makeError('BROWSE_ERROR', 'Browse error');
    }

    if (!stat.isDirectory()) {
      throw this.makeError('NOT_A_DIRECTORY', 'Path is not a directory');
    }

    let dirents;
    try {
      dirents = await fs.readdir(abs, { withFileTypes: true });
    } catch (error) {
      // The whole listing failed (not a per-entry skip) → surface as a coherent code.
      if (isWriteDeniedErrno(error)) throw this.makeError('PERMISSION_DENIED', 'Permission denied');
      throw this.makeError('BROWSE_ERROR', 'Browse error');
    }

    const entries: BrowseEntry[] = [];
    for (const dirent of dirents) {
      try {
        const entryPath = path.join(abs, dirent.name);
        let isDir = dirent.isDirectory();
        if (!isDir && dirent.isSymbolicLink()) {
          // Broken symlink → realpath throws → caught below → skipped.
          const target = await fs.realpath(entryPath);
          const st = await fs.stat(target);
          isDir = st.isDirectory();
        }
        if (!isDir) continue; // files excluded (AC1)
        const hasChildren = await this.hasChildDirectory(entryPath);
        entries.push({ name: dirent.name, path: entryPath, hasChildren });
      } catch {
        // EACCES/EPERM/broken symlink → skip (partial result, AC4/AC3)
        continue;
      }
    }

    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    return {
      path: abs,
      parent: this.parentOf(abs),
      home: os.homedir(),
      isDriveRoots: false,
      entries,
    };
  }

  /**
   * List drive roots ("My PC" view, AC2).
   * Windows: probe drive letters A–Z with fs.access — NO child_process (wmic is
   *   deprecated on newer Windows; PowerShell spawns are slow / shell-dependent /
   *   test-fragile). Drives that exist but are inaccessible (empty optical drive,
   *   locked BitLocker volume) make access() throw and are naturally omitted —
   *   this is the INTENDED meaning of AC2's "available drives", not a defect.
   * POSIX: root "/" is always present; standard mount-point parents
   *   (/Volumes, /mnt, /media) are added best-effort only when they exist.
   */
  async listDriveRoots(): Promise<BrowseResponse> {
    const entries: BrowseEntry[] = [];

    if (process.platform === 'win32') {
      for (let i = 65; i <= 90; i++) { // 'A'..'Z'
        const letter = String.fromCharCode(i);
        const root = `${letter}:\\`;
        try {
          await fs.access(root);
          // Drives are assumed expandable (avoids a probe of every drive's contents).
          entries.push({ name: `${letter}:`, path: root, hasChildren: true });
        } catch {
          // Non-existent OR inaccessible drive — intentionally omitted (see doc above).
          continue;
        }
      }
    } else {
      entries.push({ name: '/', path: '/', hasChildren: true });
      for (const mount of ['/Volumes', '/mnt', '/media']) {
        try {
          const st = await fs.stat(mount);
          if (st.isDirectory()) {
            entries.push({ name: mount, path: mount, hasChildren: true });
          }
        } catch {
          continue; // best-effort: absent mount parents are skipped
        }
      }
    }

    return {
      path: null,
      parent: null,
      home: os.homedir(),
      isDriveRoots: true,
      entries,
    };
  }

  /**
   * Create a new folder under an absolute parent directory (AC5).
   * EEXIST → ALREADY_EXISTS (409); EACCES/EPERM/EROFS → PERMISSION_DENIED (403,
   * AC9 — OS-protected areas are refused safely, never a crash/500).
   */
  async makeDirectory(parentAbsolute: string, name: string): Promise<MkdirResponse> {
    const parent = this.assertSafeAbsolutePath(parentAbsolute);
    const safe = this.sanitizeEntryName(name);

    let parentStat;
    try {
      parentStat = await fs.stat(parent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw this.makeError('NOT_FOUND', 'Parent directory not found');
      }
      if (isWriteDeniedErrno(error)) throw this.makeError('PERMISSION_DENIED', 'Permission denied');
      throw this.makeError('BROWSE_ERROR', 'Browse error');
    }
    if (!parentStat.isDirectory()) {
      throw this.makeError('NOT_A_DIRECTORY', 'Parent path is not a directory');
    }

    const target = path.join(parent, safe);
    try {
      await fs.mkdir(target);
      return { success: true, path: target };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') throw this.makeError('ALREADY_EXISTS', 'Directory already exists');
      if (code === 'ENOENT') throw this.makeError('NOT_FOUND', 'Parent directory not found');
      if (isWriteDeniedErrno(error)) throw this.makeError('PERMISSION_DENIED', 'Permission denied');
      throw this.makeError('BROWSE_ERROR', 'Browse error');
    }
  }

  /**
   * Rename an entry within its SAME parent directory (AC6).
   * Target-exists → ALREADY_EXISTS (409); EACCES/EPERM/EROFS → PERMISSION_DENIED
   * (AC9). The new name is sanitized and joined to dirname(source), so a rename
   * can never move an entry into another directory.
   */
  async rename(absolute: string, newName: string): Promise<RenameResponse> {
    const src = this.assertSafeAbsolutePath(absolute);
    const safe = this.sanitizeEntryName(newName);

    try {
      await fs.stat(src);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw this.makeError('NOT_FOUND', 'Source not found');
      }
      if (isWriteDeniedErrno(error)) throw this.makeError('PERMISSION_DENIED', 'Permission denied');
      throw this.makeError('BROWSE_ERROR', 'Browse error');
    }

    const target = path.join(path.dirname(src), safe);

    // Target must not already exist (same-parent rename, AC6).
    try {
      await fs.stat(target);
      throw this.makeError('ALREADY_EXISTS', 'Target already exists');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ALREADY_EXISTS') throw error;
      if (code !== 'ENOENT') {
        if (isWriteDeniedErrno(error)) throw this.makeError('PERMISSION_DENIED', 'Permission denied');
        throw this.makeError('BROWSE_ERROR', 'Browse error');
      }
      // ENOENT — target is free, proceed.
    }

    try {
      await fs.rename(src, target);
      return { success: true, oldPath: src, newPath: target };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST' || code === 'ENOTEMPTY') {
        throw this.makeError('ALREADY_EXISTS', 'Target already exists');
      }
      if (isWriteDeniedErrno(error)) throw this.makeError('PERMISSION_DENIED', 'Permission denied');
      throw this.makeError('BROWSE_ERROR', 'Browse error');
    }
  }
}

export const systemBrowseService = new SystemBrowseService();
