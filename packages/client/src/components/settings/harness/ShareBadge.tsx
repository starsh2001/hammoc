/**
 * Story 30.1 (Task 4.1): per-file share-scope badge.
 *
 * Renders the verdict from `harnessShareScopeStore` as a small pill. Three
 * variants:
 *
 *   - `shared`        → blue   ("이 파일은 git 으로 팀 공유됩니다")
 *   - `local`         → gray   ("이 파일은 본인 기기에만 남습니다")
 *   - `fullyIgnored`  → amber  ("`.claude/` 가 통째로 git 에서 제외됩니다")
 *
 * Pattern follows `SystemBadge.tsx` (chip + variant CSS map). Color axis is
 * intentionally distinct from SystemBadge (indigo/amber) so the two badges
 * never read as a continuous gradient when they sit side-by-side on the same
 * card header.
 */

import { useTranslation } from 'react-i18next';
import type { ShareScope } from '@hammoc/shared';

interface Props {
  scope: ShareScope;
  className?: string;
}

const VARIANT_CLASS: Record<ShareScope, string> = {
  shared:
    'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800',
  local:
    'bg-gray-100 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700',
  fullyIgnored:
    'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800',
};

export function ShareBadge({ scope, className }: Props) {
  const { t } = useTranslation('settings');
  const label = t(`harness.tools.shareBadge.${scope}`);
  return (
    <span
      data-testid={`share-badge-${scope}`}
      data-variant={scope}
      title={label}
      className={
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ' +
        VARIANT_CLASS[scope] +
        (className ? ` ${className}` : '')
      }
    >
      {label}
    </span>
  );
}
