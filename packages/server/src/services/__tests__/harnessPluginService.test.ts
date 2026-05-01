/**
 * Story 28.1: harnessPluginService unit tests.
 *
 * User scope is redirected via HAMMOC_HARNESS_HOME_OVERRIDE so the real
 * ~/.claude is never touched. Fixtures mirror the real-disk sample
 * (frontend-design@claude-plugins-official scope=project,
 * context7@claude-plugins-official scope=user,
 * playwright@claude-plugins-official scope=user) so AC3 gating scenarios
 * reflect realistic data.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { harnessPluginService } from '../harnessPluginService.js';
import { projectService } from '../projectService.js';

const MARKET = 'claude-plugins-official';
// SAMPLE_PROJECT_PATH is initialised per-test in beforeEach so tests never
// touch a real on-disk path (~/.claude/...). Project-scope toggles need a
// real, writable directory so the structured-edit round-trip can land — we
// give them a sibling tmpdir.
let SAMPLE_PROJECT_PATH: string;

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

async function writeBundle(root: string, components: {
  skills?: string[];
  commands?: string[];
  agents?: string[];
  hooks?: Record<string, unknown[]>;
  mcpServers?: Record<string, unknown>;
  manifest?: Record<string, unknown>;
}) {
  await fs.mkdir(root, { recursive: true });
  if (components.manifest) {
    await writeJson(path.join(root, '.claude-plugin', 'plugin.json'), components.manifest);
  }
  if (components.skills) {
    for (const name of components.skills) {
      const dir = path.join(root, 'skills', name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'SKILL.md'), `# ${name}`);
    }
  }
  if (components.commands) {
    const dir = path.join(root, 'commands');
    await fs.mkdir(dir, { recursive: true });
    for (const name of components.commands) {
      await fs.writeFile(path.join(dir, `${name}.md`), `# ${name}`);
    }
  }
  if (components.agents) {
    const dir = path.join(root, 'agents');
    await fs.mkdir(dir, { recursive: true });
    for (const name of components.agents) {
      await fs.writeFile(path.join(dir, `${name}.md`), `# ${name}`);
    }
  }
  if (components.hooks) {
    await writeJson(path.join(root, 'hooks', 'hooks.json'), { hooks: components.hooks });
  }
  if (components.mcpServers) {
    await writeJson(path.join(root, '.mcp.json'), components.mcpServers);
  }
}

describe('harnessPluginService', () => {
  let tmpHome: string;
  let tmpProject: string;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'hps-user-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'hps-project-'));
    SAMPLE_PROJECT_PATH = tmpProject;
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = tmpHome;
    vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(SAMPLE_PROJECT_PATH);
  });

  afterEach(async () => {
    delete process.env.HAMMOC_HARNESS_HOME_OVERRIDE;
    vi.restoreAllMocks();
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  // ------ AC1: format tolerance + card assembly --------------------------

  describe('listCards — AC1 format tolerance', () => {
    it('parses array-form enabledPlugins and emits format=array', async () => {
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), {
        enabledPlugins: [`context7@${MARKET}`],
      });
      const res = await harnessPluginService.listCards();
      expect(res.enabledPluginsFormat).toBe('array');
      const context7 = res.cards.find((c) => c.name === 'context7');
      expect(context7?.enabled).toBe(true);
      const playwright = res.cards.find((c) => c.name === 'playwright');
      expect(playwright?.enabled).toBe(false);
    });

    it('parses object-form enabledPlugins and emits format=object', async () => {
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), {
        enabledPlugins: {
          [`context7@${MARKET}`]: true,
          [`playwright@${MARKET}`]: false,
        },
      });
      const res = await harnessPluginService.listCards();
      expect(res.enabledPluginsFormat).toBe('object');
      expect(res.cards.find((c) => c.name === 'context7')?.enabled).toBe(true);
      expect(res.cards.find((c) => c.name === 'playwright')?.enabled).toBe(false);
    });

    it('defaults to object format when enabledPlugins is missing', async () => {
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), { model: 'x' });
      const res = await harnessPluginService.listCards();
      expect(res.enabledPluginsFormat).toBe('object');
      expect(res.cards.every((c) => c.enabled === false)).toBe(true);
    });

    it('returns an empty list when installed_plugins.json is absent', async () => {
      const res = await harnessPluginService.listCards();
      expect(res.cards).toEqual([]);
      expect(res.enabledPluginsFormat).toBe('object');
    });
  });

  describe('listCards — card assembly', () => {
    it('counts skills/commands/agents accurately', async () => {
      await writeJson(path.join(tmpHome, 'plugins', 'installed_plugins.json'), {
        version: 2,
        plugins: {
          [`foo@${MARKET}`]: [
            {
              scope: 'user',
              installPath: path.join(tmpHome, 'plugins', 'cache', MARKET, 'foo', 'abc'),
              version: 'abc1234567',
              gitCommitSha: 'abc1234567',
              installedAt: '2026-01-01T00:00:00Z',
              lastUpdated: '2026-01-01T00:00:00Z',
            },
          ],
        },
      });
      await writeBundle(
        path.join(tmpHome, 'plugins', 'cache', MARKET, 'foo', 'abc'),
        { skills: ['a', 'b'], commands: ['c1', 'c2', 'c3'], manifest: { name: 'foo' } },
      );
      const res = await harnessPluginService.listCards();
      const card = res.cards.find((c) => c.name === 'foo');
      expect(card?.componentCounts).toMatchObject({
        skills: 2, commands: 3, agents: 0, hooks: 0, mcpServers: 0,
      });
      expect(card?.pluginType).toBe('standard');
      expect(card?.version).toBe('abc1234');
    });

    it('flags external-mcp when only .mcp.json is present', async () => {
      await writeJson(path.join(tmpHome, 'plugins', 'installed_plugins.json'), {
        version: 2,
        plugins: {
          [`mcp-only@${MARKET}`]: [
            {
              scope: 'user',
              installPath: path.join(tmpHome, 'plugins', 'cache', MARKET, 'mcp-only', 'sha'),
              version: 'sha',
              gitCommitSha: 'shashasha',
              installedAt: '2026-01-01T00:00:00Z',
              lastUpdated: '2026-01-01T00:00:00Z',
            },
          ],
        },
      });
      await writeBundle(
        path.join(tmpHome, 'plugins', 'cache', MARKET, 'mcp-only', 'sha'),
        { mcpServers: { ping: { command: 'ping' } } },
      );
      const res = await harnessPluginService.listCards();
      expect(res.cards[0]?.pluginType).toBe('external-mcp');
      expect(res.cards[0]?.componentCounts.mcpServers).toBe(1);
    });

    it('ignores non-server metadata keys in flat-map .mcp.json (MCP-COUNT-001 regression)', async () => {
      const install = path.join(tmpHome, 'plugins', 'cache', MARKET, 'flat-mcp', 'sha');
      await writeJson(path.join(tmpHome, 'plugins', 'installed_plugins.json'), {
        version: 2,
        plugins: {
          [`flat-mcp@${MARKET}`]: [
            {
              scope: 'user',
              installPath: install,
              version: 'sha',
              gitCommitSha: 'shashaaa',
              installedAt: '2026-01-01T00:00:00Z',
              lastUpdated: '2026-01-01T00:00:00Z',
            },
          ],
        },
      });
      // Flat-map layout (no mcpServers wrapper) with $schema / version noise
      // alongside a single legitimate server entry. Only the entry should be
      // counted.
      await fs.mkdir(install, { recursive: true });
      await writeJson(path.join(install, '.mcp.json'), {
        $schema: 'https://example/mcp.schema.json',
        version: '1.0.0',
        actualServer: { command: 'node', args: ['srv.js'] },
      });
      const res = await harnessPluginService.listCards();
      expect(res.cards[0]?.componentCounts.mcpServers).toBe(1);
    });

    it('falls back to zero counts when installPath lives outside userRoot', async () => {
      const outsidePath = await fs.mkdtemp(path.join(os.tmpdir(), 'hps-outside-'));
      try {
        await writeJson(path.join(tmpHome, 'plugins', 'installed_plugins.json'), {
          version: 2,
          plugins: {
            [`ghost@${MARKET}`]: [
              {
                scope: 'user',
                installPath: outsidePath,
                version: 'v',
                gitCommitSha: 'shavalue',
                installedAt: '2026-01-01T00:00:00Z',
                lastUpdated: '2026-01-01T00:00:00Z',
              },
            ],
          },
        });
        const res = await harnessPluginService.listCards();
        const ghost = res.cards.find((c) => c.name === 'ghost');
        expect(ghost?.componentCounts).toMatchObject({
          skills: 0, commands: 0, agents: 0, hooks: 0, mcpServers: 0,
        });
        expect(ghost?.pluginType).toBe('standard');
      } finally {
        await fs.rm(outsidePath, { recursive: true, force: true });
      }
    });
  });

  // ------ AC2 / AC3: toggle --------------------------------------------

  describe('toggleEnabled', () => {
    it('writes array format as array and preserves other keys', async () => {
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), {
        model: 'opus',
        enabledPlugins: [`playwright@${MARKET}`],
      });
      const res = await harnessPluginService.toggleEnabled({
        key: `context7@${MARKET}`,
        enabled: true,
      });
      expect(res.success).toBe(true);
      expect(res.appliedFormat).toBe('array');
      const raw = await fs.readFile(path.join(tmpHome, 'settings.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.model).toBe('opus');
      expect(Array.isArray(parsed.enabledPlugins)).toBe(true);
      expect(parsed.enabledPlugins).toContain(`context7@${MARKET}`);
      expect(parsed.enabledPlugins).toContain(`playwright@${MARKET}`);
    });

    it('removes the key (not sets false) in object format on disable', async () => {
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), {
        enabledPlugins: {
          [`context7@${MARKET}`]: true,
          [`playwright@${MARKET}`]: true,
        },
      });
      await harnessPluginService.toggleEnabled({
        key: `playwright@${MARKET}`,
        enabled: false,
      });
      const raw = await fs.readFile(path.join(tmpHome, 'settings.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.enabledPlugins).toEqual({ [`context7@${MARKET}`]: true });
      expect(parsed.enabledPlugins).not.toHaveProperty(`playwright@${MARKET}`);
    });

    it('creates enabledPlugins in object form when missing and preserves comments', async () => {
      await writeSampleCatalog(tmpHome);
      const settingsFile = path.join(tmpHome, 'settings.json');
      await fs.writeFile(
        settingsFile,
        '{\n  // comment preserved\n  "model": "opus"\n}\n',
        'utf-8',
      );
      await harnessPluginService.toggleEnabled({
        key: `context7@${MARKET}`,
        enabled: true,
      });
      const raw = await fs.readFile(settingsFile, 'utf-8');
      expect(raw).toContain('// comment preserved');
      expect(raw).toContain('"model"');
      const parsed = JSON.parse(stripComments(raw));
      expect(parsed.enabledPlugins).toEqual({ [`context7@${MARKET}`]: true });
    });

    it('throws HARNESS_PLUGIN_NOT_FOUND before scope gating for unknown keys', async () => {
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });
      await expect(
        harnessPluginService.toggleEnabled({ key: `ghost@${MARKET}`, enabled: true }, 'slug'),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PLUGIN_NOT_FOUND.code });
    });

    it('AC3: project-scope toggle writes to <project>/.claude/settings.json (not the global one)', async () => {
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });
      // Project's own .claude/settings.json starts empty.
      const projectSettingsFile = path.join(tmpProject, '.claude', 'settings.json');
      await writeJson(projectSettingsFile, { enabledPlugins: {} });

      const res = await harnessPluginService.toggleEnabled({
        key: `frontend-design@${MARKET}`,
        enabled: true,
      }, 'slug-for-sample-project');
      expect(res.success).toBe(true);

      // The project's settings.json got the new key, NOT the global one.
      const projectRaw = JSON.parse(await fs.readFile(projectSettingsFile, 'utf-8'));
      expect(projectRaw.enabledPlugins).toEqual({ [`frontend-design@${MARKET}`]: true });
      const userRaw = JSON.parse(await fs.readFile(path.join(tmpHome, 'settings.json'), 'utf-8'));
      expect(userRaw.enabledPlugins).toEqual({});
    });

    it('AC3: project-scope toggle adds enabledPlugins when project settings.json exists without one', async () => {
      // Mirrors the realistic state right after `claude /plugin install --scope project`:
      // the project's settings.json exists but does not yet contain an
      // enabledPlugins object until the very first toggle.
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });
      await writeJson(path.join(tmpProject, '.claude', 'settings.json'), { model: 'opus' });
      const res = await harnessPluginService.toggleEnabled({
        key: `frontend-design@${MARKET}`,
        enabled: true,
      }, 'slug-for-sample-project');
      expect(res.success).toBe(true);
      const projectRaw = JSON.parse(
        await fs.readFile(path.join(tmpProject, '.claude', 'settings.json'), 'utf-8'),
      );
      expect(projectRaw.enabledPlugins).toEqual({ [`frontend-design@${MARKET}`]: true });
      expect(projectRaw.model).toBe('opus'); // unrelated keys preserved
    });

    it('AC3: user-scope toggle continues writing to ~/.claude/settings.json (no project file touched)', async () => {
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });
      const res = await harnessPluginService.toggleEnabled({
        key: `context7@${MARKET}`,
        enabled: true,
      }, 'slug-for-sample-project');
      expect(res.success).toBe(true);
      const userRaw = JSON.parse(await fs.readFile(path.join(tmpHome, 'settings.json'), 'utf-8'));
      expect(userRaw.enabledPlugins).toEqual({ [`context7@${MARKET}`]: true });
      // Project settings.json must not exist (we never created it).
      await expect(
        fs.access(path.join(tmpProject, '.claude', 'settings.json')),
      ).rejects.toThrow();
    });

    it('AC3: card.settingsScope reflects which settings.json each toggle targets', async () => {
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });
      const res = await harnessPluginService.listCards('slug-for-sample-project');
      const fd = res.cards.find((c) => c.name === 'frontend-design');
      const ctx = res.cards.find((c) => c.name === 'context7');
      expect(fd?.settingsScope).toBe('project'); // project-scope entry, projectPath matches
      expect(ctx?.settingsScope).toBe('user');   // user-scope entry
    });

    it('AC3: 403 when project scope mismatches current project', async () => {
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });
      vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue('D:\\other-project');
      await expect(
        harnessPluginService.toggleEnabled({
          key: `frontend-design@${MARKET}`,
          enabled: true,
        }, 'slug-for-other'),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PLUGIN_SCOPE_DENIED.code });
    });

    it('AC3: 403 when projectPath is missing from a project-scope entry', async () => {
      await writeJson(path.join(tmpHome, 'plugins', 'installed_plugins.json'), {
        version: 2,
        plugins: {
          [`orphan@${MARKET}`]: [
            {
              scope: 'project',
              installPath: path.join(tmpHome, 'plugins', 'cache', MARKET, 'orphan', 'v'),
              version: 'v',
              gitCommitSha: 'vvvvvvv',
              installedAt: '2026-01-01T00:00:00Z',
              lastUpdated: '2026-01-01T00:00:00Z',
              // projectPath intentionally omitted
            },
          ],
        },
      });
      await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });
      await expect(
        harnessPluginService.toggleEnabled({
          key: `orphan@${MARKET}`,
          enabled: true,
        }, 'slug'),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PLUGIN_SCOPE_DENIED.code });
    });

    it('AC3: 403 when no project context is supplied but entry is project-scoped', async () => {
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });
      await expect(
        harnessPluginService.toggleEnabled({
          key: `frontend-design@${MARKET}`,
          enabled: true,
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PLUGIN_SCOPE_DENIED.code });
    });

    it('AC3: allows user-scope toggle without a project context', async () => {
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });
      const res = await harnessPluginService.toggleEnabled({
        key: `context7@${MARKET}`,
        enabled: true,
      });
      expect(res.success).toBe(true);
    });

    it('AC2: returns HARNESS_STALE_WRITE when expectedMtime drifts', async () => {
      await writeSampleCatalog(tmpHome);
      await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });
      await expect(
        harnessPluginService.toggleEnabled({
          key: `context7@${MARKET}`,
          enabled: true,
          expectedMtime: '1999-01-01T00:00:00.000Z',
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_STALE_WRITE.code });
    });
  });
});

/**
 * Mirrors the live disk sample from the story dev-notes. Three plugins share
 * one marketplace; one is scope=project, two are scope=user. A marketplace
 * metadata file with a "development" category is written so the card's
 * `category` field is populated.
 */
async function writeSampleCatalog(tmpHome: string): Promise<void> {
  const frontendInstall = path.join(tmpHome, 'plugins', 'cache', MARKET, 'frontend-design', 'aa296ec');
  const context7Install = path.join(tmpHome, 'plugins', 'cache', MARKET, 'context7', 'aaa1111');
  const playwrightInstall = path.join(tmpHome, 'plugins', 'cache', MARKET, 'playwright', 'bbb2222');

  await writeJson(path.join(tmpHome, 'plugins', 'installed_plugins.json'), {
    version: 2,
    plugins: {
      [`frontend-design@${MARKET}`]: [
        {
          scope: 'project',
          installPath: frontendInstall,
          version: 'aa296ec',
          gitCommitSha: 'aa296ec81e8c',
          installedAt: '2026-04-01T00:00:00Z',
          lastUpdated: '2026-04-01T00:00:00Z',
          projectPath: SAMPLE_PROJECT_PATH,
        },
      ],
      [`context7@${MARKET}`]: [
        {
          scope: 'user',
          installPath: context7Install,
          version: 'aaa1111',
          gitCommitSha: 'aaa1111aaaa',
          installedAt: '2026-04-01T00:00:00Z',
          lastUpdated: '2026-04-01T00:00:00Z',
        },
      ],
      [`playwright@${MARKET}`]: [
        {
          scope: 'user',
          installPath: playwrightInstall,
          version: 'bbb2222',
          gitCommitSha: 'bbb2222bbbb',
          installedAt: '2026-04-01T00:00:00Z',
          lastUpdated: '2026-04-01T00:00:00Z',
        },
      ],
    },
  });

  await writeJson(path.join(tmpHome, 'plugins', 'known_marketplaces.json'), {
    [MARKET]: {
      source: { source: 'github' },
      installLocation: path.join(tmpHome, 'plugins', 'marketplaces', MARKET),
      lastUpdated: '2026-04-01T00:00:00Z',
    },
  });

  await writeJson(
    path.join(tmpHome, 'plugins', 'marketplaces', MARKET, '.claude-plugin', 'marketplace.json'),
    {
      plugins: [
        { name: 'frontend-design', category: 'development' },
        { name: 'context7', category: 'productivity' },
        { name: 'playwright', category: 'testing' },
      ],
    },
  );

  await writeBundle(frontendInstall, { manifest: { name: 'frontend-design' }, skills: ['a'] });
  await writeBundle(context7Install, { manifest: { name: 'context7' }, commands: ['ctx'] });
  await writeBundle(playwrightInstall, { manifest: { name: 'playwright' }, commands: ['pw'] });
}

function stripComments(input: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\' && i + 1 < input.length) { out += next; i += 2; continue; }
      if (ch === '"') inString = false;
      i += 1; continue;
    }
    if (ch === '"') { inString = true; out += ch; i += 1; continue; }
    if (ch === '/' && next === '/') { i += 2; while (i < input.length && input[i] !== '\n') i += 1; continue; }
    if (ch === '/' && next === '*') { i += 2; while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1; i += 2; continue; }
    out += ch;
    i += 1;
  }
  return out;
}
