/**
 * Story 28.1: supertest integration for /api/harness/plugins routes.
 * Covers the 200 / 404 / 403 / 409 response envelopes.
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
const MARKET = 'claude-plugins-official';
const SAMPLE_PROJECT_PATH = 'C:\\Users\\sh.choi';

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

async function writeBundle(root: string, manifestName: string): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  await writeJson(path.join(root, '.claude-plugin', 'plugin.json'), { name: manifestName });
}

async function writeSampleCatalog(tmpHome: string): Promise<void> {
  const paths = {
    frontend: path.join(tmpHome, 'plugins', 'cache', MARKET, 'frontend-design', 'aa296ec'),
    context7: path.join(tmpHome, 'plugins', 'cache', MARKET, 'context7', 'aaa1111'),
  };
  await writeJson(path.join(tmpHome, 'plugins', 'installed_plugins.json'), {
    version: 2,
    plugins: {
      [`frontend-design@${MARKET}`]: [{
        scope: 'project', installPath: paths.frontend, version: 'aa296ec',
        gitCommitSha: 'aa296ec81e8c', installedAt: '2026-04-01T00:00:00Z',
        lastUpdated: '2026-04-01T00:00:00Z', projectPath: SAMPLE_PROJECT_PATH,
      }],
      [`context7@${MARKET}`]: [{
        scope: 'user', installPath: paths.context7, version: 'aaa1111',
        gitCommitSha: 'aaa1111aaaa', installedAt: '2026-04-01T00:00:00Z',
        lastUpdated: '2026-04-01T00:00:00Z',
      }],
    },
  });
  await writeBundle(paths.frontend, 'frontend-design');
  await writeBundle(paths.context7, 'context7');
}

describe('Harness plugin routes (supertest)', () => {
  let app: express.Application;
  let tmpHome: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-plugin-home-'));
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = tmpHome;
    mockResolve.mockResolvedValue(SAMPLE_PROJECT_PATH);

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
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it('GET /plugins returns HarnessPluginListResponse schema', async () => {
    await writeSampleCatalog(tmpHome);
    await writeJson(path.join(tmpHome, 'settings.json'), {
      enabledPlugins: { [`context7@${MARKET}`]: true },
    });

    const res = await request(app).get('/api/harness/plugins');
    expect(res.status).toBe(200);
    expect(res.body.enabledPluginsFormat).toBe('object');
    expect(Array.isArray(res.body.cards)).toBe(true);
    expect(res.body.cards.length).toBe(2);
    const enabled = res.body.cards.find((c: { name: string }) => c.name === 'context7');
    expect(enabled.enabled).toBe(true);
  });

  it('POST /plugins/toggle returns success envelope', async () => {
    await writeSampleCatalog(tmpHome);
    await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });

    const res = await request(app)
      .post('/api/harness/plugins/toggle')
      .send({ key: `context7@${MARKET}`, enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.appliedFormat).toBe('object');
    expect(typeof res.body.mtime).toBe('string');
  });

  it('POST /plugins/toggle → 404 for unknown key', async () => {
    await writeSampleCatalog(tmpHome);
    await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });

    const res = await request(app)
      .post('/api/harness/plugins/toggle')
      .send({ key: `ghost@${MARKET}`, enabled: true });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HARNESS_PLUGIN_NOT_FOUND');
  });

  it('POST /plugins/toggle → 403 on scope mismatch', async () => {
    await writeSampleCatalog(tmpHome);
    await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });
    mockResolve.mockResolvedValue('D:\\other-project');

    const res = await request(app)
      .post('/api/harness/plugins/toggle')
      .query({ projectSlug: 'other' })
      .send({ key: `frontend-design@${MARKET}`, enabled: true });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HARNESS_PLUGIN_SCOPE_DENIED');
  });

  it('POST /plugins/toggle → 409 on STALE_WRITE with details.currentMtime', async () => {
    await writeSampleCatalog(tmpHome);
    await writeJson(path.join(tmpHome, 'settings.json'), { enabledPlugins: {} });

    const res = await request(app)
      .post('/api/harness/plugins/toggle')
      .send({
        key: `context7@${MARKET}`,
        enabled: true,
        expectedMtime: '1999-01-01T00:00:00.000Z',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HARNESS_STALE_WRITE');
    expect(typeof res.body.error.details.currentMtime).toBe('string');
  });
});
