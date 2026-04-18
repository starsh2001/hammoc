/**
 * Account API - Claude Code account info (subscription type, API provider)
 */

import { api } from './client';
import type { AccountInfoResponse, SubscriptionRateLimit } from '@hammoc/shared';

export const accountApi = {
  /** Get cached account info */
  get: () => api.get<AccountInfoResponse>('/account'),

  /** Force-refresh account info via a bootstrap SDK query */
  refresh: () => api.post<AccountInfoResponse>('/account/refresh'),

  /** Get subscription rate limit (5h/7d). Falls back to fresh probe if cache empty. */
  getUsage: () => api.get<{ rateLimit: SubscriptionRateLimit | null }>('/account/usage'),

  /** Force a fresh probe of subscription rate limit (bypasses cache). */
  refreshUsage: () => api.post<{ rateLimit: SubscriptionRateLimit | null }>('/account/usage/refresh'),
};
