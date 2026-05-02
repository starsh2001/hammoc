/**
 * Story 28.3: supertest integration for /api/harness/mcps routes.
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

async function writeUserMcp(userRoot: string, content: object): Promise<void> {
  await fs.writeFile(path.join(userRoot, '.mcp.json'), JSON.stringify(content, null, 2), 'utf-8');
}

async function writeProjectMcp(projectRoot: string, content: object): Promise<void> {
  await fs.writeFile(path.join(projectRoot, '.mcp.json'), JSON.stringify(content, null, 2), 'utf-8');
}

describe('Harness mcp routes (supertest)', () => {
  let app: express.Application;
  let userRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    userRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'h-mcp-user-'));
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'h-mcp-proj-'));
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

  it('GET /mcps returns the empty card list when nothing is on disk', async () => {
    const res = await request(app).get('/api/harness/mcps');
    expect(res.status).toBe(200);
    expect(res.body.cards).toEqual([]);
    expect(res.body.userFileKind).toBe('mcp.json');
    expect(res.body.disableStrategy).toBe('backup');
  });

  it('GET /mcps merges user + project sources', async () => {
    await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'u' } } });
    await writeProjectMcp(projectRoot, { mcpServers: { foo: { command: 'p' } } });
    const res = await request(app).get('/api/harness/mcps').query({ projectSlug: 'slug' });
    expect(res.status).toBe(200);
    const card = res.body.cards.find((c: { name: string }) => c.name === 'foo');
    expect(card.sources).toHaveLength(2);
    expect(card.activeScope).toBe('project');
  });

  it('GET /mcps/:name returns the config + raw + mtime', async () => {
    await writeUserMcp(userRoot, {
      mcpServers: { foo: { type: 'http', url: 'https://example.com' } },
    });
    const res = await request(app).get('/api/harness/mcps/foo').query({ scope: 'user' });
    expect(res.status).toBe(200);
    expect(res.body.config.url).toBe('https://example.com');
  });

  it('GET /mcps/:name returns 404 for missing entries', async () => {
    await writeUserMcp(userRoot, { mcpServers: {} });
    const res = await request(app).get('/api/harness/mcps/missing').query({ scope: 'user' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HARNESS_MCP_NOT_FOUND');
  });

  it('PUT /mcps/:name updates config', async () => {
    await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'old' } } });
    const res = await request(app)
      .put('/api/harness/mcps/foo')
      .query({ scope: 'user' })
      .send({ config: { command: 'new', args: ['flag'] } });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PUT /mcps/:name surfaces validation 400 for missing command on stdio', async () => {
    await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'old' } } });
    const res = await request(app)
      .put('/api/harness/mcps/foo')
      .query({ scope: 'user' })
      .send({ config: { type: 'stdio' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('PUT /mcps/:name surfaces STALE_WRITE 409 with currentMtime details', async () => {
    await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'old' } } });
    const res = await request(app)
      .put('/api/harness/mcps/foo')
      .query({ scope: 'user' })
      .send({ config: { command: 'new' }, expectedMtime: '1990-01-01T00:00:00.000Z' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_STALE_WRITE');
    expect(res.body.error.details.currentMtime).toBeTruthy();
  });

  it('POST /mcps/copy succeeds for user → project', async () => {
    await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'echo' } } });
    await writeProjectMcp(projectRoot, { mcpServers: {} });
    const res = await request(app)
      .post('/api/harness/mcps/copy')
      .send({
        sourceScope: 'user',
        sourceName: 'foo',
        targetScope: 'project',
        targetProjectSlug: 'slug',
        targetName: 'foo',
        onConflict: 'overwrite',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /mcps/copy returns 403 cause=secret-not-acknowledged when secrets are present', async () => {
    await writeUserMcp(userRoot, {
      mcpServers: {
        foo: { type: 'http', url: 'https://x', headers: { Auth: 'Bearer abcdefghijklmnopqrst' } },
      },
    });
    await writeProjectMcp(projectRoot, { mcpServers: {} });
    const res = await request(app)
      .post('/api/harness/mcps/copy')
      .send({
        sourceScope: 'user',
        sourceName: 'foo',
        targetScope: 'project',
        targetProjectSlug: 'slug',
        targetName: 'foo',
        onConflict: 'overwrite',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HARNESS_FORBIDDEN');
    expect(res.body.error.details.cause).toBe('secret-not-acknowledged');
  });

  it('DELETE /mcps/:name removes the entry', async () => {
    await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'echo' } } });
    const res = await request(app).delete('/api/harness/mcps/foo').query({ scope: 'user' });
    expect(res.status).toBe(200);
    const onDisk = JSON.parse(await fs.readFile(path.join(userRoot, '.mcp.json'), 'utf-8'));
    expect(onDisk.mcpServers.foo).toBeUndefined();
  });

  it('rejects reserved-character names via 403 HARNESS_PATH_DENIED', async () => {
    await writeUserMcp(userRoot, { mcpServers: { foo: { command: 'echo' } } });
    const res = await request(app)
      .get('/api/harness/mcps/' + encodeURIComponent('foo/bar'))
      .query({ scope: 'user' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HARNESS_PATH_DENIED');
  });
});
