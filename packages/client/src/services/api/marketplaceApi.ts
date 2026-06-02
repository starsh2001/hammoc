/**
 * Story 31.4: Client API wrapper for the marketplace catalog endpoint.
 *
 * Thin pass-through over the shared `api` fetch client. Read-only — there is a
 * single GET endpoint; direct install/marketplace-add automation was dropped
 * after spike #2 (negative), so installs are guided via copy-only command
 * blocks (no write endpoint to call).
 */

import type { HarnessMarketplaceCatalogResponse } from '@hammoc/shared';
import { api } from './client';

export async function fetchMarketplaceCatalog(
  projectSlug: string,
): Promise<HarnessMarketplaceCatalogResponse> {
  return api.get<HarnessMarketplaceCatalogResponse>(
    `/harness/marketplace/${encodeURIComponent(projectSlug)}/catalog`,
  );
}
