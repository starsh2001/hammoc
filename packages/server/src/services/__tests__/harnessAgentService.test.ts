/**
 * Story 28.6: harnessAgentService unit tests.
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
  harnessAgentService,
  harnessAgentInternals,
} from '../harnessAgentService.js';
import { projectService } from '../projectService.js';

const PLUGIN_KEY = 'sample-plugin@market';

function buildAgent(opts: {
  name: string;
  description?: string;
  model?: string;
  color?: string;
  tools?: string[] | 'omit';
  body?: string;
}): string {
  const fmLines: string[] = [];
  fmLines.push(`name: ${opts.name}`);
  fmLines.push(`description: ${opts.description ?? 'a description'}`);
  fmLines.push(`model: ${opts.model ?? 'sonnet'}`);
  fmLines.push(`color: ${opts.color ?? 'blue'}`);
  if (opts.tools !== 'omit' && opts.tools !== undefined) {
    if (opts.tools.length === 0) {
      fmLines.push('tools: []');
    } else {
      fmLines.push(`tools: [${opts.tools.map((t) => `'${t}'`).join(', ')}]`);
    }
  }
  return `---\n${fmLines.join('\n')}\n---\n\n${opts.body ?? 'system prompt body'}\n`;
}

async function writeProjectAgent(
  projectRoot: string,
  rel: string,
  body: string,
): Promise<void> {
  const abs = path.join(projectRoot, '.claude', 'agents', rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body, 'utf-8');
}

async function writeUserAgent(userRoot: string, rel: string, body: string): Promise<void> {
  const abs = path.join(userRoot, 'agents', rel);
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

describe('harnessAgentService', () => {
  let userRoot: string;
  let projectRoot: string;
  let pluginRoot: string;

  beforeEach(async () => {
    userRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-user-'));
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-project-'));
    pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-plugin-'));
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
    it('empty project agents directory → no cards', async () => {
      const res = await harnessAgentService.listCards('slug');
      expect(res.cards).toHaveLength(0);
      expect(res.malformed).toHaveLength(0);
    });

    it('flat project agent with valid frontmatter → card', async () => {
      await writeProjectAgent(projectRoot, 'code-reviewer.md', buildAgent({ name: 'code-reviewer' }));
      const res = await harnessAgentService.listCards('slug');
      expect(res.cards).toHaveLength(1);
      const c = res.cards[0];
      expect(c.name).toBe('code-reviewer');
      expect(c.scope).toBe('project');
      expect(c.model).toBe('sonnet');
      expect(c.color).toBe('blue');
      expect(c.toolsState).toBe('omitted');
    });

    it('nested .md file is NOT picked up (flat-only scan)', async () => {
      await writeProjectAgent(projectRoot, 'sub/nested.md', buildAgent({ name: 'nested' }));
      const res = await harnessAgentService.listCards('slug');
      expect(res.cards).toHaveLength(0);
    });

    it('frontmatter.name mismatching file stem → malformed name-mismatch', async () => {
      await writeProjectAgent(projectRoot, 'foo.md', buildAgent({ name: 'bar' }));
      const res = await harnessAgentService.listCards('slug');
      expect(res.cards).toHaveLength(0);
      expect(res.malformed).toHaveLength(1);
      expect(res.malformed[0].reason).toBe('name-mismatch');
    });

    it('name failing the regex → malformed invalid-name-pattern', async () => {
      await writeProjectAgent(projectRoot, 'BAD.md', buildAgent({ name: 'BAD' }));
      const res = await harnessAgentService.listCards('slug');
      expect(res.malformed).toHaveLength(1);
      expect(res.malformed[0].reason).toBe('invalid-name-pattern');
    });

    it('invalid model enum → malformed invalid-model', async () => {
      await writeProjectAgent(
        projectRoot,
        'agent-x.md',
        buildAgent({ name: 'agent-x', model: 'gpt5' }),
      );
      const res = await harnessAgentService.listCards('slug');
      expect(res.malformed[0].reason).toBe('invalid-model');
    });

    it('invalid color enum → malformed invalid-color', async () => {
      await writeProjectAgent(
        projectRoot,
        'agent-y.md',
        buildAgent({ name: 'agent-y', color: 'orange' }),
      );
      const res = await harnessAgentService.listCards('slug');
      expect(res.malformed[0].reason).toBe('invalid-color');
    });

    it('empty description → malformed invalid-frontmatter', async () => {
      // Cannot use buildAgent with empty description (default is non-empty), write raw.
      const raw = '---\nname: empty-desc\ndescription: \nmodel: sonnet\ncolor: blue\n---\n\nbody\n';
      await writeProjectAgent(projectRoot, 'empty-desc.md', raw);
      const res = await harnessAgentService.listCards('slug');
      expect(res.malformed).toHaveLength(1);
      expect(res.malformed[0].reason).toBe('invalid-frontmatter');
    });

    it('same name in 3 scopes → cards from all three scopes', async () => {
      await writeProjectAgent(projectRoot, 'shared.md', buildAgent({ name: 'shared' }));
      await writeUserAgent(userRoot, 'shared.md', buildAgent({ name: 'shared' }));
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      await fs.mkdir(path.join(pluginRoot, 'agents'), { recursive: true });
      await fs.writeFile(
        path.join(pluginRoot, 'agents', 'shared.md'),
        buildAgent({ name: 'shared' }),
        'utf-8',
      );
      const res = await harnessAgentService.listCards('slug');
      const sharedCards = res.cards.filter((c) => c.name === 'shared');
      expect(sharedCards).toHaveLength(3);
      // Sort priority project > user > plugin
      expect(sharedCards.map((c) => c.scope)).toEqual(['project', 'user', 'plugin']);
    });

    it('plugin manifest agents field → enumerated even if /agents/ dir is empty', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      // No agents/ directory — only manifest declares them.
      await fs.mkdir(path.join(pluginRoot, '.claude-plugin'), { recursive: true });
      await fs.writeFile(
        path.join(pluginRoot, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'p', agents: ['agents/from-manifest.md'] }),
        'utf-8',
      );
      await fs.mkdir(path.join(pluginRoot, 'agents'), { recursive: true });
      await fs.writeFile(
        path.join(pluginRoot, 'agents', 'from-manifest.md'),
        buildAgent({ name: 'from-manifest' }),
        'utf-8',
      );
      const res = await harnessAgentService.listCards('slug');
      const card = res.cards.find((c) => c.name === 'from-manifest');
      expect(card).toBeDefined();
      expect(card!.scope).toBe('plugin');
    });

    it('plugin agents/*.md fallback when manifest is absent', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      await fs.mkdir(path.join(pluginRoot, 'agents'), { recursive: true });
      await fs.writeFile(
        path.join(pluginRoot, 'agents', 'plug-agent.md'),
        buildAgent({ name: 'plug-agent' }),
        'utf-8',
      );
      const res = await harnessAgentService.listCards('slug');
      const card = res.cards.find((c) => c.name === 'plug-agent' && c.scope === 'plugin');
      expect(card).toBeDefined();
      expect(card!.pluginKey).toBe(PLUGIN_KEY);
    });

    it('skill bundle agents (<installPath>/skills/<skill>/agents/*.md) are NOT enumerated', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      await fs.mkdir(path.join(pluginRoot, 'skills', 'skill-x', 'agents'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(pluginRoot, 'skills', 'skill-x', 'agents', 'inner.md'),
        buildAgent({ name: 'inner' }),
        'utf-8',
      );
      const res = await harnessAgentService.listCards('slug');
      expect(res.cards).toHaveLength(0);
    });

    it('hasExampleBlock — body with <example> matches', async () => {
      const body = '\nSee <example>case</example> here.';
      await writeProjectAgent(
        projectRoot,
        'with-example.md',
        buildAgent({ name: 'with-example', body }),
      );
      const res = await harnessAgentService.listCards('slug');
      const c = res.cards.find((x) => x.name === 'with-example')!;
      expect(c.hasExampleBlock).toBe(true);
    });

    it('hasExampleBlock — body without <example> does not match', async () => {
      await writeProjectAgent(
        projectRoot,
        'no-example.md',
        buildAgent({ name: 'no-example', body: 'plain body' }),
      );
      const res = await harnessAgentService.listCards('slug');
      const c = res.cards.find((x) => x.name === 'no-example')!;
      expect(c.hasExampleBlock).toBe(false);
    });

    it('toolsState — omitted when key absent', async () => {
      await writeProjectAgent(projectRoot, 'tools-omit.md', buildAgent({ name: 'tools-omit' }));
      const res = await harnessAgentService.listCards('slug');
      expect(res.cards.find((c) => c.name === 'tools-omit')!.toolsState).toBe('omitted');
    });

    it('toolsState — empty when tools is []', async () => {
      await writeProjectAgent(
        projectRoot,
        'tools-empty.md',
        buildAgent({ name: 'tools-empty', tools: [] }),
      );
      const res = await harnessAgentService.listCards('slug');
      const c = res.cards.find((x) => x.name === 'tools-empty')!;
      expect(c.toolsState).toBe('empty');
    });

    it('toolsState — populated when tools has entries', async () => {
      await writeProjectAgent(
        projectRoot,
        'tools-pop.md',
        buildAgent({ name: 'tools-pop', tools: ['Read', 'Edit'] }),
      );
      const res = await harnessAgentService.listCards('slug');
      const c = res.cards.find((x) => x.name === 'tools-pop')!;
      expect(c.toolsState).toBe('populated');
      expect(c.tools).toEqual(['Read', 'Edit']);
    });
  });

  describe('readAgent', () => {
    it('returns frontmatter + body + raw + toolsState', async () => {
      const raw = buildAgent({ name: 'reader-one', tools: ['Read'] });
      await writeProjectAgent(projectRoot, 'reader-one.md', raw);
      const list = await harnessAgentService.listCards('slug');
      const card = list.cards[0];
      const res = await harnessAgentService.readAgent(card);
      expect(res.frontmatter.name).toBe('reader-one');
      expect(res.toolsState).toBe('populated');
      expect(res.raw).toBe(raw);
    });

    it('throws HARNESS_AGENT_NOT_FOUND for missing file', async () => {
      const fakeLoc = {
        scope: 'project' as const,
        absoluteFile: path.join(projectRoot, '.claude', 'agents', 'ghost.md'),
        projectSlug: 'slug',
        name: 'ghost',
      };
      await expect(harnessAgentService.readAgent(fakeLoc)).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_AGENT_NOT_FOUND.code,
      });
    });
  });

  describe('createAgent', () => {
    it('creates a new agent with valid frontmatter', async () => {
      const res = await harnessAgentService.createAgent({
        scope: 'project',
        projectSlug: 'slug',
        name: 'new-agent',
        frontmatter: {
          name: 'new-agent',
          description: 'a desc',
          model: 'sonnet',
          color: 'blue',
        },
        body: 'system body',
      });
      expect(res.success).toBe(true);
      expect(res.source.name).toBe('new-agent');
      const filePath = path.join(projectRoot, '.claude', 'agents', 'new-agent.md');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('name: new-agent');
      expect(content).toContain('system body');
    });

    it('rejects when name fails the regex', async () => {
      await expect(
        harnessAgentService.createAgent({
          scope: 'project',
          projectSlug: 'slug',
          name: 'BAD',
          frontmatter: {
            name: 'BAD',
            description: 'd',
            model: 'sonnet',
            color: 'blue',
          },
        }),
      ).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
      });
    });

    it('rejects when name conflicts with an existing file', async () => {
      await writeProjectAgent(projectRoot, 'dup.md', buildAgent({ name: 'dup' }));
      await expect(
        harnessAgentService.createAgent({
          scope: 'project',
          projectSlug: 'slug',
          name: 'dup',
          frontmatter: {
            name: 'dup',
            description: 'd',
            model: 'sonnet',
            color: 'blue',
          },
        }),
      ).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_AGENT_NAME_CONFLICT.code,
      });
    });
  });

  describe('updateAgent — tools 3-state round-trip (AC5)', () => {
    it('omitted → empty (tools key written as [])', async () => {
      const raw = buildAgent({ name: 'roundtrip-a' });
      await writeProjectAgent(projectRoot, 'roundtrip-a.md', raw);
      const list = await harnessAgentService.listCards('slug');
      const card = list.cards[0];
      const res = await harnessAgentService.updateAgent(card, {
        frontmatter: {
          name: 'roundtrip-a',
          description: 'd',
          model: 'sonnet',
          color: 'blue',
        },
        toolsState: 'empty',
      });
      expect(res.toolsState).toBe('empty');
      const updated = await fs.readFile(card.absoluteFile, 'utf-8');
      expect(updated).toMatch(/tools: \[\s*\]/);
    });

    it('empty → omitted (tools key removed)', async () => {
      const raw = buildAgent({ name: 'roundtrip-b', tools: [] });
      await writeProjectAgent(projectRoot, 'roundtrip-b.md', raw);
      const list = await harnessAgentService.listCards('slug');
      const card = list.cards[0];
      const res = await harnessAgentService.updateAgent(card, {
        frontmatter: {
          name: 'roundtrip-b',
          description: 'd',
          model: 'sonnet',
          color: 'blue',
        },
        toolsState: 'omitted',
      });
      expect(res.toolsState).toBe('omitted');
      const updated = await fs.readFile(card.absoluteFile, 'utf-8');
      expect(updated).not.toMatch(/^tools:/m);
    });

    it('omitted → populated (array preserved)', async () => {
      const raw = buildAgent({ name: 'roundtrip-c' });
      await writeProjectAgent(projectRoot, 'roundtrip-c.md', raw);
      const list = await harnessAgentService.listCards('slug');
      const card = list.cards[0];
      const res = await harnessAgentService.updateAgent(card, {
        frontmatter: {
          name: 'roundtrip-c',
          description: 'd',
          model: 'sonnet',
          color: 'blue',
          tools: ['Read', 'Edit'],
        },
      });
      expect(res.toolsState).toBe('populated');
      const updated = await fs.readFile(card.absoluteFile, 'utf-8');
      expect(updated).toMatch(/tools:/);
      expect(updated).toMatch(/Read/);
      expect(updated).toMatch(/Edit/);
    });
  });

  describe('updateAgent — modes', () => {
    it('body-only patch keeps frontmatter intact', async () => {
      const raw = buildAgent({ name: 'body-mode', body: 'old body' });
      await writeProjectAgent(projectRoot, 'body-mode.md', raw);
      const list = await harnessAgentService.listCards('slug');
      const card = list.cards[0];
      await harnessAgentService.updateAgent(card, { body: 'new body' });
      const updated = await fs.readFile(card.absoluteFile, 'utf-8');
      expect(updated).toContain('name: body-mode');
      expect(updated).toContain('new body');
      expect(updated).not.toContain('old body');
    });

    it('plugin source rejected with HARNESS_FORBIDDEN', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      await fs.mkdir(path.join(pluginRoot, 'agents'), { recursive: true });
      await fs.writeFile(
        path.join(pluginRoot, 'agents', 'plug.md'),
        buildAgent({ name: 'plug' }),
        'utf-8',
      );
      const list = await harnessAgentService.listCards('slug');
      const card = list.cards.find((c) => c.scope === 'plugin')!;
      await expect(
        harnessAgentService.updateAgent(card, { body: 'x' }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_FORBIDDEN.code });
    });

    it('STALE_WRITE 충돌', async () => {
      const raw = buildAgent({ name: 'stale-write' });
      await writeProjectAgent(projectRoot, 'stale-write.md', raw);
      const list = await harnessAgentService.listCards('slug');
      const card = list.cards[0];
      await expect(
        harnessAgentService.updateAgent(card, {
          body: 'changed',
          expectedMtime: '1970-01-01T00:00:00Z',
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_STALE_WRITE.code });
    });
  });

  describe('copyAgent (AC6)', () => {
    it('copies project → user with rewritten frontmatter.name', async () => {
      const raw = buildAgent({ name: 'p2u' });
      await writeProjectAgent(projectRoot, 'p2u.md', raw);
      await harnessAgentService.copyAgent({
        sourceScope: 'project',
        sourceProjectSlug: 'slug',
        sourceName: 'p2u',
        targetScope: 'user',
        onConflict: 'overwrite',
      });
      const target = await fs.readFile(path.join(userRoot, 'agents', 'p2u.md'), 'utf-8');
      expect(target).toContain('name: p2u');
    });

    it('rejects when secret detected without acknowledgedSecret', async () => {
      const body = `---
name: secret-agent
description: do not share Bearer abcdefghijklmnopqrstuv1234567890
model: sonnet
color: blue
---

Body
`;
      await writeProjectAgent(projectRoot, 'secret-agent.md', body);
      await expect(
        harnessAgentService.copyAgent({
          sourceScope: 'project',
          sourceProjectSlug: 'slug',
          sourceName: 'secret-agent',
          targetScope: 'user',
          onConflict: 'overwrite',
        }),
      ).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_FORBIDDEN.code,
        cause: 'secret-not-acknowledged',
      });
    });

    it('plugin → project with rename + frontmatter.name updated', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      await fs.mkdir(path.join(pluginRoot, 'agents'), { recursive: true });
      await fs.writeFile(
        path.join(pluginRoot, 'agents', 'src.md'),
        buildAgent({ name: 'src' }),
        'utf-8',
      );
      // First copy the source so target exists.
      await harnessAgentService.copyAgent({
        sourceScope: 'plugin',
        sourcePluginKey: PLUGIN_KEY,
        sourceName: 'src',
        targetScope: 'project',
        targetProjectSlug: 'slug',
        onConflict: 'overwrite',
      });
      // Now rename copy.
      await harnessAgentService.copyAgent({
        sourceScope: 'plugin',
        sourcePluginKey: PLUGIN_KEY,
        sourceName: 'src',
        targetScope: 'project',
        targetProjectSlug: 'slug',
        targetName: 'renamed-src',
        onConflict: 'overwrite',
      });
      const renamed = await fs.readFile(
        path.join(projectRoot, '.claude', 'agents', 'renamed-src.md'),
        'utf-8',
      );
      expect(renamed).toContain('name: renamed-src');
    });

    it('skip on conflict returns skipped:true', async () => {
      await writeProjectAgent(projectRoot, 'dup.md', buildAgent({ name: 'dup' }));
      await writeUserAgent(userRoot, 'dup.md', buildAgent({ name: 'dup' }));
      const res = await harnessAgentService.copyAgent({
        sourceScope: 'project',
        sourceProjectSlug: 'slug',
        sourceName: 'dup',
        targetScope: 'user',
        onConflict: 'skip',
      });
      expect(res.skipped).toBe(true);
    });

    it('plugin source with ${CLAUDE_PLUGIN_ROOT} returns plugin-root-reference warning', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      const body = `---
name: with-root
description: refs \${CLAUDE_PLUGIN_ROOT}/x
model: sonnet
color: blue
---

Refers to \${CLAUDE_PLUGIN_ROOT}/scripts here.
`;
      await fs.mkdir(path.join(pluginRoot, 'agents'), { recursive: true });
      await fs.writeFile(path.join(pluginRoot, 'agents', 'with-root.md'), body, 'utf-8');
      const res = await harnessAgentService.copyAgent({
        sourceScope: 'plugin',
        sourcePluginKey: PLUGIN_KEY,
        sourceName: 'with-root',
        targetScope: 'project',
        targetProjectSlug: 'slug',
        onConflict: 'overwrite',
      });
      expect(res.warnings).toContain('plugin-root-reference');
    });
  });

  describe('deleteAgent', () => {
    it('deletes the file', async () => {
      await writeProjectAgent(projectRoot, 'remove-me.md', buildAgent({ name: 'remove-me' }));
      await harnessAgentService.deleteAgent({
        scope: 'project',
        projectSlug: 'slug',
        name: 'remove-me',
      });
      await expect(
        fs.stat(path.join(projectRoot, '.claude', 'agents', 'remove-me.md')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('rejects 404 for missing file', async () => {
      await expect(
        harnessAgentService.deleteAgent({
          scope: 'project',
          projectSlug: 'slug',
          name: 'never-existed',
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_AGENT_NOT_FOUND.code });
    });

    it('STALE_WRITE on mismatched mtime', async () => {
      await writeProjectAgent(projectRoot, 'stale-delete.md', buildAgent({ name: 'stale-delete' }));
      await expect(
        harnessAgentService.deleteAgent({
          scope: 'project',
          projectSlug: 'slug',
          name: 'stale-delete',
          expectedMtime: '1970-01-01T00:00:00Z',
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_STALE_WRITE.code });
    });
  });

  describe('secret heuristic', () => {
    it('positive — Bearer token', () => {
      expect(
        harnessAgentInternals.detectSecretsInText(
          'auth: Bearer abcdefghijklmnopqrstuv1234567890',
        ).matched,
      ).toBe(true);
    });

    it('positive — sk-prefixed token', () => {
      expect(
        harnessAgentInternals.detectSecretsInText(
          'key: sk-abcdefghijklmnopqrstuv1234',
        ).matched,
      ).toBe(true);
    });

    it('negative — environment variable reference is excluded', () => {
      expect(
        harnessAgentInternals.detectSecretsInText('value: ${SOME_ENV_VAR}').matched,
      ).toBe(false);
    });

    it('negative — short text below threshold', () => {
      expect(harnessAgentInternals.detectSecretsInText('hello').matched).toBe(false);
    });
  });

  describe('<example> match helper', () => {
    it('returns false for body without <example>', () => {
      expect(harnessAgentInternals.detectExampleBlock('plain text')).toBe(false);
    });

    it('returns true for body with single <example>', () => {
      expect(
        harnessAgentInternals.detectExampleBlock('See <example>case</example> here.'),
      ).toBe(true);
    });

    it('returns true for body with multiple <example>', () => {
      expect(
        harnessAgentInternals.detectExampleBlock(
          '<example>a</example>\n<example>b</example>',
        ),
      ).toBe(true);
    });
  });
});
