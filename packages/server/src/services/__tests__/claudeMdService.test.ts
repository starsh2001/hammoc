/**
 * Story 29.1: claudeMdService unit tests — covers AC1 (read/write), AC4
 * (create empty file with HARNESS_FILE_EXISTS guard), and AC6 (project root
 * CLAUDE.md path resolution outside `.claude/`). User scope is redirected via
 * HAMMOC_HARNESS_HOME_OVERRIDE so the real ~/.claude is never touched.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { claudeMdService } from '../claudeMdService.js';
import { projectService } from '../projectService.js';

describe('claudeMdService', () => {
  let tmpHome: string;
  let tmpProject: string;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'claudemd-home-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'claudemd-proj-'));
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = tmpHome;
    vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(tmpProject);
  });

  afterEach(async () => {
    delete process.env.HAMMOC_HARNESS_HOME_OVERRIDE;
    vi.restoreAllMocks();
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  // AC1 — basic read of project-root CLAUDE.md (sibling of .claude/, not inside it)
  it('reads project-root CLAUDE.md (sits OUTSIDE <projectRoot>/.claude/)', async () => {
    const abs = path.join(tmpProject, 'CLAUDE.md');
    await fs.writeFile(abs, '# project memory\n');
    const result = await claudeMdService.read({ scope: 'project', projectSlug: 'any' });
    expect(result.content).toBe('# project memory\n');
    expect(result.isBinary).toBe(false);
    expect(result.path).toBe('CLAUDE.md');
    expect(result.mtime).toMatch(/Z$/);
    // AC4.c — read response carries the resolved absolute path so the client
    // can display it in the empty-state confirm dialog (and elsewhere if needed).
    expect(result.absolutePath).toBe(abs);
  });

  it('reads global CLAUDE.md from ~/.claude/CLAUDE.md', async () => {
    const abs = path.join(tmpHome, 'CLAUDE.md');
    await fs.writeFile(abs, '# global\n');
    const result = await claudeMdService.read({ scope: 'user' });
    expect(result.content).toBe('# global\n');
    expect(result.path).toBe('CLAUDE.md');
  });

  it('returns HARNESS_FILE_NOT_FOUND when the file is absent', async () => {
    await expect(claudeMdService.read({ scope: 'user' })).rejects.toMatchObject({
      code: HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code,
    });
    await expect(
      claudeMdService.read({ scope: 'project', projectSlug: 'any' }),
    ).rejects.toMatchObject({
      code: HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code,
    });
  });

  // AC4.c — even when the file does not exist, the 404 error must carry the
  // resolved absolute path so the empty-state CTA dialog can show "이 위치에
  // 빈 CLAUDE.md 를 생성합니다 — <절대경로>".
  it('attaches absolutePath to HARNESS_FILE_NOT_FOUND so empty-state UI can render the location', async () => {
    await expect(
      claudeMdService.read({ scope: 'project', projectSlug: 'any' }),
    ).rejects.toMatchObject({
      code: HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code,
      absolutePath: path.join(tmpProject, 'CLAUDE.md'),
    });
    await expect(claudeMdService.read({ scope: 'user' })).rejects.toMatchObject({
      code: HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code,
      absolutePath: path.join(tmpHome, 'CLAUDE.md'),
    });
  });

  // AC1 — write happy path + STALE_WRITE
  it('writes content with matching expectedMtime and updates the disk file', async () => {
    const abs = path.join(tmpProject, 'CLAUDE.md');
    await fs.writeFile(abs, 'old');
    const stat = await fs.stat(abs);
    const result = await claudeMdService.write(
      { scope: 'project', projectSlug: 'any' },
      { content: 'new', expectedMtime: stat.mtime.toISOString() },
    );
    expect(result.success).toBe(true);
    const updated = await fs.readFile(abs, 'utf-8');
    expect(updated).toBe('new');
  });

  it('rejects writes with HARNESS_STALE_WRITE when expectedMtime is stale', async () => {
    const abs = path.join(tmpProject, 'CLAUDE.md');
    await fs.writeFile(abs, 'old');
    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await expect(
      claudeMdService.write(
        { scope: 'project', projectSlug: 'any' },
        { content: 'x', expectedMtime: stale },
      ),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_STALE_WRITE.code });
  });

  it('creates the file when expectedMtime is omitted (force-write)', async () => {
    const result = await claudeMdService.write(
      { scope: 'project', projectSlug: 'any' },
      { content: 'fresh' },
    );
    expect(result.success).toBe(true);
    const written = await fs.readFile(path.join(tmpProject, 'CLAUDE.md'), 'utf-8');
    expect(written).toBe('fresh');
  });

  it('auto-mkdir ~/.claude/ on first user-scope write when it does not exist', async () => {
    // Move HOME_OVERRIDE to a temp parent without the `.claude` subfolder
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'claudemd-empty-home-'));
    const fakeHome = path.join(parent, '.claude'); // does NOT exist
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = fakeHome;
    try {
      const result = await claudeMdService.write({ scope: 'user' }, { content: 'hello' });
      expect(result.success).toBe(true);
      const stat = await fs.stat(fakeHome);
      expect(stat.isDirectory()).toBe(true);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
      process.env.HAMMOC_HARNESS_HOME_OVERRIDE = tmpHome;
    }
  });

  // AC4 — create empty file
  it('creates an empty CLAUDE.md when the file does not exist', async () => {
    const result = await claudeMdService.create({ scope: 'project', projectSlug: 'any' });
    expect(result.success).toBe(true);
    const content = await fs.readFile(path.join(tmpProject, 'CLAUDE.md'), 'utf-8');
    expect(content).toBe('');
  });

  it('refuses to create when the file already exists (HARNESS_FILE_EXISTS, 409)', async () => {
    await fs.writeFile(path.join(tmpProject, 'CLAUDE.md'), 'existing');
    await expect(
      claudeMdService.create({ scope: 'project', projectSlug: 'any' }),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_FILE_EXISTS.code });
  });

  it('auto-mkdir ~/.claude/ on first user-scope create when missing', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'claudemd-create-empty-home-'));
    const fakeHome = path.join(parent, '.claude');
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = fakeHome;
    try {
      const result = await claudeMdService.create({ scope: 'user' });
      expect(result.success).toBe(true);
      const content = await fs.readFile(path.join(fakeHome, 'CLAUDE.md'), 'utf-8');
      expect(content).toBe('');
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
      process.env.HAMMOC_HARNESS_HOME_OVERRIDE = tmpHome;
    }
  });

  // AC6 — projectSlug validation flows through to the service
  it('rejects projectSlug containing path separators (defense-in-depth)', async () => {
    await expect(
      claudeMdService.read({ scope: 'project', projectSlug: '../escape' }),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PATH_DENIED.code });
  });
});
