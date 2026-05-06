/**
 * Story 29.2: snippetPaths.resolveSnippetPath — name validation + traversal
 * containment + bundled read-only flag.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {
  resolveSnippetPath,
  validateSnippetName,
  getUserSnippetsDir,
  getBundledSnippetsDir,
  SNIPPET_NAME_RE,
} from '../snippetPaths.js';
import { projectService } from '../../services/projectService.js';

describe('snippetPaths', () => {
  let tmpHome: string;
  let tmpProject: string;
  let tmpBundled: string;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'snippet-home-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'snippet-proj-'));
    tmpBundled = await fs.mkdtemp(path.join(os.tmpdir(), 'snippet-bundle-'));
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

  it('resolves user scope to ~/.hammoc/snippets/<name>.md', async () => {
    const r = await resolveSnippetPath({ scope: 'user', name: 'commit-and-done' });
    expect(r.resolvedRoot).toBe(path.join(tmpHome, '.hammoc', 'snippets'));
    expect(r.absolutePath).toBe(
      path.join(tmpHome, '.hammoc', 'snippets', 'commit-and-done.md'),
    );
    expect(r.legacyAbsolutePath).toBe(
      path.join(tmpHome, '.hammoc', 'snippets', 'commit-and-done'),
    );
    expect(r.readOnly).toBe(false);
  });

  it('resolves project scope to <projectRoot>/.hammoc/snippets/<name>.md', async () => {
    const r = await resolveSnippetPath({
      scope: 'project',
      projectSlug: 'any',
      name: 'foo',
    });
    expect(r.absolutePath).toBe(path.join(tmpProject, '.hammoc', 'snippets', 'foo.md'));
    expect(r.readOnly).toBe(false);
  });

  it('resolves bundled scope to the bundled dir + readOnly: true', async () => {
    const r = await resolveSnippetPath({ scope: 'bundled', name: 'sample' });
    expect(r.resolvedRoot).toBe(path.resolve(tmpBundled));
    expect(r.readOnly).toBe(true);
  });

  it.each([
    ['..', 'parent traversal'],
    ['../foo', 'parent traversal'],
    ['foo/bar', 'separator'],
    ['foo\\bar', 'backslash'],
    ['', 'empty'],
    ['foo\0bar', 'null byte'],
  ])('rejects evil name %p (%s) with HARNESS_PATH_DENIED', async (name) => {
    await expect(
      resolveSnippetPath({ scope: 'user', name }),
    ).rejects.toMatchObject({ code: 'HARNESS_PATH_DENIED' });
  });

  it('rejects project scope without projectSlug', async () => {
    await expect(
      resolveSnippetPath({ scope: 'project', name: 'foo' }),
    ).rejects.toMatchObject({ code: 'HARNESS_PATH_DENIED' });
  });

  it('NAME_RE accepts alphanumeric + dot + underscore + hyphen', () => {
    for (const ok of ['foo', 'Foo_Bar', 'commit-and-done', 'a.b.c', '0123', 'X-1.y_2']) {
      expect(SNIPPET_NAME_RE.test(ok)).toBe(true);
      expect(() => validateSnippetName(ok)).not.toThrow();
    }
    // SNIPPET_NAME_RE alone allows '..' (dots are in the char class). The
    // resolver layer rejects '..' separately as a traversal — verified via
    // the parameterized rejection test above.
    for (const bad of ['foo bar', 'foo/bar', '', 'foo+bar']) {
      expect(SNIPPET_NAME_RE.test(bad)).toBe(false);
    }
  });

  it('getUserSnippetsDir / getBundledSnippetsDir honor env overrides', () => {
    expect(getUserSnippetsDir()).toBe(path.join(tmpHome, '.hammoc', 'snippets'));
    expect(getBundledSnippetsDir()).toBe(tmpBundled);
  });
});
