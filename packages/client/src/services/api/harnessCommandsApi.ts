/**
 * Story 28.5: Client API wrapper for the harness slash-command endpoints.
 *
 * Thin pass-through over the shared `api` fetch client. Errors propagate as
 * `ApiError` instances so the store / component can branch on `err.code`
 * (HARNESS_STALE_WRITE, HARNESS_FORBIDDEN with cause:secret-not-acknowledged,
 * HARNESS_COMMAND_NAME_CONFLICT, etc.).
 */

import type {
  HarnessCommandCopyRequest,
  HarnessCommandCopyResponse,
  HarnessCommandCreateRequest,
  HarnessCommandCreateResponse,
  HarnessCommandDeleteRequest,
  HarnessCommandDirectoryCopyRequest,
  HarnessCommandDirectoryCopyResponse,
  HarnessCommandListResponse,
  HarnessCommandReadResponse,
  HarnessCommandSourceLocation,
  HarnessCommandUpdateRequest,
  HarnessCommandUpdateResponse,
} from '@hammoc/shared';
import { api } from './client';

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  const enc = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  return `?${enc.join('&')}`;
}

/** Encode a posix relative path so each segment survives the URL but `/` stays. */
function encodeSplatPath(rel: string): string {
  return rel
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

export async function listCommands(projectSlug?: string): Promise<HarnessCommandListResponse> {
  return api.get<HarnessCommandListResponse>(`/harness/commands${qs({ projectSlug })}`);
}

export async function readCommand(
  loc: HarnessCommandSourceLocation,
): Promise<HarnessCommandReadResponse> {
  return api.get<HarnessCommandReadResponse>(
    `/harness/commands/${encodeSplatPath(loc.relativePath)}${qs({
      scope: loc.scope,
      projectSlug: loc.projectSlug,
      pluginKey: loc.pluginKey,
    })}`,
  );
}

export async function createCommand(
  body: HarnessCommandCreateRequest,
): Promise<HarnessCommandCreateResponse> {
  return api.post<HarnessCommandCreateResponse>('/harness/commands', body);
}

export async function updateCommand(
  loc: HarnessCommandSourceLocation,
  body: HarnessCommandUpdateRequest,
): Promise<HarnessCommandUpdateResponse> {
  return api.put<HarnessCommandUpdateResponse>(
    `/harness/commands/${encodeSplatPath(loc.relativePath)}${qs({
      scope: loc.scope,
      projectSlug: loc.projectSlug,
    })}`,
    body,
  );
}

export async function copyCommand(
  body: HarnessCommandCopyRequest,
): Promise<HarnessCommandCopyResponse> {
  return api.post<HarnessCommandCopyResponse>('/harness/commands/copy', body);
}

export async function copyCommandDirectory(
  body: HarnessCommandDirectoryCopyRequest,
): Promise<HarnessCommandDirectoryCopyResponse> {
  return api.post<HarnessCommandDirectoryCopyResponse>('/harness/commands/copy-directory', body);
}

export async function deleteCommand(
  req: HarnessCommandDeleteRequest,
): Promise<{ success: true }> {
  return api.delete<{ success: true }>(
    `/harness/commands/${encodeSplatPath(req.relativePath)}${qs({
      scope: req.scope,
      projectSlug: req.projectSlug,
    })}`,
    { expectedMtime: req.expectedMtime },
  );
}
