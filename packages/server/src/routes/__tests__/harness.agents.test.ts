/**
 * Story 28.6: supertest integration for /api/harness/agents routes.
 * Covers the 200 / 400 / 403 / 404 / 409 envelopes for the 6-endpoint family.
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

function buildAgentRaw(name: string): string {
  return `---\nname: ${name}\ndescription: a description\nmodel: sonnet\ncolor: blue\n---\n\nsystem prompt body\n`;
}

async function writeProjectAgent(
  projectRoot: string,
  rel: string,
  body: string,
): Promise<void> {
  const abs = path.join(projectRoot, '.claude', 'agents', rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body, 'utf-8');
}

describe('Harness agent routes (supertest)', () => {
  let app: express.Application;
  let userRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    userRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'h-ag-user-'));
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'h-ag-proj-'));
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

  it('GET /agents 200 returns cards + malformed', async () => {
    await writeProjectAgent(projectRoot, 'code-reviewer.md', buildAgentRaw('code-reviewer'));
    const res = await request(app).get('/api/harness/agents?projectSlug=slug');
    expect(res.status).toBe(200);
    expect(res.body.cards).toBeDefined();
    expect(res.body.malformed).toBeDefined();
  });

  it('GET /agents 400 for invalid query (projectSlug empty string)', async () => {
    const res = await request(app).get('/api/harness/agents?projectSlug=');
    // empty string projectSlug — Zod min(1) rejects.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('GET /agents/:name 200 for existing agent', async () => {
    await writeProjectAgent(projectRoot, 'reader.md', buildAgentRaw('reader'));
    const res = await request(app)
      .get('/api/harness/agents/reader?scope=project&projectSlug=slug');
    expect(res.status).toBe(200);
    expect(res.body.frontmatter.name).toBe('reader');
  });

  it('GET /agents/:name 404 for missing agent', async () => {
    const res = await request(app)
      .get('/api/harness/agents/missing?scope=project&projectSlug=slug');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HARNESS_AGENT_NOT_FOUND');
  });

  it('POST /agents 200 creates a new agent', async () => {
    const res = await request(app)
      .post('/api/harness/agents')
      .send({
        scope: 'project',
        projectSlug: 'slug',
        name: 'created-agent',
        frontmatter: {
          name: 'created-agent',
          description: 'd',
          model: 'sonnet',
          color: 'blue',
        },
        body: '',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /agents 400 for name regex failure', async () => {
    const res = await request(app)
      .post('/api/harness/agents')
      .send({
        scope: 'project',
        projectSlug: 'slug',
        name: 'BAD',
        frontmatter: {
          name: 'BAD',
          description: 'd',
          model: 'sonnet',
          color: 'blue',
        },
      });
    expect(res.status).toBe(400);
  });

  it('POST /agents 409 on name conflict', async () => {
    await writeProjectAgent(projectRoot, 'duplicate.md', buildAgentRaw('duplicate'));
    const res = await request(app)
      .post('/api/harness/agents')
      .send({
        scope: 'project',
        projectSlug: 'slug',
        name: 'duplicate',
        frontmatter: {
          name: 'duplicate',
          description: 'd',
          model: 'sonnet',
          color: 'blue',
        },
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_AGENT_NAME_CONFLICT');
  });

  it('PUT /agents/:name 200 updates the frontmatter', async () => {
    await writeProjectAgent(projectRoot, 'updateable.md', buildAgentRaw('updateable'));
    const res = await request(app)
      .put('/api/harness/agents/updateable?scope=project&projectSlug=slug')
      .send({
        frontmatter: {
          name: 'updateable',
          description: 'updated',
          model: 'opus',
          color: 'green',
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PUT /agents/:name 409 on STALE_WRITE', async () => {
    await writeProjectAgent(projectRoot, 'stale.md', buildAgentRaw('stale'));
    const res = await request(app)
      .put('/api/harness/agents/stale?scope=project&projectSlug=slug')
      .send({
        body: 'changed',
        expectedMtime: '1970-01-01T00:00:00Z',
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_STALE_WRITE');
  });

  it('POST /agents/copy 200 copies project → user', async () => {
    await writeProjectAgent(projectRoot, 'copyme.md', buildAgentRaw('copyme'));
    const res = await request(app)
      .post('/api/harness/agents/copy')
      .send({
        sourceScope: 'project',
        sourceProjectSlug: 'slug',
        sourceName: 'copyme',
        targetScope: 'user',
        onConflict: 'overwrite',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /agents/copy 403 when secret without acknowledgedSecret', async () => {
    const body = `---
name: secret-agent
description: do not share Bearer abcdefghijklmnopqrstuv1234567890
model: sonnet
color: blue
---

Body
`;
    await writeProjectAgent(projectRoot, 'secret-agent.md', body);
    const res = await request(app)
      .post('/api/harness/agents/copy')
      .send({
        sourceScope: 'project',
        sourceProjectSlug: 'slug',
        sourceName: 'secret-agent',
        targetScope: 'user',
        onConflict: 'overwrite',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HARNESS_FORBIDDEN');
    expect(res.body.error.details?.cause).toBe('secret-not-acknowledged');
  });

  it('DELETE /agents/:name 200 deletes the file', async () => {
    await writeProjectAgent(projectRoot, 'deletable.md', buildAgentRaw('deletable'));
    const res = await request(app)
      .delete('/api/harness/agents/deletable?scope=project&projectSlug=slug')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
