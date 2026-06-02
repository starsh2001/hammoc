/**
 * Story 31.3: Client API wrapper for the observability endpoints.
 *
 * Thin pass-through over the shared `api` fetch client (Story 31.2
 * contextBuilderApi pattern). Errors propagate as `ApiError` so the store can
 * surface a non-blocking notice.
 */

import type {
  ObservabilityMcpCallsResponse,
  ObservabilityQuery,
  TokenAttributionResponse,
  ExactTokenCountRequest,
  ExactTokenCountResponse,
  ObservabilityTokenizer,
  ObservabilityTokenizerPrefResponse,
} from '@hammoc/shared';
import { api } from './client';

const base = (projectSlug: string) => `/harness/observability/${encodeURIComponent(projectSlug)}`;

export async function fetchMcpCalls(
  projectSlug: string,
  query: ObservabilityQuery = {},
): Promise<ObservabilityMcpCallsResponse> {
  const params = new URLSearchParams();
  if (query.server !== undefined) params.set('server', query.server);
  if (query.tool !== undefined) params.set('tool', query.tool);
  if (query.sessionId !== undefined) params.set('sessionId', query.sessionId);
  if (query.sinceDays !== undefined) params.set('sinceDays', String(query.sinceDays));
  const qs = params.toString();
  return api.get<ObservabilityMcpCallsResponse>(`${base(projectSlug)}/mcp-calls${qs ? `?${qs}` : ''}`);
}

export async function fetchTokenAttribution(projectSlug: string): Promise<TokenAttributionResponse> {
  return api.get<TokenAttributionResponse>(`${base(projectSlug)}/token-attribution`);
}

export async function fetchExactCount(
  projectSlug: string,
  req: ExactTokenCountRequest,
): Promise<ExactTokenCountResponse> {
  return api.post<ExactTokenCountResponse>(`${base(projectSlug)}/exact-count`, req);
}

export async function fetchTokenizerPref(): Promise<ObservabilityTokenizerPrefResponse> {
  return api.get<ObservabilityTokenizerPrefResponse>('/harness/observability/tokenizer-pref');
}

export async function saveTokenizerPref(
  tokenizer: ObservabilityTokenizer,
): Promise<ObservabilityTokenizerPrefResponse> {
  return api.put<ObservabilityTokenizerPrefResponse>('/harness/observability/tokenizer-pref', { tokenizer });
}
