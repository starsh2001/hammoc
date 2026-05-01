/**
 * Story 28.1: Client API wrapper for the harness plugin list/toggle endpoints.
 *
 * Thin pass-through over the shared `api` fetch client. Errors (including the
 * `HARNESS_STALE_WRITE` envelope) propagate as `ApiError` instances so the
 * store can branch on `err.code`.
 */

import type {
  HarnessPluginListResponse,
  HarnessPluginToggleRequest,
  HarnessPluginToggleResponse,
} from '@hammoc/shared';
import { api } from './client';

function withProjectSlug(path: string, projectSlug?: string): string {
  if (!projectSlug) return path;
  return `${path}?projectSlug=${encodeURIComponent(projectSlug)}`;
}

export async function listPlugins(projectSlug?: string): Promise<HarnessPluginListResponse> {
  return api.get<HarnessPluginListResponse>(withProjectSlug('/harness/plugins', projectSlug));
}

export async function togglePlugin(
  body: HarnessPluginToggleRequest,
  projectSlug?: string,
): Promise<HarnessPluginToggleResponse> {
  return api.post<HarnessPluginToggleResponse>(
    withProjectSlug('/harness/plugins/toggle', projectSlug),
    body,
  );
}
