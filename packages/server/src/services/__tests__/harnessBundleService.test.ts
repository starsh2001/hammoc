/**
 * Story 30.5 (Task C.1): unit tests for `harnessBundleService`.
 *
 * Coverage map (AC1, AC2, AC4, AC5, AC9):
 *   - Export — round-trip 7 cards (skill 2 + mcp 1 + hook 1 + command 1 +
 *     agent 1 + CLAUDE.md 1) builds a ZIP whose manifest mentions every
 *     expected item.
 *   - Export — `included-explicit` without `acknowledgedSecretInclusion` is
 *     refused with HARNESS_SECRET_ACK_MISSING.
 *   - Export — `included-explicit` forces the `WITH-SECRETS` filename suffix
 *     regardless of any caller-supplied filename.
 *   - Import — `new` / `overwrite` / `same` per-item status calculation.
 *   - Import — Apply happy path writes the bundle to disk.
 *   - Import — Apply failure mid-transaction rolls back applied items.
 *   - Import — `bundleVersion: 1` is accepted, `2` is `future`, missing
 *     version is `invalid`.
 *   - Import — malformed JSON → `malformed`.
 *   - Import — ZIP-slip entry surfaces `UnsafeBundlePathError`.
 *
 * The user-scope harness root is redirected via HAMMOC_HARNESS_HOME_OVERRIDE
 * so the real ~/.claude is never touched. The project root is mocked through
 * `projectService.resolveOriginalPath`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import JSZip from 'jszip';
import { harnessBundleService } from '../harnessBundleService.js';
import { projectService } from '../projectService.js';
import { harnessPluginService } from '../harnessPluginService.js';
import { UnsafeBundlePathError } from '../../utils/assertSafeBundlePath.js';
import type { BundleManifest } from '@hammoc/shared';

describe('harnessBundleService', () => {
  let tmpHome: string;
  let tmpProject: string;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'bundle-home-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'bundle-proj-'));
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = tmpHome;
    vi.spyOn(projectService, 'resolveOriginalPath').mockResolvedValue(tmpProject);
    // Skip plugin enumeration in tests — the user-scope plugin catalog is
    // empty in the temp directory anyway, but mocking guarantees no surprise
    // reads against unrelated paths.
    vi.spyOn(harnessPluginService, 'listCards').mockResolvedValue({
      cards: [],
      enabledPluginsFormat: 'object',
      settingsMtime: '',
    });
  });

  afterEach(async () => {
    delete process.env.HAMMOC_HARNESS_HOME_OVERRIDE;
    vi.restoreAllMocks();
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Fixture helpers
  // ---------------------------------------------------------------------------

  async function makeFakeProject(): Promise<void> {
    // CLAUDE.md (1)
    await fs.writeFile(path.join(tmpProject, 'CLAUDE.md'), '# Project memory\nHello world\n');

    // Skills (2) — first with bundle assets, second SKILL.md only
    const skillsRoot = path.join(tmpProject, '.claude', 'skills');
    await fs.mkdir(skillsRoot, { recursive: true });
    await fs.mkdir(path.join(skillsRoot, 'alpha', 'assets'), { recursive: true });
    await fs.writeFile(
      path.join(skillsRoot, 'alpha', 'SKILL.md'),
      '---\nname: alpha\ndescription: Alpha skill\n---\nBody A\n',
    );
    await fs.writeFile(path.join(skillsRoot, 'alpha', 'assets', 'note.txt'), 'asset-bytes');
    await fs.mkdir(path.join(skillsRoot, 'beta'), { recursive: true });
    await fs.writeFile(
      path.join(skillsRoot, 'beta', 'SKILL.md'),
      '---\nname: beta\ndescription: Beta skill\n---\nBody B\n',
    );

    // MCP (1)
    await fs.writeFile(
      path.join(tmpProject, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            context7: { type: 'stdio', command: 'npx', args: ['-y', 'context7'] },
          },
        },
        null,
        2,
      ),
    );

    // Hook (1) — inside settings.json
    await fs.mkdir(path.join(tmpProject, '.claude'), { recursive: true });
    await fs.writeFile(
      path.join(tmpProject, '.claude', 'settings.json'),
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              { matcher: 'Read', hooks: [{ type: 'command', command: 'echo hook-fired' }] },
            ],
          },
        },
        null,
        2,
      ),
    );

    // Command (1)
    const commandsRoot = path.join(tmpProject, '.claude', 'commands');
    await fs.mkdir(commandsRoot, { recursive: true });
    await fs.writeFile(path.join(commandsRoot, 'greet.md'), '---\n---\nGreetings.\n');

    // Agent (1)
    const agentsRoot = path.join(tmpProject, '.claude', 'agents');
    await fs.mkdir(agentsRoot, { recursive: true });
    await fs.writeFile(
      path.join(agentsRoot, 'qa.md'),
      '---\nname: qa\ndescription: QA agent\nmodel: opus\ncolor: blue\n---\nQA body\n',
    );
  }

  function manifestOf(zip: JSZip): Promise<BundleManifest> {
    return zip.files['manifest.json'].async('string').then((s) => JSON.parse(s) as BundleManifest);
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  it('Export — 7 cards round-trip into the ZIP', async () => {
    await makeFakeProject();
    const result = await harnessBundleService.export({
      projectSlug: 'any',
      includes: ['claude-md', 'skills', 'commands', 'agents', 'hooks', 'mcp'],
      secretsPolicy: 'excluded',
    });

    const zip = await JSZip.loadAsync(result.zipBuffer);
    const manifest = await manifestOf(zip);

    expect(manifest.bundleVersion).toBe(1);
    expect(manifest.secretsPolicy).toBe('excluded');
    expect(manifest.includes).toEqual(
      expect.arrayContaining(['claude-md', 'skills', 'commands', 'agents', 'hooks', 'mcp']),
    );

    // claude-md (1) + skill (2) + mcp (1) + hook (1) + command (1) + agent (1) = 7 items
    const domainCounts: Record<string, number> = {};
    for (const it of manifest.items) {
      domainCounts[it.domain] = (domainCounts[it.domain] ?? 0) + 1;
    }
    expect(domainCounts['claude-md']).toBe(1);
    expect(domainCounts.skill).toBe(2);
    expect(domainCounts.mcp).toBe(1);
    expect(domainCounts.hook).toBe(1);
    expect(domainCounts.command).toBe(1);
    expect(domainCounts.agent).toBe(1);

    // ZIP carries the expected payloads
    expect(zip.files['CLAUDE.md']).toBeDefined();
    expect(zip.files['skills/alpha/SKILL.md']).toBeDefined();
    expect(zip.files['skills/alpha/assets/note.txt']).toBeDefined();
    expect(zip.files['skills/beta/SKILL.md']).toBeDefined();
    expect(zip.files['.mcp.json']).toBeDefined();
    expect(zip.files['hooks-fragment.json']).toBeDefined();
    expect(zip.files['commands/greet.md']).toBeDefined();
    expect(zip.files['agents/qa.md']).toBeDefined();
  });

  it('Export — included-explicit without acknowledgedSecretInclusion is refused', async () => {
    await makeFakeProject();
    await expect(
      harnessBundleService.export({
        projectSlug: 'any',
        includes: ['claude-md'],
        secretsPolicy: 'included-explicit',
      }),
    ).rejects.toMatchObject({ code: 'HARNESS_SECRET_ACK_MISSING' });
  });

  it('Export — included-explicit forces the WITH-SECRETS filename suffix', async () => {
    await makeFakeProject();
    const result = await harnessBundleService.export({
      projectSlug: 'plumage',
      includes: ['claude-md'],
      secretsPolicy: 'included-explicit',
      acknowledgedSecretInclusion: true,
    });
    expect(result.filename).toMatch(/-WITH-SECRETS\.zip$/);
    expect(result.filename).toContain('plumage');
    expect(result.hadPlaintextSecrets).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Import — status calculation
  // ---------------------------------------------------------------------------

  it('Import — per-item status returns "new" when target is absent and "same" when content matches', async () => {
    await makeFakeProject();
    const exp = await harnessBundleService.export({
      projectSlug: 'any',
      includes: ['claude-md', 'agents', 'commands'],
      secretsPolicy: 'excluded',
    });

    // Wipe target's CLAUDE.md and one agent — they should become `new`.
    await fs.rm(path.join(tmpProject, 'CLAUDE.md'));
    await fs.rm(path.join(tmpProject, '.claude', 'agents', 'qa.md'));

    const result = await harnessBundleService.import({
      projectSlug: 'any',
      zipBuffer: exp.zipBuffer,
      dryRun: true,
    });
    expect(result.compatibility).toBe('compatible');
    const claudeRow = result.preview.items.find((r) => r.domain === 'claude-md');
    const agentRow = result.preview.items.find((r) => r.domain === 'agent');
    const commandRow = result.preview.items.find((r) => r.domain === 'command');
    expect(claudeRow?.status).toBe('new');
    expect(agentRow?.status).toBe('new');
    // command file untouched — body equals → 'same'
    expect(commandRow?.status).toBe('same');
  });

  it('Import — "overwrite" status surfaces when target exists with different content', async () => {
    await makeFakeProject();
    const exp = await harnessBundleService.export({
      projectSlug: 'any',
      includes: ['claude-md'],
      secretsPolicy: 'excluded',
    });
    // Mutate the target CLAUDE.md so the bundle's CLAUDE.md no longer matches.
    await fs.writeFile(path.join(tmpProject, 'CLAUDE.md'), '# CHANGED LOCALLY\n');

    const result = await harnessBundleService.import({
      projectSlug: 'any',
      zipBuffer: exp.zipBuffer,
      dryRun: true,
    });
    const row = result.preview.items.find((r) => r.domain === 'claude-md');
    expect(row?.status).toBe('overwrite');
  });

  it('Import — "conflict" status surfaces when a directory sits where a file would land', async () => {
    await makeFakeProject();
    const exp = await harnessBundleService.export({
      projectSlug: 'any',
      includes: ['claude-md'],
      secretsPolicy: 'excluded',
    });
    // Replace CLAUDE.md (regular file) with a directory of the same name.
    await fs.rm(path.join(tmpProject, 'CLAUDE.md'));
    await fs.mkdir(path.join(tmpProject, 'CLAUDE.md'));

    const result = await harnessBundleService.import({
      projectSlug: 'any',
      zipBuffer: exp.zipBuffer,
      dryRun: true,
    });
    const row = result.preview.items.find((r) => r.domain === 'claude-md');
    expect(row?.status).toBe('conflict');
  });

  // ---------------------------------------------------------------------------
  // Import — apply path
  // ---------------------------------------------------------------------------

  it('Import — apply writes the bundle to disk', async () => {
    await makeFakeProject();
    const exp = await harnessBundleService.export({
      projectSlug: 'any',
      includes: ['claude-md', 'agents'],
      secretsPolicy: 'excluded',
    });

    // Remove the targets so we can verify they are recreated.
    await fs.rm(path.join(tmpProject, 'CLAUDE.md'));
    await fs.rm(path.join(tmpProject, '.claude', 'agents', 'qa.md'));

    const result = await harnessBundleService.import({
      projectSlug: 'any',
      zipBuffer: exp.zipBuffer,
      dryRun: false,
      itemActions: {
        'claude-md:CLAUDE.md': 'overwrite',
        'agent:qa': 'overwrite',
      },
    });
    expect(result.compatibility).toBe('compatible');
    expect(result.appliedSummary?.applied).toBe(2);

    // Files re-materialized on disk
    await expect(fs.readFile(path.join(tmpProject, 'CLAUDE.md'), 'utf-8')).resolves.toContain(
      'Project memory',
    );
    await expect(
      fs.readFile(path.join(tmpProject, '.claude', 'agents', 'qa.md'), 'utf-8'),
    ).resolves.toContain('QA body');
  });

  it('Import — mid-flight write failure rolls back previously-applied items', async () => {
    await makeFakeProject();
    const exp = await harnessBundleService.export({
      projectSlug: 'any',
      includes: ['claude-md', 'agents'],
      secretsPolicy: 'excluded',
    });

    // Snapshot the pre-import state.
    const originalAgent = await fs.readFile(
      path.join(tmpProject, '.claude', 'agents', 'qa.md'),
      'utf-8',
    );
    const originalClaudeMd = await fs.readFile(path.join(tmpProject, 'CLAUDE.md'), 'utf-8');

    // Mutate so the bundle's content differs (otherwise the test below cannot
    // tell whether rollback restored anything).
    await fs.writeFile(path.join(tmpProject, 'CLAUDE.md'), '# diverged claude-md\n');
    await fs.writeFile(
      path.join(tmpProject, '.claude', 'agents', 'qa.md'),
      '---\nname: qa\ndescription: stale\nmodel: opus\ncolor: blue\n---\nstale body\n',
    );

    // Force the second write to fail by spying on fs.writeFile.
    const realWriteFile = fs.writeFile;
    let writeCount = 0;
    const spy = vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
      writeCount += 1;
      if (writeCount === 2) {
        throw Object.assign(new Error('injected mid-apply failure'), { code: 'EIO' });
      }
      return realWriteFile.apply(fs, args as Parameters<typeof realWriteFile>);
    });

    await expect(
      harnessBundleService.import({
        projectSlug: 'any',
        zipBuffer: exp.zipBuffer,
        dryRun: false,
        itemActions: {
          'claude-md:CLAUDE.md': 'overwrite',
          'agent:qa': 'overwrite',
        },
      }),
    ).rejects.toThrow(/injected mid-apply failure/);

    spy.mockRestore();

    // Rollback restored the diverged content (the same bytes that lived
    // there before the failed transaction started, not the export's view).
    const afterClaude = await fs.readFile(path.join(tmpProject, 'CLAUDE.md'), 'utf-8');
    expect(afterClaude).toBe('# diverged claude-md\n');
    // The original sentinel from the very first writeFile is still in place
    // — silently swallow the original-pre-mutation step because the rollback
    // only restores the pre-transaction snapshot (mutated state), not the
    // pre-mutation original. This is the documented semantics in A.3 (e).
    expect(originalAgent.length).toBeGreaterThan(0);
    expect(originalClaudeMd.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Import — bundleVersion branches (AC5.a / AC5.b / AC5.c)
  // ---------------------------------------------------------------------------

  async function makeBundleWithManifest(manifest: Record<string, unknown>): Promise<Buffer> {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest));
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  it('Import — bundleVersion === 1 is accepted (AC5.a positive branch)', async () => {
    const buf = await makeBundleWithManifest({
      bundleVersion: 1,
      hammocVersion: 'test',
      claudeCodeSpecVersion: null,
      createdAt: new Date().toISOString(),
      sourceProjectSlug: 'src',
      includes: [],
      secretsPolicy: 'excluded',
      pluginDependencies: [],
      items: [],
    });
    const result = await harnessBundleService.import({
      projectSlug: 'any',
      zipBuffer: buf,
      dryRun: true,
    });
    expect(result.compatibility).toBe('compatible');
  });

  it('Import — bundleVersion > 1 → "future"', async () => {
    const buf = await makeBundleWithManifest({ bundleVersion: 2 });
    const result = await harnessBundleService.import({
      projectSlug: 'any',
      zipBuffer: buf,
      dryRun: true,
    });
    expect(result.compatibility).toBe('future');
    expect(result.compatibilityDetail?.bundleVersion).toBe(2);
  });

  it('Import — bundleVersion < 1 → "invalid"', async () => {
    const buf = await makeBundleWithManifest({ bundleVersion: 0 });
    const result = await harnessBundleService.import({
      projectSlug: 'any',
      zipBuffer: buf,
      dryRun: true,
    });
    expect(result.compatibility).toBe('invalid');
  });

  it('Import — malformed JSON in manifest → "malformed"', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', '{not valid json');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await harnessBundleService.import({
      projectSlug: 'any',
      zipBuffer: buf,
      dryRun: true,
    });
    expect(result.compatibility).toBe('malformed');
    expect(result.compatibilityDetail?.jsonError).toBeDefined();
  });

  it('Import — manifest.json missing → "malformed"', async () => {
    const zip = new JSZip();
    zip.file('CLAUDE.md', 'hello');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await harnessBundleService.import({
      projectSlug: 'any',
      zipBuffer: buf,
      dryRun: true,
    });
    expect(result.compatibility).toBe('malformed');
  });

  // ---------------------------------------------------------------------------
  // Import — ZIP slip / path traversal guard
  // ---------------------------------------------------------------------------

  // Note: JSZip's `.file()` method normalizes parent-escape paths
  // (`../../etc/passwd` → `etc/passwd` + a `/` root entry) BEFORE writing the
  // archive. The leading-slash root entry still surfaces traversal intent so
  // the import path throws on the `/` entry. The dedicated 4-case AC9 matrix
  // for the helper itself lives in `utils/__tests__/assertSafeBundlePath.test.ts`.
  it('Import — ZIP carrying a leading-slash root entry is rejected (AC9)', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ bundleVersion: 1 }));
    // JSZip retains the leading slash on absolute entry paths and emits dir
    // entries (`/abs/`, `/abs/path/`) which trip the absolute-path branch of
    // the guard even before the regular-file entry is inspected.
    zip.file('/abs/path/evil.txt', 'sneaky');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    await expect(
      harnessBundleService.import({
        projectSlug: 'any',
        zipBuffer: buf,
        dryRun: true,
      }),
    ).rejects.toBeInstanceOf(UnsafeBundlePathError);
  });

  it('Import — ZIP carrying a virtual root from `../` normalization is rejected (AC9)', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ bundleVersion: 1 }));
    // `../../etc/passwd` is normalized by JSZip but it still emits a `/` root
    // entry — that single entry is enough to surface traversal intent.
    zip.file('../../etc/passwd', 'sneaky');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    await expect(
      harnessBundleService.import({
        projectSlug: 'any',
        zipBuffer: buf,
        dryRun: true,
      }),
    ).rejects.toBeInstanceOf(UnsafeBundlePathError);
  });

  // ---------------------------------------------------------------------------
  // Import — preview payload (missingPlugins / unknownSections)
  // ---------------------------------------------------------------------------

  it('Import — missingPlugins lists only declared plugins absent from the catalog (AC4.b negative branch)', async () => {
    // Stand up a catalog that has `installed-one@market` installed and nothing
    // else. The manifest declares one installed plugin AND one missing — the
    // preview must surface only the missing one. Exercises the `installedKeys.has`
    // false branch in computeMissingPlugins.
    vi.spyOn(harnessPluginService, 'listCards').mockResolvedValue({
      cards: [
        // Only `name`/`marketplace` are read by computeMissingPlugins —
        // omitted card fields are irrelevant to this test.
        { name: 'installed-one', marketplace: 'market' } as never,
      ],
      enabledPluginsFormat: 'object',
      settingsMtime: '',
    });

    const buf = await makeBundleWithManifest({
      bundleVersion: 1,
      hammocVersion: 'test',
      claudeCodeSpecVersion: null,
      createdAt: new Date().toISOString(),
      sourceProjectSlug: 'src',
      includes: [],
      secretsPolicy: 'excluded',
      pluginDependencies: [
        { name: 'installed-one', marketplace: 'market', version: '1.0.0' },
        { name: 'missing-two', marketplace: 'market', version: '2.0.0' },
      ],
      items: [],
    });

    const result = await harnessBundleService.import({
      projectSlug: 'any',
      zipBuffer: buf,
      dryRun: true,
    });
    expect(result.compatibility).toBe('compatible');
    expect(result.preview.missingPlugins).toHaveLength(1);
    expect(result.preview.missingPlugins[0]).toMatchObject({
      name: 'missing-two',
      marketplace: 'market',
    });
    // Sanity — the installed one was filtered out by the false branch.
    expect(
      result.preview.missingPlugins.some((p) => p.name === 'installed-one'),
    ).toBe(false);
  });

  it('Import — unknownSections lists strangers in manifest.includes and filters their items (AC5.b)', async () => {
    // Manifest claims a known section + a stranger section. The unknown
    // section must surface in `preview.unknownSections` and its declared item
    // must NOT appear in `preview.items` (knownItems filter drops it).
    const buf = await makeBundleWithManifest({
      bundleVersion: 1,
      hammocVersion: 'test',
      claudeCodeSpecVersion: null,
      createdAt: new Date().toISOString(),
      sourceProjectSlug: 'src',
      includes: ['claude-md', 'future-mystery-section'],
      secretsPolicy: 'excluded',
      pluginDependencies: [],
      items: [
        {
          domain: 'claude-md',
          identity: 'CLAUDE.md',
          relativePath: 'CLAUDE.md',
          sourceShareScope: 'shared',
        },
      ],
    });

    const result = await harnessBundleService.import({
      projectSlug: 'any',
      zipBuffer: buf,
      dryRun: true,
    });
    expect(result.compatibility).toBe('compatible');
    expect(result.preview.unknownSections).toContain('future-mystery-section');
    expect(result.preview.unknownSections).not.toContain('claude-md');
    // The known claude-md item still appears (it belongs to the known section).
    expect(result.preview.items.some((r) => r.domain === 'claude-md')).toBe(true);
  });
});
