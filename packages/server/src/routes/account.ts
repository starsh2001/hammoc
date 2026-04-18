/**
 * Account Routes
 * Claude Code account info (subscription type, API provider, email).
 */

import { Router, Request, Response } from 'express';
import { accountInfoService } from '../services/accountInfoService.js';
import { rateLimitProbeService } from '../services/rateLimitProbeService.js';
import type { AccountInfoResponse, SubscriptionRateLimit } from '@hammoc/shared';

const router = Router();

// GET /api/account — return the in-memory account info (populated at startup)
router.get('/', (_req: Request, res: Response) => {
  const { account, fetchedAt } = accountInfoService.getCached();
  res.json({ account, fetchedAt } satisfies AccountInfoResponse);
});

// POST /api/account/refresh — force-fetch via a bootstrap query
router.post('/refresh', async (_req: Request, res: Response) => {
  const account = await accountInfoService.refresh();
  const { fetchedAt } = accountInfoService.getCached();
  res.json({ account, fetchedAt } satisfies AccountInfoResponse);
});

// GET /api/account/usage — return subscription rate limit (5h/7d).
// Falls back to a fresh probe if cache is empty (e.g., WebSocket never connected).
router.get('/usage', async (_req: Request, res: Response) => {
  let rateLimit: SubscriptionRateLimit | null = rateLimitProbeService.getCachedResult();
  if (!rateLimit) {
    rateLimit = await rateLimitProbeService.probe();
  }
  res.json({ rateLimit });
});

// POST /api/account/usage/refresh — force a fresh probe regardless of cache.
router.post('/usage/refresh', async (_req: Request, res: Response) => {
  const rateLimit = await rateLimitProbeService.probe();
  res.json({ rateLimit });
});

export default router;
