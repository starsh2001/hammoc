/**
 * Accounts API (Story BS-8) — multi-account credential store REST client.
 *
 * Distinct from `account.ts` (singular), which serves the active-account info + usage.
 * All payloads here are token-free (the server never sends `accessToken`/`refreshToken`).
 */

import { api } from './client';
import type {
  AccountListResponse,
  AccountSwitchResponse,
} from '@hammoc/shared';

export const accountsApi = {
  /** List stored accounts (token-free) + active marker. */
  list: () => api.get<AccountListResponse>('/accounts'),

  /** Switch the active account by store key (email or `account:<hash>` fallback). */
  switch: (key: string) => api.post<AccountSwitchResponse>('/accounts/switch', { key }),

  /** Remove a stored account. The key is URL-encoded (the fallback key contains a colon). */
  remove: (key: string) =>
    api.delete<{ success: boolean }>(`/accounts/${encodeURIComponent(key)}`),
};
