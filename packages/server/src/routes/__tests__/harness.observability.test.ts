/**
 * Story 31.3 (Task A.7): supertest integration for the 4 observability routes.
 *
 * Placed alongside the other `harness.*.test.ts` route tests (the established
 * convention for `/api/harness/*`). The three backing services are mocked — the
 * controller envelopes + validation are under test here, not the service
 * internals (those have their own unit tests).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../services/observabilityService.js', () => ({
  observabilityService: { query: vi.fn() },
  createMcpCallRecorder: vi.fn(),
}));
vi.mock('../../services/tokenCountService.js', () => ({
  tokenCountService: { listTokenAttribution: vi.fn(), exactCount: vi.fn() },
}));
vi.mock('../../services/preferencesService.js', () => ({
  preferencesService: { readPreferences: vi.fn(), writePreferences: vi.fn() },
}));

import harnessRoutes from '../harness.js';
import { observabilityService } from '../../services/observabilityService.js';
import { tokenCountService } from '../../services/tokenCountService.js';
import { preferencesService } from '../../services/preferencesService.js';

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

describe('observability routes', () => {
  let app: express.Application;
  beforeEach(() => {
    vi.clearAllMocks();
    app = makeApp();
  });

  describe('GET …/:projectSlug/mcp-calls', () => {
    it('200: returns aggregates + timeline', async () => {
      vi.mocked(observabilityService.query).mockResolvedValue({
        aggregates: [{ serverName: 'pw', toolName: 'mcp__pw__nav', count: 2, avgDurationMs: 50, errorCount: 0 }],
        timeline: [],
      });
      const res = await request(app).get('/api/harness/observability/proj/mcp-calls').query({ server: 'pw' });
      expect(res.status).toBe(200);
      expect(res.body.aggregates).toHaveLength(1);
      expect(observabilityService.query).toHaveBeenCalledWith('proj', expect.objectContaining({ server: 'pw' }));
    });

    it('400: invalid sinceDays (non-positive) is rejected', async () => {
      const res = await request(app).get('/api/harness/observability/proj/mcp-calls').query({ sinceDays: '-3' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    });
  });

  describe('GET …/:projectSlug/token-attribution', () => {
    it('200: returns items', async () => {
      vi.mocked(tokenCountService.listTokenAttribution).mockResolvedValue([
        { kind: 'claudeMd-project', label: 'CLAUDE.md', bytes: 40, approxTokens: 10, contentHash: 'abc' },
      ]);
      const res = await request(app).get('/api/harness/observability/proj/token-attribution');
      expect(res.status).toBe(200);
      expect(res.body.items[0].kind).toBe('claudeMd-project');
    });
  });

  describe('POST …/:projectSlug/exact-count', () => {
    it('200: returns count response', async () => {
      vi.mocked(tokenCountService.exactCount).mockResolvedValue({ tokens: 123, cached: false });
      const res = await request(app)
        .post('/api/harness/observability/proj/exact-count')
        .send({ kind: 'claudeMd-project', contentHash: 'h' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tokens: 123, cached: false });
    });

    it('400: invalid kind rejected', async () => {
      const res = await request(app)
        .post('/api/harness/observability/proj/exact-count')
        .send({ kind: 'bogus', contentHash: 'h' });
      expect(res.status).toBe(400);
    });

    it('400: missing contentHash rejected', async () => {
      const res = await request(app)
        .post('/api/harness/observability/proj/exact-count')
        .send({ kind: 'skill' });
      expect(res.status).toBe(400);
    });
  });

  describe('tokenizer-pref (global, no projectSlug)', () => {
    it('GET 200: returns tokenizer + options', async () => {
      vi.mocked(preferencesService.readPreferences).mockResolvedValue({});
      const res = await request(app).get('/api/harness/observability/tokenizer-pref');
      expect(res.status).toBe(200);
      expect(res.body.tokenizer).toBe('size/4');
      expect(res.body.options).toContain('size/4');
    });

    it('PUT 200: persists a valid tokenizer', async () => {
      vi.mocked(preferencesService.writePreferences).mockResolvedValue({} as any);
      const res = await request(app)
        .put('/api/harness/observability/tokenizer-pref')
        .send({ tokenizer: 'size/4' });
      expect(res.status).toBe(200);
      expect(preferencesService.writePreferences).toHaveBeenCalledWith({ observabilityTokenizer: 'size/4' });
    });

    it('PUT 400: a reserved/unsupported tokenizer is rejected (AC-B4.b)', async () => {
      const res = await request(app)
        .put('/api/harness/observability/tokenizer-pref')
        .send({ tokenizer: 'anthropic-tokenizer' });
      expect(res.status).toBe(400);
      expect(preferencesService.writePreferences).not.toHaveBeenCalled();
    });
  });
});
