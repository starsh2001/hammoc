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
