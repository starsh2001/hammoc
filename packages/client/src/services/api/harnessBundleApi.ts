/**
 * Story 30.6 (Task A): client API wrapper for the 4 harness bundle endpoints
 * shipped by Story 30.5.
 *
 *   - POST /api/harness/bundle/export
 *   - POST /api/harness/bundle/import/preview   (multipart/form-data)
 *   - POST /api/harness/bundle/import/apply
 *   - GET  /api/harness/bundle/plugin-deps
 *
 * The export endpoint streams a ZIP back, so we bypass the JSON-only `api`
 * client and call `fetch` directly. The Content-Disposition filename is
 * extracted so the dialog can show what the browser will save (the server
 * normalises `WITH-SECRETS` into the filename for included-explicit bundles —
 * AC2-UI.b-1).
 */

import type {
  BundleSection,
  ImportApplySummary,
  ImportItemAction,
  ImportPreviewResponse,
  PluginDependenciesResponse,
  SecretsPolicy,
} from '@hammoc/shared';
import { ApiError } from './client';
import i18n from '../../i18n';

const API_BASE = '/api';

export interface ExportBundleResult {
  blob: Blob;
  filename: string;
}

export async function exportBundle(req: {
  projectSlug: string;
  includes: BundleSection[];
  secretsPolicy: SecretsPolicy;
  acknowledgedSecretInclusion?: boolean;
}): Promise<ExportBundleResult> {
  const response = await fetch(`${API_BASE}/harness/bundle/export`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': i18n.language || 'en',
    },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    await throwApiError(response, `${API_BASE}/harness/bundle/export`);
  }

  const blob = await response.blob();
  const filename = parseContentDispositionFilename(
    response.headers.get('Content-Disposition'),
  );
  return { blob, filename };
}

export async function importPreview(
  projectSlug: string,
  file: File,
): Promise<ImportPreviewResponse> {
  const formData = new FormData();
  formData.append('projectSlug', projectSlug);
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/harness/bundle/import/preview`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Accept-Language': i18n.language || 'en',
    },
    body: formData,
  });

  if (!response.ok) {
    await throwApiError(response, `${API_BASE}/harness/bundle/import/preview`);
  }
  return (await response.json()) as ImportPreviewResponse;
}

export async function importApply(req: {
  projectSlug: string;
  bundleToken: string;
  itemActions: Record<string, ImportItemAction>;
}): Promise<ImportApplySummary> {
  const response = await fetch(`${API_BASE}/harness/bundle/import/apply`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': i18n.language || 'en',
    },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    await throwApiError(response, `${API_BASE}/harness/bundle/import/apply`);
  }
  // Server wraps the summary as `{ appliedSummary }` — unwrap to keep the
  // store contract aligned with the shared `ImportApplySummary` type.
  const body = (await response.json()) as { appliedSummary: ImportApplySummary };
  return body.appliedSummary;
}

export async function fetchPluginDeps(
  projectSlug: string,
): Promise<PluginDependenciesResponse> {
  const url = `${API_BASE}/harness/bundle/plugin-deps?projectSlug=${encodeURIComponent(projectSlug)}`;
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Accept-Language': i18n.language || 'en',
    },
  });
  if (!response.ok) {
    await throwApiError(response, url);
  }
  return (await response.json()) as PluginDependenciesResponse;
}

// ----- helpers -------------------------------------------------------------

async function throwApiError(response: Response, url: string): Promise<never> {
  const errorData = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; details?: unknown } }
    | null;
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
    `Request failed (${response.status} ${response.statusText}) - ${url}`,
  );
}

/**
 * Pulls the filename out of `Content-Disposition: attachment; filename="..."`.
 * Falls back to `harness-bundle.zip` when the header is absent.
 */
function parseContentDispositionFilename(header: string | null): string {
  const fallback = 'harness-bundle.zip';
  if (!header) return fallback;
  // RFC 5987 filename* (UTF-8) takes precedence when present.
  const star = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through to plain filename */
    }
  }
  const plain = /filename\s*=\s*("([^"]+)"|([^;]+))/i.exec(header);
  if (plain) {
    return (plain[2] ?? plain[3] ?? '').trim() || fallback;
  }
  return fallback;
}

// Exposed for unit-test reuse.
export const __testing__ = { parseContentDispositionFilename };
