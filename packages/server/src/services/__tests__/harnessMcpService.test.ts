/**
 * Story 28.3: harnessMcpService unit tests.
 *
 * User scope is redirected via HAMMOC_HARNESS_HOME_OVERRIDE so the real
 * ~/.claude is never touched. Project scope is mocked through `projectService`.
 * Plugin scope is exercised through a hand-written installed_plugins.json that
 * points at a separate temp dir.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { HARNESS_ERRORS } from '@hammoc/shared';
import {
  detectSecretsInConfig,
  harnessMcpService,
  resolveSourceLocation,
} from '../harnessMcpService.js';
import { projectService } from '../projectService.js';

const PLUGIN_KEY = 'sample-plugin@market';

async function writeProjectMcp(projectRoot: string, content: object): Promise<void> {
  await fs.writeFile(path.join(projectRoot, '.mcp.json'), JSON.stringify(content, null, 2), 'utf-8');
}

async function writeUserMcp(userRoot: string, content: object): Promise<void> {
  await fs.writeFile(path.join(userRoot, '.mcp.json'), JSON.stringify(content, null, 2), 'utf-8');
}

async function writePluginMcp(pluginRoot: string, content: object): Promise<void> {
  await fs.writeFile(path.join(pluginRoot, '.mcp.json'), JSON.stringify(content, null, 2), 'utf-8');
}

async function writePluginManifest(pluginRoot: string, content: object): Promise<void> {
  const dir = path.join(pluginRoot, '.claude-plugin');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify(content, null, 2), 'utf-8');
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

describe('harnessMcpService', () => {
  let userRoot: string;
  let projectRoot: string;
  let pluginRoot: string;

  beforeEach(async () => {
    userRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-user-'));
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-project-'));
    pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-plugin-'));
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
    it('renders all four type variants as cards with the correct activeType', async () => {
      await writeProjectMcp(projectRoot, {
        mcpServers: {
          stdioServer: { command: 'node', args: ['index.js'] },
          sseServer: { type: 'sse', url: 'https://sse.example.com' },
          httpServer: { type: 'http', url: 'https://http.example.com', headers: { X: 'y' } },
          wsServer: { type: 'ws', url: 'wss://ws.example.com' },
        },
      });

      const res = await harnessMcpService.listCards('slug');
      const byName = Object.fromEntries(res.cards.map((c) => [c.name, c]));
      expect(byName.stdioServer.activeType).toBe('stdio');
      expect(byName.sseServer.activeType).toBe('sse');
      expect(byName.httpServer.activeType).toBe('http');
      expect(byName.wsServer.activeType).toBe('ws');
    });

    it('treats type-omitted entries as stdio', async () => {
      await writeProjectMcp(projectRoot, {
        mcpServers: { foo: { command: 'echo', args: ['hi'] } },
      });

      const res = await harnessMcpService.listCards('slug');
      expect(res.cards[0].activeType).toBe('stdio');
      // The original config has no type field — the card surfaces stdio without
      // mutating the underlying source.
      expect(res.cards[0].sources[0].config.type).toBeUndefined();
    });

    it('merges 3 sources with project priority and reports activeScope=project', async () => {
      await writeProjectMcp(projectRoot, { mcpServers: { shared: { command: 'p' } } });
      await writeUserMcp(userRoot, { mcpServers: { shared: { command: 'u' } } });
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      // Plugin .mcp.json is the unwrapped form (no mcpServers wrapper).
      await writePluginMcp(pluginRoot, { shared: { command: 'pl' } });

      const res = await harnessMcpService.listCards('slug');

      expect(res.cards).toHaveLength(1);
      expect(res.cards[0].activeScope).toBe('project');
      expect(res.cards[0].sources).toHaveLength(3);
      expect(res.cards[0].sources.map((s) => s.scope)).toEqual([
        'project',
        'user',
        'plugin',
      ]);
    });

    it('reads plugin servers from both .mcp.json and plugin.json.mcpServers', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      await writePluginMcp(pluginRoot, { fromMcp: { command: 'a' } });
      await writePluginManifest(pluginRoot, {
        name: 'sample',
        mcpServers: { fromManifest: { type: 'http', url: 'https://x.example.com' } },
      });

      const res = await harnessMcpService.listCards();

      const names = res.cards.map((c) => c.name).sort();
      expect(names).toEqual(['fromManifest', 'fromMcp']);
    });

    it('records malformed entries separately and excludes them from cards', async () => {
      await fs.writeFile(path.join(userRoot, '.mcp.json'), 'not json {{{', 'utf-8');

      const res = await harnessMcpService.listCards();

      expect(res.malformed.length).toBeGreaterThan(0);
      expect(res.malformed[0].scope).toBe('user');
    });

    it('reports the spike outcomes via userFileKind / disableStrategy', async () => {
      const res = await harnessMcpService.listCards();
      expect(res.userFileKind).toBe('mcp.json');
      expect(res.disableStrategy).toBe('backup');
    });

    it('marks backup-file entries as disabledByBackup and reports enabled=false', async () => {
      await fs.writeFile(
        path.join(userRoot, 'mcp.disabled.json'),
        JSON.stringify({ mcpServers: { backed: { command: 'echo' } } }),
        'utf-8',
      );

      const res = await harnessMcpService.listCards();
      const card = res.cards.find((c) => c.name === 'backed');
      expect(card).toBeDefined();
      expect(card!.enabled).toBe(false);
      expect(card!.sources[0].disabledByBackup).toBe(true);
    });
  });

  describe('readServer', () => {
    it('returns config + raw + mtime for an existing entry', async () => {
      await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'echo' } } });
      const source = await resolveSourceLocation({ scope: 'user', name: 'foo' });
      const res = await harnessMcpService.readServer(source, 'foo');
      expect(res.config.command).toBe('echo');
      expect(res.raw).toContain('"command": "echo"');
      expect(res.mtime).toBeTruthy();
      expect(res.disabledByBackup).toBe(false);
    });

    it('throws HARNESS_MCP_NOT_FOUND for missing names', async () => {
      await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'echo' } } });
      const source = await resolveSourceLocation({ scope: 'user', name: 'missing' });
      await expect(harnessMcpService.readServer(source, 'missing')).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_MCP_NOT_FOUND.code,
      });
    });
  });

  describe('updateServer', () => {
    it('saves a config change for stdio', async () => {
      await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'old' } } });
      const source = await resolveSourceLocation({ scope: 'user', name: 'foo' });
      const res = await harnessMcpService.updateServer(source, 'foo', {
        config: { command: 'new', args: ['flag'] },
      });
      expect(res.success).toBe(true);
      const onDisk = JSON.parse(await fs.readFile(path.join(userRoot, '.mcp.json'), 'utf-8'));
      expect(onDisk.mcpServers.foo.command).toBe('new');
      expect(onDisk.mcpServers.foo.args).toEqual(['flag']);
    });

    it('saves a raw payload as the entire server object', async () => {
      await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'old' } } });
      const source = await resolveSourceLocation({ scope: 'user', name: 'foo' });
      await harnessMcpService.updateServer(source, 'foo', {
        raw: '{"type":"http","url":"https://example.com"}',
      });
      const onDisk = JSON.parse(await fs.readFile(path.join(userRoot, '.mcp.json'), 'utf-8'));
      expect(onDisk.mcpServers.foo.type).toBe('http');
      expect(onDisk.mcpServers.foo.url).toBe('https://example.com');
    });

    it('refuses to write plugin-scope entries', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      await writePluginMcp(pluginRoot, { foo: { command: 'pl' } });
      const source = await resolveSourceLocation({
        scope: 'plugin',
        name: 'foo',
        pluginKey: PLUGIN_KEY,
      });
      await expect(
        harnessMcpService.updateServer(source, 'foo', { config: { command: 'new' } }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_FORBIDDEN.code });
    });

    it('toggles a server off (backup move) and back on', async () => {
      await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'echo' } } });
      const source = await resolveSourceLocation({ scope: 'user', name: 'foo' });
      // Disable
      await harnessMcpService.updateServer(source, 'foo', { enabled: false });
      const mainAfterDisable = JSON.parse(
        await fs.readFile(path.join(userRoot, '.mcp.json'), 'utf-8'),
      );
      expect(mainAfterDisable.mcpServers.foo).toBeUndefined();
      const backupAfterDisable = JSON.parse(
        await fs.readFile(path.join(userRoot, 'mcp.disabled.json'), 'utf-8'),
      );
      expect(backupAfterDisable.mcpServers.foo.command).toBe('echo');
      // Enable
      await harnessMcpService.updateServer(source, 'foo', { enabled: true });
      const mainAfterEnable = JSON.parse(
        await fs.readFile(path.join(userRoot, '.mcp.json'), 'utf-8'),
      );
      expect(mainAfterEnable.mcpServers.foo.command).toBe('echo');
    });

    it('rejects STALE_WRITE when expectedMtime mismatches', async () => {
      await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'echo' } } });
      const source = await resolveSourceLocation({ scope: 'user', name: 'foo' });
      await expect(
        harnessMcpService.updateServer(source, 'foo', {
          config: { command: 'new' },
          expectedMtime: '1990-01-01T00:00:00.000Z',
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_STALE_WRITE.code });
    });
  });

  describe('copyServer (AC3, AC4)', () => {
    it('copies user → project preserving environment variable references', async () => {
      await writeUserMcp(userRoot, {
        mcpServers: {
          gh: {
            type: 'http',
            url: 'https://api.github.com/mcp',
            headers: { Authorization: 'Bearer ${GH_TOKEN}' },
          },
        },
      });
      await writeProjectMcp(projectRoot, { mcpServers: {} });
      const res = await harnessMcpService.copyServer({
        sourceScope: 'user',
        sourceName: 'gh',
        targetScope: 'project',
        targetProjectSlug: 'slug',
        targetName: 'gh',
        onConflict: 'overwrite',
      });
      expect(res.success).toBe(true);
      const onDisk = JSON.parse(await fs.readFile(path.join(projectRoot, '.mcp.json'), 'utf-8'));
      expect(onDisk.mcpServers.gh.headers.Authorization).toBe('Bearer ${GH_TOKEN}');
    });

    it('refuses copy with HARNESS_FORBIDDEN when secrets are unacknowledged', async () => {
      await writeUserMcp(userRoot, {
        mcpServers: {
          gh: {
            type: 'http',
            url: 'https://example.com',
            headers: { Authorization: 'Bearer ghp_AbcdefghIJKLMNOPQRST' },
          },
        },
      });
      await writeProjectMcp(projectRoot, { mcpServers: {} });
      await expect(
        harnessMcpService.copyServer({
          sourceScope: 'user',
          sourceName: 'gh',
          targetScope: 'project',
          targetProjectSlug: 'slug',
          targetName: 'gh',
          onConflict: 'overwrite',
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_FORBIDDEN.code });
    });

    it('attaches plugin-root-reference warning when copying plugin server', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      await writePluginMcp(pluginRoot, {
        local: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server.js'] },
      });
      await writeUserMcp(userRoot, { mcpServers: {} });
      const res = await harnessMcpService.copyServer({
        sourceScope: 'plugin',
        sourcePluginKey: PLUGIN_KEY,
        sourceFileKind: 'mcp.json',
        sourceName: 'local',
        targetScope: 'user',
        targetName: 'local',
        onConflict: 'overwrite',
      });
      expect(res.warnings).toContain('plugin-root-reference');
    });

    it('returns skipped=true when onConflict=skip and the target exists', async () => {
      await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'u' } } });
      await writeProjectMcp(projectRoot, { mcpServers: { foo: { command: 'p' } } });
      const res = await harnessMcpService.copyServer({
        sourceScope: 'user',
        sourceName: 'foo',
        targetScope: 'project',
        targetProjectSlug: 'slug',
        targetName: 'foo',
        onConflict: 'skip',
      });
      expect(res.skipped).toBe(true);
    });

    it('rejects rename collision with HARNESS_MCP_NAME_CONFLICT', async () => {
      await writeUserMcp(userRoot, { mcpServers: { src: { command: 'u' } } });
      await writeProjectMcp(projectRoot, { mcpServers: { dst: { command: 'p' } } });
      await expect(
        harnessMcpService.copyServer({
          sourceScope: 'user',
          sourceName: 'src',
          targetScope: 'project',
          targetProjectSlug: 'slug',
          targetName: 'dst',
          onConflict: 'rename',
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_MCP_NAME_CONFLICT.code });
    });
  });

  describe('deleteServer', () => {
    it('removes the entry from disk', async () => {
      await writeUserMcp(userRoot, {
        mcpServers: { keep: { command: 'a' }, drop: { command: 'b' } },
      });
      const source = await resolveSourceLocation({ scope: 'user', name: 'drop' });
      await harnessMcpService.deleteServer(source, 'drop', { scope: 'user' });
      const onDisk = JSON.parse(await fs.readFile(path.join(userRoot, '.mcp.json'), 'utf-8'));
      expect(onDisk.mcpServers.drop).toBeUndefined();
      expect(onDisk.mcpServers.keep).toBeDefined();
    });

    it('refuses to delete plugin entries', async () => {
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      await writePluginMcp(pluginRoot, { foo: { command: 'pl' } });
      const source = await resolveSourceLocation({
        scope: 'plugin',
        name: 'foo',
        pluginKey: PLUGIN_KEY,
      });
      await expect(
        harnessMcpService.deleteServer(source, 'foo', { scope: 'project' }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_FORBIDDEN.code });
    });
  });

  describe('detectSecretsInConfig', () => {
    it('matches Bearer / sk- / AKIA / xoxb / long base64', async () => {
      const res = detectSecretsInConfig({
        env: {
          BEARER: 'Bearer aaaaaaaaaaaaaaaaaaaaaaaa',
          STRIPE: 'sk-aaaaaaaaaaaaaaaaaaaaaaaa',
          AWS: 'AKIAABCDEFGHIJKLMNOP',
          SLACK: 'xoxb-1234567890-abcdefghij',
          BIG: 'aGVsbG93b3JsZHRoaXNpc2FzZWNyZXR0b2tlbg==',
        },
      });
      expect(res.matched).toBe(true);
      expect(res.paths.length).toBe(5);
    });

    it('excludes ${ENV} references and short plaintext', async () => {
      const res = detectSecretsInConfig({
        env: {
          REF: '${TOKEN}',
          SHORT: 'abcd1234',
        },
      });
      expect(res.matched).toBe(false);
    });
  });

  /**
   * Story 30.7 (Task A.4): sibling-save into `<projectRoot>/.mcp.local.json`.
   * The accessor bypasses `harnessService.write` because the target lives
   * outside `.claude/`. Tests pin the share-scope verdict to `local` so the
   * `assertNoSecretOnShared` guard does not fire — the gitignore-missing case
   * is exercised separately at the share-scope layer.
   */
  describe('writeLocalSibling (Story 30.7 Task A.1)', () => {
    beforeEach(async () => {
      // Pretend the project gitignores `*.local.*` so the secret guard sees
      // the sibling as `local`, not `shared`.
      await fs.writeFile(path.join(projectRoot, '.gitignore'), '**/*.local.*\n', 'utf-8');
    });

    it('creates .mcp.local.json with the supplied config when the file is missing', async () => {
      const res = await harnessMcpService.writeLocalSibling({
        projectSlug: 'slug',
        name: 'context7',
        config: { command: 'node', args: ['ctx.js'], env: { TOKEN: 'Bearer aaaaaaaaaaaaaaaaaaaaaaaa' } },
      });
      expect(res.success).toBe(true);
      expect(res.siblingRelativePath).toBe('.mcp.local.json');
      const text = await fs.readFile(path.join(projectRoot, '.mcp.local.json'), 'utf-8');
      const parsed = JSON.parse(text);
      expect(parsed.mcpServers.context7.command).toBe('node');
      expect(parsed.mcpServers.context7.env.TOKEN).toContain('Bearer');
    });

    it('merges a new entry into an existing .mcp.local.json without clobbering siblings', async () => {
      await fs.writeFile(
        path.join(projectRoot, '.mcp.local.json'),
        JSON.stringify({ mcpServers: { existing: { command: 'echo' } } }, null, 2),
        'utf-8',
      );
      await harnessMcpService.writeLocalSibling({
        projectSlug: 'slug',
        name: 'newone',
        config: { command: 'node' },
      });
      const text = await fs.readFile(path.join(projectRoot, '.mcp.local.json'), 'utf-8');
      const parsed = JSON.parse(text);
      expect(parsed.mcpServers.existing.command).toBe('echo');
      expect(parsed.mcpServers.newone.command).toBe('node');
    });

    it('registers the sibling write with fileWatcherService so the own-write echo is suppressed', async () => {
      const { fileWatcherService } = await import('../fileWatcherService.js');
      const spy = vi.spyOn(fileWatcherService, 'noteLocalWrite');
      await harnessMcpService.writeLocalSibling({
        projectSlug: 'slug',
        name: 'context7',
        config: { command: 'node' },
      });
      expect(spy).toHaveBeenCalledWith(path.join(projectRoot, '.mcp.local.json'));
    });

    it('re-throws HARNESS_SECRET_ON_SHARED when the sibling itself is not gitignored', async () => {
      // Project has NO gitignore for `*.local.*` — share-scope verdict
      // for `.mcp.local.json` is `shared`, so the guard fires.
      await fs.writeFile(path.join(projectRoot, '.gitignore'), '# empty\n', 'utf-8');
      await expect(
        harnessMcpService.writeLocalSibling({
          projectSlug: 'slug',
          name: 'context7',
          config: { command: 'node', env: { T: 'Bearer aaaaaaaaaaaaaaaaaaaaaaaa' } },
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_SECRET_ON_SHARED.code });
    });
  });
});
