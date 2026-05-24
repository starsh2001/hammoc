/**
 * Story 30.1 (Task 2.1): share-scope evaluator.
 *
 * Given a project slug and a set of project-relative POSIX paths, classify
 * each path as `shared` / `local` / `fullyIgnored` based on the project's
 * `.gitignore`. Also derives the project-level Mode A / Mode B classification
 * by evaluating the virtual path `.claude/settings.json` (file may not exist
 * physically — `isIgnored()` is a pattern test, not a stat call).
 *
 * Single source of truth: `gitignoreFilter.loadGitignore` + `isIgnored`. No
 * direct `.gitignore` parsing.
 */

import path from 'path';
import fs from 'fs/promises';
import type { Ignore } from 'ignore';
import { HARNESS_ERRORS, type HarnessShareScopeResponse, type ShareScope } from '@hammoc/shared';
import { projectService } from './projectService.js';
import { loadGitignore, isIgnored } from '../utils/gitignoreFilter.js';
import { resolveProjectGitignorePath } from '../utils/harnessPaths.js';
import { fileWatcherService } from './fileWatcherService.js';

const CLAUDE_DIR = '.claude';
/**
 * Virtual path used for Mode A/B classification. The file may not exist on
 * disk — `isIgnored()` evaluates the pattern alone, so a brand-new project
 * with an empty `.claude/` still gets a deterministic mode verdict.
 */
const MODE_PROBE_PATH = `${CLAUDE_DIR}/settings.json`;
/**
 * Probe used to detect "directory itself ignored" patterns like `.claude/`
 * (which auto-propagates to descendants). When the directory itself is
 * matched, every leaf gets the `fullyIgnored` verdict.
 */
const FULL_IGNORE_PROBE_PATH = `${CLAUDE_DIR}/`;

export interface EvaluateShareScopeRequest {
  projectSlug: string;
  /** Project-relative POSIX paths. May include sibling files outside `.claude/` (e.g. `.mcp.json`). */
  relativePaths: string[];
}

class HarnessShareScopeService {
  /**
   * Evaluate share-scope for each path + the project-level mode in one
   * `.gitignore` load. Returns `cards: {}` if no paths were requested but
   * still computes `mode` (so a freshly mounted workbench can render the
   * banner before any file is asked about).
   */
  async evaluate(req: EvaluateShareScopeRequest): Promise<HarnessShareScopeResponse> {
    if (!req.projectSlug) {
      const err = new Error('projectSlug is required') as NodeJS.ErrnoException;
      err.code = HARNESS_ERRORS.HARNESS_ROOT_MISSING.code;
      throw err;
    }

    let projectRoot: string;
    try {
      projectRoot = await projectService.resolveOriginalPath(req.projectSlug);
    } catch (cause) {
      const wrapped = new Error(
        `Unable to resolve project root for "${req.projectSlug}": ${(cause as Error).message}`,
      ) as NodeJS.ErrnoException;
      wrapped.code = HARNESS_ERRORS.HARNESS_ROOT_MISSING.code;
      throw wrapped;
    }

    const matcher = await loadGitignore(projectRoot);

    // Mode A/B verdict: probe `.claude/settings.json`. The file may be missing
    // — `isIgnored` is a pattern test that returns the same verdict either way.
    const mode = isIgnored(matcher, MODE_PROBE_PATH) ? 'B' : 'A';

    // When `.claude/` itself is matched, the directory's children all become
    // `fullyIgnored` regardless of their own paths. We still evaluate each
    // requested path individually so callers can mix in sibling files
    // (e.g. `.mcp.json`) that escape the directory pattern.
    const claudeDirIgnored = isIgnored(matcher, FULL_IGNORE_PROBE_PATH);

    const cards: Record<string, ShareScope> = {};
    for (const rel of req.relativePaths) {
      cards[rel] = classifyPath(matcher, rel, claudeDirIgnored);
    }

    return { mode, cards };
  }

  /**
   * Story 30.7 (Task D.3): append `pattern` to `<projectRoot>/.gitignore`,
   * creating the file if missing. Idempotent: when the trimmed pattern
   * already appears as a non-comment line, the method returns
   * `{ appended: false }` without writing. Used by the client's
   * `SecretOnSharedDialog → Move to local` flow when the sibling pre-check
   * detects that `**\/.claude/**\/*.local.*` is missing.
   *
   * The target file sits outside the `.claude/` whitelist that
   * `harnessService.write` clamps to, so the method (a) resolves the
   * canonical path via `resolveProjectGitignorePath` (a defense-in-depth
   * helper that rejects traversal-bearing slugs) and (b) registers the
   * write with `fileWatcherService.noteLocalWrite` directly so the chokidar
   * watcher does not surface our own change as an external edit.
   */
  async appendGitignorePattern(
    projectSlug: string,
    pattern: string,
  ): Promise<{ success: true; appended: boolean }> {
    const trimmedPattern = pattern.trim();
    if (trimmedPattern.length === 0) {
      const err = new Error('pattern must be a non-empty string') as NodeJS.ErrnoException;
      err.code = HARNESS_ERRORS.HARNESS_PARSE_ERROR.code;
      throw err;
    }
    const { absolutePath } = await resolveProjectGitignorePath(projectSlug);

    let existing = '';
    try {
      existing = await fs.readFile(absolutePath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
      // File missing → create it with just the pattern below.
    }
    // Idempotency check: scan non-comment, non-blank lines for an exact
    // match. Comments (lines starting with `#`) are skipped because
    // `# **/.claude/**/*.local.*` is not the same as the live pattern.
    const alreadyPresent = existing
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
      .some((l) => l === trimmedPattern);
    if (alreadyPresent) {
      return { success: true, appended: false };
    }

    const sep = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
    const next = `${existing}${sep}${trimmedPattern}\n`;
    try {
      await fs.writeFile(absolutePath, next, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EACCES') {
        const denied = new Error('permission denied on .gitignore') as NodeJS.ErrnoException;
        denied.code = HARNESS_ERRORS.HARNESS_FORBIDDEN.code;
        throw denied;
      }
      const wrapped = new Error('failed to write .gitignore') as NodeJS.ErrnoException;
      wrapped.code = HARNESS_ERRORS.HARNESS_WRITE_ERROR.code;
      throw wrapped;
    }
    fileWatcherService.noteLocalWrite(absolutePath);
    return { success: true, appended: true };
  }
}

function classifyPath(
  matcher: Ignore,
  relativePath: string,
  claudeDirIgnored: boolean,
): ShareScope {
  // Normalize separators so Windows callers don't accidentally bypass `ignore`.
  const posix = relativePath.replace(/\\/g, '/');
  const fileIgnored = isIgnored(matcher, posix);

  if (!fileIgnored) {
    return 'shared';
  }

  // The path is ignored. If `.claude/` itself is the source of the rule, treat
  // the verdict as the project-wide `fullyIgnored` state so Mode B projects
  // get a coherent badge across every harness file.
  if (claudeDirIgnored && isUnderClaudeDir(posix)) {
    return 'fullyIgnored';
  }

  return 'local';
}

function isUnderClaudeDir(posixPath: string): boolean {
  return posixPath === CLAUDE_DIR || posixPath.startsWith(`${CLAUDE_DIR}/`);
}

export const harnessShareScopeService = new HarnessShareScopeService();

// Re-export so consumers (e.g. the .gitignore append fallback in Task 6.4)
// can also resolve the standard project-root path the matcher was built from.
export async function getProjectRootForShareScope(projectSlug: string): Promise<string> {
  const root = await projectService.resolveOriginalPath(projectSlug);
  return path.resolve(root);
}
