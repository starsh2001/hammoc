/**
 * Story 30.1 (Task 4.2): Mode A / Mode B banner shown above the workbench
 * sub-section nav.
 *
 *   Mode A — gray  : "팀 공유 하네스 프로젝트" (Mode A keeps the calm tone of
 *                    `ShareBadge.local` so the blue `shared` chip stays the
 *                    only blue accent on the page)
 *   Mode B — amber : "비공유 모드 — `.claude/` 가 git 에서 제외됩니다."
 *                    Optional [번들 내보내기] button on the right (Story 30.3
 *                    Export trigger). When `onExportClick` is undefined the
 *                    button still renders but pops a fallback toast — Task 7.1.
 *
 * The banner is mounted exactly once per workbench (above the sub-section
 * nav) — sub-section components never render their own banner so the verdict
 * stays a single source of truth.
 */

import { useTranslation } from 'react-i18next';
import { Share2, Lock } from 'lucide-react';
import type { ShareMode } from '@hammoc/shared';

interface Props {
  mode: ShareMode;
  /** Story 30.3 Export modal trigger. When omitted, button shows fallback toast. */
  onExportClick?: () => void;
  className?: string;
}

const MODE_VARIANT_CLASS: Record<'A' | 'B', string> = {
  A: 'bg-gray-50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-800',
  B: 'bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800',
};

export function ModeBanner({ mode, onExportClick, className }: Props) {
  const { t } = useTranslation('settings');

  if (mode === 'unknown') return null;

  const isB = mode === 'B';
  const Icon = isB ? Lock : Share2;
  const titleKey = isB ? 'harness.tools.modeBanner.modeB.title' : 'harness.tools.modeBanner.modeA.title';
  const detailKey = isB ? 'harness.tools.modeBanner.modeB.detail' : 'harness.tools.modeBanner.modeA.detail';

  const handleExport = () => {
    if (onExportClick) {
      onExportClick();
      return;
    }
    // Task 7.1 fallback — Story 30.3 not yet merged. Render an alert so the
    // user understands the CTA is wired but the destination isn't ready.
    if (typeof window !== 'undefined') {
      window.alert(t('harness.tools.modeBanner.exportFallbackToast'));
    }
  };

  return (
    <div
      data-testid={`mode-banner-${mode}`}
      data-mode={mode}
      className={
        'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2 rounded-md text-sm ' +
        MODE_VARIANT_CLASS[isB ? 'B' : 'A'] +
        (className ? ` ${className}` : '')
      }
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{t(titleKey)}</span>
        <span className="hidden sm:inline"> — </span>
        <span className="block sm:inline opacity-90">{t(detailKey)}</span>
      </div>
      {isB && (
        <button
          type="button"
          data-testid="mode-banner-export-cta"
          onClick={handleExport}
          className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-amber-200 dark:bg-amber-800/60 text-amber-900 dark:text-amber-100 hover:bg-amber-300 dark:hover:bg-amber-800"
        >
          {t('harness.tools.modeBanner.modeB.exportCta')}
        </button>
      )}
    </div>
  );
}
