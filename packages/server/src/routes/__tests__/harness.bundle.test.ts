/**
 * Story 30.5 (Task B.4): Supertest integration for the 4 harness bundle
 * endpoints.
 *
 * Endpoints covered (13 cases total):
 *   POST /api/harness/bundle/export
 *     - 200 success on a populated project
 *     - 400 invalid body (missing includes)
 *     - 400 included-explicit without acknowledgedSecretInclusion
 *     - included-explicit forces the `WITH-SECRETS` filename (Content-Disposition)
 *   POST /api/harness/bundle/import/preview
 *     - 200 success with a freshly-built bundle
 *     - 400 missing `file` field
 *     - 415 non-multipart Content-Type
 *   POST /api/harness/bundle/import/apply
 *     - 200 success when token resolves
 *     - 404 unknown bundle token
 *     - 422 future-bundle apply refusal
 *   GET /api/harness/bundle/plugin-deps
 *     - 200 with an empty plugin catalog
 *     - 400 missing projectSlug
 *
 * `projectService.resolveOriginalPath` is mocked to redirect every slug to a
 * temp project root; `harnessPluginService.listCards` is mocked to return an
 * empty catalog so the import path never has to read a real plugin tree.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import JSZip from 'jszip';

vi.mock('../../services/projectService.js', () => ({
  projectService: {
    resolveOriginalPath: vi.fn(),
  },
}));
vi.mock('../../services/harnessPluginService.js', () => ({
  harnessPluginService: {
    listCards: vi.fn(),
  },
}));
vi.mock('../../handlers/websocket.js', () => ({
  getIO: () => ({ to: () => ({ emit: () => {} }) }),
}));

import harnessRoutes from '../harness.js';
import { projectService } from '../../services/projectService.js';
import { harnessPluginService } from '../../services/harnessPluginService.js';
import { harnessBundleService } from '../../services/harnessBundleService.js';

const mockResolve = vi.mocked(projectService.resolveOriginalPath);
const mockListPlugins = vi.mocked(harnessPluginService.listCards);

describe('Harness bundle routes', () => {
  let app: express.Application;
  let tmpProject: string;
  let tmpHome: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'bundle-route-proj-'));
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'bundle-route-home-'));
    process.env.HAMMOC_HARNESS_HOME_OVERRIDE = tmpHome;
    mockResolve.mockResolvedValue(tmpProject);
    mockListPlugins.mockResolvedValue({
      cards: [],
      enabledPluginsFormat: 'object',
      settingsMtime: '',
    });

    // Seed a tiny CLAUDE.md so the export path has something to serialize.
    await fs.writeFile(path.join(tmpProject, 'CLAUDE.md'), '# Project memory\n');

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

  // ----- POST /api/harness/bundle/export ------------------------------------

  it('POST /bundle/export — 200 returns a ZIP attachment', async () => {
    const res = await request(app)
      .post('/api/harness/bundle/export')
      .send({
        projectSlug: 'any',
        includes: ['claude-md'],
        secretsPolicy: 'excluded',
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/zip/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=".+\.zip"/);
  });

  it('POST /bundle/export — 400 when includes is missing', async () => {
    const res = await request(app)
      .post('/api/harness/bundle/export')
      .send({ projectSlug: 'any', secretsPolicy: 'excluded' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('POST /bundle/export — 400 when included-explicit omits acknowledgedSecretInclusion', async () => {
    const res = await request(app)
      .post('/api/harness/bundle/export')
      .send({
        projectSlug: 'any',
        includes: ['claude-md'],
        secretsPolicy: 'included-explicit',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('POST /bundle/export — included-explicit forces the WITH-SECRETS suffix in Content-Disposition', async () => {
    const res = await request(app)
      .post('/api/harness/bundle/export')
      .send({
        projectSlug: 'specimen',
        includes: ['claude-md'],
        secretsPolicy: 'included-explicit',
        acknowledgedSecretInclusion: true,
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/-WITH-SECRETS\.zip"/);
  });

  // ----- POST /api/harness/bundle/import/preview ----------------------------

  it('POST /bundle/import/preview — 200 returns manifest + preview for a valid bundle', async () => {
    const exp = await harnessBundleService.export({
      projectSlug: 'any',
      includes: ['claude-md'],
      secretsPolicy: 'excluded',
    });
    const res = await request(app)
      .post('/api/harness/bundle/import/preview')
      .field('projectSlug', 'any')
      .attach('file', exp.zipBuffer, 'bundle.zip');
    expect(res.status).toBe(200);
    expect(res.body.bundleToken).toBeDefined();
    expect(res.body.compatibility).toBe('compatible');
    expect(res.body.manifest.bundleVersion).toBe(1);
    expect(Array.isArray(res.body.preview.items)).toBe(true);
  });

  it('POST /bundle/import/preview — 400 when file field is missing', async () => {
    const res = await request(app)
      .post('/api/harness/bundle/import/preview')
      .field('projectSlug', 'any');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FILE');
  });

  it('POST /bundle/import/preview — 415 when Content-Type is not multipart', async () => {
    const res = await request(app)
      .post('/api/harness/bundle/import/preview')
      .set('Content-Type', 'application/json')
      .send({ projectSlug: 'any' });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  // ----- POST /api/harness/bundle/import/apply ------------------------------

  it('POST /bundle/import/apply — 200 applies a previously-previewed bundle', async () => {
    const exp = await harnessBundleService.export({
      projectSlug: 'any',
      includes: ['claude-md'],
      secretsPolicy: 'excluded',
    });
    const previewRes = await request(app)
      .post('/api/harness/bundle/import/preview')
      .field('projectSlug', 'any')
      .attach('file', exp.zipBuffer, 'bundle.zip');
    const token = previewRes.body.bundleToken as string;
    expect(token).toBeTruthy();

    const applyRes = await request(app)
      .post('/api/harness/bundle/import/apply')
      .send({
        projectSlug: 'any',
        bundleToken: token,
        itemActions: { 'claude-md:CLAUDE.md': 'overwrite' },
      });
    expect(applyRes.status).toBe(200);
    expect(applyRes.body.appliedSummary.applied).toBeGreaterThanOrEqual(1);
  });

  it('POST /bundle/import/apply — 404 when bundleToken is unknown', async () => {
    const res = await request(app)
      .post('/api/harness/bundle/import/apply')
      .send({
        projectSlug: 'any',
        bundleToken: '00000000-0000-0000-0000-000000000000',
        itemActions: {},
      });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HARNESS_BUNDLE_TOKEN_NOT_FOUND');
  });

  it('POST /bundle/import/apply — 422 refuses a future bundle', async () => {
    // Build a future bundle (version 2) and stash it under a token by going
    // through the preview path first.
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ bundleVersion: 2 }));
    const futureBuf = await zip.generateAsync({ type: 'nodebuffer' });

    const previewRes = await request(app)
      .post('/api/harness/bundle/import/preview')
      .field('projectSlug', 'any')
      .attach('file', futureBuf, 'bundle.zip');
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.compatibility).toBe('future');
    const token = previewRes.body.bundleToken;

    const applyRes = await request(app)
      .post('/api/harness/bundle/import/apply')
      .send({
        projectSlug: 'any',
        bundleToken: token,
        itemActions: {},
      });
    expect(applyRes.status).toBe(422);
    expect(applyRes.body.error.code).toBe('HARNESS_BUNDLE_INCOMPATIBLE');
    expect(applyRes.body.error.details.compatibility).toBe('future');
  });

  // ----- GET /api/harness/bundle/plugin-deps --------------------------------

  it('GET /bundle/plugin-deps — 200 with empty catalog', async () => {
    const res = await request(app)
      .get('/api/harness/bundle/plugin-deps')
      .query({ projectSlug: 'any' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.pluginDependencies)).toBe(true);
    expect(res.body.pluginDependencies).toHaveLength(0);
  });

  it('GET /bundle/plugin-deps — 400 when projectSlug is missing', async () => {
    const res = await request(app).get('/api/harness/bundle/plugin-deps');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });
});
