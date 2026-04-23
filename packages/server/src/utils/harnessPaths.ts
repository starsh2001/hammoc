/**
 * Story 28.0.5: Harness workbench path resolver.
 *
 * Resolves `~/.claude` (user scope) and `<projectRoot>/.claude` (project scope)
 * into absolute paths and enforces that any relative path requested by the
 * caller stays inside the resolved root. Every entry point into `harnessService`
 * MUST route through `resolveHarnessPath` so that Windows/POSIX separator
 * mixing, drive letters, UNC paths, and null-byte inputs cannot escape the
 * subtree.
 */

import os from 'os';
import path from 'path';
import { projectService } from '../services/projectService.js';
import { HARNESS_ERRORS, type HarnessPathRef } from '@hammoc/shared';

/**
 * Test-only dependency-injection hook. When set, `getUserHarnessRoot()` returns
 * this value instead of `~/.claude`. Production configurations leave it unset
 * (no effect); unit tests in `harnessPaths.test.ts` / `harnessService.test.ts`
 * redirect the user scope to a temp directory so they never touch the real
 * home directory.
 */
const HOME_OVERRIDE_ENV = 'HAMMOC_HARNESS_HOME_OVERRIDE';

/** Return the absolute path to the user-scope harness root (`~/.claude`). */
export function getUserHarnessRoot(): string {
  const override = process.env[HOME_OVERRIDE_ENV];
  if (override && override.length > 0) {
    return override;
  }
  // Node resolves %USERPROFILE% on Windows and $HOME on POSIX.
  return path.join(os.homedir(), '.claude');
}

/** Return the absolute path to the project-scope harness root (`<project>/.claude`). */
export async function getProjectHarnessRoot(projectSlug: string): Promise<string> {
  if (!projectSlug) {
    const err = new Error('projectSlug is required for project scope') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_ROOT_MISSING.code;
    throw err;
  }
  try {
    const projectRoot = await projectService.resolveOriginalPath(projectSlug);
    return path.join(projectRoot, '.claude');
  } catch (error) {
    // Any failure to resolve the project (unknown slug, missing index, etc.)
    // maps to HARNESS_ROOT_MISSING so the controller can return a uniform 404.
    const wrapped = new Error(
      `Unable to resolve harness root for project "${projectSlug}": ${(error as Error).message}`,
    ) as NodeJS.ErrnoException;
    wrapped.code = HARNESS_ERRORS.HARNESS_ROOT_MISSING.code;
    throw wrapped;
  }
}

export interface ResolvedHarnessPath {
  resolvedRoot: string;
  absolutePath: string;
}

/**
 * Resolve a `HarnessPathRef` to an absolute path, guaranteed to sit inside the
 * resolved root. Throws `HARNESS_PATH_DENIED` for any traversal attempt.
 */
export async function resolveHarnessPath(ref: HarnessPathRef): Promise<ResolvedHarnessPath> {
  const rel = ref.relativePath ?? '';

  // Reject absolute paths and null bytes before touching `path.join`, since
  // join would otherwise discard the root prefix (POSIX absolute) or let a
  // null byte slip through to fs APIs.
  if (rel.includes('\0')) {
    const err = new Error('null byte in relative path') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_PATH_DENIED.code;
    throw err;
  }
  if (path.isAbsolute(rel)) {
    const err = new Error('absolute path not allowed') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_PATH_DENIED.code;
    throw err;
  }
  // UNC inputs (`\\server\share`) on Windows: path.isAbsolute flags some of
  // these, but on POSIX it would not — reject the prefix defensively.
  if (rel.startsWith('\\\\') || rel.startsWith('//')) {
    const err = new Error('UNC path not allowed') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_PATH_DENIED.code;
    throw err;
  }

  const resolvedRoot = ref.scope === 'user'
    ? path.resolve(getUserHarnessRoot())
    : path.resolve(await getProjectHarnessRoot(ref.projectSlug ?? ''));

  const absolutePath = path.resolve(resolvedRoot, rel);

  // Containment check: absolutePath must be the root itself or sit beneath it.
  // `startsWith(root + sep)` avoids the false match where root="/a" and
  // absolutePath="/abc".
  if (absolutePath !== resolvedRoot && !absolutePath.startsWith(resolvedRoot + path.sep)) {
    const err = new Error('path escapes harness root') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_PATH_DENIED.code;
    throw err;
  }

  return { resolvedRoot, absolutePath };
}
