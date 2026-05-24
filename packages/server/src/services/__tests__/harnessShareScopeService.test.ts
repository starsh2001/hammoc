/**
 * Story 30.1 (Task 2.4): harnessShareScopeService unit tests.
 *
 * Covers the four scenarios called out in the story:
 *   - Mode A project: `.claude/settings.json` is tracked, `*.local.*` ignored
 *   - Mode B project: `.claude/` directory itself is ignored (Hammoc-style)
 *   - No `.gitignore` at the project root → every path is `shared`
 *   - Sibling files outside `.claude/` (e.g. `.mcp.json`) classify on their own
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { harnessShareScopeService } from '../harnessShareScopeService.js';
import { projectService } from '../projectService.js';

async function makeProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sharescope-'));
}

describe('harnessShareScopeService.evaluate', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeProject();
    vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(projectRoot);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('Mode A: classifies tracked vs ignored harness files individually', async () => {
    await fs.writeFile(path.join(projectRoot, '.gitignore'), '.claude/*.local.*\n');

    const result = await harnessShareScopeService.evaluate({
      projectSlug: 'slug',
      relativePaths: [
        '.claude/settings.json',
        '.claude/settings.local.json',
        '.claude/skills/foo/SKILL.md',
      ],
    });

    expect(result.mode).toBe('A');
    expect(result.cards['.claude/settings.json']).toBe('shared');
    expect(result.cards['.claude/settings.local.json']).toBe('local');
    expect(result.cards['.claude/skills/foo/SKILL.md']).toBe('shared');
  });

  it('Mode B: directory-level ignore promotes harness files to fullyIgnored', async () => {
    await fs.writeFile(path.join(projectRoot, '.gitignore'), '.claude/\n');

    const result = await harnessShareScopeService.evaluate({
      projectSlug: 'slug',
      relativePaths: [
        '.claude/settings.json',
        '.claude/agents/dev.md',
      ],
    });

    expect(result.mode).toBe('B');
    expect(result.cards['.claude/settings.json']).toBe('fullyIgnored');
    expect(result.cards['.claude/agents/dev.md']).toBe('fullyIgnored');
  });

  it('treats absent .gitignore as Mode A with every path shared', async () => {
    const result = await harnessShareScopeService.evaluate({
      projectSlug: 'slug',
      relativePaths: ['.claude/settings.json', '.claude/settings.local.json'],
    });

    expect(result.mode).toBe('A');
    expect(result.cards['.claude/settings.json']).toBe('shared');
    // No `.gitignore` means even `*.local.*` resolves as shared — the rule
    // doesn't exist yet. The Task 6.4 fallback flow exists exactly to remind
    // the user to add the pattern before relying on `local` semantics.
    expect(result.cards['.claude/settings.local.json']).toBe('shared');
  });

  it('returns mode without cards when no paths are requested', async () => {
    await fs.writeFile(path.join(projectRoot, '.gitignore'), '.claude/\n');
    const result = await harnessShareScopeService.evaluate({
      projectSlug: 'slug',
      relativePaths: [],
    });
    expect(result.mode).toBe('B');
    expect(result.cards).toEqual({});
  });

  it('classifies sibling files outside `.claude/` (e.g. `.mcp.json`) on their own merits', async () => {
    // Mode B at the `.claude/` directory level, but `.mcp.json` is its own
    // file — directory-rule does not apply outside the directory itself.
    await fs.writeFile(path.join(projectRoot, '.gitignore'), '.claude/\n');

    const result = await harnessShareScopeService.evaluate({
      projectSlug: 'slug',
      relativePaths: ['.claude/settings.json', '.mcp.json'],
    });

    expect(result.cards['.claude/settings.json']).toBe('fullyIgnored');
    expect(result.cards['.mcp.json']).toBe('shared');
  });

  it('throws HARNESS_ROOT_MISSING when projectSlug cannot be resolved', async () => {
    vi.spyOn(projectService, 'resolveOriginalPath').mockRejectedValueOnce(new Error('boom'));
    await expect(
      harnessShareScopeService.evaluate({ projectSlug: 'unknown', relativePaths: [] }),
    ).rejects.toMatchObject({ code: 'HARNESS_ROOT_MISSING' });
  });
});

describe('harnessShareScopeService.appendGitignorePattern (Story 30.7 Task D.3)', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeProject();
    vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(projectRoot);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('creates .gitignore when missing and writes the pattern', async () => {
    const res = await harnessShareScopeService.appendGitignorePattern('slug', '**/.claude/**/*.local.*');
    expect(res).toEqual({ success: true, appended: true });
    const text = await fs.readFile(path.join(projectRoot, '.gitignore'), 'utf-8');
    expect(text.trim()).toBe('**/.claude/**/*.local.*');
  });

  it('appends to an existing .gitignore without dropping prior content', async () => {
    await fs.writeFile(path.join(projectRoot, '.gitignore'), '# header\nnode_modules\n', 'utf-8');
    const res = await harnessShareScopeService.appendGitignorePattern('slug', '**/.claude/**/*.local.*');
    expect(res).toEqual({ success: true, appended: true });
    const text = await fs.readFile(path.join(projectRoot, '.gitignore'), 'utf-8');
    expect(text).toContain('node_modules');
    expect(text).toContain('**/.claude/**/*.local.*');
  });

  it('is idempotent: skips the write when the pattern already exists as a non-comment line', async () => {
    await fs.writeFile(
      path.join(projectRoot, '.gitignore'),
      'node_modules\n**/.claude/**/*.local.*\n',
      'utf-8',
    );
    const statBefore = await fs.stat(path.join(projectRoot, '.gitignore'));
    const res = await harnessShareScopeService.appendGitignorePattern('slug', '**/.claude/**/*.local.*');
    expect(res).toEqual({ success: true, appended: false });
    const statAfter = await fs.stat(path.join(projectRoot, '.gitignore'));
    expect(statAfter.mtime.getTime()).toBe(statBefore.mtime.getTime());
  });

  it('registers the .gitignore write with fileWatcherService so the own-write echo is suppressed', async () => {
    const { fileWatcherService } = await import('../fileWatcherService.js');
    const spy = vi.spyOn(fileWatcherService, 'noteLocalWrite');
    await harnessShareScopeService.appendGitignorePattern('slug', '**/.claude/**/*.local.*');
    expect(spy).toHaveBeenCalledWith(path.join(projectRoot, '.gitignore'));
  });

  it('rejects an empty pattern with HARNESS_PARSE_ERROR', async () => {
    await expect(
      harnessShareScopeService.appendGitignorePattern('slug', '   '),
    ).rejects.toMatchObject({ code: 'HARNESS_PARSE_ERROR' });
  });
});
