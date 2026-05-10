/**
 * Story 30.1 (Task 6.2): server-side guard that escalates a secret detection
 * to a hard `HARNESS_SECRET_ON_SHARED` block when the target file is tracked
 * by git (`shared` verdict from `harnessShareScopeService`).
 *
 * Sub-spike 6.2.0 decision: option (b) — distributed at the four domain
 * services (agent / command / hook / mcp). Rationale:
 *   - `harnessService.write` IS a single common call site, so option (a)
 *     would also work for the raw write path. But AC4.d carves out
 *     domain-specific scopes (settings.json values, hook command/prompt
 *     fields, agent frontmatter) that the single point cannot meaningfully
 *     filter without re-parsing the file. Distributing the helper keeps each
 *     domain's existing per-field detection in place and just adds the
 *     "shared → block" escalation on top.
 *
 * The helper performs the cheap path-classification round trip
 * (`harnessShareScopeService.evaluate` is a single `.gitignore` load + one
 * `isIgnored()` call). User-scope writes are no-ops (no `.gitignore`
 * involved).
 */

import { HARNESS_ERRORS, type HarnessScope } from '@hammoc/shared';
import { harnessShareScopeService } from '../services/harnessShareScopeService.js';

export interface AssertNoSecretOnSharedInput {
  scope: HarnessScope;
  projectSlug?: string;
  /** Project-relative POSIX path of the file being written (e.g. `.claude/agents/dev.md`). */
  relativePath: string;
  /**
   * Pre-computed detection result from the calling service. The helper does
   * not re-run secret detection because each service knows which fields are
   * in-scope per AC4.d.
   */
  secretDetected: boolean;
  /** Optional secret locations (line numbers / dot-paths) to surface in the error. */
  detectedAt?: { lines?: number[]; paths?: string[] };
}

export async function assertNoSecretOnShared(
  input: AssertNoSecretOnSharedInput,
): Promise<void> {
  if (!input.secretDetected) return;
  // User scope (`~/.claude`) is not git-tracked — `.gitignore` does not apply.
  if (input.scope !== 'project' || !input.projectSlug) return;

  const result = await harnessShareScopeService.evaluate({
    projectSlug: input.projectSlug,
    relativePaths: [input.relativePath],
  });
  const verdict = result.cards[input.relativePath];

  // Only `shared` triggers the hard block. `local` / `fullyIgnored` keep
  // the existing per-service acknowledgement flow.
  if (verdict !== 'shared') return;

  const err = new Error('plaintext secret detected on a git-tracked file') as NodeJS.ErrnoException
    & { lines?: number[]; paths?: string[]; relativePath?: string };
  err.code = HARNESS_ERRORS.HARNESS_SECRET_ON_SHARED.code;
  err.relativePath = input.relativePath;
  if (input.detectedAt?.lines) err.lines = input.detectedAt.lines;
  if (input.detectedAt?.paths) err.paths = input.detectedAt.paths;
  throw err;
}
