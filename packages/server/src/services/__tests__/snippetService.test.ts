/**
 * Story 29.2: snippetService unit tests — list/read/create/update/delete/copy
 * + bundled read-only guard + STALE_WRITE + path traversal rejection +
 * legacy-extension-less file backwards compatibility.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { snippetService } from '../snippetService.js';
import { projectService } from '../projectService.js';

describe('snippetService', () => {
  let tmpHome: string;
  let tmpProject: string;
  let tmpBundled: string;

  const userDir = () => path.join(tmpHome, '.hammoc', 'snippets');
  const projectDir = () => path.join(tmpProject, '.hammoc', 'snippets');

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'snip-svc-home-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'snip-svc-proj-'));
    tmpBundled = await fs.mkdtemp(path.join(os.tmpdir(), 'snip-svc-bundle-'));
    process.env.HAMMOC_HOME_OVERRIDE = tmpHome;
    process.env.HAMMOC_BUNDLED_SNIPPETS_DIR = tmpBundled;
    vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(tmpProject);
  });

  afterEach(async () => {
    delete process.env.HAMMOC_HOME_OVERRIDE;
    delete process.env.HAMMOC_BUNDLED_SNIPPETS_DIR;
    vi.restoreAllMocks();
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpProject, { recursive: true, force: true });
    await fs.rm(tmpBundled, { recursive: true, force: true });
  });

  it('list returns project + user + bundled cards (no dedupe)', async () => {
    await fs.mkdir(userDir(), { recursive: true });
    await fs.mkdir(projectDir(), { recursive: true });
    await fs.writeFile(path.join(userDir(), 'foo.md'), 'global foo body\n');
    await fs.writeFile(path.join(projectDir(), 'foo.md'), 'project foo body\n');
    await fs.writeFile(path.join(tmpBundled, 'standard'), 'bundled standard\n');

    const res = await snippetService.list({ projectSlug: 'any' });
    const names = res.snippets.map((s) => `${s.scope}:${s.name}`).sort();
    expect(names).toEqual(['bundled:standard', 'project:foo', 'user:foo']);
    const projectFoo = res.snippets.find((s) => s.scope === 'project')!;
    expect(projectFoo.preview).toBe('project foo body');
  });

  it('read returns content + mtime + absolutePath', async () => {
    await fs.mkdir(userDir(), { recursive: true });
    const abs = path.join(userDir(), 'hello.md');
    await fs.writeFile(abs, 'hello world\n');
    const res = await snippetService.read({ scope: 'user', name: 'hello' });
    expect(res.content).toBe('hello world\n');
    expect(res.absolutePath).toBe(abs);
    expect(res.mtime).toMatch(/Z$/);
  });

  it('read transparently handles legacy extension-less files', async () => {
    await fs.mkdir(userDir(), { recursive: true });
    const abs = path.join(userDir(), 'legacy');
    await fs.writeFile(abs, 'legacy body\n');
    const res = await snippetService.read({ scope: 'user', name: 'legacy' });
    expect(res.content).toBe('legacy body\n');
    expect(res.absolutePath).toBe(abs);
  });

  it('read returns HARNESS_FILE_NOT_FOUND for missing snippets', async () => {
    await expect(
      snippetService.read({ scope: 'user', name: 'absent' }),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code });
  });

  it('create writes to <name>.md and refuses overwrite with HARNESS_FILE_EXISTS', async () => {
    const r1 = await snippetService.create(
      { scope: 'user', name: 'new' },
      { content: 'first' },
    );
    expect(r1.success).toBe(true);
    const written = await fs.readFile(path.join(userDir(), 'new.md'), 'utf-8');
    expect(written).toBe('first');
    await expect(
      snippetService.create({ scope: 'user', name: 'new' }, { content: 'second' }),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_FILE_EXISTS.code });
  });

  it('create rejects bundled scope with HARNESS_BUNDLED_READONLY', async () => {
    await expect(
      snippetService.create({ scope: 'bundled', name: 'foo' }, { content: 'x' }),
    ).rejects.toMatchObject({ code: 'HARNESS_BUNDLED_READONLY' });
  });

  it('update enforces STALE_WRITE when expectedMtime mismatches', async () => {
    await fs.mkdir(userDir(), { recursive: true });
    const abs = path.join(userDir(), 'doc.md');
    await fs.writeFile(abs, 'v1');
    const stat1 = await fs.stat(abs);
    const r = await snippetService.update(
      { scope: 'user', name: 'doc' },
      { content: 'v2', expectedMtime: stat1.mtime.toISOString() },
    );
    expect(r.success).toBe(true);
    expect(await fs.readFile(abs, 'utf-8')).toBe('v2');

    // Stale guard with old mtime should fail.
    await expect(
      snippetService.update(
        { scope: 'user', name: 'doc' },
        { content: 'v3', expectedMtime: stat1.mtime.toISOString() },
      ),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_STALE_WRITE.code });
  });

  it('update rejects bundled scope', async () => {
    await expect(
      snippetService.update({ scope: 'bundled', name: 'foo' }, { content: 'x' }),
    ).rejects.toMatchObject({ code: 'HARNESS_BUNDLED_READONLY' });
  });

  it('delete removes the file and returns success', async () => {
    await fs.mkdir(userDir(), { recursive: true });
    const abs = path.join(userDir(), 'gone.md');
    await fs.writeFile(abs, 'x');
    const r = await snippetService.delete({ scope: 'user', name: 'gone' }, {});
    expect(r.success).toBe(true);
    await expect(fs.stat(abs)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('delete enforces STALE_WRITE', async () => {
    await fs.mkdir(userDir(), { recursive: true });
    const abs = path.join(userDir(), 'guard.md');
    await fs.writeFile(abs, 'x');
    await expect(
      snippetService.delete(
        { scope: 'user', name: 'guard' },
        { expectedMtime: '1970-01-01T00:00:00.000Z' },
      ),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_STALE_WRITE.code });
  });

  it('delete rejects bundled scope', async () => {
    await expect(
      snippetService.delete({ scope: 'bundled', name: 'foo' }, {}),
    ).rejects.toMatchObject({ code: 'HARNESS_BUNDLED_READONLY' });
  });

  it('copy project → user with no conflict succeeds', async () => {
    await fs.mkdir(projectDir(), { recursive: true });
    await fs.writeFile(path.join(projectDir(), 'src.md'), 'project body');
    const r = await snippetService.copy({
      sourceScope: 'project',
      sourceName: 'src',
      sourceProjectSlug: 'any',
      targetScope: 'user',
    });
    expect(r.success).toBe(true);
    const written = await fs.readFile(path.join(userDir(), 'src.md'), 'utf-8');
    expect(written).toBe('project body');
  });

  it('copy bundled → project succeeds (one-way clone)', async () => {
    await fs.writeFile(path.join(tmpBundled, 'std'), 'bundled body');
    const r = await snippetService.copy({
      sourceScope: 'bundled',
      sourceName: 'std',
      targetScope: 'project',
      targetProjectSlug: 'any',
    });
    expect(r.success).toBe(true);
    expect(await fs.readFile(path.join(projectDir(), 'std.md'), 'utf-8')).toBe('bundled body');
  });

  it('copy with target collision and onConflict abort returns HARNESS_FILE_EXISTS', async () => {
    await fs.mkdir(projectDir(), { recursive: true });
    await fs.mkdir(userDir(), { recursive: true });
    await fs.writeFile(path.join(projectDir(), 'dup.md'), 'p');
    await fs.writeFile(path.join(userDir(), 'dup.md'), 'u');
    await expect(
      snippetService.copy({
        sourceScope: 'project',
        sourceName: 'dup',
        sourceProjectSlug: 'any',
        targetScope: 'user',
      }),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_FILE_EXISTS.code });
  });

  it('copy with onConflict=overwrite replaces the target body', async () => {
    await fs.mkdir(projectDir(), { recursive: true });
    await fs.mkdir(userDir(), { recursive: true });
    await fs.writeFile(path.join(projectDir(), 'dup.md'), 'project body');
    await fs.writeFile(path.join(userDir(), 'dup.md'), 'old user body');
    const r = await snippetService.copy({
      sourceScope: 'project',
      sourceName: 'dup',
      sourceProjectSlug: 'any',
      targetScope: 'user',
      onConflict: 'overwrite',
    });
    expect(r.success).toBe(true);
    expect(await fs.readFile(path.join(userDir(), 'dup.md'), 'utf-8')).toBe('project body');
  });

  it('copy with onConflict=rename writes to the new target name', async () => {
    await fs.mkdir(projectDir(), { recursive: true });
    await fs.mkdir(userDir(), { recursive: true });
    await fs.writeFile(path.join(projectDir(), 'dup.md'), 'p');
    await fs.writeFile(path.join(userDir(), 'dup.md'), 'u');
    const r = await snippetService.copy({
      sourceScope: 'project',
      sourceName: 'dup',
      sourceProjectSlug: 'any',
      targetScope: 'user',
      targetName: 'dup-from-project',
      onConflict: 'rename',
    });
    expect(r.success).toBe(true);
    expect(
      await fs.readFile(path.join(userDir(), 'dup-from-project.md'), 'utf-8'),
    ).toBe('p');
  });

  it('copy returns HARNESS_FILE_NOT_FOUND when the source snippet does not exist', async () => {
    // No source file ever written — the target directory must remain untouched
    // and the service must surface the canonical not-found error code so the
    // controller maps to a 404 instead of a 500.
    await expect(
      snippetService.copy({
        sourceScope: 'project',
        sourceName: 'never-existed',
        sourceProjectSlug: 'any',
        targetScope: 'user',
      }),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code });
    // Defensive — the user directory should not have been created as a side
    // effect of a failed copy.
    const userExists = await fs
      .stat(userDir())
      .then(() => true)
      .catch(() => false);
    expect(userExists).toBe(false);
  });

  it('copy rejects bundled as a target', async () => {
    await fs.mkdir(projectDir(), { recursive: true });
    await fs.writeFile(path.join(projectDir(), 'src.md'), 'x');
    await expect(
      snippetService.copy({
        sourceScope: 'project',
        sourceName: 'src',
        sourceProjectSlug: 'any',
        // @ts-expect-error — invalid by type, validating runtime guard
        targetScope: 'bundled',
      }),
    ).rejects.toMatchObject({ code: 'HARNESS_BUNDLED_READONLY' });
  });

  it('rejects path traversal in name (HARNESS_PATH_DENIED)', async () => {
    await expect(
      snippetService.read({ scope: 'user', name: '../etc/passwd' }),
    ).rejects.toMatchObject({ code: 'HARNESS_PATH_DENIED' });
  });
});
