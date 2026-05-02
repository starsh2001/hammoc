/**
 * Story 28.3: Client API wrapper for the harness MCP endpoints.
 *
 * Thin pass-through over the shared `api` fetch client. Errors propagate as
 * `ApiError` instances so the store / component can branch on `err.code`.
 */

import type {
  HarnessMcpCopyRequest,
  HarnessMcpCopyResponse,
  HarnessMcpListResponse,
  HarnessMcpReadResponse,
  HarnessMcpSourceFileKind,
  HarnessMcpSourceScope,
  HarnessMcpUpdateRequest,
  HarnessMcpUpdateResponse,
} from '@hammoc/shared';
import { api } from './client';

interface ReadParams {
  scope: HarnessMcpSourceScope;
  projectSlug?: string;
  pluginKey?: string;
  fileKind?: HarnessMcpSourceFileKind;
}

interface UpdateParams {
  scope: 'project' | 'user';
  projectSlug?: string;
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  const enc = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  return `?${enc.join('&')}`;
}

export async function listMcps(projectSlug?: string): Promise<HarnessMcpListResponse> {
  return api.get<HarnessMcpListResponse>(`/harness/mcps${qs({ projectSlug })}`);
}

export async function readMcp(name: string, params: ReadParams): Promise<HarnessMcpReadResponse> {
  return api.get<HarnessMcpReadResponse>(
    `/harness/mcps/${encodeURIComponent(name)}${qs({
      scope: params.scope,
      projectSlug: params.projectSlug,
      pluginKey: params.pluginKey,
      fileKind: params.fileKind,
    })}`,
  );
}

export async function updateMcp(
  name: string,
  params: UpdateParams,
  body: HarnessMcpUpdateRequest,
): Promise<HarnessMcpUpdateResponse> {
  return api.put<HarnessMcpUpdateResponse>(
    `/harness/mcps/${encodeURIComponent(name)}${qs({
      scope: params.scope,
      projectSlug: params.projectSlug,
    })}`,
    body,
  );
}

export async function copyMcp(body: HarnessMcpCopyRequest): Promise<HarnessMcpCopyResponse> {
  return api.post<HarnessMcpCopyResponse>('/harness/mcps/copy', body);
}

export async function deleteMcp(
  name: string,
  params: UpdateParams,
  body: { expectedMtime?: string },
): Promise<{ success: true }> {
  return api.delete<{ success: true }>(
    `/harness/mcps/${encodeURIComponent(name)}${qs({
      scope: params.scope,
      projectSlug: params.projectSlug,
    })}`,
    body,
  );
}
