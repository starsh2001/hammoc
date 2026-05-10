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
import type { Ignore } from 'ignore';
import { HARNESS_ERRORS, type HarnessShareScopeResponse, type ShareScope } from '@hammoc/shared';
import { projectService } from './projectService.js';
import { loadGitignore, isIgnored } from '../utils/gitignoreFilter.js';

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
