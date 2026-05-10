/**
 * Story 30.2 (Task 4.1): client API wrapper for `GET /api/harness/lint`.
 *
 * Both `user` and `project` scopes are supported — the client store decides
 * which to load based on whether the workbench is mounted under a project.
 */

import type { HarnessLintResponse } from '@hammoc/shared';
import { api } from './client';

function encodeQuery(params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== '');
  if (entries.length === 0) return '';
  const enc = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return `?${enc.join('&')}`;
}

export async function fetchLint(opts: {
  scope: 'user' | 'project';
  projectSlug?: string;
}): Promise<HarnessLintResponse> {
  const params: Record<string, string> = { scope: opts.scope };
  if (opts.projectSlug) params.projectSlug = opts.projectSlug;
  return api.get<HarnessLintResponse>(`/harness/lint${encodeQuery(params)}`);
}
