/**
 * Story 30.1 (Task 5.3): convenience hook for resolving a single harness
 * file's share-scope verdict from the centralized store.
 *
 * - Returns `undefined` when the path has not yet been evaluated. Panels
 *   should render the badge conditionally so transient empty verdicts do not
 *   flash unstyled chips.
 * - User-scope harness files (`scope === 'user'`) are out of scope for the
 *   share badge axis (no `.gitignore` involved); pass `null` to opt out.
 */

import { useEffect } from 'react';
import { useHarnessShareScopeStore } from '../stores/harnessShareScopeStore';
import type { ShareScope } from '@hammoc/shared';

export function useShareBadge(
  projectSlug: string | undefined,
  relativePath: string | null | undefined,
): ShareScope | undefined {
  const cards = useHarnessShareScopeStore((s) => s.cards);
  const evaluateMore = useHarnessShareScopeStore((s) => s.evaluateMore);

  // Lazy-evaluate any path the bulk prefetch did not already cover. The store
  // dedupes (paths already in `cards` are skipped) so this runs at most once
  // per (slug, path) tuple even when many cards mount in the same render.
  useEffect(() => {
    if (!projectSlug || !relativePath) return;
    if (cards[relativePath] === undefined) {
      void evaluateMore(projectSlug, [relativePath]);
    }
  }, [projectSlug, relativePath, cards, evaluateMore]);

  if (!relativePath) return undefined;
  return cards[relativePath];
}
