/**
 * Story 30.2 (Task 2.4): supertest integration for `GET /api/harness/lint`.
 *
 * Mirrors the harness.test.ts setup (project mock + temp home override) so a
 * project's MCP / hook / skill state is read off real disk into the lint
 * service — only `projectService.resolveOriginalPath` and the websocket
 * `getIO()` are stubbed.
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

describe('GET /api/harness/lint', () => {
  let app: express.Application;
  let tmpProject: string;
  let tmpHome: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'lint-route-proj-'));
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'lint-route-home-'));
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

  it('200: empty project returns empty issues + default rule preferences', async () => {
    const res = await request(app)
      .get('/api/harness/lint')
      .query({ scope: 'project', projectSlug: 'any' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.rulePreferences).toMatchObject({
      'mcp/command-not-on-path': false,
      'agent/tools-non-standard': true,
    });
    expect(typeof res.body.evaluatedAt).toBe('string');
  });

  it('400: project scope without projectSlug is rejected', async () => {
    const res = await request(app)
      .get('/api/harness/lint')
      .query({ scope: 'project' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('200: surfaces an mcp/url-invalid error when .mcp.json has a malformed URL', async () => {
    await fs.writeFile(
      path.join(tmpProject, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          remote: { type: 'http', url: 'not a url' },
        },
      }, null, 2),
      'utf-8',
    );

    const res = await request(app)
      .get('/api/harness/lint')
      .query({ scope: 'project', projectSlug: 'any' });

    expect(res.status).toBe(200);
    const urlIssue = res.body.issues.find(
      (i: { ruleId: string }) => i.ruleId === 'mcp/url-invalid',
    );
    expect(urlIssue).toBeTruthy();
    expect(urlIssue.severity).toBe('error');
    expect(urlIssue.cardName).toBe('remote');
  });
});
