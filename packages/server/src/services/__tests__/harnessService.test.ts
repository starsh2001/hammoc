/**
 * Story 28.0.5: harnessService unit tests — covers AC1/AC2/AC4/AC5 paths.
 * User scope is redirected via HAMMOC_HARNESS_HOME_OVERRIDE so the real
 * ~/.claude is never touched.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { harnessService } from '../harnessService.js';
import { projectService } from '../projectService.js';

describe('harnessService', () => {
  let tmpHome: string;
  let tmpProject: string;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-user-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-proj-'));
    // Build <tmpProject>/.claude so project-scope ops can write there.
    await fs.mkdir(path.join(tmpProject, '.claude'), { recursive: true });
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = tmpHome;

    vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(tmpProject);
  });

  afterEach(async () => {
    delete process.env.HAMMOC_HARNESS_HOME_OVERRIDE;
    vi.restoreAllMocks();
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  // AC1 — project scope list / read / write
  it('lists project-scope entries', async () => {
    const skills = path.join(tmpProject, '.claude', 'skills');
    await fs.mkdir(skills, { recursive: true });
    await fs.writeFile(path.join(skills, 'SKILL.md'), '# skill');

    const result = await harnessService.list({
      scope: 'project',
      projectSlug: 'any',
      relativePath: 'skills',
    });
    expect(result.entries.map((e) => e.name).sort()).toEqual(['SKILL.md']);
    expect(result.entries[0].type).toBe('file');
  });

  // AC2 — user scope uses the same schema
  it('lists user-scope entries with same schema', async () => {
    await fs.mkdir(path.join(tmpHome, 'commands'), { recursive: true });
    await fs.writeFile(path.join(tmpHome, 'commands', 'foo.md'), 'foo');

    const result = await harnessService.list({ scope: 'user', relativePath: 'commands' });
    expect(result.scope).toBe('user');
    expect(result.resolvedRoot).toBe(path.resolve(tmpHome));
    expect(result.entries[0].name).toBe('foo.md');
  });

  it('returns an empty list when the root does not exist yet', async () => {
    const result = await harnessService.list({ scope: 'user', relativePath: 'never-created' });
    expect(result.entries).toEqual([]);
  });

  // AC1 — basic read
  it('reads an existing file', async () => {
    const p = path.join(tmpProject, '.claude', 'settings.json');
    await fs.writeFile(p, '{"x":1}');
    const result = await harnessService.read({
      scope: 'project',
      projectSlug: 'any',
      relativePath: 'settings.json',
    });
    expect(result.content).toBe('{"x":1}');
    expect(result.isBinary).toBe(false);
    expect(result.isTruncated).toBe(false);
    expect(result.mtime).toMatch(/Z$/);
  });

  it('throws HARNESS_FILE_NOT_FOUND for a missing file', async () => {
    await expect(
      harnessService.read({ scope: 'user', relativePath: 'missing.txt' }),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code });
  });

  // AC5 — STALE_WRITE across three branches
  it('succeeds when expectedMtime matches current file mtime', async () => {
    const rel = 'a.txt';
    const abs = path.join(tmpProject, '.claude', rel);
    await fs.writeFile(abs, 'original');
    const stat = await fs.stat(abs);
    const result = await harnessService.write(
      { scope: 'project', projectSlug: 'any', relativePath: rel },
      { content: 'updated', expectedMtime: stat.mtime.toISOString() },
    );
    expect(result.success).toBe(true);
    const updated = await fs.readFile(abs, 'utf-8');
    expect(updated).toBe('updated');
  });

  it('rejects with HARNESS_STALE_WRITE when mtimes differ on an existing file', async () => {
    const rel = 'b.txt';
    const abs = path.join(tmpProject, '.claude', rel);
    await fs.writeFile(abs, 'original');
    // Pretend we read it an hour ago
    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await expect(
      harnessService.write(
        { scope: 'project', projectSlug: 'any', relativePath: rel },
        { content: 'x', expectedMtime: stale },
      ),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_STALE_WRITE.code });
  });

  it('creates a new file when expectedMtime is omitted', async () => {
    const rel = 'fresh.json';
    const result = await harnessService.write(
      { scope: 'project', projectSlug: 'any', relativePath: rel },
      { content: '{}' },
    );
    expect(result.success).toBe(true);
    const abs = path.join(tmpProject, '.claude', rel);
    expect(await fs.readFile(abs, 'utf-8')).toBe('{}');
  });

  it('rejects new-file write with expectedMtime as STALE_WRITE', async () => {
    const rel = 'ghost.json';
    const error = await harnessService
      .write(
        { scope: 'project', projectSlug: 'any', relativePath: rel },
        { content: '{}', expectedMtime: new Date().toISOString() },
      )
      .catch((e) => e);
    expect(error.code).toBe(HARNESS_ERRORS.HARNESS_STALE_WRITE.code);
    expect(error.currentMtime).toBe('');
  });

  it('does not auto-create missing parent directories', async () => {
    await expect(
      harnessService.write(
        { scope: 'project', projectSlug: 'any', relativePath: 'deep/nested/new.txt' },
        { content: 'x' },
      ),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PARENT_NOT_FOUND.code });
  });

  // AC4 — patchStructured preserves YAML comments
  it('patchStructured (yaml) preserves comments across round trip', async () => {
    const rel = 'config.yaml';
    const abs = path.join(tmpProject, '.claude', rel);
    await fs.writeFile(abs, `# keep me
name: old
`);
    await harnessService.patchStructured(
      { scope: 'project', projectSlug: 'any', relativePath: rel },
      { format: 'yaml', ops: [{ path: ['name'], value: 'new' }] },
    );
    const after = await fs.readFile(abs, 'utf-8');
    expect(after).toContain('# keep me');
    expect(after).toMatch(/name:\s*new/);
  });

  it('patchStructured (jsonc) preserves comments across round trip', async () => {
    const rel = 'settings.json';
    const abs = path.join(tmpProject, '.claude', rel);
    await fs.writeFile(abs, `{
  // keep me
  "theme": "dark"
}
`);
    await harnessService.patchStructured(
      { scope: 'project', projectSlug: 'any', relativePath: rel },
      { format: 'jsonc', ops: [{ path: ['theme'], value: 'light' }] },
    );
    const after = await fs.readFile(abs, 'utf-8');
    expect(after).toContain('// keep me');
    expect(after).toContain('"theme": "light"');
  });
});
