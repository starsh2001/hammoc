/**
 * Story 29.1 (AC2.b + Task 3.3): project-scope harness watcher must surface
 * external edits to `<projectRoot>/CLAUDE.md` (a sibling of `.claude/`) and
 * normalize the emitted path to `'../CLAUDE.md'` so it can never collide with
 * a hypothetical `<projectRoot>/.claude/CLAUDE.md` that would otherwise share
 * the relative path `'CLAUDE.md'`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import type { HarnessExternalChangeEvent } from '@hammoc/shared';

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

vi.mock('../projectService.js', () => ({
  projectService: {
    resolveOriginalPath: vi.fn(),
  },
}));

const { fileWatcherService } = await import('../fileWatcherService.js');
const { projectService } = await import('../projectService.js');

async function waitForEvent(
  predicate: (e: typeof emitted[number]) => boolean,
  timeoutMs = 2000,
): Promise<typeof emitted[number]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const match = emitted.find(predicate);
    if (match) return match;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out (emitted=${JSON.stringify(emitted)})`);
}

describe('fileWatcherService project-root CLAUDE.md emit (Story 29.1)', () => {
  let tmpProject: string;

  beforeEach(async () => {
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'cmd-watch-'));
    await fs.mkdir(path.join(tmpProject, '.claude'), { recursive: true });
    vi.mocked(projectService.resolveOriginalPath).mockResolvedValue(tmpProject);
    emitted.length = 0;
  });

  afterEach(async () => {
    fileWatcherService.releaseHarnessWatcher({ scope: 'project', projectSlug: 'slug' });
    await new Promise((r) => setTimeout(r, 150));
    await fs.rm(tmpProject, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('emits scope=project, path="../CLAUDE.md" when <projectRoot>/CLAUDE.md changes', async () => {
    await fileWatcherService.ensureHarnessWatcher({ scope: 'project', projectSlug: 'slug' });
    await new Promise((r) => setTimeout(r, 300));

    await fs.writeFile(path.join(tmpProject, 'CLAUDE.md'), '# project memory\n');
    const ev = await waitForEvent((e) => e.payload.path === '../CLAUDE.md');
    expect(ev.payload.scope).toBe('project');
    expect(ev.payload.type).toBe('created');
    expect(ev.room).toBe('harness:project:slug');
  }, 15_000);

  it('does NOT emit when an unrelated file in projectRoot changes (only CLAUDE.md is whitelisted)', async () => {
    await fileWatcherService.ensureHarnessWatcher({ scope: 'project', projectSlug: 'slug' });
    await new Promise((r) => setTimeout(r, 300));
    emitted.length = 0;

    await fs.writeFile(path.join(tmpProject, 'unrelated.txt'), 'noise');
    await new Promise((r) => setTimeout(r, 700));
    const matched = emitted.filter((e) => e.payload.path === '../unrelated.txt' || e.payload.path === 'unrelated.txt');
    expect(matched).toEqual([]);
  }, 15_000);

  it('distinguishes <projectRoot>/CLAUDE.md (../CLAUDE.md) from <projectRoot>/.claude/CLAUDE.md (CLAUDE.md)', async () => {
    await fileWatcherService.ensureHarnessWatcher({ scope: 'project', projectSlug: 'slug' });
    await new Promise((r) => setTimeout(r, 300));

    // Create both candidate locations.
    await fs.writeFile(path.join(tmpProject, 'CLAUDE.md'), '# outer\n');
    await fs.writeFile(path.join(tmpProject, '.claude', 'CLAUDE.md'), '# inner\n');

    // Wait long enough for both events to surface.
    await new Promise((r) => setTimeout(r, 800));

    const outer = emitted.find((e) => e.payload.path === '../CLAUDE.md');
    const inner = emitted.find((e) => e.payload.path === 'CLAUDE.md');
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();
    // Both events MUST land on the same project room and scope, but the path
    // discriminator is what the client uses to route them to the right column.
    expect(outer?.payload.scope).toBe('project');
    expect(inner?.payload.scope).toBe('project');
  }, 15_000);
});
