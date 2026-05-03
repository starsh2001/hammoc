/**
 * Story 28.4: Client API wrapper for the harness Hook endpoints.
 *
 * Thin pass-through over the shared `api` fetch client. Errors propagate as
 * `ApiError` instances so the store / component can branch on `err.code`
 * (HARNESS_STALE_WRITE, HARNESS_FORBIDDEN with cause:type-warning-not-acknowledged, etc.).
 */

import type {
  HarnessHookCopyRequest,
  HarnessHookCopyResponse,
  HarnessHookCreateRequest,
  HarnessHookCreateResponse,
  HarnessHookDeleteRequest,
  HarnessHookListResponse,
  HarnessHookReadResponse,
  HarnessHookSourceLocation,
  HarnessHookUpdateRequest,
  HarnessHookUpdateResponse,
} from '@hammoc/shared';
import { api } from './client';

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  const enc = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  return `?${enc.join('&')}`;
}

function buildHookPath(loc: Pick<HarnessHookSourceLocation, 'event' | 'groupIndex' | 'hookIndex'>): string {
  return `/harness/hooks/${encodeURIComponent(loc.event)}/${loc.groupIndex}/${loc.hookIndex}`;
}

export async function listHooks(projectSlug?: string): Promise<HarnessHookListResponse> {
  return api.get<HarnessHookListResponse>(`/harness/hooks${qs({ projectSlug })}`);
}

export async function readHook(loc: HarnessHookSourceLocation): Promise<HarnessHookReadResponse> {
  return api.get<HarnessHookReadResponse>(
    `${buildHookPath(loc)}${qs({
      scope: loc.scope,
      projectSlug: loc.projectSlug,
      pluginKey: loc.pluginKey,
      disabledByBackup: loc.disabledByBackup ? 'true' : undefined,
    })}`,
  );
}

export async function createHook(body: HarnessHookCreateRequest): Promise<HarnessHookCreateResponse> {
  return api.post<HarnessHookCreateResponse>('/harness/hooks', body);
}

export async function updateHook(
  loc: HarnessHookSourceLocation,
  body: HarnessHookUpdateRequest,
): Promise<HarnessHookUpdateResponse> {
  return api.put<HarnessHookUpdateResponse>(
    `${buildHookPath(loc)}${qs({
      scope: loc.scope,
      projectSlug: loc.projectSlug,
      disabledByBackup: loc.disabledByBackup ? 'true' : undefined,
    })}`,
    body,
  );
}

export async function copyHook(body: HarnessHookCopyRequest): Promise<HarnessHookCopyResponse> {
  return api.post<HarnessHookCopyResponse>('/harness/hooks/copy', body);
}

export async function deleteHook(req: HarnessHookDeleteRequest): Promise<{ success: true }> {
  return api.delete<{ success: true }>(
    `/harness/hooks/${encodeURIComponent(req.event)}/${req.groupIndex}/${req.hookIndex}${qs({
      scope: req.scope,
      projectSlug: req.projectSlug,
    })}`,
    { expectedMtime: req.expectedMtime },
  );
}
