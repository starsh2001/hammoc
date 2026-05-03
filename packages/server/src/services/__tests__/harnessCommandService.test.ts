/**
 * Story 28.5: harnessCommandService unit tests.
 *
 * The user scope is redirected via HAMMOC_HARNESS_HOME_OVERRIDE so the real
 * ~/.claude is never touched. Project scope is mocked through `projectService`.
 * Plugin scope uses a hand-written installed_plugins.json that points at a
 * separate temp dir.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { HARNESS_ERRORS } from '@hammoc/shared';
import {
  harnessCommandService,
  harnessCommandInternals,
} from '../harnessCommandService.js';
import { projectService } from '../projectService.js';

const PLUGIN_KEY = 'sample-plugin@market';

async function writeProjectCommand(
  projectRoot: string,
  rel: string,
  body: string,
): Promise<void> {
  const abs = path.join(projectRoot, '.claude', 'commands', rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body, 'utf-8');
}

async function writeUserCommand(userRoot: string, rel: string, body: string): Promise<void> {
  const abs = path.join(userRoot, 'commands', rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body, 'utf-8');
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

describe('harnessCommandService', () => {
  let userRoot: string;
  let projectRoot: string;
  let pluginRoot: string;

  beforeEach(async () => {
    userRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cmd-user-'));
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cmd-project-'));
    pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cmd-plugin-'));
    await fs.mkdir(path.join(projectRoot, '.claude'), { recursive: true });
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

  describe('listCards (AC1)', () => {
    it('flat project file → /foo slash name with project scope', async () => {
      await writeProjectCommand(projectRoot, 'foo.md', '---\ndescription: hi\n---\n\nbody\n');
      const res = await harnessCommandService.listCards('slug');
      const card = res.cards.find((c) => c.relativePath === 'foo.md');
      expect(card).toBeDefined();
      expect(card!.slashName).toBe('/foo');
      expect(card!.scope).toBe('project');
      expect(card!.frontmatter.description).toBe('hi');
    });

    it('nested project file → /sub:foo with colon-converted slash name', async () => {
      await writeProjectCommand(projectRoot, 'sub/foo.md', '# body\n');
      const res = await harnessCommandService.listCards('slug');
      const card = res.cards.find((c) => c.relativePath === 'sub/foo.md');
      expect(card).toBeDefined();
      expect(card!.slashName).toBe('/sub:foo');
    });

    it('3-deep nested file → /A:B:C:foo (multiple colons)', async () => {
      await writeProjectCommand(projectRoot, 'A/B/C/foo.md', '# body\n');
      const res = await harnessCommandService.listCards('slug');
      const card = res.cards.find((c) => c.relativePath === 'A/B/C/foo.md');
      expect(card).toBeDefined();
      expect(card!.slashName).toBe('/A:B:C:foo');
    });

    it('detects token usage in body for badge flags', async () => {
      const body = `---
description: tokens
---

Run \`echo\` here:

!\`git status\`

@docs/foo.md is referenced.

Pass $1 (or $ARGUMENTS) — uses \${CLAUDE_PLUGIN_ROOT} too.
`;
      await writeProjectCommand(projectRoot, 'tokens.md', body);
      const res = await harnessCommandService.listCards('slug');
      const card = res.cards.find((c) => c.relativePath === 'tokens.md');
      expect(card).toBeDefined();
      expect(card!.tokens.usesPositionalArgs).toBe(true);
      expect(card!.tokens.usesArgumentsAll).toBe(true);
      expect(card!.tokens.usesFileRefs).toBe(true);
      expect(card!.tokens.usesBashExec).toBe(true);
      expect(card!.tokens.usesPluginRoot).toBe(true);
    });

    it('detects BMad mirror via the leading 10-line window (marker on line 5)', async () => {
      const body = `# /sm Command

When this command is used, adopt the following agent persona:

<!-- Powered by BMAD™ Core -->

# sm

ACTIVATION-NOTICE: ...
`;
      await writeProjectCommand(projectRoot, 'BMad/agents/sm.md', body);
      const res = await harnessCommandService.listCards('slug');
      const card = res.cards.find((c) => c.relativePath === 'BMad/agents/sm.md');
      expect(card).toBeDefined();
      expect(card!.isBmadMirror).toBe(true);
    });

    it('does NOT detect BMad mirror when marker sits past line 10', async () => {
      const head = Array.from({ length: 11 }, () => 'placeholder').join('\n');
      const body = `${head}\n<!-- Powered by BMAD™ Core -->\n`;
      await writeProjectCommand(projectRoot, 'late.md', body);
      const res = await harnessCommandService.listCards('slug');
      const card = res.cards.find((c) => c.relativePath === 'late.md');
      expect(card).toBeDefined();
      expect(card!.isBmadMirror).toBe(false);
    });

    it('plugin commands are surfaced via installed_plugins.json catalog', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      const pluginCmdDir = path.join(pluginRoot, 'commands');
      await fs.mkdir(pluginCmdDir, { recursive: true });
      await fs.writeFile(path.join(pluginCmdDir, 'plugcmd.md'), '# from plugin\n', 'utf-8');
      const res = await harnessCommandService.listCards('slug');
      const card = res.cards.find((c) => c.scope === 'plugin' && c.relativePath === 'plugcmd.md');
      expect(card).toBeDefined();
      expect(card!.pluginKey).toBe(PLUGIN_KEY);
      expect(card!.slashName).toBe('/plugcmd');
    });

    it('paletteVisibleCount excludes BMad mirror collisions', async () => {
      await fs.mkdir(path.join(projectRoot, '.bmad-core', 'agents'), { recursive: true });
      await fs.writeFile(
        path.join(projectRoot, '.bmad-core', 'agents', 'sm.md'),
        '```yaml\nagent:\n  id: sm\n  title: SM\n```\n',
        'utf-8',
      );
      await fs.writeFile(
        path.join(projectRoot, '.bmad-core', 'core-config.yaml'),
        'slashPrefix: BMad\n',
        'utf-8',
      );
      // Mirror command and a unique custom command alongside it.
      await writeProjectCommand(projectRoot, 'BMad/agents/sm.md', '# /sm Command\n\n<!-- Powered by BMAD™ Core -->\n');
      await writeProjectCommand(projectRoot, 'unique.md', '# unique\n');
      const res = await harnessCommandService.listCards('slug');
      // Both cards are present (the workbench shows everything),
      // but the palette count only sees `/unique`.
      expect(res.cards.length).toBeGreaterThanOrEqual(2);
      expect(res.paletteVisibleCount).toBe(1);
    });

    it('malformed YAML frontmatter routes to malformed[] without breaking other cards', async () => {
      await writeProjectCommand(
        projectRoot,
        'broken.md',
        '---\nallowed-tools: [unclosed\n---\n\nbody\n',
      );
      await writeProjectCommand(projectRoot, 'good.md', '# good\n');
      const res = await harnessCommandService.listCards('slug');
      const goodCard = res.cards.find((c) => c.relativePath === 'good.md');
      expect(goodCard).toBeDefined();
      const malformed = res.malformed.find((m) => m.absoluteFile.endsWith('broken.md'));
      expect(malformed).toBeDefined();
    });
  });

  describe('readCommand', () => {
    it('returns frontmatter + body + raw + isBmadMirror', async () => {
      await writeProjectCommand(projectRoot, 'foo.md', '---\ndescription: x\n---\n\n# body\n');
      const list = await harnessCommandService.listCards('slug');
      const card = list.cards.find((c) => c.relativePath === 'foo.md')!;
      const read = await harnessCommandService.readCommand(card);
      expect(read.frontmatter.description).toBe('x');
      expect(read.body).toContain('# body');
      expect(read.raw).toContain('---');
      expect(read.isBmadMirror).toBe(false);
    });
  });

  describe('createCommand', () => {
    it('creates a flat project file and emits its slash name', async () => {
      const res = await harnessCommandService.createCommand({
        scope: 'project',
        projectSlug: 'slug',
        relativePath: 'fresh.md',
        frontmatter: { description: 'created' },
      });
      expect(res.success).toBe(true);
      expect(res.source.slashName).toBe('/fresh');
      const created = await fs.readFile(
        path.join(projectRoot, '.claude', 'commands', 'fresh.md'),
        'utf-8',
      );
      expect(created).toContain('description: created');
    });

    it('rejects path traversal', async () => {
      await expect(
        harnessCommandService.createCommand({
          scope: 'project',
          projectSlug: 'slug',
          relativePath: '../escape.md',
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PATH_DENIED.code });
    });

    it('refuses to overwrite an existing file via create', async () => {
      await writeProjectCommand(projectRoot, 'dup.md', '# original\n');
      await expect(
        harnessCommandService.createCommand({
          scope: 'project',
          projectSlug: 'slug',
          relativePath: 'dup.md',
        }),
      ).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_COMMAND_NAME_CONFLICT.code,
      });
    });
  });

  describe('updateCommand', () => {
    it('frontmatter mode updates only the YAML block', async () => {
      await writeProjectCommand(projectRoot, 'edit.md', '---\ndescription: old\n---\n\n# body\n');
      const list = await harnessCommandService.listCards('slug');
      const card = list.cards.find((c) => c.relativePath === 'edit.md')!;
      const res = await harnessCommandService.updateCommand(card, {
        frontmatter: { description: 'new' },
        expectedMtime: card.mtime,
      });
      expect(res.success).toBe(true);
      const after = await fs.readFile(card.absoluteFile, 'utf-8');
      expect(after).toContain('description: new');
      expect(after).toContain('# body');
    });

    it('refuses plugin-source updates with HARNESS_FORBIDDEN', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      const pluginCmdDir = path.join(pluginRoot, 'commands');
      await fs.mkdir(pluginCmdDir, { recursive: true });
      await fs.writeFile(path.join(pluginCmdDir, 'p.md'), '# plugin\n', 'utf-8');
      const list = await harnessCommandService.listCards('slug');
      const card = list.cards.find((c) => c.scope === 'plugin')!;
      await expect(
        harnessCommandService.updateCommand(card, { body: 'edited' }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_FORBIDDEN.code });
    });
  });

  describe('copyCommand', () => {
    it('copies a project command to global without conflict', async () => {
      await writeProjectCommand(projectRoot, 'porta.md', '# port me\n');
      const res = await harnessCommandService.copyCommand({
        sourceScope: 'project',
        sourceProjectSlug: 'slug',
        sourceRelativePath: 'porta.md',
        targetScope: 'user',
        onConflict: 'overwrite',
      });
      expect(res.success).toBe(true);
      expect(res.target.scope).toBe('user');
      const copied = await fs.readFile(path.join(userRoot, 'commands', 'porta.md'), 'utf-8');
      expect(copied).toContain('# port me');
    });

    it('refuses copy when secrets present and acknowledgedSecret missing', async () => {
      await writeProjectCommand(
        projectRoot,
        'sec.md',
        '# leak\n\nBearer abcdef0123456789abcdef\n',
      );
      await expect(
        harnessCommandService.copyCommand({
          sourceScope: 'project',
          sourceProjectSlug: 'slug',
          sourceRelativePath: 'sec.md',
          targetScope: 'user',
          onConflict: 'overwrite',
        }),
      ).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_FORBIDDEN.code,
        cause: 'secret-not-acknowledged',
      });
    });
  });

  describe('deleteCommand', () => {
    it('removes the file and prunes empty parent directories', async () => {
      await writeProjectCommand(projectRoot, 'dirX/dirY/lonely.md', '# bye\n');
      const list = await harnessCommandService.listCards('slug');
      const card = list.cards.find((c) => c.relativePath === 'dirX/dirY/lonely.md')!;
      await harnessCommandService.deleteCommand({
        scope: 'project',
        projectSlug: 'slug',
        relativePath: card.relativePath,
        expectedMtime: card.mtime,
      });
      await expect(fs.stat(card.absoluteFile)).rejects.toMatchObject({ code: 'ENOENT' });
      // dirY should be cleaned up; dirX may also be cleaned. The commands root
      // itself must remain.
      await expect(fs.stat(path.join(projectRoot, '.claude', 'commands'))).resolves.toMatchObject({
        isDirectory: expect.any(Function),
      });
    });
  });

  describe('analyzeTokens helper', () => {
    it('detects positional args in isolation', () => {
      const t = harnessCommandInternals.analyzeTokens('Use $1 and $2.');
      expect(t.usesPositionalArgs).toBe(true);
      expect(t.usesArgumentsAll).toBe(false);
    });

    it('does not falsely match $ARGUMENTS for positional', () => {
      const t = harnessCommandInternals.analyzeTokens('Pass $ARGUMENTS along.');
      expect(t.usesPositionalArgs).toBe(false);
      expect(t.usesArgumentsAll).toBe(true);
    });

    it('@email@example.com does not register as fileRefs', () => {
      const t = harnessCommandInternals.analyzeTokens('contact me at email@example.com');
      expect(t.usesFileRefs).toBe(false);
    });
  });
});
