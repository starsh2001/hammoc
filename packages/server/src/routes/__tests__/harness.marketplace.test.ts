/**
 * Story 31.4 (Task A.4): supertest integration for the marketplace catalog route.
 *
 * Placed alongside the other `harness.*.test.ts` route tests. The backing
 * `marketplaceService` is mocked — the controller envelope + param validation +
 * HARNESS_ERRORS mapping are under test here, not the service internals (those
 * have their own unit tests). Only GET catalog exists — install/add automation
 * was dropped after spike #2 (negative).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../services/marketplaceService.js', () => ({
  marketplaceService: { listCatalog: vi.fn() },
}));

import harnessRoutes from '../harness.js';
import { marketplaceService } from '../../services/marketplaceService.js';

function makeApp(): express.Application {
  const app = express();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use((req: any, _res: any, next: any) => {
    req.t = (key: string) => key;
    req.language = 'en';
    next();
  });
  app.use('/api/harness', harnessRoutes);
  return app;
}

describe('marketplace catalog route', () => {
  let app: express.Application;
  beforeEach(() => {
    vi.clearAllMocks();
    app = makeApp();
  });

  it('200: returns the catalog and forwards the projectSlug', async () => {
    vi.mocked(marketplaceService.listCatalog).mockResolvedValue({
      marketplaces: ['claude-plugins-official'],
      entries: [
        {
          key: 'context7@claude-plugins-official',
          name: 'context7',
          marketplace: 'claude-plugins-official',
          pluginType: 'external-mcp',
          installed: true,
        },
      ],
      errors: [],
    });

    const res = await request(app).get('/api/harness/marketplace/my-proj/catalog');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].pluginType).toBe('external-mcp');
    expect(marketplaceService.listCatalog).toHaveBeenCalledWith('my-proj');
  });

  it('200: surfaces per-market errors and formatWarning in the envelope', async () => {
    vi.mocked(marketplaceService.listCatalog).mockResolvedValue({
      marketplaces: ['a', 'b'],
      entries: [],
      errors: [{ marketplace: 'a', code: 'HARNESS_PARSE_ERROR' }],
      formatWarning: { detectedVersion: 99, reason: 'unrecognizedVersion' },
    });

    const res = await request(app).get('/api/harness/marketplace/p/catalog');
    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([{ marketplace: 'a', code: 'HARNESS_PARSE_ERROR' }]);
    expect(res.body.formatWarning).toEqual({ detectedVersion: 99, reason: 'unrecognizedVersion' });
  });

  it('maps a HARNESS_ROOT_MISSING service error to a 404 envelope', async () => {
    const err = new Error('root missing') as NodeJS.ErrnoException;
    err.code = 'HARNESS_ROOT_MISSING';
    vi.mocked(marketplaceService.listCatalog).mockRejectedValue(err);

    const res = await request(app).get('/api/harness/marketplace/p/catalog');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HARNESS_ROOT_MISSING');
  });

  it('maps an unknown service error to the 500 write-error catch-all', async () => {
    vi.mocked(marketplaceService.listCatalog).mockRejectedValue(new Error('boom'));

    const res = await request(app).get('/api/harness/marketplace/p/catalog');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('HARNESS_WRITE_ERROR');
  });
});
