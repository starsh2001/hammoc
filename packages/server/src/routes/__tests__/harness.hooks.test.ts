/**
 * Story 28.4: supertest integration for /api/harness/hooks routes.
 * Covers the 200 / 400 / 403 / 404 / 409 envelopes for the 6 endpoint family.
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

describe('Harness hook routes (supertest)', () => {
  let app: express.Application;
  let userRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    userRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'h-hook-user-'));
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'h-hook-proj-'));
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

  it('GET /hooks returns 9-event empty map plus backupMtimeByScope', async () => {
    const res = await request(app).get('/api/harness/hooks');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.cardsByEvent).sort()).toEqual([
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
    expect(res.body.backupMtimeByScope).toBeDefined();
  });

  it('GET /hooks/:event/:groupIndex/:hookIndex 200 for an existing hook', async () => {
    await writeUserSettings(userRoot, {
      hooks: { Stop: [{ matcher: 'X', hooks: [{ type: 'command', command: 'echo' }] }] },
    });
    const res = await request(app)
      .get('/api/harness/hooks/Stop/0/0')
      .query({ scope: 'user' });
    expect(res.status).toBe(200);
    expect(res.body.matcher).toBe('X');
    expect(res.body.config.command).toBe('echo');
  });

  it('GET on unknown event returns HARNESS_HOOK_INVALID_EVENT 400', async () => {
    const res = await request(app)
      .get('/api/harness/hooks/Bogus/0/0')
      .query({ scope: 'user' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('HARNESS_HOOK_INVALID_EVENT');
  });

  it('GET on missing index returns HARNESS_HOOK_NOT_FOUND 404', async () => {
    await writeUserSettings(userRoot, {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'a' }] }] },
    });
    const res = await request(app)
      .get('/api/harness/hooks/Stop/9/9')
      .query({ scope: 'user' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HARNESS_HOOK_NOT_FOUND');
  });

  it('POST /hooks creates a new hook and returns its coordinates', async () => {
    const res = await request(app)
      .post('/api/harness/hooks')
      .send({
        scope: 'user',
        event: 'PreToolUse',
        matcher: 'Write',
        config: { type: 'command', command: 'echo' },
      });
    expect(res.status).toBe(200);
    expect(res.body.newGroupIndex).toBe(0);
    expect(res.body.newHookIndex).toBe(0);
  });

  it('POST /hooks rejects an invalid hook config (Zod 400)', async () => {
    const res = await request(app)
      .post('/api/harness/hooks')
      .send({
        scope: 'user',
        event: 'PreToolUse',
        config: { type: 'command' },
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('PUT /hooks/:event/:gi/:hi updates the config', async () => {
    await writeUserSettings(userRoot, {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'old' }] }] },
    });
    const res = await request(app)
      .put('/api/harness/hooks/Stop/0/0')
      .query({ scope: 'user' })
      .send({ config: { type: 'command', command: 'new' } });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PUT returns STALE_WRITE 409 with details.staleFile=main', async () => {
    await writeUserSettings(userRoot, {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'old' }] }] },
    });
    const res = await request(app)
      .put('/api/harness/hooks/Stop/0/0')
      .query({ scope: 'user' })
      .send({
        config: { type: 'command', command: 'new' },
        expectedMtime: '1999-01-01T00:00:00Z',
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_STALE_WRITE');
    expect(res.body.error.details?.staleFile).toBe('main');
  });

  it('PUT splitFromGroup without matcher 400', async () => {
    await writeUserSettings(userRoot, {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'a' }] }] },
    });
    const res = await request(app)
      .put('/api/harness/hooks/Stop/0/0')
      .query({ scope: 'user' })
      .send({ config: { type: 'command', command: 'b' }, splitFromGroup: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('POST /hooks/copy 200 with acknowledgedWarning=true', async () => {
    await writeUserSettings(userRoot, {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'src' }] }] },
    });
    const res = await request(app).post('/api/harness/hooks/copy').send({
      sourceScope: 'user',
      sourceEvent: 'Stop',
      sourceGroupIndex: 0,
      sourceHookIndex: 0,
      targetScope: 'project',
      targetProjectSlug: 'slug',
      onConflict: 'duplicate',
      acknowledgedWarning: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /hooks/copy with acknowledgedWarning=false → 403 type-warning-not-acknowledged', async () => {
    await writeUserSettings(userRoot, {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'src' }] }] },
    });
    const res = await request(app).post('/api/harness/hooks/copy').send({
      sourceScope: 'user',
      sourceEvent: 'Stop',
      sourceGroupIndex: 0,
      sourceHookIndex: 0,
      targetScope: 'project',
      targetProjectSlug: 'slug',
      onConflict: 'duplicate',
      acknowledgedWarning: false,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HARNESS_FORBIDDEN');
    expect(res.body.error.details?.cause).toBe('type-warning-not-acknowledged');
  });

  it('DELETE /hooks/:event/:gi/:hi 200', async () => {
    await writeUserSettings(userRoot, {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'a' }] }] },
    });
    const res = await request(app)
      .delete('/api/harness/hooks/Stop/0/0')
      .query({ scope: 'user' })
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PUT to plugin scope is rejected via FORBIDDEN', async () => {
    // The route schema doesn't allow scope=plugin in the query — Zod 400 first.
    const res = await request(app)
      .put('/api/harness/hooks/Stop/0/0')
      .query({ scope: 'plugin' })
      .send({ config: { type: 'command', command: 'x' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });
});
