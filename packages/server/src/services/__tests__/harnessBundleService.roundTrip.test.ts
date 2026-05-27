/**
 * Story 30.5 (Task C.2 + AC1.e): full bundle round-trip tests across the 3
 * secrets policies.
 *
 * Each test sets up a 7-card fake project, exports a bundle, imports it into
 * a *fresh empty target project*, and verifies the cards round-trip with
 * the appropriate secrets-policy-dependent transformations:
 *
 *   - `excluded`            : secret-bearing leaves removed; non-secret text
 *                             round-trips byte-for-byte.
 *   - `placeholder`         : secret-bearing leaves rewritten as
 *                             `${ENV_REF}`; non-secret text round-trips.
 *   - `included-explicit`   : every secret is preserved verbatim; the
 *                             manifest records `hadPlaintextSecrets`.
 *
 * Each policy gets exactly one end-to-end test. The cheaper unit-level
 * coverage of individual policy paths lives in `applySecretsPolicy.test.ts`
 * (Task 2.2 prerequisite) — these tests sit on top.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { harnessBundleService } from '../harnessBundleService.js';
import { projectService } from '../projectService.js';
import { harnessPluginService } from '../harnessPluginService.js';

describe('harnessBundleService — round-trip across secrets policies', () => {
  let tmpHome: string;
  let tmpSourceProject: string;
  let tmpTargetProject: string;
  const SOURCE_SLUG = 'source-proj';
  const TARGET_SLUG = 'target-proj';

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-home-'));
    tmpSourceProject = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-src-'));
    tmpTargetProject = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-tgt-'));
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = tmpHome;

    vi.spyOn(projectService, 'resolveOriginalPath').mockImplementation(async (slug) => {
      if (slug === SOURCE_SLUG) return tmpSourceProject;
      if (slug === TARGET_SLUG) return tmpTargetProject;
      throw Object.assign(new Error('unknown slug'), { code: 'PROJECT_NOT_FOUND' });
    });
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
    await fs.rm(tmpSourceProject, { recursive: true, force: true });
    await fs.rm(tmpTargetProject, { recursive: true, force: true });
  });

  /**
   * 7-card fixture used by every policy test. Two cards (the MCP server's
   * Authorization header + the agent body's `Bearer ...`) carry secrets so
   * the policy paths get exercised.
   */
  async function makeFakeSourceProject(): Promise<void> {
    // CLAUDE.md
    await fs.writeFile(
      path.join(tmpSourceProject, 'CLAUDE.md'),
      '# Project memory\nNo secrets here.\n',
    );

    // Skills (2)
    const skillsRoot = path.join(tmpSourceProject, '.claude', 'skills');
    await fs.mkdir(path.join(skillsRoot, 'alpha'), { recursive: true });
    await fs.writeFile(
      path.join(skillsRoot, 'alpha', 'SKILL.md'),
      '---\nname: alpha\ndescription: Alpha skill\n---\nAlpha body — nothing sensitive.\n',
    );
    await fs.mkdir(path.join(skillsRoot, 'beta'), { recursive: true });
    await fs.writeFile(
      path.join(skillsRoot, 'beta', 'SKILL.md'),
      '---\nname: beta\ndescription: Beta skill\n---\nBeta body.\n',
    );

    // MCP (1) — secret in `headers.Authorization`
    await fs.writeFile(
      path.join(tmpSourceProject, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            context7: {
              type: 'http',
              url: 'https://context7.example.com',
              headers: {
                Authorization: 'Bearer abc123def456ghi789jkl012mno345pqr',
              },
            },
          },
        },
        null,
        2,
      ),
    );

    // Hook (1)
    await fs.mkdir(path.join(tmpSourceProject, '.claude'), { recursive: true });
    await fs.writeFile(
      path.join(tmpSourceProject, '.claude', 'settings.json'),
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              { matcher: 'Read', hooks: [{ type: 'command', command: 'echo benign' }] },
            ],
          },
        },
        null,
        2,
      ),
    );

    // Command (1)
    const commandsRoot = path.join(tmpSourceProject, '.claude', 'commands');
    await fs.mkdir(commandsRoot, { recursive: true });
    await fs.writeFile(
      path.join(commandsRoot, 'greet.md'),
      '---\n---\nGreet the user. Nothing sensitive.\n',
    );

    // Agent (1) — secret-bearing system prompt
    const agentsRoot = path.join(tmpSourceProject, '.claude', 'agents');
    await fs.mkdir(agentsRoot, { recursive: true });
    await fs.writeFile(
      path.join(agentsRoot, 'qa.md'),
      '---\nname: qa\ndescription: QA agent\nmodel: opus\ncolor: blue\n---\n' +
        'Use the production API token: Bearer abc123def456ghi789jkl012mno345pqr\n',
    );
  }

  // ---------------------------------------------------------------------------

  it('round-trip — "excluded" policy strips secrets while keeping benign payloads', async () => {
    await makeFakeSourceProject();

    const exp = await harnessBundleService.export({
      projectSlug: SOURCE_SLUG,
      includes: ['claude-md', 'skills', 'commands', 'agents', 'hooks', 'mcp'],
      secretsPolicy: 'excluded',
    });
    expect(exp.secretsRemovedCount).toBeGreaterThan(0);
    expect(exp.manifest.secretsPolicy).toBe('excluded');

    // Apply into the empty target project — every item is `new` so default
    // overwrite actions just write the file.
    const applyActions: Record<string, string> = {};
    for (const it of exp.manifest.items) {
      applyActions[`${it.domain}:${it.identity}`] = 'overwrite';
    }
    const importResult = await harnessBundleService.import({
      projectSlug: TARGET_SLUG,
      zipBuffer: exp.zipBuffer,
      dryRun: false,
      itemActions: applyActions as Record<string, 'overwrite'>,
    });
    expect(importResult.compatibility).toBe('compatible');
    expect(importResult.appliedSummary?.applied).toBeGreaterThan(0);

    // Verify the agent body no longer contains the Bearer secret on the
    // target — the "<< SECRET REMOVED >>" sentinel replaces that line.
    const targetAgent = await fs.readFile(
      path.join(tmpTargetProject, '.claude', 'agents', 'qa.md'),
      'utf-8',
    );
    expect(targetAgent).not.toContain('abc123def456ghi789jkl012mno345pqr');
    expect(targetAgent).toContain('<< SECRET REMOVED >>');

    // Benign cards round-trip
    const targetClaude = await fs.readFile(
      path.join(tmpTargetProject, 'CLAUDE.md'),
      'utf-8',
    );
    expect(targetClaude).toContain('Project memory');
    const targetSkill = await fs.readFile(
      path.join(tmpTargetProject, '.claude', 'skills', 'alpha', 'SKILL.md'),
      'utf-8',
    );
    expect(targetSkill).toContain('Alpha body');
  });

  it('round-trip — "placeholder" policy rewrites secrets as ${ENV_REF}', async () => {
    await makeFakeSourceProject();

    const exp = await harnessBundleService.export({
      projectSlug: SOURCE_SLUG,
      includes: ['agents', 'mcp'],
      secretsPolicy: 'placeholder',
    });
    expect(exp.secretsReplacedCount).toBeGreaterThan(0);
    expect(exp.manifest.secretsPolicy).toBe('placeholder');

    const applyActions: Record<string, string> = {};
    for (const it of exp.manifest.items) {
      applyActions[`${it.domain}:${it.identity}`] = 'overwrite';
    }
    const importResult = await harnessBundleService.import({
      projectSlug: TARGET_SLUG,
      zipBuffer: exp.zipBuffer,
      dryRun: false,
      itemActions: applyActions as Record<string, 'overwrite'>,
    });
    expect(importResult.compatibility).toBe('compatible');

    // Agent body — the literal Bearer token is replaced with ${ENV_REF}.
    const targetAgent = await fs.readFile(
      path.join(tmpTargetProject, '.claude', 'agents', 'qa.md'),
      'utf-8',
    );
    expect(targetAgent).not.toContain('abc123def456ghi789jkl012mno345pqr');
    expect(targetAgent).toMatch(/\$\{[A-Z_][A-Z0-9_]*\}/);

    // MCP — the Authorization header is rewritten as ${BEARER_TOKEN_CONTEXT7}
    const targetMcpRaw = await fs.readFile(path.join(tmpTargetProject, '.mcp.json'), 'utf-8');
    expect(targetMcpRaw).toContain('${BEARER_TOKEN_CONTEXT7}');
    expect(targetMcpRaw).not.toContain('abc123def456ghi789jkl012mno345pqr');
  });

  it('round-trip — "included-explicit" policy preserves secrets verbatim', async () => {
    await makeFakeSourceProject();

    const exp = await harnessBundleService.export({
      projectSlug: SOURCE_SLUG,
      includes: ['agents', 'mcp'],
      secretsPolicy: 'included-explicit',
      acknowledgedSecretInclusion: true,
    });
    expect(exp.manifest.secretsPolicy).toBe('included-explicit');
    expect(exp.hadPlaintextSecrets).toBe(true);
    expect(exp.filename).toMatch(/-WITH-SECRETS\.zip$/);

    const applyActions: Record<string, string> = {};
    for (const it of exp.manifest.items) {
      applyActions[`${it.domain}:${it.identity}`] = 'overwrite';
    }
    const importResult = await harnessBundleService.import({
      projectSlug: TARGET_SLUG,
      zipBuffer: exp.zipBuffer,
      dryRun: false,
      itemActions: applyActions as Record<string, 'overwrite'>,
    });
    expect(importResult.compatibility).toBe('compatible');
    expect(importResult.appliedSummary?.hadPlaintextSecrets).toBe(true);

    // Agent body — the literal Bearer token survives the round-trip.
    const targetAgent = await fs.readFile(
      path.join(tmpTargetProject, '.claude', 'agents', 'qa.md'),
      'utf-8',
    );
    expect(targetAgent).toContain('abc123def456ghi789jkl012mno345pqr');

    // MCP — the Authorization header still carries the raw token.
    const targetMcpRaw = await fs.readFile(path.join(tmpTargetProject, '.mcp.json'), 'utf-8');
    expect(targetMcpRaw).toContain('abc123def456ghi789jkl012mno345pqr');
  });
});
