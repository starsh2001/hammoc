/**
 * Story 31.2: Client API wrapper for the SessionStart context-builder endpoints.
 *
 * Thin pass-through over the shared `api` fetch client (Story 31.1
 * bmadCoreConfigApi pattern). Errors propagate as `ApiError` so the store can
 * branch on `err.code` (HARNESS_STALE_WRITE → reload/overwrite modal, etc.).
 */

import type {
  ContextBuilderManifest,
  ContextBuilderReadResponse,
  ContextBuilderGenerateResponse,
  ContextBuilderDisableResponse,
} from '@hammoc/shared';
import { api } from './client';

export async function readContextBuilder(
  projectSlug: string,
): Promise<ContextBuilderReadResponse> {
  return api.get<ContextBuilderReadResponse>(
    `/harness/context-builder/${encodeURIComponent(projectSlug)}`,
  );
}

export async function saveContextBuilder(
  projectSlug: string,
  manifest: ContextBuilderManifest,
  expectedMtime?: string,
): Promise<ContextBuilderGenerateResponse> {
  return api.put<ContextBuilderGenerateResponse>(
    `/harness/context-builder/${encodeURIComponent(projectSlug)}`,
    { manifest, expectedMtime },
  );
}

export async function disableContextBuilder(
  projectSlug: string,
  expectedMtime?: string,
): Promise<ContextBuilderDisableResponse> {
  return api.post<ContextBuilderDisableResponse>(
    `/harness/context-builder/${encodeURIComponent(projectSlug)}/disable`,
    { expectedMtime },
  );
}
