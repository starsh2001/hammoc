/**
 * File Watcher Service
 * Watches the filesystem of active projects and broadcasts external-change
 * events to clients subscribed to the project room. Each project is watched
 * under a reference count so multiple subscribers (editor, explorer, chain, etc.)
 * share one chokidar instance and the watcher tears down cleanly when the
 * last client leaves.
 *
 * Self-write suppression: when Hammoc itself writes a file via fileSystemService,
 * chokidar would normally echo that change back to the originating client and
 * cause an "external change" banner on their own save. Callers must invoke
 * noteLocalWrite(absolutePath) immediately after writing — events for paths
 * noted within the last SELF_WRITE_WINDOW_MS are silently dropped.
 *
 * Story 28.0.5: extended with harness-scope watchers over ~/.claude (user) and
 * <project>/.claude (project). Harness watchers emit `harness:external-change`
 * on dedicated rooms and share the same self-write-suppression map so writes
 * coming out of harnessService do not echo back to the originating client.
 */

import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import type { HarnessScope, HarnessExternalChangeEvent } from '@hammoc/shared';
import { getIO } from '../handlers/websocket.js';
import { createLogger } from '../utils/logger.js';
import { getUserHarnessRoot, getProjectHarnessRoot } from '../utils/harnessPaths.js';

const log = createLogger('fileWatcher');

interface ProjectWatcher {
  watcher: FSWatcher;
  refCount: number;
  projectRoot: string;
}

interface HarnessWatcher {
  watcher: FSWatcher;
  refCount: number;
  resolvedRoot: string;
  scope: HarnessScope;
  projectSlug?: string;
}

interface HarnessRef {
  scope: HarnessScope;
  projectSlug?: string;
}

/** Directories where we never recurse — mirrors fileSystemService.SKIP_DIRS. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.cache', '__pycache__', 'dist', '.turbo',
]);

function harnessKey(ref: HarnessRef): string {
  return ref.scope === 'user'
    ? 'harness:user'
    : `harness:project:${ref.projectSlug ?? ''}`;
}

function harnessRoom(ref: HarnessRef): string {
  return harnessKey(ref);
}

class FileWatcherService {
  private watchers = new Map<string, ProjectWatcher>();
  private harnessWatchers = new Map<string, HarnessWatcher>();
  /** absolute path → timestamp (ms) of the last local write */
  private pendingLocalWrites = new Map<string, number>();

  /** Events arriving within this window after a local write are treated as our own echo. */
  private static readonly SELF_WRITE_WINDOW_MS = 1500;

  /**
   * Start (or increment the ref count of) a watcher for the given project.
   * No-op if projectRoot is falsy.
   */
  ensureWatcher(projectSlug: string, projectRoot: string): void {
    if (!projectSlug || !projectRoot) return;

    const existing = this.watchers.get(projectSlug);
    if (existing) {
      existing.refCount++;
      return;
    }

    const watcher = chokidar.watch(projectRoot, {
      ignoreInitial: true,
      ignored: (target: string): boolean => {
        const rel = path.relative(projectRoot, target).replace(/\\/g, '/');
        if (!rel || rel === '.') return false;
        const segments = rel.split('/');
        for (const seg of segments) {
          if (SKIP_DIRS.has(seg)) return true;
        }
        return false;
      },
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
      persistent: true,
      // Do not follow symlinks — keeps watcher bounded even if a project
      // contains a symlink loop.
      followSymlinks: false,
    });

    const emit = (type: 'modified' | 'deleted') =>
      (absolutePath: string, stats?: { mtime?: Date }) => {
        try {
          const noteTs = this.pendingLocalWrites.get(absolutePath);
          if (noteTs !== undefined && Date.now() - noteTs < FileWatcherService.SELF_WRITE_WINDOW_MS) {
            this.pendingLocalWrites.delete(absolutePath);
            return;
          }

          const rel = path.relative(projectRoot, absolutePath).replace(/\\/g, '/');
          // Skip root-dir notifications (rel === '.' or '') and any path that
          // somehow resolves outside the project root. Directory mtime bumps
          // produce these and are noise for the editor's file-level listener.
          if (!rel || rel === '.' || rel.startsWith('..')) return;

          const payload = {
            projectSlug,
            path: rel,
            type,
            mtime: stats?.mtime ? stats.mtime.toISOString() : undefined,
          };

          try {
            getIO().to(`project:${projectSlug}`).emit('file:external-change', payload);
          } catch {
            // Socket.io not initialized yet — drop the event silently.
          }
        } catch (err) {
          log.warn(`failed to emit file:external-change for ${projectSlug}: ${String(err)}`);
        }
      };

    watcher.on('change', emit('modified'));
    watcher.on('unlink', emit('deleted'));
    watcher.on('error', (err) => {
      log.warn(`chokidar watcher error (${projectSlug}): ${String(err)}`);
    });

    this.watchers.set(projectSlug, { watcher, refCount: 1, projectRoot });
    log.info(`started file watcher for project "${projectSlug}" at ${projectRoot}`);
  }

  /** Decrement the ref count and close the watcher when it reaches zero. */
  releaseWatcher(projectSlug: string): void {
    if (!projectSlug) return;
    const existing = this.watchers.get(projectSlug);
    if (!existing) return;
    existing.refCount--;
    if (existing.refCount <= 0) {
      existing.watcher.close().catch(() => { /* best-effort */ });
      this.watchers.delete(projectSlug);
      log.info(`stopped file watcher for project "${projectSlug}"`);
    }
  }

  /**
   * Start (or increment the ref count of) a harness watcher for the given scope.
   * - `scope='user'`     → ~/.claude (via `getUserHarnessRoot()`)
   * - `scope='project'`  → <project>/.claude (via `getProjectHarnessRoot()`)
   *
   * Idempotent + reference-counted so concurrent subscribers share one chokidar.
   * Unlike the project watcher, harness watchers subscribe to `add` in addition
   * to `change`/`unlink` so they can fire the `'created'` type required by
   * HarnessExternalChangeEvent.
   */
  async ensureHarnessWatcher(ref: HarnessRef): Promise<void> {
    const key = harnessKey(ref);
    const existing = this.harnessWatchers.get(key);
    if (existing) {
      existing.refCount++;
      return;
    }

    let resolvedRoot: string;
    try {
      resolvedRoot = ref.scope === 'user'
        ? getUserHarnessRoot()
        : await getProjectHarnessRoot(ref.projectSlug ?? '');
    } catch (err) {
      log.warn(`failed to resolve harness root for ${key}: ${String(err)}`);
      return;
    }

    // Story 28.3: project scope must also surface external edits to
    // `<projectRoot>/.mcp.json`. The file is the SIBLING of `.claude/`, so
    // the standard root-only watcher cannot pick it up. We add it as a second
    // path in the same chokidar instance and emit `path: '.mcp.json'`
    // (hard-coded relative form) when the event lands on that file.
    //
    // Story 29.1 (AC2.b): same pattern is used to watch `<projectRoot>/CLAUDE.md`,
    // a second sibling of `.claude/`. Its emitted path is normalized to
    // `'../CLAUDE.md'` so it cannot collide with `<projectRoot>/.claude/CLAUDE.md`
    // (which would also normalize to `'CLAUDE.md'`). Using the `..` prefix —
    // a string that path-resolver would otherwise reject as traversal — guarantees
    // a unique discriminator since no path going through the standard harness
    // API can ever match it. Client matching rule (AC2.b) is `path === '../CLAUDE.md'`.
    const projectMcpFilePath = ref.scope === 'project'
      ? path.join(path.dirname(resolvedRoot), '.mcp.json')
      : null;
    const projectClaudeMdPath = ref.scope === 'project'
      ? path.join(path.dirname(resolvedRoot), 'CLAUDE.md')
      : null;
    const watchTargets: string | string[] = ref.scope === 'project'
      ? [resolvedRoot, projectMcpFilePath as string, projectClaudeMdPath as string]
      : resolvedRoot;

    const watcher = chokidar.watch(watchTargets, {
      ignoreInitial: true,
      ignored: (target: string): boolean => {
        // Always allow the sibling files (`.mcp.json`, `CLAUDE.md`) —
        // chokidar would otherwise drop them because they sit outside
        // `resolvedRoot`.
        if (projectMcpFilePath && path.resolve(target) === path.resolve(projectMcpFilePath)) {
          return false;
        }
        if (projectClaudeMdPath && path.resolve(target) === path.resolve(projectClaudeMdPath)) {
          return false;
        }
        const rel = path.relative(resolvedRoot, target).replace(/\\/g, '/');
        if (!rel || rel === '.') return false;
        const segments = rel.split('/');
        for (const seg of segments) {
          if (SKIP_DIRS.has(seg)) return true;
        }
        return false;
      },
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
      persistent: true,
      followSymlinks: false,
    });

    const emit = (type: HarnessExternalChangeEvent['type']) =>
      (absolutePath: string, stats?: { mtime?: Date }) => {
        try {
          const noteTs = this.pendingLocalWrites.get(absolutePath);
          if (noteTs !== undefined && Date.now() - noteTs < FileWatcherService.SELF_WRITE_WINDOW_MS) {
            this.pendingLocalWrites.delete(absolutePath);
            return;
          }

          let rel: string;
          if (projectMcpFilePath
            && path.resolve(absolutePath) === path.resolve(projectMcpFilePath)) {
            rel = '.mcp.json';
          } else if (projectClaudeMdPath
            && path.resolve(absolutePath) === path.resolve(projectClaudeMdPath)) {
            // Story 29.1 (AC2.b): `<projectRoot>/CLAUDE.md` emits as
            // `'../CLAUDE.md'` to namespace-separate it from a hypothetical
            // `<projectRoot>/.claude/CLAUDE.md` that would otherwise share
            // the relative path `'CLAUDE.md'`.
            rel = '../CLAUDE.md';
          } else {
            rel = path.relative(resolvedRoot, absolutePath).replace(/\\/g, '/');
            if (!rel || rel === '.' || rel.startsWith('..')) return;
          }

          const payload: HarnessExternalChangeEvent = {
            scope: ref.scope,
            projectSlug: ref.projectSlug,
            path: rel,
            type,
            mtime: type !== 'deleted' && stats?.mtime ? stats.mtime.toISOString() : undefined,
          };

          try {
            getIO().to(harnessRoom(ref)).emit('harness:external-change', payload);
          } catch {
            // Socket.io not initialized yet — drop silently.
          }
        } catch (err) {
          log.warn(`failed to emit harness:external-change for ${key}: ${String(err)}`);
        }
      };

    watcher.on('add', emit('created'));
    watcher.on('change', emit('modified'));
    watcher.on('unlink', emit('deleted'));
    watcher.on('error', (err) => {
      log.warn(`chokidar harness watcher error (${key}): ${String(err)}`);
    });

    this.harnessWatchers.set(key, {
      watcher,
      refCount: 1,
      resolvedRoot,
      scope: ref.scope,
      projectSlug: ref.projectSlug,
    });
    log.info(`started harness watcher for ${key} at ${resolvedRoot}`);
  }

  /** Decrement the harness watcher ref count, closing when it reaches zero. */
  releaseHarnessWatcher(ref: HarnessRef): void {
    const key = harnessKey(ref);
    const existing = this.harnessWatchers.get(key);
    if (!existing) return;
    existing.refCount--;
    if (existing.refCount <= 0) {
      existing.watcher.close().catch(() => { /* best-effort */ });
      this.harnessWatchers.delete(key);
      log.info(`stopped harness watcher for ${key}`);
    }
  }

  /** Mark an absolute path as just-written so the next watcher event is ignored. */
  noteLocalWrite(absolutePath: string): void {
    this.pendingLocalWrites.set(absolutePath, Date.now());
    // Opportunistic pruning — keep the map bounded without a timer.
    if (this.pendingLocalWrites.size > 64) {
      const now = Date.now();
      for (const [p, ts] of this.pendingLocalWrites.entries()) {
        if (now - ts > FileWatcherService.SELF_WRITE_WINDOW_MS * 2) {
          this.pendingLocalWrites.delete(p);
        }
      }
    }
  }

  /** Close every active watcher. Called on server shutdown. */
  async shutdown(): Promise<void> {
    const closers = [
      ...Array.from(this.watchers.values()).map(({ watcher }) =>
        watcher.close().catch(() => { /* best-effort */ })
      ),
      ...Array.from(this.harnessWatchers.values()).map(({ watcher }) =>
        watcher.close().catch(() => { /* best-effort */ })
      ),
    ];
    this.watchers.clear();
    this.harnessWatchers.clear();
    this.pendingLocalWrites.clear();
    await Promise.all(closers);
  }
}

export const fileWatcherService = new FileWatcherService();
