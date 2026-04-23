/**
 * Story 28.0.5: supertest integration for /api/harness routes.
 * Covers AC1 / AC4 / AC5 on the transport layer — response envelopes and
 * HTTP status codes must match the contract documented in the story.
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

// Stub websocket.getIO so harnessService.write → fileWatcherService.noteLocalWrite
// doesn't try to touch a real Socket.IO server.
vi.mock('../../handlers/websocket.js', () => ({
  getIO: () => ({ to: () => ({ emit: () => {} }) }),
}));

import harnessRoutes from '../harness.js';
import { projectService } from '../../services/projectService.js';

const mockResolve = vi.mocked(projectService.resolveOriginalPath);

describe('Harness routes (supertest)', () => {
  let app: express.Application;
  let tmpProject: string;
  let tmpHome: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-route-proj-'));
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-route-home-'));
    await fs.mkdir(path.join(tmpProject, '.claude'), { recursive: true });
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

  // ────────────────────────── success path ──────────────────────────

  it('GET /list returns entries for project scope', async () => {
    await fs.mkdir(path.join(tmpProject, '.claude', 'skills'), { recursive: true });
    await fs.writeFile(path.join(tmpProject, '.claude', 'skills', 'one.md'), 'x');

    const res = await request(app)
      .get('/api/harness/list')
      .query({ scope: 'project', projectSlug: 'any', path: 'skills' });

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('project');
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].name).toBe('one.md');
  });

  it('PUT /write creates a new file when expectedMtime is omitted', async () => {
    const res = await request(app)
      .put('/api/harness/write')
      .query({ scope: 'project', projectSlug: 'any', path: 'fresh.json' })
      .send({ content: '{}' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ────────────────────────── error envelopes ──────────────────────────

  it('returns 403 HARNESS_PATH_DENIED for traversal', async () => {
    const res = await request(app)
      .get('/api/harness/list')
      .query({ scope: 'project', projectSlug: 'any', path: '../../etc' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HARNESS_PATH_DENIED');
  });

  it('returns 404 HARNESS_FILE_NOT_FOUND for missing file', async () => {
    const res = await request(app)
      .get('/api/harness/read')
      .query({ scope: 'project', projectSlug: 'any', path: 'absent.txt' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HARNESS_FILE_NOT_FOUND');
  });

  it('returns 409 HARNESS_STALE_WRITE with details.currentMtime', async () => {
    const abs = path.join(tmpProject, '.claude', 'conf.txt');
    await fs.writeFile(abs, 'first');
    const stale = new Date(Date.now() - 60_000).toISOString();
    const res = await request(app)
      .put('/api/harness/write')
      .query({ scope: 'project', projectSlug: 'any', path: 'conf.txt' })
      .send({ content: 'second', expectedMtime: stale });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_STALE_WRITE');
    expect(typeof res.body.error.details.currentMtime).toBe('string');
    expect(res.body.error.details.currentMtime.length).toBeGreaterThan(0);
  });

  it('returns 422 HARNESS_PARSE_ERROR from patch-structured on bad YAML', async () => {
    const abs = path.join(tmpProject, '.claude', 'bad.yaml');
    await fs.writeFile(abs, '::\ninvalid:: : : :');
    const res = await request(app)
      .post('/api/harness/patch-structured')
      .query({ scope: 'project', projectSlug: 'any', path: 'bad.yaml' })
      .send({ format: 'yaml', ops: [{ path: ['x'], value: 1 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('HARNESS_PARSE_ERROR');
  });

  it('returns 400 INVALID_REQUEST when scope=project is missing projectSlug', async () => {
    const res = await request(app)
      .get('/api/harness/list')
      .query({ scope: 'project', path: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });
});
