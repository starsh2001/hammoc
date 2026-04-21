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
 */

import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import { getIO } from '../handlers/websocket.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('fileWatcher');

interface ProjectWatcher {
  watcher: FSWatcher;
  refCount: number;
  projectRoot: string;
}

/** Directories where we never recurse — mirrors fileSystemService.SKIP_DIRS. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.cache', '__pycache__', 'dist', '.turbo',
]);

class FileWatcherService {
  private watchers = new Map<string, ProjectWatcher>();
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
    const closers = Array.from(this.watchers.values()).map(({ watcher }) =>
      watcher.close().catch(() => { /* best-effort */ })
    );
    this.watchers.clear();
    this.pendingLocalWrites.clear();
    await Promise.all(closers);
  }
}

export const fileWatcherService = new FileWatcherService();
