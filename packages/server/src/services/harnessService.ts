/**
 * Story 28.0.5: Harness workbench service.
 *
 * Domain: the project's `.claude/` subtree and the global `~/.claude/` subtree
 * — the files that drive plugins, skills, MCP servers, hooks, commands, and
 * subagents. Responsibilities are intentionally separated from
 * `fileSystemService` (which serves arbitrary project files) so that path
 * resolution, scope routing, and the structured-edit surface can evolve
 * independently for harness consumers.
 *
 * Method contract surfaces (all throw typed errors from `HARNESS_ERRORS`):
 *   list              — directory contents for a `.claude/` subtree
 *   read              — single file read with binary detection + 1MB truncation
 *   write             — raw write with expectedMtime / STALE_WRITE guard
 *   patchStructured   — YAML/JSONC AST-level patch preserving comments & order
 */

import fs from 'fs/promises';
import path from 'path';
import {
  HARNESS_ERRORS,
  type HarnessPathRef,
  type HarnessListResponse,
  type HarnessReadResponse,
  type HarnessWriteRequest,
  type HarnessWriteResponse,
  type HarnessStructuredPatchRequest,
} from '@hammoc/shared';
import { resolveHarnessPath } from '../utils/harnessPaths.js';
import { isBinaryFile, getMimeType, MAX_FILE_SIZE } from '../utils/pathUtils.js';
import { applyYamlPatch, applyJsoncPatch } from '../utils/structuredEditor.js';
import { fileWatcherService } from './fileWatcherService.js';

function throwMapped(code: string, message: string, extras?: Record<string, unknown>): never {
  const err = new Error(message) as NodeJS.ErrnoException & Record<string, unknown>;
  err.code = code;
  if (extras) Object.assign(err, extras);
  throw err;
}

class HarnessService {
  /** List entries of a harness subtree. Missing root → empty list (AC1/AC2). */
  async list(ref: HarnessPathRef): Promise<HarnessListResponse> {
    const { resolvedRoot, absolutePath } = await resolveHarnessPath(ref);

    let stat;
    try {
      stat = await fs.stat(absolutePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // Harness root (or any subdir) that has never been created yet —
        // return an empty list instead of 404 so the UI can render an empty
        // state without a blocking error.
        return {
          scope: ref.scope,
          projectSlug: ref.projectSlug,
          resolvedRoot,
          path: ref.relativePath ?? '',
          entries: [],
        };
      }
      if (code === 'EACCES') {
        throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied');
      }
      throw error;
    }

    if (!stat.isDirectory()) {
      throwMapped(HARNESS_ERRORS.HARNESS_NOT_A_FILE.code, 'path is not a directory');
    }

    const names = await fs.readdir(absolutePath);
    const entries: HarnessListResponse['entries'] = [];
    for (const name of names) {
      try {
        const entryPath = path.join(absolutePath, name);
        const entryStat = await fs.stat(entryPath);
        entries.push({
          name,
          type: entryStat.isDirectory() ? 'directory' : 'file',
          size: entryStat.isDirectory() ? 0 : entryStat.size,
          modifiedAt: entryStat.mtime.toISOString(),
        });
      } catch {
        // Skip broken symlinks / unstat-able entries — same policy as fileSystemService.
        continue;
      }
    }

    return {
      scope: ref.scope,
      projectSlug: ref.projectSlug,
      resolvedRoot,
      path: ref.relativePath ?? '',
      entries,
    };
  }

  /** Read a single harness file. Binary → content:null, >1MB → truncated. */
  async read(ref: HarnessPathRef): Promise<HarnessReadResponse> {
    const { absolutePath } = await resolveHarnessPath(ref);

    let stat;
    try {
      stat = await fs.stat(absolutePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throwMapped(HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code, 'file not found');
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
    const mimeType = getMimeType(absolutePath);
    const base = {
      scope: ref.scope,
      projectSlug: ref.projectSlug,
      path: ref.relativePath ?? '',
      size,
      mtime,
      mimeType,
    };

    if (size > 0) {
      const binary = await isBinaryFile(absolutePath);
      if (binary) {
        return { ...base, content: null, isBinary: true, isTruncated: false };
      }
    }

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
   * Write a harness file with optional ETag/mtime conflict check.
   * - expectedMtime present + file exists + mtime differs → STALE_WRITE
   * - expectedMtime present + file missing             → STALE_WRITE (currentMtime: '')
   * - expectedMtime absent                             → force overwrite/create
   * - parent directory missing                         → HARNESS_PARENT_NOT_FOUND (no auto-mkdir)
   */
  async write(ref: HarnessPathRef, body: HarnessWriteRequest): Promise<HarnessWriteResponse> {
    const { absolutePath } = await resolveHarnessPath(ref);

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
        throwMapped(HARNESS_ERRORS.HARNESS_PARENT_NOT_FOUND.code, 'parent directory not found');
      }
      if (code === 'EACCES') {
        throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied on parent');
      }
      throwMapped(HARNESS_ERRORS.HARNESS_WRITE_ERROR.code, 'failed to stat parent directory');
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
          // Caller asserted a specific mtime but the file is gone — treat as stale.
          throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'file missing on disk', { currentMtime: '' });
        }
        if (code === HARNESS_ERRORS.HARNESS_STALE_WRITE.code) throw error;
        if (code === 'EACCES') {
          throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied');
        }
        // Any other stat failure: fall through and let writeFile surface it.
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
    // Share the existing self-write suppression map so the harness watcher
    // (Task 7) swallows our own-write echo on the same path.
    fileWatcherService.noteLocalWrite(absolutePath);

    return { success: true, size: stat.size, mtime: stat.mtime.toISOString() };
  }

  /**
   * Read-patch-write an AST-level edit. Running the round trip through
   * `write` means an external mutation that sneaks in between our read and
   * write will surface as STALE_WRITE (AC5).
   */
  async patchStructured(
    ref: HarnessPathRef,
    body: HarnessStructuredPatchRequest,
  ): Promise<HarnessWriteResponse> {
    const current = await this.read(ref);
    if (current.isBinary || current.content == null) {
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'cannot patch binary file');
    }

    const patched = body.format === 'yaml'
      ? applyYamlPatch(current.content, body.ops)
      : applyJsoncPatch(current.content, body.ops);

    const expectedMtime = body.expectedMtime ?? current.mtime;
    return this.write(ref, { content: patched, expectedMtime });
  }
}

export const harnessService = new HarnessService();
