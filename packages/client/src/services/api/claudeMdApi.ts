/**
 * Story 29.1: Client API wrapper for the harness CLAUDE.md endpoints.
 *
 * Three endpoints, all under `/api/harness/claude-md`:
 *   - GET    — read content for a given scope (404 → HARNESS_FILE_NOT_FOUND)
 *   - PUT    — write content with optional STALE_WRITE guard
 *   - POST   — create an empty file (409 HARNESS_FILE_EXISTS when present)
 *
 * The story carries no dedicated DTO types in `@hammoc/shared` — we reuse
 * `HarnessReadResponse` / `HarnessWriteResponse` because the response shapes
 * are identical to what `harnessService` emits for arbitrary harness files.
 */

import type {
  HarnessReadResponse,
  HarnessScope,
  HarnessWriteResponse,
} from '@hammoc/shared';
import { api } from './client';

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  const enc = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  return `?${enc.join('&')}`;
}

export interface ClaudeMdRef {
  scope: HarnessScope;
  projectSlug?: string;
}

export async function readClaudeMd(ref: ClaudeMdRef): Promise<HarnessReadResponse> {
  return api.get<HarnessReadResponse>(
    `/harness/claude-md${qs({ scope: ref.scope, projectSlug: ref.projectSlug })}`,
  );
}

export async function writeClaudeMd(
  ref: ClaudeMdRef,
  content: string,
  expectedMtime?: string,
): Promise<HarnessWriteResponse> {
  return api.put<HarnessWriteResponse>('/harness/claude-md', {
    scope: ref.scope,
    projectSlug: ref.projectSlug,
    content,
    expectedMtime,
  });
}

export async function createClaudeMd(ref: ClaudeMdRef): Promise<HarnessWriteResponse> {
  return api.post<HarnessWriteResponse>('/harness/claude-md', {
    scope: ref.scope,
    projectSlug: ref.projectSlug,
  });
}
