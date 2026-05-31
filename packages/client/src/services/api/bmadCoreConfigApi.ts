/**
 * Story 31.1: Client API wrapper for the BMad core-config editor endpoints.
 *
 * Thin pass-through over the shared `api` fetch client (Story 28.4
 * harnessHooksApi pattern). Errors propagate as `ApiError` so the store can
 * branch on `err.code` (HARNESS_STALE_WRITE → reload/overwrite modal,
 * HARNESS_PARSE_ERROR → raw fallback, etc.).
 */

import type {
  BmadCoreConfigReadResponse,
  BmadCoreConfigWriteResponse,
  HarnessStructuredPatchOp,
} from '@hammoc/shared';
import { api } from './client';

export async function readBmadConfig(projectSlug: string): Promise<BmadCoreConfigReadResponse> {
  return api.get<BmadCoreConfigReadResponse>(
    `/harness/bmad-config/${encodeURIComponent(projectSlug)}`,
  );
}

export async function patchBmadConfig(
  projectSlug: string,
  ops: HarnessStructuredPatchOp[],
  expectedMtime?: string,
): Promise<BmadCoreConfigWriteResponse> {
  return api.patch<BmadCoreConfigWriteResponse>(
    `/harness/bmad-config/${encodeURIComponent(projectSlug)}`,
    { ops, expectedMtime },
  );
}

export async function writeRawBmadConfig(
  projectSlug: string,
  content: string,
  expectedMtime?: string,
): Promise<BmadCoreConfigWriteResponse> {
  return api.put<BmadCoreConfigWriteResponse>(
    `/harness/bmad-config/${encodeURIComponent(projectSlug)}/raw`,
    { content, expectedMtime },
  );
}
