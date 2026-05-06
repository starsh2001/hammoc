/**
 * Story 29.2: Snippet path resolver.
 *
 * The snippet system has three scopes that map to different on-disk roots:
 *
 *   - project   → `<projectRoot>/.hammoc/snippets/`
 *   - user      → `~/.hammoc/snippets/`
 *   - bundled   → server-bundled snippets (read-only, located alongside the
 *                 server build at `<serverDist>/snippets/`)
 *
 * `resolveSnippetPath` is the only path-shaping entry point used by
 * `snippetService` — it accepts `{ scope, projectSlug?, name }` and never lets
 * a caller-supplied relative path through. NAME_RE rejects anything outside
 * `[A-Za-z0-9._-]+` so directory traversal (`..`, `/`, `\`, `\0`, drive
 * letters, UNC prefixes) is impossible by construction.
 *
 * On-disk filename normalization: writes always land at `<root>/<name>.md`
 * regardless of input form. Reads accept both `<name>.md` and the legacy
 * extension-less `<name>` (snippetResolver supports both for back-compat) so
 * existing bundled and user files continue to load.
 */

import os from 'os';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { projectService } from '../services/projectService.js';

/** Hammoc home root override for tests. Mirrors `HAMMOC_HARNESS_HOME_OVERRIDE`. */
const HOME_OVERRIDE_ENV = 'HAMMOC_HOME_OVERRIDE';

/** Bundled snippet directory override for tests (e.g. point at a tmp dir). */
const BUNDLED_OVERRIDE_ENV = 'HAMMOC_BUNDLED_SNIPPETS_DIR';

/** Snippet name regex — same shape as snippetResolver's NAME_RE. */
export const SNIPPET_NAME_RE = /^[a-zA-Z0-9._-]+$/;

const SNIPPETS_SUBDIR = '.hammoc/snippets';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BUNDLED_DIR = path.resolve(__dirname, '..', 'snippets');

/** Return the absolute path of `~/.hammoc/snippets/`. */
export function getUserSnippetsDir(): string {
  const override = process.env[HOME_OVERRIDE_ENV];
  if (override && override.length > 0) {
    return path.join(override, '.hammoc', 'snippets');
  }
  return path.join(os.homedir(), '.hammoc', 'snippets');
}

/** Return the absolute path of the server-bundled snippets directory. */
export function getBundledSnippetsDir(): string {
  const override = process.env[BUNDLED_OVERRIDE_ENV];
  if (override && override.length > 0) {
    return override;
  }
  return DEFAULT_BUNDLED_DIR;
}

/** Return the absolute path of `<projectRoot>/.hammoc/snippets/`. */
export async function getProjectSnippetsDir(projectSlug: string): Promise<string> {
  if (!projectSlug) {
    throw makePathDeniedError('projectSlug is required for project scope');
  }
  if (
    projectSlug.includes('\0') ||
    projectSlug.includes('..') ||
    projectSlug.includes('/') ||
    projectSlug.includes('\\')
  ) {
    throw makePathDeniedError('projectSlug must not contain path separators');
  }
  const projectRoot = await projectService.resolveOriginalPath(projectSlug);
  return path.join(projectRoot, SNIPPETS_SUBDIR);
}

export interface ResolvedSnippetPath {
  /** Root directory (the snippets dir itself, not the project root). */
  resolvedRoot: string;
  /** `<resolvedRoot>/<name>.md`. */
  absolutePath: string;
  /** Same path but without `.md` — legacy format used for back-compat reads. */
  legacyAbsolutePath: string;
  /** True when this path is read-only (bundled). */
  readOnly: boolean;
}

export type SnippetScope = 'project' | 'user' | 'bundled';

export interface SnippetPathRef {
  scope: SnippetScope;
  /** Required when scope === 'project'. */
  projectSlug?: string;
  name: string;
}

/**
 * Resolve a snippet path with NAME_RE validation and bundled read-only flagging.
 * Throws an Error with `code: 'HARNESS_PATH_DENIED'` for invalid names.
 */
export async function resolveSnippetPath(ref: SnippetPathRef): Promise<ResolvedSnippetPath> {
  validateSnippetName(ref.name);

  let resolvedRoot: string;
  let readOnly = false;
  if (ref.scope === 'project') {
    if (!ref.projectSlug) {
      throw makePathDeniedError('projectSlug is required for project scope');
    }
    resolvedRoot = path.resolve(await getProjectSnippetsDir(ref.projectSlug));
  } else if (ref.scope === 'user') {
    resolvedRoot = path.resolve(getUserSnippetsDir());
  } else {
    resolvedRoot = path.resolve(getBundledSnippetsDir());
    readOnly = true;
  }

  // Belt + suspenders: even though NAME_RE forbids separators, double-check
  // the resolved file stays inside the root.
  const absolutePath = path.resolve(resolvedRoot, `${ref.name}.md`);
  if (
    absolutePath !== resolvedRoot &&
    !absolutePath.startsWith(resolvedRoot + path.sep)
  ) {
    throw makePathDeniedError('snippet path escapes root');
  }
  const legacyAbsolutePath = path.resolve(resolvedRoot, ref.name);
  return { resolvedRoot, absolutePath, legacyAbsolutePath, readOnly };
}

/**
 * Throws an HARNESS_PATH_DENIED Error when the name is invalid.
 *
 * Note: SNIPPET_NAME_RE allows `.` so single-dot names (`a.b`) pass through.
 * That also means literal `..` would pass the regex — we reject it
 * separately below, mirroring snippetResolver.resolveSnippet's defensive
 * filter.
 */
export function validateSnippetName(name: string): void {
  if (!name || typeof name !== 'string') {
    throw makePathDeniedError('snippet name is required');
  }
  if (name.includes('\0')) {
    throw makePathDeniedError('null byte in snippet name');
  }
  if (name === '..' || name === '.' || name.includes('/') || name.includes('\\')) {
    throw makePathDeniedError(`path traversal denied: ${name}`);
  }
  if (!SNIPPET_NAME_RE.test(name)) {
    throw makePathDeniedError(`invalid snippet name: ${name}`);
  }
}

function makePathDeniedError(message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = 'HARNESS_PATH_DENIED';
  return err;
}
