/**
 * Story 30.2 (Task 5.1): per-section count badge for the lint nav.
 *
 * Renders the (error, warn) tally on a sub-section nav button. 0/0 is
 * unrendered (zero visual noise — the section is "clean"). Color axis is
 * amber=warn / red=error, intentionally distinct from `ShareBadge`'s
 * blue/gray/amber so the two badges never read as a continuous gradient.
 */

import { useTranslation } from 'react-i18next';

interface Props {
  errorCount: number;
  warnCount: number;
  onClick?: () => void;
  className?: string;
}

export function LintCountBadge({ errorCount, warnCount, onClick, className }: Props) {
  const { t } = useTranslation('settings');
  if (errorCount <= 0 && warnCount <= 0) return null;

  const label =
    errorCount > 0 && warnCount > 0
      ? t('harness.tools.lint.count.errorAndWarn', { error: errorCount, warn: warnCount })
      : errorCount > 0
        ? t('harness.tools.lint.count.error', { count: errorCount })
        : t('harness.tools.lint.count.warn', { count: warnCount });

  // When errors are present we lead with red; otherwise amber.
  const variant = errorCount > 0 ? 'error' : 'warn';
  const colorClass =
    variant === 'error'
      ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800'
      : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800';

  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      data-testid={`lint-count-badge-${variant}`}
      data-error-count={errorCount}
      data-warn-count={warnCount}
      title={label}
      className={
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border ' +
        colorClass +
        (onClick ? ' cursor-pointer hover:brightness-95' : '') +
        (className ? ` ${className}` : '')
      }
    >
      {label}
    </Tag>
  );
}
