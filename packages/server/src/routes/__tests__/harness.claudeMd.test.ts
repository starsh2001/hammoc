/**
 * Story 29.1: supertest integration for /api/harness/claude-md routes.
 * Covers AC1 (read/write happy path + STALE_WRITE), AC4 (POST create-empty
 * with HARNESS_FILE_EXISTS guard), and AC6 (project-root path is sibling of
 * `.claude/`, not inside it).
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

describe('CLAUDE.md routes (Story 29.1, supertest)', () => {
  let app: express.Application;
  let tmpProject: string;
  let tmpHome: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'claudemd-route-proj-'));
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'claudemd-route-home-'));
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = tmpHome;
    mockResolve.mockResolvedValue(tmpProject);

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
    await fs.rm(tmpProject, { recursive: true, force: true });
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  // ─────────── GET /claude-md ───────────

  it('GET returns 404 with HARNESS_FILE_NOT_FOUND when missing', async () => {
    const res = await request(app)
      .get('/api/harness/claude-md')
      .query({ scope: 'project', projectSlug: 'any' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HARNESS_FILE_NOT_FOUND');
    // AC4.c — 404 must include the resolved absolute path in details so the
    // client can render the empty-state "Create CLAUDE.md?" dialog with the
    // canonical location even before the file exists.
    expect(res.body.error.details.absolutePath).toBe(path.join(tmpProject, 'CLAUDE.md'));
  });

  it('GET reads project-root CLAUDE.md (sibling of .claude/)', async () => {
    await fs.writeFile(path.join(tmpProject, 'CLAUDE.md'), '# project\n');
    const res = await request(app)
      .get('/api/harness/claude-md')
      .query({ scope: 'project', projectSlug: 'any' });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('# project\n');
    expect(res.body.path).toBe('CLAUDE.md');
    expect(typeof res.body.mtime).toBe('string');
    expect(res.body.absolutePath).toBe(path.join(tmpProject, 'CLAUDE.md'));
  });

  it('GET reads global CLAUDE.md from ~/.claude/CLAUDE.md', async () => {
    await fs.writeFile(path.join(tmpHome, 'CLAUDE.md'), '# global\n');
    const res = await request(app)
      .get('/api/harness/claude-md')
      .query({ scope: 'user' });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('# global\n');
  });

  it('GET requires projectSlug when scope is project (400)', async () => {
    const res = await request(app)
      .get('/api/harness/claude-md')
      .query({ scope: 'project' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  // ─────────── PUT /claude-md ───────────

  it('PUT writes content with no expectedMtime (force-create)', async () => {
    const res = await request(app)
      .put('/api/harness/claude-md')
      .send({ scope: 'project', projectSlug: 'any', content: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const onDisk = await fs.readFile(path.join(tmpProject, 'CLAUDE.md'), 'utf-8');
    expect(onDisk).toBe('hello');
  });

  it('PUT returns 409 STALE_WRITE with currentMtime when mtime mismatches', async () => {
    await fs.writeFile(path.join(tmpProject, 'CLAUDE.md'), 'before');
    const stale = new Date(Date.now() - 60_000).toISOString();
    const res = await request(app)
      .put('/api/harness/claude-md')
      .send({ scope: 'project', projectSlug: 'any', content: 'after', expectedMtime: stale });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_STALE_WRITE');
    expect(typeof res.body.error.details.currentMtime).toBe('string');
  });

  // ─────────── POST /claude-md ───────────

  it('POST creates an empty file when none exists (201)', async () => {
    const res = await request(app)
      .post('/api/harness/claude-md')
      .send({ scope: 'project', projectSlug: 'any' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const onDisk = await fs.readFile(path.join(tmpProject, 'CLAUDE.md'), 'utf-8');
    expect(onDisk).toBe('');
  });

  it('POST returns 409 HARNESS_FILE_EXISTS when the file already exists (no overwrite)', async () => {
    await fs.writeFile(path.join(tmpProject, 'CLAUDE.md'), 'existing');
    const res = await request(app)
      .post('/api/harness/claude-md')
      .send({ scope: 'project', projectSlug: 'any' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_FILE_EXISTS');
    const onDisk = await fs.readFile(path.join(tmpProject, 'CLAUDE.md'), 'utf-8');
    expect(onDisk).toBe('existing');
  });

  it('POST auto-mkdirs ~/.claude/ for user scope on a fresh machine', async () => {
    // Move HOME_OVERRIDE to a path whose parent exists but `.claude` does not.
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'claudemd-route-empty-home-'));
    const fakeHome = path.join(parent, '.claude'); // does not exist
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = fakeHome;
    try {
      const res = await request(app)
        .post('/api/harness/claude-md')
        .send({ scope: 'user' });
      expect(res.status).toBe(201);
      const stat = await fs.stat(fakeHome);
      expect(stat.isDirectory()).toBe(true);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  });

  it('POST/PUT 400 when scope=project but projectSlug missing', async () => {
    const post = await request(app).post('/api/harness/claude-md').send({ scope: 'project' });
    const put = await request(app)
      .put('/api/harness/claude-md')
      .send({ scope: 'project', content: 'x' });
    expect(post.status).toBe(400);
    expect(put.status).toBe(400);
  });
});
