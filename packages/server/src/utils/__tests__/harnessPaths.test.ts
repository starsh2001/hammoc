/**
 * Story 28.0.5: Tests for harnessPaths.ts — verifies scope resolution,
 * path traversal rejection, and the HAMMOC_HARNESS_HOME_OVERRIDE test hook.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { HARNESS_ERRORS } from '@hammoc/shared';
import {
  getUserHarnessRoot,
  getProjectHarnessRoot,
  resolveHarnessPath,
  resolveProjectClaudeMdPath,
  resolveProjectGitignorePath,
  resolveBmadCoreConfigPath,
  resolveContextBuilderManifestPath,
  resolveContextBuilderScriptPath,
} from '../harnessPaths.js';
import { projectService } from '../../services/projectService.js';

describe('getUserHarnessRoot', () => {
  const originalOverride = process.env.HAMMOC_HARNESS_HOME_OVERRIDE;

  afterEach(() => {
    if (originalOverride === undefined) {
      delete process.env.HAMMOC_HARNESS_HOME_OVERRIDE;
    } else {
      process.env.HAMMOC_HARNESS_HOME_OVERRIDE = originalOverride;
    }
  });

  it('returns os.homedir()/.claude when override is unset', () => {
    delete process.env.HAMMOC_HARNESS_HOME_OVERRIDE;
    expect(getUserHarnessRoot()).toBe(path.join(os.homedir(), '.claude'));
  });

  it('returns the override when HAMMOC_HARNESS_HOME_OVERRIDE is set', () => {
    const tmp = path.join(os.tmpdir(), 'harness-override-' + Date.now());
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = tmp;
    expect(getUserHarnessRoot()).toBe(tmp);
  });
});

describe('getProjectHarnessRoot', () => {
  let tmpProject: string;

  beforeEach(async () => {
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-proj-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('returns <projectRoot>/.claude for an existing slug', async () => {
    vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(tmpProject);
    const result = await getProjectHarnessRoot('my-slug');
    expect(result).toBe(path.join(tmpProject, '.claude'));
  });

  it('wraps unknown slug errors as HARNESS_ROOT_MISSING', async () => {
    vi.spyOn(projectService, 'resolveOriginalPath').mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'PROJECT_NOT_FOUND' }),
    );
    await expect(getProjectHarnessRoot('unknown')).rejects.toMatchObject({
      code: HARNESS_ERRORS.HARNESS_ROOT_MISSING.code,
    });
  });

  it('rejects empty projectSlug with HARNESS_ROOT_MISSING', async () => {
    await expect(getProjectHarnessRoot('')).rejects.toMatchObject({
      code: HARNESS_ERRORS.HARNESS_ROOT_MISSING.code,
    });
  });
});

describe('resolveHarnessPath', () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-home-'));
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = tmpHome;
  });

  afterEach(async () => {
    delete process.env.HAMMOC_HARNESS_HOME_OVERRIDE;
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it('resolves normal relative paths inside the root', async () => {
    const { resolvedRoot, absolutePath } = await resolveHarnessPath({
      scope: 'user',
      relativePath: 'skills/foo',
    });
    expect(resolvedRoot).toBe(path.resolve(tmpHome));
    expect(absolutePath).toBe(path.resolve(tmpHome, 'skills/foo'));
  });

  it('accepts empty relativePath (root itself)', async () => {
    const { absolutePath, resolvedRoot } = await resolveHarnessPath({
      scope: 'user',
      relativePath: '',
    });
    expect(absolutePath).toBe(resolvedRoot);
  });

  it('rejects parent traversal with HARNESS_PATH_DENIED', async () => {
    await expect(
      resolveHarnessPath({ scope: 'user', relativePath: '../../../etc/passwd' }),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PATH_DENIED.code });
  });

  it('rejects absolute paths with HARNESS_PATH_DENIED', async () => {
    const abs = path.isAbsolute('/etc/passwd') ? '/etc/passwd' : 'C:\\Windows\\notepad.exe';
    await expect(
      resolveHarnessPath({ scope: 'user', relativePath: abs }),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PATH_DENIED.code });
  });

  it('rejects UNC-style paths with HARNESS_PATH_DENIED', async () => {
    await expect(
      resolveHarnessPath({ scope: 'user', relativePath: '\\\\server\\share' }),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PATH_DENIED.code });
    await expect(
      resolveHarnessPath({ scope: 'user', relativePath: '//server/share' }),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PATH_DENIED.code });
  });

  it('rejects null byte in relative path', async () => {
    await expect(
      resolveHarnessPath({ scope: 'user', relativePath: 'foo\0bar' }),
    ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PATH_DENIED.code });
  });
});

describe('resolveProjectClaudeMdPath (Story 29.1)', () => {
  let tmpProject: string;

  beforeEach(async () => {
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'claudemd-proj-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('returns <projectRoot>/CLAUDE.md (sibling of .claude/) for an existing slug', async () => {
    vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(tmpProject);
    const { resolvedRoot, absolutePath } = await resolveProjectClaudeMdPath('my-slug');
    expect(resolvedRoot).toBe(path.resolve(tmpProject));
    expect(absolutePath).toBe(path.join(path.resolve(tmpProject), 'CLAUDE.md'));
  });

  it('wraps unknown slug errors as HARNESS_ROOT_MISSING', async () => {
    vi.spyOn(projectService, 'resolveOriginalPath').mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'PROJECT_NOT_FOUND' }),
    );
    await expect(resolveProjectClaudeMdPath('unknown')).rejects.toMatchObject({
      code: HARNESS_ERRORS.HARNESS_ROOT_MISSING.code,
    });
  });

  it('rejects empty projectSlug with HARNESS_PATH_DENIED', async () => {
    await expect(resolveProjectClaudeMdPath('')).rejects.toMatchObject({
      code: HARNESS_ERRORS.HARNESS_PATH_DENIED.code,
    });
  });

  it('rejects projectSlug containing "..", path separators, or null byte', async () => {
    for (const evil of ['..', '../escape', 'a/b', 'a\\b', 'a\0b']) {
      await expect(resolveProjectClaudeMdPath(evil)).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_PATH_DENIED.code,
      });
    }
  });
});

describe('resolveProjectGitignorePath (Story 30.7)', () => {
  let tmpProject: string;

  beforeEach(async () => {
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'gitignore-proj-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('returns <projectRoot>/.gitignore (sibling of .claude/) for an existing slug', async () => {
    vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(tmpProject);
    const { resolvedRoot, absolutePath } = await resolveProjectGitignorePath('my-slug');
    expect(resolvedRoot).toBe(path.resolve(tmpProject));
    expect(absolutePath).toBe(path.join(path.resolve(tmpProject), '.gitignore'));
  });

  it('wraps unknown slug errors as HARNESS_ROOT_MISSING', async () => {
    vi.spyOn(projectService, 'resolveOriginalPath').mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'PROJECT_NOT_FOUND' }),
    );
    await expect(resolveProjectGitignorePath('unknown')).rejects.toMatchObject({
      code: HARNESS_ERRORS.HARNESS_ROOT_MISSING.code,
    });
  });

  it('rejects projectSlug containing "..", path separators, or null byte with HARNESS_PATH_DENIED', async () => {
    for (const evil of ['', '..', '../escape', 'a/b', 'a\\b', 'a\0b']) {
      await expect(resolveProjectGitignorePath(evil)).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_PATH_DENIED.code,
      });
    }
  });
});

describe('resolveBmadCoreConfigPath (Story 31.1)', () => {
  let tmpProject: string;

  beforeEach(async () => {
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'bmadcfg-proj-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('returns <projectRoot>/.bmad-core/core-config.yaml (sibling of .claude/) for an existing slug', async () => {
    vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(tmpProject);
    const { resolvedRoot, absolutePath } = await resolveBmadCoreConfigPath('my-slug');
    expect(resolvedRoot).toBe(path.resolve(tmpProject));
    expect(absolutePath).toBe(path.join(path.resolve(tmpProject), '.bmad-core', 'core-config.yaml'));
  });

  it('wraps unknown slug errors as HARNESS_ROOT_MISSING', async () => {
    vi.spyOn(projectService, 'resolveOriginalPath').mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'PROJECT_NOT_FOUND' }),
    );
    await expect(resolveBmadCoreConfigPath('unknown')).rejects.toMatchObject({
      code: HARNESS_ERRORS.HARNESS_ROOT_MISSING.code,
    });
  });

  it('rejects projectSlug containing "..", path separators, or null byte with HARNESS_PATH_DENIED', async () => {
    for (const evil of ['', '..', '../escape', 'a/b', 'a\\b', 'a\0b']) {
      await expect(resolveBmadCoreConfigPath(evil)).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_PATH_DENIED.code,
      });
    }
  });
});

describe('resolveContextBuilderManifestPath / resolveContextBuilderScriptPath (Story 31.2)', () => {
  let tmpProject: string;

  beforeEach(async () => {
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'ctxbuilder-proj-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('resolves <projectRoot>/.hammoc/context-builder.json and .hammoc/hooks/context-builder.mjs', async () => {
    vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(tmpProject);
    const manifest = await resolveContextBuilderManifestPath('my-slug');
    expect(manifest.resolvedRoot).toBe(path.resolve(tmpProject));
    expect(manifest.absolutePath).toBe(path.join(path.resolve(tmpProject), '.hammoc', 'context-builder.json'));
    const script = await resolveContextBuilderScriptPath('my-slug');
    expect(script.absolutePath).toBe(path.join(path.resolve(tmpProject), '.hammoc', 'hooks', 'context-builder.mjs'));
  });

  it('rejects traversal-bearing slugs with HARNESS_PATH_DENIED', async () => {
    const backslash = String.fromCharCode(92);
    const nul = String.fromCharCode(0);
    for (const evil of ['', '..', '../escape', 'a/b', `a${backslash}b`, `a${nul}b`]) {
      await expect(resolveContextBuilderManifestPath(evil)).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_PATH_DENIED.code,
      });
      await expect(resolveContextBuilderScriptPath(evil)).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_PATH_DENIED.code,
      });
    }
  });
});
