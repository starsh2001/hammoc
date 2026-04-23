/**
 * Story 28.0.5 (AC3): harness-scope file watcher tests.
 *
 * Verifies:
 *  - 'add' event surfaces as 'created'
 *  - 'change' event surfaces as 'modified'
 *  - 'unlink' event surfaces as 'deleted'
 *  - self-write suppression via noteLocalWrite()
 *
 * Timing note: chokidar's awaitWriteFinish.stabilityThreshold (200ms) + event
 * loop slack means the wait must be ~500ms; 1s is the test timeout.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import type { HarnessExternalChangeEvent } from '@hammoc/shared';

// Fake Socket.IO surface captured by the watcher when it calls getIO().to(...).emit(...).
const emitted: Array<{ room: string; event: string; payload: HarnessExternalChangeEvent }> = [];

vi.mock('../../handlers/websocket.js', () => ({
  getIO: () => ({
    to: (room: string) => ({
      emit: (event: string, payload: HarnessExternalChangeEvent) => {
        emitted.push({ room, event, payload });
      },
    }),
  }),
}));

// Import after vi.mock so the service picks up the fake getIO.
const { fileWatcherService } = await import('../fileWatcherService.js');

async function waitForEvent(
  predicate: (e: typeof emitted[number]) => boolean,
  timeoutMs = 1500,
): Promise<typeof emitted[number]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const match = emitted.find(predicate);
    if (match) return match;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for event (emitted=${JSON.stringify(emitted)})`);
}

describe('fileWatcherService harness watcher (AC3)', () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-watch-'));
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = tmpHome;
    emitted.length = 0;
  });

  afterEach(async () => {
    fileWatcherService.releaseHarnessWatcher({ scope: 'user' });
    // Small delay so chokidar releases file handles on Windows before rmdir.
    await new Promise((r) => setTimeout(r, 100));
    delete process.env.HAMMOC_HARNESS_HOME_OVERRIDE;
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it('emits created when a new file appears', async () => {
    await fileWatcherService.ensureHarnessWatcher({ scope: 'user' });
    // Give chokidar a moment to finish its initial scan before we write.
    await new Promise((r) => setTimeout(r, 300));

    await fs.writeFile(path.join(tmpHome, 'created.txt'), 'hello');
    const ev = await waitForEvent((e) => e.payload.type === 'created');
    expect(ev.room).toBe('harness:user');
    expect(ev.payload.scope).toBe('user');
    expect(ev.payload.path).toBe('created.txt');
    expect(ev.payload.mtime).toMatch(/Z$/);
  }, 10_000);

  it('emits modified when an existing file is written', async () => {
    const p = path.join(tmpHome, 'mod.txt');
    await fs.writeFile(p, 'first');
    await fileWatcherService.ensureHarnessWatcher({ scope: 'user' });
    await new Promise((r) => setTimeout(r, 300));
    emitted.length = 0;

    await fs.writeFile(p, 'second');
    const ev = await waitForEvent((e) => e.payload.type === 'modified');
    expect(ev.payload.path).toBe('mod.txt');
  }, 10_000);

  it('emits deleted when an existing file is removed', async () => {
    const p = path.join(tmpHome, 'del.txt');
    await fs.writeFile(p, 'bye');
    await fileWatcherService.ensureHarnessWatcher({ scope: 'user' });
    await new Promise((r) => setTimeout(r, 300));
    emitted.length = 0;

    await fs.unlink(p);
    const ev = await waitForEvent((e) => e.payload.type === 'deleted');
    expect(ev.payload.path).toBe('del.txt');
  }, 10_000);

  it('suppresses echoes for paths previously passed to noteLocalWrite', async () => {
    await fileWatcherService.ensureHarnessWatcher({ scope: 'user' });
    await new Promise((r) => setTimeout(r, 300));
    emitted.length = 0;

    const p = path.join(tmpHome, 'self.txt');
    fileWatcherService.noteLocalWrite(p);
    await fs.writeFile(p, 'local');

    // Wait past the watcher stability window and a little extra.
    await new Promise((r) => setTimeout(r, 800));
    const matched = emitted.filter((e) => e.payload.path === 'self.txt');
    expect(matched).toEqual([]);
  }, 10_000);
});
