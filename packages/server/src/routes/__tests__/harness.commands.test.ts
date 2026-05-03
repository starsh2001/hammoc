/**
 * Story 28.5: supertest integration for /api/harness/commands routes.
 * Covers the 200 / 400 / 403 / 404 / 409 envelopes for the 7-endpoint family.
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

async function writeProjectCommand(
  projectRoot: string,
  rel: string,
  body: string,
): Promise<void> {
  const abs = path.join(projectRoot, '.claude', 'commands', rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body, 'utf-8');
}

describe('Harness command routes (supertest)', () => {
  let app: express.Application;
  let userRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    userRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'h-cmd-user-'));
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'h-cmd-proj-'));
    await fs.mkdir(path.join(projectRoot, '.claude'), { recursive: true });
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
  });

  it('GET /commands returns paletteVisibleCount + cards', async () => {
    await writeProjectCommand(projectRoot, 'foo.md', '---\ndescription: x\n---\n\nbody\n');
    const res = await request(app).get('/api/harness/commands?projectSlug=slug');
    expect(res.status).toBe(200);
    expect(res.body.cards).toBeDefined();
    expect(res.body.paletteVisibleCount).toBeGreaterThanOrEqual(1);
  });

  it('GET /commands/* 200 for an existing command', async () => {
    await writeProjectCommand(projectRoot, 'foo.md', '---\ndescription: x\n---\n\nbody\n');
    const res = await request(app)
      .get('/api/harness/commands/foo.md?scope=project&projectSlug=slug');
    expect(res.status).toBe(200);
    expect(res.body.frontmatter.description).toBe('x');
  });

  it('GET /commands/* 404 for missing path', async () => {
    const res = await request(app)
      .get('/api/harness/commands/missing.md?scope=project&projectSlug=slug');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HARNESS_COMMAND_NOT_FOUND');
  });

  it('POST /commands 200 creates a new file', async () => {
    const res = await request(app)
      .post('/api/harness/commands')
      .send({
        scope: 'project',
        projectSlug: 'slug',
        relativePath: 'created.md',
        body: '# new\n',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /commands 400 on OS-reserved characters in relativePath', async () => {
    const res = await request(app)
      .post('/api/harness/commands')
      .send({
        scope: 'project',
        projectSlug: 'slug',
        relativePath: 'has*star.md',
      });
    expect(res.status).toBe(400);
  });

  it('POST /commands 409 when target file already exists', async () => {
    await writeProjectCommand(projectRoot, 'dup.md', '# original\n');
    const res = await request(app)
      .post('/api/harness/commands')
      .send({
        scope: 'project',
        projectSlug: 'slug',
        relativePath: 'dup.md',
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_COMMAND_NAME_CONFLICT');
  });

  it('PUT /commands/* 200 frontmatter update', async () => {
    await writeProjectCommand(projectRoot, 'edit.md', '---\ndescription: old\n---\n\nbody\n');
    const list = await request(app).get('/api/harness/commands?projectSlug=slug');
    const card = list.body.cards.find((c: { relativePath: string }) => c.relativePath === 'edit.md');
    const res = await request(app)
      .put('/api/harness/commands/edit.md?scope=project&projectSlug=slug')
      .send({ frontmatter: { description: 'new' }, expectedMtime: card.mtime });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /commands/copy 403 when secrets present without ack', async () => {
    await writeProjectCommand(projectRoot, 'sec.md', '# leak\n\nBearer abcdef0123456789abcdef\n');
    const res = await request(app)
      .post('/api/harness/commands/copy')
      .send({
        sourceScope: 'project',
        sourceProjectSlug: 'slug',
        sourceRelativePath: 'sec.md',
        targetScope: 'user',
        onConflict: 'overwrite',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HARNESS_FORBIDDEN');
    expect(res.body.error.details?.cause).toBe('secret-not-acknowledged');
  });

  it('POST /commands/copy 200 when ack is provided', async () => {
    await writeProjectCommand(projectRoot, 'plain.md', '# hi\n');
    const res = await request(app)
      .post('/api/harness/commands/copy')
      .send({
        sourceScope: 'project',
        sourceProjectSlug: 'slug',
        sourceRelativePath: 'plain.md',
        targetScope: 'user',
        onConflict: 'overwrite',
      });
    expect(res.status).toBe(200);
    expect(res.body.target.scope).toBe('user');
  });

  it('DELETE /commands/* 200 removes the file', async () => {
    await writeProjectCommand(projectRoot, 'gone.md', '# bye\n');
    const list = await request(app).get('/api/harness/commands?projectSlug=slug');
    const card = list.body.cards.find((c: { relativePath: string }) => c.relativePath === 'gone.md');
    const res = await request(app)
      .delete('/api/harness/commands/gone.md?scope=project&projectSlug=slug')
      .send({ expectedMtime: card.mtime });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /commands/* 404 when path is missing', async () => {
    const res = await request(app)
      .delete('/api/harness/commands/never.md?scope=project&projectSlug=slug')
      .send({});
    expect(res.status).toBe(404);
  });
});
