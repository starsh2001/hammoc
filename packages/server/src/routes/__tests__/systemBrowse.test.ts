/**
 * System Browse routes (Story 34.1, supertest).
 * Covers browse (dir + drive-roots), mkdir (+conflict), rename (+conflict),
 * consistent 404, request validation, and — crucially — the ABSENCE of a delete
 * route (AC7). A req.t / req.language mock middleware is injected before the
 * router, mirroring the snippets route test.
 *
 * AC8 (auth) is NOT re-tested here by building the full app: authentication is a
 * GLOBAL concern applied once in app.ts via authMiddlewareWithExclusions
 * (app.ts:105), which protects every '/api/*' path. '/api/system/*' is mounted
 * under '/api' (app.ts) and is NOT listed in PUBLIC_ROUTES (auth.ts:13-18), so it
 * is covered by that global guard with no per-route code. Re-asserting it would
 * require booting the whole app (session/i18n/config side effects); the structural
 * guarantee above is the cheaper, equivalent evidence the story permits.
 * [Source: docs/stories/34.1.story.md#Task 8; packages/server/src/routes/__tests__/snippets.test.ts:30-56]
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

import systemBrowseRoutes from '../systemBrowse.js';

describe('System Browse routes (Story 34.1, supertest)', () => {
  let app: express.Application;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sysbrowse-route-'));

    app = express();
    app.use(express.json()); // POST bodies (global parser in the real app.ts:97)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use((req: any, _res: any, next: any) => {
      req.t = (key: string) => key;
      req.language = 'en';
      next();
    });
    app.use('/api/system', systemBrowseRoutes);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ① GET /browse?path lists only subdirectories
  it('GET /browse?path returns 200 with directories only', async () => {
    await fs.mkdir(path.join(tmpDir, 'dir1'));
    await fs.writeFile(path.join(tmpDir, 'file.txt'), 'x');

    const res = await request(app).get('/api/system/browse').query({ path: tmpDir });

    expect(res.status).toBe(200);
    expect(res.body.isDriveRoots).toBe(false);
    const names = res.body.entries.map((e: { name: string }) => e.name);
    expect(names).toEqual(['dir1']); // file.txt excluded
  });

  // ② GET /browse without path returns drive roots
  it('GET /browse without path returns 200 with isDriveRoots:true', async () => {
    const res = await request(app).get('/api/system/browse');

    expect(res.status).toBe(200);
    expect(res.body.isDriveRoots).toBe(true);
    expect(res.body.path).toBeNull();
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries.length).toBeGreaterThan(0);
  });

  // ③ POST /browse/mkdir creates (201) + duplicate conflict (409)
  it('POST /browse/mkdir returns 201, then 409 on duplicate', async () => {
    const created = await request(app)
      .post('/api/system/browse/mkdir')
      .send({ parentPath: tmpDir, name: 'newfolder' });
    expect(created.status).toBe(201);
    expect(created.body.success).toBe(true);
    expect((await fs.stat(path.join(tmpDir, 'newfolder'))).isDirectory()).toBe(true);

    const dup = await request(app)
      .post('/api/system/browse/mkdir')
      .send({ parentPath: tmpDir, name: 'newfolder' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_EXISTS');
  });

  // ④ POST /browse/rename renames (200) + target-exists conflict (409)
  it('POST /browse/rename returns 200, then 409 when target exists', async () => {
    await fs.mkdir(path.join(tmpDir, 'old'));
    const renamed = await request(app)
      .post('/api/system/browse/rename')
      .send({ path: path.join(tmpDir, 'old'), newName: 'fresh' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.success).toBe(true);
    expect((await fs.stat(path.join(tmpDir, 'fresh'))).isDirectory()).toBe(true);

    await fs.mkdir(path.join(tmpDir, 'x'));
    await fs.mkdir(path.join(tmpDir, 'y'));
    const conflict = await request(app)
      .post('/api/system/browse/rename')
      .send({ path: path.join(tmpDir, 'x'), newName: 'y' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('ALREADY_EXISTS');
  });

  // ⑤ Non-existent path → consistent 404
  it('GET /browse with a non-existent path returns 404 NOT_FOUND', async () => {
    const res = await request(app)
      .get('/api/system/browse')
      .query({ path: path.join(tmpDir, 'does-not-exist') });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  // Request validation (missing body field) → 400
  it('POST /browse/mkdir without name returns 400 INVALID_REQUEST', async () => {
    const res = await request(app).post('/api/system/browse/mkdir').send({ parentPath: tmpDir });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  // ⑥ AC7 — there is NO delete route on the surface
  it('DELETE /api/system/browse is not registered (404, AC7)', async () => {
    const del = await request(app).delete('/api/system/browse').query({ path: tmpDir });
    expect(del.status).toBe(404);
  });
});
