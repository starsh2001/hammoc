/**
 * Story 30.2 (Task 1.5): server-side PATH resolver for the
 * `mcp/command-not-on-path` lint rule.
 *
 * Mirrors the `which`/`where` + 5s timeout pattern used by
 * serverController.ts:14-31 for npm path resolution. Absolute paths skip the
 * shell call entirely and fall through to a simple `fs.existsSync` check —
 * faster and avoids spurious `which: not found` lines on stderr for inputs
 * that obviously don't need PATH resolution.
 *
 * The result is intentionally shaped as `{ resolved: string | null }` (not a
 * boolean) so the caller can surface the resolved absolute path in tooltips
 * without re-running the lookup.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface ResolveCommandResult {
  resolved: string | null;
}

const RESOLVE_TIMEOUT_MS = 5000;

/**
 * Resolve `cmd` against the current process PATH.
 *
 * - Absolute path → `fs.existsSync` only (no shell).
 * - Relative path containing a separator → resolved relative to `cwd`
 *   (uncommon for MCP `command` fields but covered for completeness).
 * - Bare name → `where.exe` on Windows / `which` elsewhere.
 *
 * Never throws — failures collapse to `{ resolved: null }`.
 */
export function resolveCommandOnServerPath(cmd: string): ResolveCommandResult {
  if (!cmd || typeof cmd !== 'string') return { resolved: null };

  const trimmed = cmd.trim();
  if (!trimmed) return { resolved: null };

  if (path.isAbsolute(trimmed)) {
    return { resolved: fs.existsSync(trimmed) ? trimmed : null };
  }

  // Path with a separator (e.g. "./bin/foo" or "scripts/run.sh") — resolve
  // against cwd. Server PATH is irrelevant in this case.
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    const abs = path.resolve(process.cwd(), trimmed);
    return { resolved: fs.existsSync(abs) ? abs : null };
  }

  const finder = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    const stdout = execFileSync(finder, [trimmed], {
      encoding: 'utf-8',
      timeout: RESOLVE_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const first = stdout.trim().split(/\r?\n/)[0]?.trim();
    return { resolved: first ? first : null };
  } catch {
    // Non-zero exit (not found) or timeout — both surface as "unresolved".
    return { resolved: null };
  }
}
