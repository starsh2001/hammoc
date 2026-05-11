/**
 * Story 28.4: harnessHookService unit tests.
 *
 * The user scope is redirected via HAMMOC_HARNESS_HOME_OVERRIDE so the real
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
  detectSecretsInHook,
  harnessHookService,
} from '../harnessHookService.js';
import { projectService } from '../projectService.js';

const PLUGIN_KEY = 'sample-plugin@market';

async function writeProjectSettings(projectRoot: string, content: object): Promise<void> {
  await fs.writeFile(
    path.join(projectRoot, '.claude', 'settings.json'),
    JSON.stringify(content, null, 2),
    'utf-8',
  );
}

async function writeUserSettings(userRoot: string, content: object): Promise<void> {
  await fs.writeFile(
    path.join(userRoot, 'settings.json'),
    JSON.stringify(content, null, 2),
    'utf-8',
  );
}

async function writePluginHooks(pluginRoot: string, content: object): Promise<void> {
  const dir = path.join(pluginRoot, 'hooks');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'hooks.json'), JSON.stringify(content, null, 2), 'utf-8');
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

describe('harnessHookService', () => {
  let userRoot: string;
  let projectRoot: string;
  let pluginRoot: string;

  beforeEach(async () => {
    userRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-user-'));
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-project-'));
    pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-plugin-'));
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
    it('returns all 9 events even when none have hooks', async () => {
      const res = await harnessHookService.listCards('slug');
      expect(Object.keys(res.cardsByEvent).sort()).toEqual([
        'Notification',
        'PostToolUse',
        'PreCompact',
        'PreToolUse',
        'SessionEnd',
        'SessionStart',
        'Stop',
        'SubagentStop',
        'UserPromptSubmit',
      ]);
      for (const ev of Object.values(res.cardsByEvent)) {
        expect(ev).toEqual([]);
      }
    });

    it('collects project + user + plugin hooks across an event', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'p' }] }] },
      });
      await writeUserSettings(userRoot, {
        hooks: { PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'u' }] }] },
      });
      await writePluginHooks(pluginRoot, {
        hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'b' }] }] },
      });
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);

      const res = await harnessHookService.listCards('slug');
      const cards = res.cardsByEvent.PreToolUse;
      expect(cards).toHaveLength(3);
      expect(cards.map((c) => c.scope)).toEqual(['project', 'user', 'plugin']);
    });

    it('flattens multiple matcher groups and multi-hook groups', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [
                { type: 'command', command: 'a' },
                { type: 'command', command: 'b' },
              ],
            },
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'c' }] },
          ],
        },
      });
      const res = await harnessHookService.listCards('slug');
      const cards = res.cardsByEvent.PreToolUse;
      expect(cards).toHaveLength(3);
      expect(cards.map((c) => `${c.groupIndex}.${c.hookIndex}`)).toEqual(['0.0', '0.1', '1.0']);
    });

    it('handles missing/empty matcher field as undefined', async () => {
      await writeUserSettings(userRoot, {
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] },
      });
      const res = await harnessHookService.listCards();
      expect(res.cardsByEvent.Stop[0].matcher).toBeUndefined();
    });

    it('returns promptTypeSupport as the cached spike result', async () => {
      const res = await harnessHookService.listCards();
      expect(['supported', 'unsupported', 'unknown']).toContain(res.promptTypeSupport);
    });

    it('reports backupMtimeByScope only for files that exist', async () => {
      const res1 = await harnessHookService.listCards('slug');
      expect(res1.backupMtimeByScope.user).toBeUndefined();
      expect(res1.backupMtimeByScope.project).toBeUndefined();

      // Now create the user backup and re-check.
      await fs.writeFile(
        path.join(userRoot, 'hooks.disabled.json'),
        JSON.stringify({ hooks: {} }),
        'utf-8',
      );
      const res2 = await harnessHookService.listCards('slug');
      expect(res2.backupMtimeByScope.user).toMatch(/T/);
    });

    it('flags hooks living in hooks.disabled.json with disabledByBackup', async () => {
      await fs.writeFile(
        path.join(userRoot, 'hooks.disabled.json'),
        JSON.stringify({
          hooks: { Stop: [{ hooks: [{ type: 'command', command: 'paused' }] }] },
        }),
        'utf-8',
      );
      const res = await harnessHookService.listCards();
      const card = res.cardsByEvent.Stop[0];
      expect(card.disabledByBackup).toBe(true);
      expect(card.enabled).toBe(false);
    });
  });

  describe('readHook', () => {
    it('returns the matcher + config for an existing hook', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: { Stop: [{ matcher: 'X', hooks: [{ type: 'command', command: 'echo hi' }] }] },
      });
      const res = await harnessHookService.readHook({
        scope: 'project',
        absoluteFile: path.join(projectRoot, '.claude', 'settings.json'),
        projectSlug: 'slug',
        event: 'Stop',
        groupIndex: 0,
        hookIndex: 0,
        disabledByBackup: false,
      });
      expect(res.matcher).toBe('X');
      expect(res.config.type).toBe('command');
      expect(res.config.command).toBe('echo hi');
      expect(res.raw).toContain('"matcher"');
    });

    it('throws HOOK_NOT_FOUND for a bogus index', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] },
      });
      await expect(
        harnessHookService.readHook({
          scope: 'project',
          absoluteFile: path.join(projectRoot, '.claude', 'settings.json'),
          projectSlug: 'slug',
          event: 'Stop',
          groupIndex: 5,
          hookIndex: 0,
          disabledByBackup: false,
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_HOOK_NOT_FOUND.code });
    });
  });

  describe('createHook (AC1, AC3)', () => {
    it('appends a new matcher group and returns the coordinates', async () => {
      const res = await harnessHookService.createHook({
        scope: 'project',
        projectSlug: 'slug',
        event: 'PreToolUse',
        matcher: 'Write',
        config: { type: 'command', command: 'echo' },
      });
      expect(res.newGroupIndex).toBe(0);
      expect(res.newHookIndex).toBe(0);
      const onDisk = JSON.parse(
        await fs.readFile(path.join(projectRoot, '.claude', 'settings.json'), 'utf-8'),
      );
      expect(onDisk.hooks.PreToolUse[0].matcher).toBe('Write');
      expect(onDisk.hooks.PreToolUse[0].hooks[0].command).toBe('echo');
    });

    it('omits matcher when not provided', async () => {
      await harnessHookService.createHook({
        scope: 'user',
        event: 'Stop',
        config: { type: 'command', command: 'on-stop' },
      });
      const onDisk = JSON.parse(
        await fs.readFile(path.join(userRoot, 'settings.json'), 'utf-8'),
      );
      expect(onDisk.hooks.Stop[0].matcher).toBeUndefined();
    });

    it('rejects mismatched type/body combos', async () => {
      await expect(
        harnessHookService.createHook({
          scope: 'user',
          event: 'Stop',
          config: { type: 'command', prompt: 'wrong' },
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_PARSE_ERROR.code });
    });
  });

  describe('updateHook — config (AC3)', () => {
    it('updates the hook config in place', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'old' }] }] },
      });
      const res = await harnessHookService.listCards('slug');
      const card = res.cardsByEvent.Stop[0];
      const updated = await harnessHookService.updateHook(card, {
        config: { type: 'command', command: 'new' },
        expectedMtime: card.mtime,
      });
      expect(updated.success).toBe(true);
      const onDisk = JSON.parse(
        await fs.readFile(path.join(projectRoot, '.claude', 'settings.json'), 'utf-8'),
      );
      expect(onDisk.hooks.Stop[0].hooks[0].command).toBe('new');
    });

    it('rejects plugin-source updates', async () => {
      await writePluginHooks(pluginRoot, {
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'plug' }] }] },
      });
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      const res = await harnessHookService.listCards();
      const pluginCard = res.cardsByEvent.Stop.find((c) => c.scope === 'plugin')!;
      await expect(
        harnessHookService.updateHook(pluginCard, {
          config: { type: 'command', command: 'cant' },
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_FORBIDDEN.code });
    });

    it('returns affectedSiblings when the matcher group has 2+ hooks', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Old',
              hooks: [
                { type: 'command', command: 'a' },
                { type: 'command', command: 'b' },
              ],
            },
          ],
        },
      });
      const list = await harnessHookService.listCards('slug');
      const card = list.cardsByEvent.PreToolUse[0];
      const res = await harnessHookService.updateHook(card, {
        matcher: 'New',
        expectedMtime: card.mtime,
      });
      expect(res.affectedSiblings).toBe(1);
      const onDisk = JSON.parse(
        await fs.readFile(path.join(projectRoot, '.claude', 'settings.json'), 'utf-8'),
      );
      expect(onDisk.hooks.PreToolUse[0].matcher).toBe('New');
      expect(onDisk.hooks.PreToolUse[0].hooks).toHaveLength(2);
    });

    it('extracts the hook into a new group when splitFromGroup is true', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Old',
              hooks: [
                { type: 'command', command: 'a' },
                { type: 'command', command: 'b' },
              ],
            },
          ],
        },
      });
      const list = await harnessHookService.listCards('slug');
      const card = list.cardsByEvent.PreToolUse[1];
      const res = await harnessHookService.updateHook(card, {
        matcher: 'New',
        splitFromGroup: true,
        expectedMtime: card.mtime,
      });
      expect(res.newGroupIndex).toBe(1);
      expect(res.newHookIndex).toBe(0);
      const onDisk = JSON.parse(
        await fs.readFile(path.join(projectRoot, '.claude', 'settings.json'), 'utf-8'),
      );
      expect(onDisk.hooks.PreToolUse[0].matcher).toBe('Old');
      expect(onDisk.hooks.PreToolUse[0].hooks).toHaveLength(1);
      expect(onDisk.hooks.PreToolUse[1].matcher).toBe('New');
      expect(onDisk.hooks.PreToolUse[1].hooks).toHaveLength(1);
    });

    it('refuses splitFromGroup on a single-hook group', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'a' }] }] },
      });
      const list = await harnessHookService.listCards('slug');
      const card = list.cardsByEvent.Stop[0];
      await expect(
        harnessHookService.updateHook(card, {
          matcher: 'New',
          splitFromGroup: true,
          expectedMtime: card.mtime,
        }),
      ).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_FORBIDDEN.code,
        cause: 'split-noop',
      });
    });

    it('rejects stale-write when expectedMtime mismatches', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'old' }] }] },
      });
      const list = await harnessHookService.listCards('slug');
      const card = list.cardsByEvent.Stop[0];
      await expect(
        harnessHookService.updateHook(card, {
          config: { type: 'command', command: 'new' },
          expectedMtime: '1999-01-01T00:00:00Z',
        }),
      ).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_STALE_WRITE.code,
        staleFile: 'main',
      });
    });
  });

  describe('updateHook — enabled toggle (AC5)', () => {
    it('moves a hook from main to backup on disable', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo' }] }] },
      });
      const list = await harnessHookService.listCards('slug');
      const card = list.cardsByEvent.Stop[0];
      const res = await harnessHookService.updateHook(card, {
        enabled: false,
        expectedMtime: card.mtime,
      });
      expect(res.backupMtime).toBeTruthy();
      const main = JSON.parse(
        await fs.readFile(path.join(projectRoot, '.claude', 'settings.json'), 'utf-8'),
      );
      expect(main.hooks.Stop ?? []).toHaveLength(0);
      const backup = JSON.parse(
        await fs.readFile(path.join(projectRoot, '.claude', 'hooks.disabled.json'), 'utf-8'),
      );
      expect(backup.hooks.Stop[0].hooks[0].command).toBe('echo');
    });

    it('moves a hook from backup back to main on enable', async () => {
      // Seed main as an empty hooks object so we have an mtime to echo back.
      await writeProjectSettings(projectRoot, { hooks: {} });
      await fs.writeFile(
        path.join(projectRoot, '.claude', 'hooks.disabled.json'),
        JSON.stringify({
          hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo' }] }] },
        }),
        'utf-8',
      );
      const list = await harnessHookService.listCards('slug');
      const card = list.cardsByEvent.Stop[0];
      expect(card.disabledByBackup).toBe(true);
      const res = await harnessHookService.updateHook(card, {
        enabled: true,
        expectedBackupMtime: card.mtime,
      });
      expect(res.success).toBe(true);
      const main = JSON.parse(
        await fs.readFile(path.join(projectRoot, '.claude', 'settings.json'), 'utf-8'),
      );
      expect(main.hooks.Stop[0].hooks[0].command).toBe('echo');
    });
  });

  describe('copyHook (AC2, AC4)', () => {
    it('rejects when acknowledgedWarning is missing', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] },
      });
      await expect(
        harnessHookService.copyHook({
          sourceScope: 'project',
          sourceProjectSlug: 'slug',
          sourceEvent: 'Stop',
          sourceGroupIndex: 0,
          sourceHookIndex: 0,
          targetScope: 'user',
          onConflict: 'duplicate',
          acknowledgedWarning: false,
        }),
      ).rejects.toMatchObject({
        code: HARNESS_ERRORS.HARNESS_FORBIDDEN.code,
        cause: 'type-warning-not-acknowledged',
      });
    });

    it('appends a new matcher group on bidirectional copy', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: { Stop: [{ matcher: 'X', hooks: [{ type: 'command', command: 'a' }] }] },
      });
      const res = await harnessHookService.copyHook({
        sourceScope: 'project',
        sourceProjectSlug: 'slug',
        sourceEvent: 'Stop',
        sourceGroupIndex: 0,
        sourceHookIndex: 0,
        targetScope: 'user',
        onConflict: 'duplicate',
        acknowledgedWarning: true,
      });
      expect(res.newGroupIndex).toBe(0);
      const userOnDisk = JSON.parse(
        await fs.readFile(path.join(userRoot, 'settings.json'), 'utf-8'),
      );
      expect(userOnDisk.hooks.Stop[0].hooks[0].command).toBe('a');
    });

    it('returns plugin-root-reference warning when copying from plugin with ${CLAUDE_PLUGIN_ROOT}', async () => {
      await writePluginHooks(pluginRoot, {
        hooks: {
          Stop: [
            {
              hooks: [{ type: 'command', command: 'echo ${CLAUDE_PLUGIN_ROOT}/foo' }],
            },
          ],
        },
      });
      await writeInstalledPluginsCatalog(userRoot, pluginRoot);
      const res = await harnessHookService.copyHook({
        sourceScope: 'plugin',
        sourcePluginKey: PLUGIN_KEY,
        sourceEvent: 'Stop',
        sourceGroupIndex: 0,
        sourceHookIndex: 0,
        targetScope: 'user',
        onConflict: 'duplicate',
        acknowledgedWarning: true,
      });
      expect(res.warnings).toContain('plugin-root-reference');
    });

    it('skips when onConflict=skip and target already has the same hook', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] },
      });
      await writeUserSettings(userRoot, {
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] },
      });
      const res = await harnessHookService.copyHook({
        sourceScope: 'project',
        sourceProjectSlug: 'slug',
        sourceEvent: 'Stop',
        sourceGroupIndex: 0,
        sourceHookIndex: 0,
        targetScope: 'user',
        onConflict: 'skip',
        acknowledgedWarning: true,
      });
      expect(res.skipped).toBe(true);
    });
  });

  describe('deleteHook', () => {
    it('removes the entire group when its hooks[] becomes empty', async () => {
      await writeProjectSettings(projectRoot, {
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'only' }] }] },
      });
      const list = await harnessHookService.listCards('slug');
      const card = list.cardsByEvent.Stop[0];
      await harnessHookService.deleteHook({
        scope: 'project',
        projectSlug: 'slug',
        event: 'Stop',
        groupIndex: card.groupIndex,
        hookIndex: card.hookIndex,
        expectedMtime: card.mtime,
      });
      const onDisk = JSON.parse(
        await fs.readFile(path.join(projectRoot, '.claude', 'settings.json'), 'utf-8'),
      );
      expect(onDisk.hooks.Stop ?? []).toHaveLength(0);
    });

    it('throws HOOK_NOT_FOUND when index is bogus', async () => {
      await writeProjectSettings(projectRoot, { hooks: {} });
      await expect(
        harnessHookService.deleteHook({
          scope: 'project',
          projectSlug: 'slug',
          event: 'Stop',
          groupIndex: 0,
          hookIndex: 0,
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERRORS.HARNESS_HOOK_NOT_FOUND.code });
    });
  });

  describe('detectSecretsInHook', () => {
    it('matches Bearer / sk- / AKIA / xoxb / long base64 in command', () => {
      expect(detectSecretsInHook({ type: 'command', command: 'curl -H "Bearer ABCDEF1234567890"' }).matched).toBe(true);
      expect(detectSecretsInHook({ type: 'command', command: 'echo sk-AAAAAAAAAAAAAAAAAAAA' }).matched).toBe(true);
      expect(detectSecretsInHook({ type: 'command', command: 'AKIAABCDEFGHIJKLMNOP' }).matched).toBe(true);
      expect(detectSecretsInHook({ type: 'command', command: 'xoxb-abcdefghijklmnop' }).matched).toBe(true);
      expect(
        detectSecretsInHook({
          type: 'command',
          command: 'padding aGVsbG93b3JsZHRoaXNpc2FzZWNyZXR0b2tlbg== padding',
        }).matched,
      ).toBe(true);
    });

    it('excludes ${ENV_REF} matches', () => {
      // base64-like but stripped to nothing once env refs removed.
      const allEnv = '${TOK1}${TOK2}${TOK3}${TOK4}${TOK5}';
      expect(detectSecretsInHook({ type: 'command', command: allEnv }).matched).toBe(false);
    });

    it('returns no match for a short benign string', () => {
      expect(detectSecretsInHook({ type: 'command', command: 'echo hi' }).matched).toBe(false);
    });
  });
});
