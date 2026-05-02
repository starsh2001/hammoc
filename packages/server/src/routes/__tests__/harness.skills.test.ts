/**
 * Story 28.2: supertest integration for /api/harness/skills routes.
 * Covers the 200 / 400 / 403 / 404 / 409 envelopes for the 5 endpoint family.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

vi.mock('../../services/projectService.js', () => ({
  projectService: {
    resolveOriginalPath: vi.fn(),
  },
}));
vi.mock('../../handlers/websocket.js', () => ({
  getIO: () => ({ to: () => ({ emit: () => {} }) }),
}));

import harnessRoutes from '../harness.js';
import { projectService } from '../../services/projectService.js';

const mockResolve = vi.mocked(projectService.resolveOriginalPath);
const PLUGIN_KEY = 'demo-plugin@market';

async function writeSkill(
  root: string,
  name: string,
  options: { description?: string; body?: string; bundle?: Record<string, string> } = {},
): Promise<void> {
  const dir = path.join(root, 'skills', name);
  await fs.mkdir(dir, { recursive: true });
  const fm = `name: ${name}\ndescription: ${options.description ?? `Skill ${name}`}\n`;
  const content = `---\n${fm}---\n${options.body ?? `# ${name}\n`}`;
  await fs.writeFile(path.join(dir, 'SKILL.md'), content, 'utf-8');
  if (options.bundle) {
    for (const [rel, body] of Object.entries(options.bundle)) {
      const abs = path.join(dir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, body);
    }
  }
}

async function writeInstalledPluginsCatalog(userRoot: string, installPath: string): Promise<void> {
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
              installPath,
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

describe('Harness skill routes (supertest)', () => {
  let app: express.Application;
  let userRoot: string;
  let projectRoot: string;
  let pluginRoot: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    userRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'h-skill-user-'));
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'h-skill-proj-'));
    pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'h-skill-plug-'));
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = userRoot;
    mockResolve.mockResolvedValue(projectRoot);

    app = express();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use((req: any, _res: any, next: any) => {
      req.t = (key: string) => key;
      req.language = 'en';
      next();
    });
    app.use('/api/harness', harnessRoutes);
  });

  afterEach(async () => {
    delete process.env.HAMMOC_HARNESS_HOME_OVERRIDE;
    await fs.rm(userRoot, { recursive: true, force: true });
    await fs.rm(projectRoot, { recursive: true, force: true });
    await fs.rm(pluginRoot, { recursive: true, force: true });
  });

  it('GET /skills returns merged sources from all 3 scopes', async () => {
    await writeSkill(path.join(projectRoot, '.claude'), 'shared');
    await writeSkill(userRoot, 'shared');
    await writeInstalledPluginsCatalog(userRoot, pluginRoot);
    await writeSkill(pluginRoot, 'shared');

    const res = await request(app).get('/api/harness/skills').query({ projectSlug: 'slug' });

    expect(res.status).toBe(200);
    const card = res.body.cards.find((c: { name: string }) => c.name === 'shared');
    expect(card.sources).toHaveLength(3);
    expect(card.activeScope).toBe('project');
  });

  it('GET /skills/:name returns body and bundle entries', async () => {
    await writeSkill(userRoot, 'demo', { bundle: { 'references/notes.md': 'notes' } });

    const res = await request(app)
      .get('/api/harness/skills/demo')
      .query({ scope: 'user' });

    expect(res.status).toBe(200);
    expect(res.body.frontmatter.name).toBe('demo');
    expect(res.body.bundleEntries.find((e: { relativePath: string }) => e.relativePath === 'references/notes.md')).toBeDefined();
  });

  it('GET /skills/:name → 404 SKILL_NOT_FOUND when missing', async () => {
    const res = await request(app)
      .get('/api/harness/skills/ghost')
      .query({ scope: 'user' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HARNESS_SKILL_NOT_FOUND');
  });

  it('PUT /skills/:name → 200 success on body-only update', async () => {
    await writeSkill(userRoot, 'demo');
    const read = await request(app).get('/api/harness/skills/demo').query({ scope: 'user' });

    const put = await request(app)
      .put('/api/harness/skills/demo')
      .query({ scope: 'user' })
      .send({ body: '# new body\n', expectedMtime: read.body.skillMdMtime });
    expect(put.status).toBe(200);
    expect(put.body.success).toBe(true);
  });

  it('PUT /skills/:name → 409 STALE_WRITE with details.currentMtime', async () => {
    await writeSkill(userRoot, 'demo');
    const put = await request(app)
      .put('/api/harness/skills/demo')
      .query({ scope: 'user' })
      .send({ body: '# new\n', expectedMtime: '1999-01-01T00:00:00.000Z' });
    expect(put.status).toBe(409);
    expect(put.body.error.code).toBe('HARNESS_STALE_WRITE');
    expect(typeof put.body.error.details.currentMtime).toBe('string');
  });

  it('POST /skills/copy → 200 with file count and finalName', async () => {
    await writeSkill(userRoot, 'src', { bundle: { 'references/a.md': 'a' } });
    const res = await request(app)
      .post('/api/harness/skills/copy')
      .send({
        sourceScope: 'user',
        sourceName: 'src',
        targetScope: 'project',
        targetProjectSlug: 'slug',
        targetName: 'src',
        onConflict: 'overwrite',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.copied).toBeGreaterThan(0);
  });

  it('POST /skills/copy → 400 when targetScope=plugin', async () => {
    const res = await request(app)
      .post('/api/harness/skills/copy')
      .send({
        sourceScope: 'user',
        sourceName: 'src',
        targetScope: 'plugin',
        targetName: 'src',
        onConflict: 'overwrite',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('POST /skills/copy → 400 on reserved-character name', async () => {
    await writeSkill(userRoot, 'src');
    const res = await request(app)
      .post('/api/harness/skills/copy')
      .send({
        sourceScope: 'user',
        sourceName: 'src',
        targetScope: 'user',
        targetName: 'inva|lid',
        onConflict: 'overwrite',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('POST /skills/copy → 409 when rename mode collides too', async () => {
    await writeSkill(userRoot, 'src');
    await writeSkill(path.join(projectRoot, '.claude'), 'src-renamed');
    const res = await request(app)
      .post('/api/harness/skills/copy')
      .send({
        sourceScope: 'user',
        sourceName: 'src',
        targetScope: 'project',
        targetProjectSlug: 'slug',
        targetName: 'src-renamed',
        onConflict: 'rename',
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_SKILL_NAME_CONFLICT');
  });

  it('GET /skills/:name → 403 PATH_DENIED on reserved-char name', async () => {
    // %7C decodes to '|', which RESERVED_NAME_RE blocks as a Windows-reserved
    // character. This guards against the same family of risks as path
    // traversal — a name that escapes the skill root or encodes OS-illegal
    // segments.
    const res = await request(app)
      .get('/api/harness/skills/foo%7Cbar')
      .query({ scope: 'user' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HARNESS_PATH_DENIED');
  });

  it('PUT /skills/:name → 403 PATH_DENIED on reserved-char name', async () => {
    const res = await request(app)
      .put('/api/harness/skills/foo%7Cbar')
      .query({ scope: 'user' })
      .send({ body: 'x', expectedMtime: '2026-01-01T00:00:00Z' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HARNESS_PATH_DENIED');
  });

  it('PUT /skills/:name with scope=plugin is rejected at validation (Zod editableScope)', async () => {
    const res = await request(app)
      .put('/api/harness/skills/demo')
      .query({ scope: 'plugin' })
      .send({ body: 'no' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('GET /skills/:name/bundle/* reads a text bundle file', async () => {
    await writeSkill(userRoot, 'demo', { bundle: { 'references/a.md': 'hello' } });
    const res = await request(app)
      .get('/api/harness/skills/demo/bundle/references/a.md')
      .query({ scope: 'user' });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('hello');
  });

  it('PUT /skills/:name/bundle/* writes a text bundle file with mtime guard', async () => {
    await writeSkill(userRoot, 'demo', { bundle: { 'references/a.md': 'hello' } });
    const read = await request(app)
      .get('/api/harness/skills/demo/bundle/references/a.md')
      .query({ scope: 'user' });
    const res = await request(app)
      .put('/api/harness/skills/demo/bundle/references/a.md')
      .query({ scope: 'user' })
      .send({ content: 'updated', expectedMtime: read.body.mtime });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
