/**
 * Story 30.2 (Task 5.2): per-card inline lint marker.
 *
 * Sits on the card header next to `<CardShareBadge />` (Story 30.1's slot).
 * Renders nothing when the card has 0 issues. When 1+ errors are present the
 * marker is red; warn-only cards get amber. Hover or keyboard focus surfaces
 * an accessible tooltip (`role="tooltip"` + `aria-describedby`) with the
 * first issue's rule + message — and, for the environment-sensitive
 * `mcp/command-not-on-path` rule, the server-PATH caveat (AC3.a).
 *
 * Click invokes `onActivate(issue)` so the panel can open the corresponding
 * editor — the marker itself does not own that state (AC2.b).
 */

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LINT_RULE_I18N_KEY, type LintIssue } from '@hammoc/shared';

interface Props {
  issues: LintIssue[];
  onActivate: (issue: LintIssue) => void;
  className?: string;
}

export function LintMarker({ issues, onActivate, className }: Props) {
  const { t } = useTranslation('settings');
  const tooltipId = useId();
  const [tooltipVisible, setTooltipVisible] = useState(false);

  if (!issues || issues.length === 0) return null;

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.length - errorCount;
  const variant = errorCount > 0 ? 'error' : 'warn';

  // Prefer the first error if any, otherwise the first warn — that's the
  // issue the marker tooltip describes and the click handler activates.
  const first = issues.find((i) => i.severity === 'error') ?? issues[0];

  const colorClass =
    variant === 'error'
      ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800'
      : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800';

  const dotClass = variant === 'error' ? 'bg-red-600' : 'bg-amber-500';
  const total = issues.length;

  // Translate the rule body + carry interpolation vars so the tooltip uses
  // the same i18n message the detail list does.
  const ruleI18nKey = LINT_RULE_I18N_KEY[first.ruleId];
  const ruleTitle = t(`harness.tools.lint.rule.${ruleI18nKey}.title`, {
    defaultValue: first.ruleId,
  });
  const message = t(first.messageI18nKey, {
    ...(first.messageI18nVars ?? {}),
    defaultValue: ruleTitle,
  });
  const baseTooltip = `${ruleTitle} — ${message}`;
  // AC3.a: append the server-PATH caveat for the MCP-on-path rule. The notice
  // already includes the "open Lint rules" CTA pointer; the panel's detail
  // list also renders an explicit clickable CTA next to the row.
  const isPathRule = first.ruleId === 'mcp/command-not-on-path';
  const pathNotice = isPathRule
    ? t('harness.tools.lint.rule.mcpCommandNotOnPath.serverPathNotice', {
        defaultValue: '',
      })
    : '';
  const tooltip = pathNotice ? `${baseTooltip}\n\n${pathNotice}` : baseTooltip;

  const showTooltip = () => setTooltipVisible(true);
  const hideTooltip = () => setTooltipVisible(false);

  return (
    <span className={'relative inline-flex' + (className ? ` ${className}` : '')}>
      <button
        type="button"
        onClick={() => onActivate(first)}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        data-testid={`lint-marker-${variant}`}
        data-error-count={errorCount}
        data-warn-count={warnCount}
        aria-label={baseTooltip}
        aria-describedby={tooltipId}
        className={
          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium border ' +
          colorClass +
          ' cursor-pointer hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1'
        }
      >
        <span aria-hidden="true" className={'inline-block h-1.5 w-1.5 rounded-full ' + dotClass} />
        <span>{total}</span>
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        data-testid={`lint-marker-tooltip-${variant}`}
        // The tooltip stays in the DOM at all times so screen readers can
        // resolve `aria-describedby` on focus regardless of the visibility
        // state. Hidden visually via Tailwind's `sr-only` when not active.
        className={
          (tooltipVisible
            ? 'absolute z-30 top-full left-0 mt-1 w-max max-w-xs rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-800 dark:text-gray-100 shadow-md whitespace-pre-line'
            : 'sr-only')
        }
      >
        {tooltip}
      </span>
    </span>
  );
}
