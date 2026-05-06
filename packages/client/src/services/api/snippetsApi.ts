/**
 * Story 29.2: REST client for the snippet management endpoints.
 *
 * Lives at `/api/snippets/*` (NOT `/api/harness/snippets`) because snippets
 * are a Hammoc-native system, not a Claude Code harness primitive — the URL
 * boundary makes the system-of-record obvious.
 *
 * Mutation calls (`create` / `update` / `delete` / `copy`) attach two
 * broadcast headers:
 *   - X-Hammoc-Socket-Id          — current socket.io connection id
 *   - X-Hammoc-Working-Directory  — project working directory (for the server
 *                                   to compute the snippet list to broadcast)
 * The server reads these and emits a fresh `snippets:list` payload back to
 * the originating socket so the in-page autocomplete cache (`useSnippets` in
 * `SnippetPalette`) refreshes without a manual `refresh()` call (AC1.e).
 */

import type {
  SnippetCopyRequest,
  SnippetCopyResponse,
  SnippetDeleteResponse,
  SnippetListResponse,
  SnippetReadResponse,
  SnippetScope,
  SnippetWriteResponse,
} from '@hammoc/shared';
import { ApiError } from './client';
import { getSocket } from '../socket';
import i18n from '../../i18n';

const BASE = '/api/snippets';

export interface SnippetRef {
  scope: SnippetScope;
  /** Required when scope === 'project'. */
  projectSlug?: string;
  name: string;
}

interface BroadcastContext {
  /** Project root absolute path used by the server to recompute the snippet list. */
  workingDirectory?: string;
}

function buildHeaders(includeBroadcast: boolean, ctx?: BroadcastContext): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept-Language': i18n.language || 'en',
  };
  if (includeBroadcast && ctx?.workingDirectory) {
    try {
      const socket = getSocket();
      if (socket.id) headers['X-Hammoc-Socket-Id'] = socket.id;
      headers['X-Hammoc-Working-Directory'] = ctx.workingDirectory;
    } catch {
      // socket not yet connected — broadcast is best-effort, skip headers
    }
  }
  return headers;
}

async function request<T>(
  path: string,
  init: RequestInit & { broadcast?: BroadcastContext },
): Promise<T> {
  const { broadcast, headers: callerHeaders, ...rest } = init;
  const response = await fetch(path, {
    ...rest,
    credentials: 'include',
    headers: {
      ...buildHeaders(Boolean(broadcast), broadcast),
      ...(callerHeaders ?? {}),
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    if (errorData?.error?.message) {
      throw new ApiError(
        response.status,
        errorData.error.code || 'UNKNOWN_ERROR',
        errorData.error.message,
        errorData.error.details,
      );
    }
    throw new ApiError(
      response.status,
      'UNKNOWN_ERROR',
      `요청 실패 (${response.status} ${response.statusText}) - ${path}`,
    );
  }
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function refPath(ref: SnippetRef): string {
  return `${BASE}/${encodeURIComponent(ref.scope)}/${encodeURIComponent(ref.name)}`;
}

function refQuery(ref: SnippetRef): string {
  if (ref.scope !== 'project' || !ref.projectSlug) return '';
  return `?projectSlug=${encodeURIComponent(ref.projectSlug)}`;
}

export async function listSnippets(projectSlug?: string): Promise<SnippetListResponse> {
  const qs = projectSlug ? `?projectSlug=${encodeURIComponent(projectSlug)}` : '';
  return request<SnippetListResponse>(`${BASE}${qs}`, { method: 'GET' });
}

export async function readSnippet(ref: SnippetRef): Promise<SnippetReadResponse> {
  return request<SnippetReadResponse>(`${refPath(ref)}${refQuery(ref)}`, { method: 'GET' });
}

export async function createSnippet(
  ref: SnippetRef,
  content: string,
  ctx?: BroadcastContext,
): Promise<SnippetWriteResponse> {
  return request<SnippetWriteResponse>(refPath(ref), {
    method: 'POST',
    body: JSON.stringify({ content, projectSlug: ref.projectSlug }),
    broadcast: ctx,
  });
}

export async function updateSnippet(
  ref: SnippetRef,
  content: string,
  expectedMtime?: string,
  ctx?: BroadcastContext,
): Promise<SnippetWriteResponse> {
  return request<SnippetWriteResponse>(refPath(ref), {
    method: 'PUT',
    body: JSON.stringify({ content, expectedMtime, projectSlug: ref.projectSlug }),
    broadcast: ctx,
  });
}

export async function deleteSnippet(
  ref: SnippetRef,
  expectedMtime?: string,
  ctx?: BroadcastContext,
): Promise<SnippetDeleteResponse> {
  return request<SnippetDeleteResponse>(refPath(ref), {
    method: 'DELETE',
    body: JSON.stringify({ expectedMtime, projectSlug: ref.projectSlug }),
    broadcast: ctx,
  });
}

export async function copySnippet(
  req: SnippetCopyRequest,
  ctx?: BroadcastContext,
): Promise<SnippetCopyResponse> {
  return request<SnippetCopyResponse>(`${BASE}/copy`, {
    method: 'POST',
    body: JSON.stringify(req),
    broadcast: ctx,
  });
}
