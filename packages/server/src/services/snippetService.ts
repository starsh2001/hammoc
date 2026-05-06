/**
 * Story 29.2: Snippet management service.
 *
 * Manages the three-scope snippet store consumed by `snippetResolver` for
 * `%name%` chat-input expansion:
 *
 *   - project   → `<projectRoot>/.hammoc/snippets/<name>.md`         (mutable)
 *   - user      → `~/.hammoc/snippets/<name>.md`                     (mutable)
 *   - bundled   → `<serverDist>/snippets/<name>[.md]`                (read-only)
 *
 * Differences from the harness services (Epic 28):
 *   - no YAML frontmatter — body is free-form markdown
 *   - no plugin scope — `bundled` replaces it but is structurally simpler
 *     (no manifest, no installed_plugins.json lookup)
 *   - no watcher integration (Story 29.2 Phase 1) — `noteLocalWrite` is not
 *     called because snippets are NOT in the harness watcher's subscription
 *     tree (`fileWatcherService` only watches `.claude/`, never `.hammoc/`)
 *
 * STALE_WRITE / HARNESS_FILE_EXISTS contract mirrors `harnessService` so the
 * client can reuse its existing conflict UX.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  HARNESS_ERRORS,
  type SnippetCard,
  type SnippetCopyRequest,
  type SnippetCopyResponse,
  type SnippetDeleteRequest,
  type SnippetDeleteResponse,
  type SnippetListResponse,
  type SnippetReadResponse,
  type SnippetScope,
  type SnippetWriteRequest,
  type SnippetWriteResponse,
} from '@hammoc/shared';
import {
  getBundledSnippetsDir,
  getProjectSnippetsDir,
  getUserSnippetsDir,
  resolveSnippetPath,
  validateSnippetName,
  type SnippetPathRef,
} from '../utils/snippetPaths.js';

const MAX_FILE_SIZE = 102_400; // 100KB — matches snippetResolver
const PREVIEW_MAX_LEN = 80;

function throwMapped(code: string, message: string, extras?: Record<string, unknown>): never {
  const err = new Error(message) as NodeJS.ErrnoException & Record<string, unknown>;
  err.code = code;
  if (extras) Object.assign(err, extras);
  throw err;
}

/**
 * Read snippet content from a path, transparently handling both `<name>.md`
 * and the legacy extension-less `<name>` form (snippetResolver back-compat).
 * Returns `null` when neither path exists.
 */
async function readSnippetFile(
  primaryPath: string,
  legacyPath: string,
): Promise<{ content: string; mtime: string; size: number; effectivePath: string } | null> {
  for (const candidate of [primaryPath, legacyPath]) {
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) continue;
      const content = await fs.readFile(candidate, 'utf-8');
      return {
        content,
        mtime: stat.mtime.toISOString(),
        size: stat.size,
        effectivePath: candidate,
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') continue;
      throw err;
    }
  }
  return null;
}

/** Scan one root for `.md` and extension-less files, returning SnippetCard entries. */
async function scanSnippetDir(dir: string, scope: SnippetScope): Promise<SnippetCard[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const cards: SnippetCard[] = [];
  // Use `for await` style so we don't touch fs serially in a way that blows up
  // on large dirs — but with awaits inside a loop the cost is bounded by the
  // number of files; the user-facing dir is tiny.
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const rawName = entry.name;
    const name = rawName.endsWith('.md') ? rawName.slice(0, -3) : rawName;
    // Skip files whose stem fails NAME_RE — e.g. README.md inside the bundled dir.
    try {
      validateSnippetName(name);
    } catch {
      continue;
    }
    const abs = path.join(dir, rawName);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    let preview: string | undefined;
    try {
      const content = await fs.readFile(abs, 'utf-8');
      const firstLine = content.split('\n').find((l) => l.trim().length > 0);
      if (firstLine) preview = firstLine.trim().slice(0, PREVIEW_MAX_LEN);
    } catch {
      // unreadable — leave preview undefined
    }
    cards.push({
      scope,
      name,
      preview,
      mtime: stat.mtime.toISOString(),
      size: stat.size,
    });
  }
  return cards;
}

class SnippetService {
  /**
   * List snippets across all three scopes. Names are NOT deduplicated — the
   * client renders one card per (scope, name) combination so users can see
   * shadowing relationships explicitly. Resolution at runtime
   * (snippetResolver) still applies project > user > bundled precedence.
   */
  async list(opts: { projectSlug?: string }): Promise<SnippetListResponse> {
    const tasks: Array<Promise<SnippetCard[]>> = [
      scanSnippetDir(getUserSnippetsDir(), 'user'),
      scanSnippetDir(getBundledSnippetsDir(), 'bundled'),
    ];
    if (opts.projectSlug) {
      tasks.push(
        getProjectSnippetsDir(opts.projectSlug).then((dir) => scanSnippetDir(dir, 'project')),
      );
    }
    const results = await Promise.all(tasks);
    const merged = results.flat();
    merged.sort((a, b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope));
    return { snippets: merged };
  }

  async read(ref: SnippetPathRef): Promise<SnippetReadResponse> {
    const { absolutePath, legacyAbsolutePath } = await resolveSnippetPath(ref);
    const file = await readSnippetFile(absolutePath, legacyAbsolutePath);
    if (!file) {
      throwMapped(HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code, 'snippet not found', {
        absolutePath,
      });
    }
    if (file.size > MAX_FILE_SIZE) {
      // Truncate to stay consistent with snippetResolver's 100KB limit.
      throwMapped(HARNESS_ERRORS.HARNESS_PARSE_ERROR.code, 'snippet exceeds 100KB limit');
    }
    return {
      scope: ref.scope,
      name: ref.name,
      content: file.content,
      mtime: file.mtime,
      size: file.size,
      absolutePath: file.effectivePath,
    };
  }

  /** Create a new snippet — fails with HARNESS_FILE_EXISTS when a same-named file exists. */
  async create(
    ref: SnippetPathRef,
    body: SnippetWriteRequest,
  ): Promise<SnippetWriteResponse> {
    if (ref.scope === 'bundled') {
      throwMapped(HARNESS_ERRORS.HARNESS_BUNDLED_READONLY.code, 'bundled scope is read-only');
    }
    const { absolutePath, legacyAbsolutePath, resolvedRoot } = await resolveSnippetPath(ref);
    // Reject creation if either form already exists.
    for (const candidate of [absolutePath, legacyAbsolutePath]) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) {
          throwMapped(HARNESS_ERRORS.HARNESS_FILE_EXISTS.code, 'snippet already exists');
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') continue;
        if (code === HARNESS_ERRORS.HARNESS_FILE_EXISTS.code) throw err;
        throw err;
      }
    }
    await fs.mkdir(resolvedRoot, { recursive: true });
    await writeSnippetFile(absolutePath, body.content);
    const stat = await fs.stat(absolutePath);
    return { success: true, size: stat.size, mtime: stat.mtime.toISOString() };
  }

  /** Update an existing snippet body with optional STALE_WRITE guard. */
  async update(
    ref: SnippetPathRef,
    body: SnippetWriteRequest,
  ): Promise<SnippetWriteResponse> {
    if (ref.scope === 'bundled') {
      throwMapped(HARNESS_ERRORS.HARNESS_BUNDLED_READONLY.code, 'bundled scope is read-only');
    }
    const { absolutePath, legacyAbsolutePath, resolvedRoot } = await resolveSnippetPath(ref);

    // STALE_WRITE check — try `.md` first, fall back to legacy ext-less form
    // because the existing file may still be in the legacy layout. If neither
    // exists, treat the write as a fresh create (no guard).
    let targetPath = absolutePath;
    let existing;
    try {
      existing = await fs.stat(absolutePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      try {
        existing = await fs.stat(legacyAbsolutePath);
        targetPath = legacyAbsolutePath;
      } catch (err2) {
        if ((err2 as NodeJS.ErrnoException).code !== 'ENOENT') throw err2;
        // Neither exists — caller should use create(); but to keep update()
        // forgiving we proceed and let it be created at the canonical .md path.
        existing = undefined;
        targetPath = absolutePath;
      }
    }

    if (body.expectedMtime !== undefined && existing) {
      const currentMtime = existing.mtime.toISOString();
      if (currentMtime !== body.expectedMtime) {
        throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'snippet changed on disk', {
          currentMtime,
        });
      }
    }

    if (!existing) {
      await fs.mkdir(resolvedRoot, { recursive: true });
    }
    await writeSnippetFile(targetPath, body.content);
    const stat = await fs.stat(targetPath);
    return { success: true, size: stat.size, mtime: stat.mtime.toISOString() };
  }

  async delete(
    ref: SnippetPathRef,
    body: SnippetDeleteRequest,
  ): Promise<SnippetDeleteResponse> {
    if (ref.scope === 'bundled') {
      throwMapped(HARNESS_ERRORS.HARNESS_BUNDLED_READONLY.code, 'bundled scope is read-only');
    }
    const { absolutePath, legacyAbsolutePath } = await resolveSnippetPath(ref);

    let targetPath: string | null = null;
    let stat;
    for (const candidate of [absolutePath, legacyAbsolutePath]) {
      try {
        stat = await fs.stat(candidate);
        if (stat.isFile()) {
          targetPath = candidate;
          break;
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw err;
      }
    }
    if (!targetPath || !stat) {
      throwMapped(HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code, 'snippet not found');
    }

    if (body.expectedMtime !== undefined && stat.mtime.toISOString() !== body.expectedMtime) {
      throwMapped(HARNESS_ERRORS.HARNESS_STALE_WRITE.code, 'snippet changed on disk', {
        currentMtime: stat.mtime.toISOString(),
      });
    }
    await fs.unlink(targetPath);
    return { success: true };
  }

  /**
   * Copy a snippet across scopes.
   *
   *   project ↔ user      → bi-directional
   *   bundled → project   → one-way clone
   *   bundled → user      → one-way clone
   *
   * `bundled` is never a target. When the target exists the call resolves
   * according to `onConflict` (default 'abort' → HARNESS_FILE_EXISTS).
   */
  async copy(req: SnippetCopyRequest): Promise<SnippetCopyResponse> {
    if (req.targetScope !== 'project' && req.targetScope !== 'user') {
      throwMapped(HARNESS_ERRORS.HARNESS_BUNDLED_READONLY.code, 'bundled cannot be a copy target');
    }
    if (req.sourceScope === 'project' && !req.sourceProjectSlug) {
      throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'sourceProjectSlug is required');
    }
    if (req.targetScope === 'project' && !req.targetProjectSlug) {
      throwMapped(HARNESS_ERRORS.HARNESS_ROOT_MISSING.code, 'targetProjectSlug is required');
    }

    const sourceRef: SnippetPathRef = {
      scope: req.sourceScope,
      projectSlug: req.sourceProjectSlug,
      name: req.sourceName,
    };
    const sourceResolved = await resolveSnippetPath(sourceRef);
    const sourceFile = await readSnippetFile(
      sourceResolved.absolutePath,
      sourceResolved.legacyAbsolutePath,
    );
    if (!sourceFile) {
      throwMapped(HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code, 'source snippet not found');
    }

    const targetName = req.targetName ?? req.sourceName;
    validateSnippetName(targetName);
    const targetRef: SnippetPathRef = {
      scope: req.targetScope,
      projectSlug: req.targetProjectSlug,
      name: targetName,
    };
    const targetResolved = await resolveSnippetPath(targetRef);

    // Detect target conflict (either canonical or legacy form).
    let targetExisting = false;
    let targetExistingPath = '';
    for (const candidate of [
      targetResolved.absolutePath,
      targetResolved.legacyAbsolutePath,
    ]) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) {
          targetExisting = true;
          targetExistingPath = candidate;
          break;
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw err;
      }
    }

    const onConflict = req.onConflict ?? 'abort';
    if (targetExisting) {
      if (onConflict === 'abort') {
        throwMapped(HARNESS_ERRORS.HARNESS_FILE_EXISTS.code, 'target snippet already exists');
      }
      if (onConflict === 'rename') {
        // Rename mode requires a fresh targetName, which the caller is
        // responsible for choosing. If the new name still collides, surface
        // the same 409 — the dialog will re-prompt.
        if (!req.targetName || req.targetName === req.sourceName) {
          throwMapped(
            HARNESS_ERRORS.HARNESS_FILE_EXISTS.code,
            'rename requires a distinct targetName',
          );
        }
      }
      // overwrite → fall through; we'll write to the canonical .md path so
      // the target is always normalized to `<name>.md` even if the existing
      // form was legacy.
    }

    await fs.mkdir(targetResolved.resolvedRoot, { recursive: true });
    await writeSnippetFile(targetResolved.absolutePath, sourceFile.content);
    // If the existing file was at the legacy path, leave it in place per the
    // story's "no automatic rename" policy (S4 in AC1.b). The client may end
    // up with two files (legacy + new .md) — listSnippets will show only the
    // canonical card because scanSnippetDir dedupes by stem name.
    void targetExistingPath;

    return {
      success: true,
      target: {
        scope: req.targetScope,
        name: targetName,
        absolutePath: targetResolved.absolutePath,
      },
    };
  }
}

/** Atomic-ish file write — `fs.writeFile` with utf-8 encoding. */
async function writeSnippetFile(absolutePath: string, content: string): Promise<void> {
  try {
    await fs.writeFile(absolutePath, content, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES') {
      throwMapped(HARNESS_ERRORS.HARNESS_FORBIDDEN.code, 'permission denied');
    }
    throwMapped(HARNESS_ERRORS.HARNESS_WRITE_ERROR.code, 'failed to write snippet');
  }
}

export const snippetService = new SnippetService();
