/**
 * Story 31.1: BMad core-config editor service (Epic 31).
 *
 * Domain: the single `<projectRoot>/.bmad-core/core-config.yaml` file that
 * drives downstream BMad agents (`/dev` · `/sm` · `/qa`). This file is the
 * SIBLING of `.claude/` (it lives under `.bmad-core/`, outside the harness
 * whitelist), so it gets a dedicated canonical-path resolver
 * (`resolveBmadCoreConfigPath`) exactly like Story 29.1's CLAUDE.md and Story
 * 30.7's `.gitignore`.
 *
 * Separation from `bmadStatusService`: that service SCANS the whole BMad
 * project (epics, stories, QA, documents) and returns a status snapshot;
 * this service does single-file R/W on the config itself. They read the same
 * file but expose different shapes (status snapshot vs raw config + AST ops),
 * so they stay separate.
 *
 * YAML parser single source of truth: `yaml` (eemeli) via
 * `structuredEditor.applyYamlPatch`, which preserves comments, key order,
 * quoting, and blank-line metadata across a patch. `js-yaml@4` (used by
 * `bmadStatusService` for a lossy status read) must NOT be used here — it has
 * no comment-preservation path (see structuredEditor.ts header).
 *
 * Method contract (all throw typed errors from `HARNESS_ERRORS`):
 *   read             — content + mtime; missing file → HARNESS_FILE_NOT_FOUND
 *   patchKey         — AST patch preserving comments/order; STALE_WRITE guard
 *   writeRaw         — raw text overwrite (Raw editor); same STALE_WRITE guard
 *   parseUnknownKeys — partition parsed YAML into known/unknown top-level keys
 */

import fs from 'fs/promises';
import { parse as parseYaml } from 'yaml';
import {
  HARNESS_ERRORS,
  BMAD_CORE_CONFIG_KNOWN_TOP_LEVEL_KEYS,
  type HarnessStructuredPatchOp,
  type BmadCoreConfigKnownKeys,
} from '@hammoc/shared';
import { resolveBmadCoreConfigPath } from '../utils/harnessPaths.js';
import { applyYamlPatch } from '../utils/structuredEditor.js';
import { fileWatcherService } from './fileWatcherService.js';

function throwMapped(code: string, message: string, extras?: Record<string, unknown>): never {
  const err = new Error(message) as NodeJS.ErrnoException & Record<string, unknown>;
  err.code = code;
  if (extras) Object.assign(err, extras);
  throw err;
}

const KNOWN_TOP_LEVEL = new Set<string>(BMAD_CORE_CONFIG_KNOWN_TOP_LEVEL_KEYS);

export interface BmadCoreConfigReadResult {
  content: string;
  mtime: string;
}

export interface BmadCoreConfigParsed {
  knownKeys: BmadCoreConfigKnownKeys;
  unknownKeys: Record<string, unknown>;
}

class BmadCoreConfigService {
  /**
   * Read the raw config text + mtime. Missing file →
   * HARNESS_FILE_NOT_FOUND: the BMad-project gate means this service is only
   * ever called for projects that have `.bmad-core/`, so a missing
   * core-config.yaml is an abnormal state, not an empty-state.
   */
  async read(projectSlug: string): Promise<BmadCoreConfigReadResult> {
    const { absolutePath } = await resolveBmadCoreConfigPath(projectSlug);

    let stat;
    try {
      stat = await fs.stat(absolutePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throwMapped(HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code, 'core-config.yaml not found', { absolutePath });
      }
      if (code === 'EACCES') {
        throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied');
      }
      throw error;
    }

    if (!stat.isFile()) {
      throwMapped(HARNESS_ERRORS.HARNESS_NOT_A_FILE.code, 'path is not a file');
    }

    const content = await fs.readFile(absolutePath, 'utf-8');
    return { content, mtime: stat.mtime.toISOString() };
  }

  /**
   * Partition a parsed config into the 10 known top-level keys vs everything
   * else. Known nested groups (`qa`/`prd`/`architecture`/`brownfieldEpic`)
   * pass through whole; their leaves are the 18-key matrix the form renders.
   * Unknown top-level keys are surfaced read-only (AC4). Unparseable input →
   * HARNESS_PARSE_ERROR so the client can fall back to raw editing.
   */
  parseUnknownKeys(content: string): BmadCoreConfigParsed {
    let parsed: unknown;
    try {
      parsed = parseYaml(content);
    } catch (cause) {
      throwMapped(
        HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
        `failed to parse core-config.yaml: ${(cause as Error)?.message ?? String(cause)}`,
      );
    }

    const knownKeys: Record<string, unknown> = {};
    const unknownKeys: Record<string, unknown> = {};

    // A comment-only / empty file parses to null or a scalar — treat as no keys.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (KNOWN_TOP_LEVEL.has(key)) {
          knownKeys[key] = value;
        } else {
          unknownKeys[key] = value;
        }
      }
    }

    return { knownKeys: knownKeys as BmadCoreConfigKnownKeys, unknownKeys };
  }

  /**
   * Apply AST-level patches to the config, preserving comments/order/quoting
   * for every untouched node — including unknown keys (AC4.b). Running through
   * a read → patch → write round trip means an external mutation that slipped
   * in between read and write surfaces as STALE_WRITE.
   *
   * `expectedMtime` semantics mirror `harnessService.patchStructured`: when the
   * client supplies it, that value is the guard; otherwise the freshly-read
   * mtime guards against a concurrent write during our own round trip.
   */
  async patchKey(
    projectSlug: string,
    ops: HarnessStructuredPatchOp[],
    expectedMtime?: string,
  ): Promise<{ mtime: string }> {
    const { absolutePath } = await resolveBmadCoreConfigPath(projectSlug);
    const current = await this.read(projectSlug);

    const patched = applyYamlPatch(current.content, ops);
    const guardMtime = expectedMtime ?? current.mtime;
    return this.writeInternal(absolutePath, patched, guardMtime);
  }

  /**
   * Raw-mode overwrite: write the supplied text verbatim, bypassing the AST
   * patch (the user intentionally took control of the whole file). The
   * STALE_WRITE guard still applies so a raw save cannot silently clobber an
   * external edit (AC5.b).
   */
  async writeRaw(
    projectSlug: string,
    content: string,
    expectedMtime?: string,
  ): Promise<{ mtime: string }> {
    const { absolutePath } = await resolveBmadCoreConfigPath(projectSlug);
    return this.writeInternal(absolutePath, content, expectedMtime);
  }

  /**
   * Shared write tail: STALE_WRITE guard + writeFile + self-write echo
   * suppression. Mirrors `harnessService.write` / `claudeMdService.write`.
   * The parent `.bmad-core/` directory is guaranteed to exist (BMad-project
   * gate), so there is no auto-mkdir path here.
   */
  private async writeInternal(
    absolutePath: string,
    content: string,
    expectedMtime?: string,
  ): Promise<{ mtime: string }> {
    if (expectedMtime !== undefined) {
      try {
        const existing = await fs.stat(absolutePath);
        const currentMtime = existing.mtime.toISOString();
        if (currentMtime !== expectedMtime) {
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
        // Any other stat failure: fall through and let writeFile surface it.
      }
    }

    try {
      await fs.writeFile(absolutePath, content, 'utf-8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EACCES') {
        throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied');
      }
      throwMapped(HARNESS_ERRORS.HARNESS_WRITE_ERROR.code, 'failed to write file');
    }

    const stat = await fs.stat(absolutePath);
    // Share the harness self-write suppression map so the `.bmad-core/`
    // watcher (Task A.4) swallows our own-write echo on the same path.
    fileWatcherService.noteLocalWrite(absolutePath);

    return { mtime: stat.mtime.toISOString() };
  }
}

export const bmadCoreConfigService = new BmadCoreConfigService();
