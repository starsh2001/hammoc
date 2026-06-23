/**
 * Account Management Routes (Story BS-8)
 *
 * Multi-account credential store endpoints. Mounted at `/api/accounts` (plural) —
 * distinct from the existing `/api/account` (singular) which serves the active-account
 * info + usage. Auth is automatic via authMiddlewareWithExclusions.
 *
 * The `:key` param is the store key — the account email, or the `account:<hash>` fallback
 * (AC1a). Clients must `encodeURIComponent` it (the fallback key contains a colon).
 */

import { Router } from 'express';
import { listAccounts, switchAccount, removeAccount } from '../controllers/accountController.js';

const router = Router();

router.get('/', listAccounts);
router.post('/switch', switchAccount);
router.delete('/:key', removeAccount);

export default router;
