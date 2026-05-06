/**
 * Story 29.2: supertest integration for /api/snippets routes.
 * Covers list/read/create/update/delete/copy + STALE_WRITE + bundled
 * read-only + path traversal rejection.
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
  broadcastSnippetList: vi.fn().mockResolvedValue(undefined),
  getIO: () => ({ to: () => ({ emit: () => {} }) }),
}));

import snippetsRoutes from '../snippets.js';
import { projectService } from '../../services/projectService.js';

const mockResolve = vi.mocked(projectService.resolveOriginalPath);

describe('Snippet routes (Story 29.2, supertest)', () => {
  let app: express.Application;
  let tmpProject: string;
  let tmpHome: string;
  let tmpBundled: string;

  const userDir = () => path.join(tmpHome, '.hammoc', 'snippets');
  const projectDir = () => path.join(tmpProject, '.hammoc', 'snippets');

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'snip-route-proj-'));
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'snip-route-home-'));
    tmpBundled = await fs.mkdtemp(path.join(os.tmpdir(), 'snip-route-bundle-'));
    process.env.HAMMOC_HOME_OVERRIDE = tmpHome;
    process.env.HAMMOC_BUNDLED_SNIPPETS_DIR = tmpBundled;
    mockResolve.mockResolvedValue(tmpProject);

    app = express();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use((req: any, _res: any, next: any) => {
      req.t = (key: string) => key;
      req.language = 'en';
      next();
    });
    app.use('/api/snippets', snippetsRoutes);
  });

  afterEach(async () => {
    delete process.env.HAMMOC_HOME_OVERRIDE;
    delete process.env.HAMMOC_BUNDLED_SNIPPETS_DIR;
    await fs.rm(tmpProject, { recursive: true, force: true });
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpBundled, { recursive: true, force: true });
  });

  it('GET / lists snippets across scopes', async () => {
    await fs.mkdir(userDir(), { recursive: true });
    await fs.mkdir(projectDir(), { recursive: true });
    await fs.writeFile(path.join(userDir(), 'g.md'), 'g');
    await fs.writeFile(path.join(projectDir(), 'p.md'), 'p');
    await fs.writeFile(path.join(tmpBundled, 'b'), 'b');

    const res = await request(app).get('/api/snippets').query({ projectSlug: 'any' });
    expect(res.status).toBe(200);
    const names = res.body.snippets.map((s: { scope: string; name: string }) => `${s.scope}:${s.name}`);
    expect(names.sort()).toEqual(['bundled:b', 'project:p', 'user:g']);
  });

  it('GET /:scope/:name reads a snippet', async () => {
    await fs.mkdir(userDir(), { recursive: true });
    await fs.writeFile(path.join(userDir(), 'hi.md'), 'hello');
    const res = await request(app).get('/api/snippets/user/hi');
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('hello');
    expect(res.body.absolutePath).toContain('hi.md');
  });

  it('GET /:scope/:name returns 404 for missing snippet', async () => {
    const res = await request(app).get('/api/snippets/user/missing');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HARNESS_FILE_NOT_FOUND');
  });

  it('POST creates a new snippet (201)', async () => {
    const res = await request(app)
      .post('/api/snippets/user/new')
      .send({ content: 'fresh' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(await fs.readFile(path.join(userDir(), 'new.md'), 'utf-8')).toBe('fresh');
  });

  it('POST returns 409 HARNESS_FILE_EXISTS on duplicate', async () => {
    await fs.mkdir(userDir(), { recursive: true });
    await fs.writeFile(path.join(userDir(), 'dup.md'), 'x');
    const res = await request(app)
      .post('/api/snippets/user/dup')
      .send({ content: 'y' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_FILE_EXISTS');
  });

  it('POST against bundled returns 409 HARNESS_BUNDLED_READONLY', async () => {
    const res = await request(app)
      .post('/api/snippets/bundled/foo')
      .send({ content: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_BUNDLED_READONLY');
  });

  it('PUT enforces STALE_WRITE with 409 + currentMtime detail', async () => {
    await fs.mkdir(userDir(), { recursive: true });
    await fs.writeFile(path.join(userDir(), 's.md'), 'v1');
    const res = await request(app)
      .put('/api/snippets/user/s')
      .send({ content: 'v2', expectedMtime: '1970-01-01T00:00:00.000Z' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_STALE_WRITE');
    expect(typeof res.body.error.details.currentMtime).toBe('string');
  });

  it('PUT updates existing snippet content', async () => {
    await fs.mkdir(userDir(), { recursive: true });
    await fs.writeFile(path.join(userDir(), 's.md'), 'v1');
    const stat = await fs.stat(path.join(userDir(), 's.md'));
    const res = await request(app)
      .put('/api/snippets/user/s')
      .send({ content: 'v2', expectedMtime: stat.mtime.toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(await fs.readFile(path.join(userDir(), 's.md'), 'utf-8')).toBe('v2');
  });

  it('DELETE removes the snippet', async () => {
    await fs.mkdir(userDir(), { recursive: true });
    await fs.writeFile(path.join(userDir(), 's.md'), 'x');
    const res = await request(app)
      .delete('/api/snippets/user/s')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /copy with conflict returns 409 HARNESS_FILE_EXISTS', async () => {
    await fs.mkdir(projectDir(), { recursive: true });
    await fs.mkdir(userDir(), { recursive: true });
    await fs.writeFile(path.join(projectDir(), 'c.md'), 'p');
    await fs.writeFile(path.join(userDir(), 'c.md'), 'u');
    const res = await request(app)
      .post('/api/snippets/copy')
      .send({
        sourceScope: 'project',
        sourceName: 'c',
        sourceProjectSlug: 'any',
        targetScope: 'user',
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_FILE_EXISTS');
  });

  it('POST /copy bundled→project succeeds (one-way clone)', async () => {
    await fs.writeFile(path.join(tmpBundled, 'std'), 'bundled body');
    const res = await request(app)
      .post('/api/snippets/copy')
      .send({
        sourceScope: 'bundled',
        sourceName: 'std',
        targetScope: 'project',
        targetProjectSlug: 'any',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(await fs.readFile(path.join(projectDir(), 'std.md'), 'utf-8')).toBe('bundled body');
  });

  it('rejects names with disallowed characters via NAME_RE (403)', async () => {
    // `+` is not in the NAME_RE char class. URL-encoded so the `+` survives
    // form-encoding decoding (where `+` would otherwise become a space).
    const res = await request(app).get('/api/snippets/user/foo%2Bbar');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HARNESS_PATH_DENIED');
  });
});
