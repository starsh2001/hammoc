/**
 * Story 28.6: Client API wrapper for the harness sub-agent endpoints.
 *
 * Thin pass-through over the shared `api` fetch client. Errors propagate as
 * `ApiError` instances so the store / component can branch on `err.code`
 * (HARNESS_STALE_WRITE, HARNESS_FORBIDDEN with cause:secret-not-acknowledged,
 * HARNESS_AGENT_NAME_CONFLICT, HARNESS_PARSE_ERROR with detail:invalid-name-pattern,
 * etc.).
 */

import type {
  HarnessAgentCopyRequest,
  HarnessAgentCopyResponse,
  HarnessAgentCreateRequest,
  HarnessAgentCreateResponse,
  HarnessAgentDeleteRequest,
  HarnessAgentDeleteResponse,
  HarnessAgentListResponse,
  HarnessAgentReadResponse,
  HarnessAgentSourceLocation,
  HarnessAgentUpdateRequest,
  HarnessAgentUpdateResponse,
} from '@hammoc/shared';
import { api } from './client';

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  const enc = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  return `?${enc.join('&')}`;
}

export async function listAgents(projectSlug?: string): Promise<HarnessAgentListResponse> {
  return api.get<HarnessAgentListResponse>(`/harness/agents${qs({ projectSlug })}`);
}

export async function readAgent(
  loc: HarnessAgentSourceLocation,
): Promise<HarnessAgentReadResponse> {
  return api.get<HarnessAgentReadResponse>(
    `/harness/agents/${encodeURIComponent(loc.name)}${qs({
      scope: loc.scope,
      projectSlug: loc.projectSlug,
      pluginKey: loc.pluginKey,
    })}`,
  );
}

export async function createAgent(
  body: HarnessAgentCreateRequest,
): Promise<HarnessAgentCreateResponse> {
  return api.post<HarnessAgentCreateResponse>('/harness/agents', body);
}

export async function updateAgent(
  loc: HarnessAgentSourceLocation,
  body: HarnessAgentUpdateRequest,
): Promise<HarnessAgentUpdateResponse> {
  return api.put<HarnessAgentUpdateResponse>(
    `/harness/agents/${encodeURIComponent(loc.name)}${qs({
      scope: loc.scope,
      projectSlug: loc.projectSlug,
    })}`,
    body,
  );
}

export async function copyAgent(
  body: HarnessAgentCopyRequest,
): Promise<HarnessAgentCopyResponse> {
  return api.post<HarnessAgentCopyResponse>('/harness/agents/copy', body);
}

export async function deleteAgent(
  req: HarnessAgentDeleteRequest,
): Promise<HarnessAgentDeleteResponse> {
  return api.delete<HarnessAgentDeleteResponse>(
    `/harness/agents/${encodeURIComponent(req.name)}${qs({
      scope: req.scope,
      projectSlug: req.projectSlug,
    })}`,
    { expectedMtime: req.expectedMtime },
  );
}
