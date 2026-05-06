/**
 * Story 29.2: System badge — distinguishes Hammoc-native primitives from
 * Claude Code primitives when both surface in the same panel.
 *
 *   variant="hammoc"      → 보라/인디고 — `%snippet%` 자산 (스니펫)
 *   variant="claudeCode"  → 오렌지/앰버 — `/slash` 커맨드 (즐겨찾기 등)
 *
 * Distinct from `ScopeBadge` (project/global/plugin) — both can appear on the
 * same row. Convention: SystemBadge sits left, ScopeBadge sits right.
 *
 * Designed to be reusable across other panels where a Hammoc/Claude system
 * distinction matters (e.g. Story 30.1 share/local badges).
 */

import { useTranslation } from 'react-i18next';

export type SystemBadgeVariant = 'hammoc' | 'claudeCode';

interface Props {
  variant: SystemBadgeVariant;
  /** Optional override for the label — falls back to the i18n default. */
  label?: string;
  className?: string;
}

const VARIANT_CLASS: Record<SystemBadgeVariant, string> = {
  hammoc:
    'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800',
  claudeCode:
    'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800',
};

const VARIANT_DEFAULT_LABEL: Record<SystemBadgeVariant, string> = {
  hammoc: 'Snippets (Hammoc)',
  claudeCode: 'Command Favorites (Claude Code)',
};

export function SystemBadge({ variant, label, className }: Props) {
  const { t } = useTranslation('settings');
  const text =
    label ??
    t(`harness.snippets.systemBadge.${variant}`, {
      defaultValue: VARIANT_DEFAULT_LABEL[variant],
    });
  return (
    <span
      data-testid={`system-badge-${variant}`}
      data-variant={variant}
      className={
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ' +
        VARIANT_CLASS[variant] +
        (className ? ` ${className}` : '')
      }
    >
      {text}
    </span>
  );
}
