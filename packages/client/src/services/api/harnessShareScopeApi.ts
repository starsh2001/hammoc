/**
 * Story 30.1 (Task 3): client API wrapper for `GET /api/harness/share-scope`.
 *
 * Project-scope only — `.gitignore` does not apply to the user-scope tree.
 */

import type { HarnessShareScopeResponse } from '@hammoc/shared';
import { api } from './client';

function encodeQuery(params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== '');
  if (entries.length === 0) return '';
  const enc = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return `?${enc.join('&')}`;
}

export async function fetchShareScope(
  projectSlug: string,
  paths: string[],
): Promise<HarnessShareScopeResponse> {
  return api.get<HarnessShareScopeResponse>(
    `/harness/share-scope${encodeQuery({
      scope: 'project',
      projectSlug,
      paths: paths.join(','),
    })}`,
  );
}
