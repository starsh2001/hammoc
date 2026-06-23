/**
 * Account Controller (Story BS-8)
 *
 * REST handlers for the multi-account credential store. Responses carry only token-free
 * {@link AccountSummary} data — `accessToken`/`refreshToken` never leave the server (AC14).
 *
 * Switch orchestration (Task 4): write the credential (service) → refresh accountInfoService
 * (reads the now-active credential) → back-fill a missing email (AC1a) → invalidate the
 * rate-limit probe's token cache so usage probing re-reads the new credential → broadcast
 * `account:switched` to all tabs (email + tier only, AC15).
 */

import { Request, Response } from 'express';
import type {
  AccountListResponse,
  AccountSwitchResponse,
  AccountRemovedEvent,
} from '@hammoc/shared';
import { accountStorageService } from '../services/accountStorageService.js';
import { accountInfoService } from '../services/accountInfoService.js';
import { rateLimitProbeService } from '../services/rateLimitProbeService.js';
import { getIO } from '../handlers/websocket.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('accountController');

/** GET /api/accounts — list stored accounts (token-free) + active marker. */
export async function listAccounts(_req: Request, res: Response): Promise<void> {
  const accounts = await accountStorageService.listAccounts();
  const activeKey = await accountStorageService.getActiveKey();
  res.json({ accounts, activeKey } satisfies AccountListResponse);
}

/** POST /api/accounts/switch — make a stored account active. Body: { key }. */
export async function switchAccount(req: Request, res: Response): Promise<void> {
  const key = typeof req.body?.key === 'string' ? req.body.key : '';
  if (!key) {
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'key is required' } });
    return;
  }

  const result = await accountStorageService.switchAccount(key);
  if (!result.switched) {
    res.status(404).json({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' } });
    return;
  }

  // The credential file now holds the switched account → re-read everything from it.
  rateLimitProbeService.invalidateTokenCache();
  let activeKey: string | null = key;
  try {
    const account = await accountInfoService.refresh();
    // AC1a/AC3: if this account was stored without an email, back-fill it now that the
    // active credential resolves one (re-keys the entry from the fallback to the email).
    if (account?.email) {
      activeKey = (await accountStorageService.backfillActiveEmail(account.email)) ?? key;
    }
  } catch (err) {
    log.warn(`switch: accountInfo refresh failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const accounts = await accountStorageService.listAccounts();
  const active = accounts.find((a) => a.key === activeKey) ?? null;

  // Broadcast to all tabs (token-free, AC15).
  try {
    getIO().emit('account:switched', {
      key: activeKey ?? key,
      email: active?.email ?? null,
      tier: active?.tier ?? null,
    });
  } catch {
    /* io not initialized (e.g. tests) — REST response still carries the new state */
  }

  res.json({
    success: true,
    activeKey,
    reauthRequired: result.reauthRequired,
    accounts,
  } satisfies AccountSwitchResponse);
}

/** DELETE /api/accounts/:key — remove a stored account (not the active one, AC8). */
export async function removeAccount(req: Request, res: Response): Promise<void> {
  const key = req.params.key;
  const result = await accountStorageService.removeAccount(key);
  if (!result.removed) {
    if (result.reason === 'active') {
      res.status(409).json({
        error: { code: 'ACCOUNT_ACTIVE', message: 'Cannot remove the active account' },
      });
      return;
    }
    res.status(404).json({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' } });
    return;
  }

  try {
    getIO().emit('account:removed', { key } satisfies AccountRemovedEvent);
  } catch {
    /* io not initialized — fine */
  }

  res.json({ success: true });
}
