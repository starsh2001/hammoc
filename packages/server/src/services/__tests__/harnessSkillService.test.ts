/**
 * Story 28.2: harnessSkillService unit tests.
 *
 * User scope is redirected via HAMMOC_HARNESS_HOME_OVERRIDE so the real
 * ~/.claude is never touched. Project scope is mocked through `projectService`.
 * Plugin scope is exercised through a hand-written installed_plugins.json that
 * points at a separate temp dir (covering the dev-installed out-of-tree path).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { harnessSkillService } from '../harnessSkillService.js';
import { projectService } from '../projectService.js';

const PLUGIN_KEY = 'sample-plugin@market';

async function writeSkill(
  root: string,
  name: string,
  options: {
    description?: string;
    version?: string;
    body?: string;
    bundle?: Record<string, string>;
  } = {},
): Promise<void> {
  const dir = path.join(root, 'skills', name);
  await fs.mkdir(dir, { recursive: true });
  const fm = [
    `name: ${name}`,
    `description: ${options.description ?? `Skill ${name}`}`,
  ];
  if (options.version) fm.push(`version: ${options.version}`);
  const content = `---\n${fm.join('\n')}\n---\n${options.body ?? `# ${name}\n`}`;
  await fs.writeFile(path.join(dir, 'SKILL.md'), content, 'utf-8');
  if (options.bundle) {
    for (const [relPath, body] of Object.entries(options.bundle)) {
      const abs = path.join(dir, relPath);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, body);
    }
  }
}

async function writeMalformedSkill(root: string, name: string): Promise<void> {
  const dir = path.join(root, 'skills', name);
  await fs.mkdir(dir, { recursive: true });
  // Intentionally missing required `description` field.
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name}\n---\nbody\n`);
}

async function writeInstalledPluginsCatalog(
  userRoot: string,
  pluginInstallPath: string,
): Promise<void> {
  const file = path.join(userRoot, 'plugins', 'installed_plugins.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    JSON.stringify(
      {
        version: 2,
        plugins: {
          [PLUGIN_KEY]: [
            {
              scope: 'user',
              installPath: pluginInstallPath,
              version: 'a',
              gitCommitSha: 'a',
              installedAt: '2026-04-01T00:00:00Z',
              lastUpdated: '2026-04-01T00:00:00Z',
            },
          ],
        },
      },
      null,
      2,
    ),
    'utf-8',
  );
}

describe('harnessSkillService', () => {
  let userRoot: string;
  let projectRoot: string;
  let pluginRoot: string;

  beforeEach(async () => {
    userRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-user-'));
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-project-'));
    pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-plugin-'));
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = userRoot;
    vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(projectRoot);
  });

  afterEach(async () => {
    delete process.env.HAMMOC_HARNESS_HOME_OVERRIDE;
    vi.restoreAllMocks();
    await fs.rm(userRoot, { recursive: true, force: true });
    await fs.rm(projectRoot, { recursive: true, force: true });
    await fs.rm(pluginRoot, { recursive: true, force: true });
  });

  // ----- AC1 -------------------------------------------------------------

  describe('listCards (AC1)', () => {
    it('merges 3 sources with project priority and reports activeScope=project', async () => {
      await writeSkill(path.join(projectRoot, '.claude'), 'shared');
      await writeSkill(path.join(userRoot), 'shared', { description: 'user-shared' });
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      await writeSkill(pluginRoot, 'shared', { description: 'plugin-shared' });

      const res = await harnessSkillService.listCards('slug');

      expect(res.cards).toHaveLength(1);
      expect(res.cards[0].name).toBe('shared');
      expect(res.cards[0].activeScope).toBe('project');
      expect(res.cards[0].sources).toHaveLength(3);
      expect(res.cards[0].sources.map((s) => s.scope)).toEqual(['project', 'user', 'plugin']);
    });

    it('records malformed entries separately and excludes them from cards', async () => {
      await writeMalformedSkill(path.join(userRoot), 'broken');
      await writeSkill(path.join(userRoot), 'good');

      const res = await harnessSkillService.listCards();

      expect(res.cards.find((c) => c.name === 'good')).toBeDefined();
      expect(res.cards.find((c) => c.name === 'broken')).toBeUndefined();
      expect(res.malformed.length).toBeGreaterThan(0);
      expect(res.malformed[0].scope).toBe('user');
    });

    it('omits bundle counts from list response and reports them via readSkill', async () => {
      await writeSkill(path.join(userRoot), 'bundled', {
        bundle: {
          'references/foo.md': 'foo',
          'references/sub/bar.md': 'bar',
          'examples/example.md': 'eg',
        },
      });

      // list path skips bundle counting for performance; the panel UI no
      // longer renders bundle badges per card.
      const res = await harnessSkillService.listCards();
      const card = res.cards.find((c) => c.name === 'bundled');
      expect(card).toBeDefined();
      const userSource = card!.sources.find((s) => s.scope === 'user')!;
      expect(userSource).not.toHaveProperty('bundleCounts');

      // The detail (read) path still walks the four bundle directories so
      // the editor modal can show counts and the file tree.
      const readRes = await harnessSkillService.readSkill({
        scope: userSource.scope,
        absoluteRoot: userSource.absoluteRoot,
      });
      expect(readRes.bundleCounts.references).toBe(2);
      expect(readRes.bundleCounts.examples).toBe(1);
      expect(readRes.bundleCounts.scripts).toBe(0);
    });

    it('falls back to user activeScope when project source is absent', async () => {
      await writeSkill(path.join(userRoot), 'only-user');

      const res = await harnessSkillService.listCards('slug');

      const card = res.cards.find((c) => c.name === 'only-user');
      expect(card).toBeDefined();
      expect(card!.activeScope).toBe('user');
    });
  });

  // ----- AC2 / AC3 update branches --------------------------------------

  describe('updateSkill (AC2, AC3)', () => {
    it('frontmatter-only patch preserves the body verbatim', async () => {
      await writeSkill(path.join(userRoot), 'demo', {
        description: 'orig',
        body: '# original body\nbody line\n',
      });
      const res = await harnessSkillService.listCards();
      const card = res.cards.find((c) => c.name === 'demo')!;
      const source = card.sources.find((s) => s.scope === 'user')!;

      const result = await harnessSkillService.updateSkill(source, {
        frontmatter: { description: 'updated description' },
        expectedMtime: source.skillMdMtime,
      });
      expect(result.success).toBe(true);

      const skillMd = path.join(userRoot, 'skills', 'demo', 'SKILL.md');
      const text = await fs.readFile(skillMd, 'utf-8');
      expect(text).toContain('description: updated description');
      expect(text).toContain('# original body');
      expect(text).toContain('body line');
    });

    it('body-only patch keeps the frontmatter block verbatim', async () => {
      await writeSkill(path.join(userRoot), 'demo', {
        description: 'orig',
        body: '# old body\n',
      });
      const res = await harnessSkillService.listCards();
      const source = res.cards
        .find((c) => c.name === 'demo')!
        .sources.find((s) => s.scope === 'user')!;

      const result = await harnessSkillService.updateSkill(source, {
        body: '# brand new body\n',
        expectedMtime: source.skillMdMtime,
      });
      expect(result.success).toBe(true);

      const skillMd = path.join(userRoot, 'skills', 'demo', 'SKILL.md');
      const text = await fs.readFile(skillMd, 'utf-8');
      expect(text).toContain('name: demo');
      expect(text).toContain('description: orig');
      expect(text).toContain('# brand new body');
      expect(text).not.toContain('# old body');
    });

    it('combined frontmatter+body update goes through without STALE_WRITE on the second pass', async () => {
      await writeSkill(path.join(userRoot), 'demo');
      const res = await harnessSkillService.listCards();
      const source = res.cards
        .find((c) => c.name === 'demo')!
        .sources.find((s) => s.scope === 'user')!;

      const result = await harnessSkillService.updateSkill(source, {
        frontmatter: { description: 'updated' },
        body: '# new body\n',
        expectedMtime: source.skillMdMtime,
      });
      expect(result.success).toBe(true);
    });

    it('plugin scope updates are forbidden', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      await writeSkill(pluginRoot, 'plug-skill');
      const res = await harnessSkillService.listCards();
      const source = res.cards
        .find((c) => c.name === 'plug-skill')!
        .sources.find((s) => s.scope === 'plugin')!;

      await expect(
        harnessSkillService.updateSkill(source, {
          body: 'no',
          expectedMtime: source.skillMdMtime,
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_FORBIDDEN.code });
    });

    it('raw update with a broken frontmatter is rejected with PARSE_ERROR', async () => {
      await writeSkill(path.join(userRoot), 'demo');
      const res = await harnessSkillService.listCards();
      const source = res.cards
        .find((c) => c.name === 'demo')!
        .sources.find((s) => s.scope === 'user')!;
      await expect(
        harnessSkillService.updateSkill(source, {
          raw: 'no frontmatter here',
          expectedMtime: source.skillMdMtime,
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PARSE_ERROR.code });
    });
  });

  // ----- AC4 copy ---------------------------------------------------------

  describe('copySkill (AC4)', () => {
    it('overwrite mode replaces the existing destination tree', async () => {
      await writeSkill(path.join(userRoot), 'src', {
        bundle: { 'references/a.md': 'a' },
      });
      await writeSkill(path.join(projectRoot, '.claude'), 'src', {
        description: 'old',
        bundle: { 'references/old.md': 'old' },
      });

      const res = await harnessSkillService.copySkill({
        sourceScope: 'user',
        sourceName: 'src',
        targetScope: 'project',
        targetProjectSlug: 'slug',
        targetName: 'src',
        onConflict: 'overwrite',
      });
      expect(res.success).toBe(true);
      expect(res.copied).toBeGreaterThan(0);

      const newFile = path.join(projectRoot, '.claude', 'skills', 'src', 'references', 'a.md');
      expect((await fs.readFile(newFile, 'utf-8')).trim()).toBe('a');
      const oldFile = path.join(projectRoot, '.claude', 'skills', 'src', 'references', 'old.md');
      await expect(fs.access(oldFile)).rejects.toBeTruthy();
    });

    it('skip mode reports skipped:true and leaves the destination unchanged', async () => {
      await writeSkill(path.join(userRoot), 'demo');
      await writeSkill(path.join(projectRoot, '.claude'), 'demo', { description: 'old' });

      const res = await harnessSkillService.copySkill({
        sourceScope: 'user',
        sourceName: 'demo',
        targetScope: 'project',
        targetProjectSlug: 'slug',
        targetName: 'demo',
        onConflict: 'skip',
      });
      expect(res.skipped).toBe(true);

      const text = await fs.readFile(
        path.join(projectRoot, '.claude', 'skills', 'demo', 'SKILL.md'),
        'utf-8',
      );
      expect(text).toContain('description: old');
    });

    it('rename mode that still collides surfaces 409 NAME_CONFLICT', async () => {
      await writeSkill(path.join(userRoot), 'demo');
      await writeSkill(path.join(projectRoot, '.claude'), 'demo-renamed');

      await expect(
        harnessSkillService.copySkill({
          sourceScope: 'user',
          sourceName: 'demo',
          targetScope: 'project',
          targetProjectSlug: 'slug',
          targetName: 'demo-renamed',
          onConflict: 'rename',
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_SKILL_NAME_CONFLICT.code });
    });

    it('plugin → project copy uses the bundled tree', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      await writeSkill(pluginRoot, 'plug-clone', {
        bundle: { 'references/r.md': 'r' },
      });

      const res = await harnessSkillService.copySkill({
        sourceScope: 'plugin',
        sourcePluginKey: PLUGIN_KEY,
        sourceName: 'plug-clone',
        targetScope: 'project',
        targetProjectSlug: 'slug',
        targetName: 'plug-clone',
        onConflict: 'overwrite',
      });
      expect(res.success).toBe(true);
      const cloned = path.join(projectRoot, '.claude', 'skills', 'plug-clone', 'references', 'r.md');
      expect((await fs.readFile(cloned, 'utf-8')).trim()).toBe('r');
    });

    it('source missing → 404 SKILL_NOT_FOUND', async () => {
      await expect(
        harnessSkillService.copySkill({
          sourceScope: 'user',
          sourceName: 'ghost',
          targetScope: 'project',
          targetProjectSlug: 'slug',
          targetName: 'ghost',
          onConflict: 'overwrite',
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_SKILL_NOT_FOUND.code });
    });
  });

  // ----- AC5 readSkill bundle entries -----------------------------------

  describe('readSkill (AC5)', () => {
    it('returns body, raw, frontmatter, bundle entries', async () => {
      await writeSkill(path.join(userRoot), 'demo', {
        description: 'desc',
        body: '# body lives here\n',
        bundle: { 'references/notes.md': 'notes' },
      });
      const cards = await harnessSkillService.listCards();
      const source = cards.cards
        .find((c) => c.name === 'demo')!
        .sources.find((s) => s.scope === 'user')!;

      const res = await harnessSkillService.readSkill(source);
      expect(res.frontmatter.name).toBe('demo');
      expect(res.frontmatter.description).toBe('desc');
      expect(res.body).toContain('# body lives here');
      expect(res.raw).toContain('---');
      expect(res.bundleEntries.find((e) => e.relativePath === 'references/notes.md')).toBeDefined();
    });
  });
});
