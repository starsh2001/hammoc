/**
 * Story 31.4: marketplaceService unit tests.
 *
 * User scope is redirected via HAMMOC_HARNESS_HOME_OVERRIDE so the real
 * ~/.claude is never touched. Fixtures mirror the real-disk schema:
 * known_marketplaces.json → marketplaces/<name>/.claude-plugin/marketplace.json
 * (plugins[] with `source` prefixes) + installed_plugins.json (version:2 array
 * entries). Covers AC1.b/c (catalog + type-by-source), AC1.d (installed join),
 * AC5 (per-market parse isolation), AC6 (format warning), and best-effort
 * component counting from the cloned market repo source dir.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { marketplaceService } from '../marketplaceService.js';
import { projectService } from '../projectService.js';

const MARKET = 'claude-plugins-official';
const MARKET2 = 'second-market';
let SAMPLE_PROJECT_PATH: string;

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

async function writeRaw(file: string, raw: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, raw, 'utf-8');
}

describe('marketplaceService.listCatalog', () => {
  let tmpHome: string;
  let tmpProject: string;

  /** Path to a market's marketplace.json under the tmp user root. */
  function marketManifestPath(market: string): string {
    return path.join(tmpHome, 'plugins', 'marketplaces', market, '.claude-plugin', 'marketplace.json');
  }

  async function writeKnown(markets: string[]): Promise<void> {
    const obj: Record<string, unknown> = {};
    for (const m of markets) obj[m] = { source: { source: 'github', repo: `anthropics/${m}` } };
    await writeJson(path.join(tmpHome, 'plugins', 'known_marketplaces.json'), obj);
  }

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'mkt-user-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'mkt-project-'));
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

  it('returns an empty catalog when known_marketplaces.json is absent', async () => {
    const res = await marketplaceService.listCatalog();
    expect(res).toEqual({ marketplaces: [], entries: [], errors: [] });
  });

  it('parses plugins[] into catalog entries with mapped fields (AC1.b)', async () => {
    await writeKnown([MARKET]);
    await writeJson(marketManifestPath(MARKET), {
      name: MARKET,
      plugins: [
        {
          name: 'frontend-design',
          description: 'UI helper',
          version: '1.2.0',
          author: { name: 'Anthropic', email: 'support@anthropic.com' },
          category: 'development',
          source: './plugins/frontend-design',
        },
      ],
    });

    const res = await marketplaceService.listCatalog();
    expect(res.marketplaces).toEqual([MARKET]);
    expect(res.errors).toEqual([]);
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]).toMatchObject({
      key: 'frontend-design@claude-plugins-official',
      name: 'frontend-design',
      marketplace: MARKET,
      description: 'UI helper',
      version: '1.2.0',
      author: { name: 'Anthropic', email: 'support@anthropic.com' },
      category: 'development',
      source: './plugins/frontend-design',
      pluginType: 'standard',
      installed: false,
    });
  });

  it('decides pluginType from the source path prefix (AC1.c)', async () => {
    await writeKnown([MARKET]);
    await writeJson(marketManifestPath(MARKET), {
      plugins: [
        { name: 'typescript-lsp', source: './plugins/typescript-lsp' },
        { name: 'greptile', source: './external_plugins/greptile' },
        { name: 'nosource' },
      ],
    });

    const res = await marketplaceService.listCatalog();
    const byName = Object.fromEntries(res.entries.map((e) => [e.name, e.pluginType]));
    expect(byName['typescript-lsp']).toBe('standard');
    expect(byName.greptile).toBe('external-mcp');
    expect(byName.nosource).toBe('standard'); // default when no source
  });

  it('marks installed=true for a user-scope installed key (AC1.d)', async () => {
    await writeKnown([MARKET]);
    await writeJson(marketManifestPath(MARKET), {
      plugins: [
        { name: 'context7', source: './external_plugins/context7' },
        { name: 'unused', source: './plugins/unused' },
      ],
    });
    await writeJson(path.join(tmpHome, 'plugins', 'installed_plugins.json'), {
      version: 2,
      plugins: {
        'context7@claude-plugins-official': [
          { scope: 'user', installPath: 'x', version: 'a', installedAt: 't', lastUpdated: 't', gitCommitSha: 'a' },
        ],
      },
    });

    const res = await marketplaceService.listCatalog();
    const byName = Object.fromEntries(res.entries.map((e) => [e.name, e.installed]));
    expect(byName.context7).toBe(true);
    expect(byName.unused).toBe(false);
    expect(res.formatWarning).toBeUndefined();
  });

  it('matches project-scope installs only for the current project (AC1.d)', async () => {
    await writeKnown([MARKET]);
    await writeJson(marketManifestPath(MARKET), {
      plugins: [
        { name: 'matches', source: './plugins/matches' },
        { name: 'other-project', source: './plugins/other-project' },
      ],
    });
    await writeJson(path.join(tmpHome, 'plugins', 'installed_plugins.json'), {
      version: 2,
      plugins: {
        'matches@claude-plugins-official': [
          { scope: 'project', projectPath: SAMPLE_PROJECT_PATH, installPath: 'x', version: 'a', installedAt: 't', lastUpdated: 't', gitCommitSha: 'a' },
        ],
        'other-project@claude-plugins-official': [
          { scope: 'project', projectPath: path.join(os.tmpdir(), 'some-other-dir'), installPath: 'x', version: 'a', installedAt: 't', lastUpdated: 't', gitCommitSha: 'a' },
        ],
      },
    });

    const res = await marketplaceService.listCatalog('proj-slug');
    const byName = Object.fromEntries(res.entries.map((e) => [e.name, e.installed]));
    expect(byName.matches).toBe(true);
    expect(byName['other-project']).toBe(false);
  });

  it('isolates a malformed marketplace.json to errors[] and renders the rest (AC5)', async () => {
    await writeKnown([MARKET, MARKET2]);
    await writeRaw(marketManifestPath(MARKET), '{ this is : not json ]');
    await writeJson(marketManifestPath(MARKET2), {
      plugins: [{ name: 'good', source: './plugins/good' }],
    });

    const res = await marketplaceService.listCatalog();
    expect(res.errors).toEqual([{ marketplace: MARKET, code: 'HARNESS_PARSE_ERROR' }]);
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0].name).toBe('good');
  });

  it('reports a missing marketplace.json as a per-market error (AC5)', async () => {
    await writeKnown([MARKET]);
    // no marketplace.json written for MARKET
    const res = await marketplaceService.listCatalog();
    expect(res.errors).toEqual([{ marketplace: MARKET, code: 'HARNESS_FILE_NOT_FOUND' }]);
    expect(res.entries).toEqual([]);
  });

  it('emits a format warning for an unrecognized installed_plugins.json version and degrades (AC6)', async () => {
    await writeKnown([MARKET]);
    await writeJson(marketManifestPath(MARKET), {
      plugins: [{ name: 'context7', source: './external_plugins/context7' }],
    });
    await writeJson(path.join(tmpHome, 'plugins', 'installed_plugins.json'), {
      version: 99,
      plugins: { 'context7@claude-plugins-official': [{ scope: 'user' }] },
    });

    const res = await marketplaceService.listCatalog();
    expect(res.formatWarning).toEqual({ detectedVersion: 99, reason: 'unrecognizedVersion' });
    // catalog still renders
    expect(res.entries).toHaveLength(1);
  });

  it('emits a parseError format warning when installed_plugins.json is malformed (AC6)', async () => {
    await writeKnown([MARKET]);
    await writeJson(marketManifestPath(MARKET), {
      plugins: [{ name: 'context7', source: './external_plugins/context7' }],
    });
    await writeRaw(path.join(tmpHome, 'plugins', 'installed_plugins.json'), '{ broken');

    const res = await marketplaceService.listCatalog();
    expect(res.formatWarning).toEqual({ reason: 'parseError' });
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0].installed).toBe(false);
  });

  it('computes best-effort component counts from the market repo source dir (AC1.c)', async () => {
    await writeKnown([MARKET]);
    await writeJson(marketManifestPath(MARKET), {
      plugins: [{ name: 'rich', source: './plugins/rich' }],
    });
    const srcDir = path.join(tmpHome, 'plugins', 'marketplaces', MARKET, 'plugins', 'rich');
    await fs.mkdir(path.join(srcDir, 'skills', 'alpha'), { recursive: true });
    await fs.writeFile(path.join(srcDir, 'skills', 'alpha', 'SKILL.md'), '# alpha');
    await fs.mkdir(path.join(srcDir, 'commands'), { recursive: true });
    await fs.writeFile(path.join(srcDir, 'commands', 'do.md'), '# do');
    await writeJson(path.join(srcDir, '.mcp.json'), { mcpServers: { s1: { command: 'x' }, s2: { url: 'y' } } });

    const res = await marketplaceService.listCatalog();
    expect(res.entries[0].componentCounts).toEqual({
      skills: 1, commands: 1, agents: 0, hooks: 0, mcpServers: 2,
    });
  });

  it('omits component counts when the source dir is absent but keeps the type badge (AC1.c)', async () => {
    await writeKnown([MARKET]);
    await writeJson(marketManifestPath(MARKET), {
      plugins: [{ name: 'ghost', source: './plugins/ghost' }],
    });
    // no source dir created
    const res = await marketplaceService.listCatalog();
    expect(res.entries[0].componentCounts).toBeUndefined();
    expect(res.entries[0].pluginType).toBe('standard');
  });

  it('has no installed flags and no warning when installed_plugins.json is absent', async () => {
    await writeKnown([MARKET]);
    await writeJson(marketManifestPath(MARKET), {
      plugins: [{ name: 'context7', source: './external_plugins/context7' }],
    });
    const res = await marketplaceService.listCatalog();
    expect(res.entries[0].installed).toBe(false);
    expect(res.formatWarning).toBeUndefined();
  });
});
