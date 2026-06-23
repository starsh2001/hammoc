/**
 * serverController Tests — Story BS-6
 *
 * Verifies that GET /api/server/info reports `isDebugMode`, mirroring the HAMMOC_DEBUG gate.
 * `config.debug.enabled` is evaluated from process.env at config-module load, so each case
 * sets the env var, resets the module registry, and dynamically imports a fresh controller.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request, Response } from 'express';

describe('serverController.info — isDebugMode (Story BS-6)', () => {
  const ORIG = process.env.HAMMOC_DEBUG;

  afterEach(() => {
    if (ORIG === undefined) delete process.env.HAMMOC_DEBUG;
    else process.env.HAMMOC_DEBUG = ORIG;
    vi.resetModules();
  });

  async function callInfo(): Promise<Record<string, unknown>> {
    vi.resetModules();
    const { serverController } = await import('../serverController.js');
    let body: Record<string, unknown> = {};
    const res = { json: (b: Record<string, unknown>) => { body = b; } } as unknown as Response;
    await serverController.info({} as Request, res);
    return body;
  }

  it('returns isDebugMode:true when HAMMOC_DEBUG=1', async () => {
    process.env.HAMMOC_DEBUG = '1';
    const body = await callInfo();
    expect(body.isDebugMode).toBe(true);
  });

  it('returns isDebugMode:false when HAMMOC_DEBUG is not set', async () => {
    delete process.env.HAMMOC_DEBUG;
    const body = await callInfo();
    expect(body.isDebugMode).toBe(false);
  });
});
