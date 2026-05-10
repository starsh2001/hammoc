/**
 * Story 28.0.5 (Task 5): thin wrapper around `ignore` (kaelzhang/node-ignore).
 *
 * Originally introduced as preemptive infrastructure under the placeholder
 * label "Epic 30 Story 10" (the pre-BMad-renumbering forward reference);
 * Story 30.1 fills the call-sites (`harnessShareScopeService` + the
 * client-side `ShareBadge` / `ModeBanner`) by consuming `loadGitignore()` +
 * `isIgnored()` to drive the "shared vs. local vs. fully-ignored" badges on
 * the harness workbench tree.
 */

import fs from 'fs/promises';
import path from 'path';
import ignoreFactory, { type Ignore } from 'ignore';

/**
 * Load `<rootPath>/.gitignore` into an `Ignore` matcher. Missing files yield
 * a matcher that never excludes anything (so callers can treat "no
 * .gitignore" as "nothing is ignored" without a separate branch).
 */
export async function loadGitignore(rootPath: string): Promise<Ignore> {
  const matcher = ignoreFactory();
  const gitignorePath = path.join(rootPath, '.gitignore');
  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    matcher.add(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    // No .gitignore — return an empty matcher.
  }
  return matcher;
}

/**
 * Test a relative path against the matcher. Input paths are normalized to
 * POSIX separators as required by `ignore`'s contract.
 */
export function isIgnored(matcher: Ignore, relativePath: string): boolean {
  const posix = relativePath.replace(/\\/g, '/');
  return matcher.ignores(posix);
}
