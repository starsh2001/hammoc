/**
 * Story 30.1 (Task 5): wrapper that renders `ShareBadge` for a single
 * harness card on the workbench panels.
 *
 * - User-scope cards are skipped (`.gitignore` does not apply)
 * - Plugin-scope cards are skipped (AC5 — plugin assets are read-only and
 *   sit on the marketplace axis, not the share-vs-local axis)
 * - Until the verdict is resolved (initial load + new-card lazy fetch), the
 *   component renders nothing — better than flashing an empty pill
 */

import type { HarnessScope, ShareScope } from '@hammoc/shared';
import { useShareBadge } from '../../../hooks/useShareBadge';
import { ShareBadge } from './ShareBadge';

interface Props {
  projectSlug: string;
  /** Card's source scope. The badge only renders for `'project'`. */
  scope: HarnessScope | 'plugin';
  /** Project-relative POSIX path. Pass empty / undefined to suppress rendering. */
  relativePath: string | null | undefined;
  /**
   * Override resolution. Used by tests + by panels that already have the
   * verdict in hand and want to avoid an extra subscription.
   */
  forcedScope?: ShareScope;
  className?: string;
}

export function CardShareBadge({
  projectSlug,
  scope,
  relativePath,
  forcedScope,
  className,
}: Props) {
  // Hook order must be unconditional — call it always, then narrow.
  const lookedUp = useShareBadge(projectSlug, relativePath);

  if (scope !== 'project') return null;
  if (!relativePath) return null;

  const verdict = forcedScope ?? lookedUp;
  if (!verdict) return null;

  return <ShareBadge scope={verdict} className={className} />;
}
