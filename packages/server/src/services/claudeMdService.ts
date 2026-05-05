/**
 * Story 29.1: Claude Code free-edit memory layer service.
 *
 * Domain: the two CLAUDE.md files that Claude Code auto-loads at session
 * launch — the project root file (`<projectRoot>/CLAUDE.md`) and the global
 * file (`~/.claude/CLAUDE.md`). Both files share Markdown semantics, but
 * their on-disk locations are asymmetric:
 *   - global  → `~/.claude/CLAUDE.md` is INSIDE the user-scope harness root,
 *               so `harnessService` could in principle handle it; we still
 *               route through this service so the two scopes share one set
 *               of method signatures and response shapes.
 *   - project → `<projectRoot>/CLAUDE.md` lives OUTSIDE
 *               `<projectRoot>/.claude/`, which `resolveHarnessPath` rejects
 *               as a traversal. `resolveProjectClaudeMdPath` is the
 *               whitelisted resolver for this single file.
 *
 * Method contract (mirrors `harnessService` so behavioral patterns line up):
 *   read   — returns content + mtime + size; missing file → HARNESS_FILE_NOT_FOUND
 *   write  — STALE_WRITE conflict via expectedMtime; self-write echo suppressed
 *   create — creates an empty file; refuses if it already exists (HARNESS_FILE_EXISTS)
 */

import fs from 'fs/promises';
import path from 'path';
import {
  HARNESS_ERRORS,
  type HarnessReadResponse,
  type HarnessWriteRequest,
  type HarnessWriteResponse,
} from '@hammoc/shared';
import { getUserHarnessRoot, resolveProjectClaudeMdPath } from '../utils/harnessPaths.js';
import { MAX_FILE_SIZE } from '../utils/pathUtils.js';
import { fileWatcherService } from './fileWatcherService.js';

export type ClaudeMdScope = 'user' | 'project';

export interface ClaudeMdRef {
  scope: ClaudeMdScope;
  /** Required when scope === 'project'. */
  projectSlug?: string;
}

function throwMapped(code: string, message: string, extras?: Record<string, unknown>): never {
  const err = new Error(message) as NodeJS.ErrnoException & Record<string, unknown>;
  err.code = code;
  if (extras) Object.assign(err, extras);
  throw err;
}

/**
 * Resolve the absolute path of CLAUDE.md for the given scope. Project scope
 * goes through the AC6 whitelisted resolver; user scope is `~/.claude/CLAUDE.md`.
 * Both code paths return the path even when the file does not yet exist on disk —
 * callers stat the path themselves and surface HARNESS_FILE_NOT_FOUND.
 */
async function resolve(ref: ClaudeMdRef): Promise<string> {
  if (ref.scope === 'user') {
    return path.join(getUserHarnessRoot(), 'CLAUDE.md');
  }
  if (!ref.projectSlug) {
    throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'projectSlug is required for project scope');
  }
  const { absolutePath } = await resolveProjectClaudeMdPath(ref.projectSlug!);
  return absolutePath;
}

class ClaudeMdService {
  /** Read the CLAUDE.md text; missing file → HARNESS_FILE_NOT_FOUND. */
  async read(ref: ClaudeMdRef): Promise<HarnessReadResponse> {
    const absolutePath = await resolve(ref);

    let stat;
    try {
      stat = await fs.stat(absolutePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // Story 29.1 (AC4.c): the empty-state CTA confirmation dialog must
        // display the resolved absolute path so the user can verify *where*
        // the new file will be created. We attach `absolutePath` to the 404
        // error so the controller can surface it in `details` even though no
        // file is on disk yet.
        throwMapped(HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code, 'file not found', { absolutePath });
      }
      if (code === 'EACCES') {
        throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied');
      }
      throw error;
    }

    if (!stat.isFile()) {
      throwMapped(HARNESS_ERRORS.HARNESS_NOT_A_FILE.code, 'path is not a file');
    }

    const size = stat.size;
    const mtime = stat.mtime.toISOString();
    const base = {
      scope: ref.scope,
      projectSlug: ref.projectSlug,
      // Surfaced for client display; matches the conventional payload shape used
      // by Story 28's HarnessReadResponse so existing UI patterns can render
      // without a separate type.
      path: 'CLAUDE.md',
      size,
      mtime,
      mimeType: 'text/markdown',
      absolutePath,
    };

    if (size > MAX_FILE_SIZE) {
      const handle = await fs.open(absolutePath, 'r');
      try {
        const buffer = Buffer.alloc(MAX_FILE_SIZE);
        await handle.read(buffer, 0, MAX_FILE_SIZE, 0);
        return { ...base, content: buffer.toString('utf-8'), isBinary: false, isTruncated: true };
      } finally {
        await handle.close();
      }
    }

    const content = await fs.readFile(absolutePath, 'utf-8');
    return { ...base, content, isBinary: false, isTruncated: false };
  }

  /**
   * Write CLAUDE.md content with optional STALE_WRITE guard. Echoing watcher
   * events are suppressed via `noteLocalWrite` so the originating client does
   * not see its own save bounce back as an external change banner.
   */
  async write(ref: ClaudeMdRef, body: HarnessWriteRequest): Promise<HarnessWriteResponse> {
    const absolutePath = await resolve(ref);

    // Parent directory must exist. For user scope we auto-mkdir `~/.claude/`
    // because Story 28.6 already established the precedent that the global
    // harness root may not yet be present on a fresh machine. Project root
    // is guaranteed to exist by the project registration flow, so we never
    // mkdir there.
    const parentDir = path.dirname(absolutePath);
    try {
      const parentStat = await fs.stat(parentDir);
      if (!parentStat.isDirectory()) {
        throwMapped(HARNESS_ERRORS.HARNESS_PARENT_NOT_FOUND.code, 'parent is not a directory');
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === HARNESS_ERRORS.HARNESS_PARENT_NOT_FOUND.code) throw error;
      if (code === 'ENOENT') {
        if (ref.scope === 'user') {
          await fs.mkdir(parentDir, { recursive: true });
        } else {
          throwMapped(HARNESS_ERRORS.HARNESS_PARENT_NOT_FOUND.code, 'parent directory not found');
        }
      } else if (code === 'EACCES') {
        throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied on parent');
      } else {
        throwMapped(HARNESS_ERRORS.HARNESS_WRITE_ERROR.code, 'failed to stat parent directory');
      }
    }

    if (body.expectedMtime !== undefined) {
      try {
        const existing = await fs.stat(absolutePath);
        const currentMtime = existing.mtime.toISOString();
        if (currentMtime !== body.expectedMtime) {
          throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'file changed on disk', { currentMtime });
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'file missing on disk', { currentMtime: '' });
        }
        if (code === HARNESS_ERRORS.HARNESS_STALE_WRITE.code) throw error;
        if (code === 'EACCES') {
          throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied');
        }
        // Other stat failures fall through to writeFile.
      }
    }

    try {
      await fs.writeFile(absolutePath, body.content, 'utf-8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EACCES') {
        throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied');
      }
      throwMapped(HARNESS_ERRORS.HARNESS_WRITE_ERROR.code, 'failed to write file');
    }

    const stat = await fs.stat(absolutePath);
    fileWatcherService.noteLocalWrite(absolutePath);

    return { success: true, size: stat.size, mtime: stat.mtime.toISOString() };
  }

  /**
   * Create an empty CLAUDE.md file. Fails with HARNESS_FILE_EXISTS when the
   * file already exists — the "create empty" intent is intentionally distinct
   * from "overwrite with empty content" (which goes through write()).
   * `~/.claude/` is auto-created when missing (mirrors write()).
   */
  async create(ref: ClaudeMdRef): Promise<HarnessWriteResponse> {
    const absolutePath = await resolve(ref);

    const parentDir = path.dirname(absolutePath);
    try {
      const parentStat = await fs.stat(parentDir);
      if (!parentStat.isDirectory()) {
        throwMapped(HARNESS_ERRORS.HARNESS_PARENT_NOT_FOUND.code, 'parent is not a directory');
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === HARNESS_ERRORS.HARNESS_PARENT_NOT_FOUND.code) throw error;
      if (code === 'ENOENT') {
        if (ref.scope === 'user') {
          await fs.mkdir(parentDir, { recursive: true });
        } else {
          throwMapped(HARNESS_ERRORS.HARNESS_PARENT_NOT_FOUND.code, 'parent directory not found');
        }
      } else if (code === 'EACCES') {
        throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied on parent');
      } else {
        throwMapped(HARNESS_ERRORS.HARNESS_WRITE_ERROR.code, 'failed to stat parent directory');
      }
    }

    // O_EXCL emulation — open with `wx` flag fails when the file already
    // exists, atomically gating the "must not exist" precondition.
    let handle;
    try {
      handle = await fs.open(absolutePath, 'wx');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        throwMapped(HARNESS_ERRORS.HARNESS_FILE_EXISTS.code, 'file already exists');
      }
      if (code === 'EACCES') {
        throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied');
      }
      throwMapped(HARNESS_ERRORS.HARNESS_WRITE_ERROR.code, 'failed to create file');
    }
    try {
      await handle.writeFile('', 'utf-8');
    } finally {
      await handle.close();
    }

    const stat = await fs.stat(absolutePath);
    fileWatcherService.noteLocalWrite(absolutePath);

    return { success: true, size: stat.size, mtime: stat.mtime.toISOString() };
  }
}

export const claudeMdService = new ClaudeMdService();
