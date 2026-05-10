/**
 * Story 30.2 (Task 5.3): detail list panel for a sub-section's lint issues.
 *
 * Renders above the card list when the active sub-section has any lint
 * issues. Each row = `규칙 + 카드 이름 + 위치 + 메시지`. Clicking a row
 * invokes `onActivate(issue)` so the panel can open the matching card editor
 * — the same handler used by `LintMarker`.
 *
 * For environment-sensitive rules (`mcp/command-not-on-path`) each row also
 * surfaces the server-PATH caveat and a "Lint rules" CTA that opens
 * `LintRulePreferencesDialog` for the AC3.c flow.
 */

import { useTranslation } from 'react-i18next';
import { LINT_RULE_I18N_KEY, type LintIssue, type LintRuleId } from '@hammoc/shared';

interface Props {
  issues: LintIssue[];
  onActivate: (issue: LintIssue) => void;
  /**
   * Called when the user clicks the "Lint rules" CTA on a row whose rule is
   * environment-sensitive. Wired by the workbench container to open the
   * preferences dialog (AC3.c).
   */
  onOpenRulePreferences?: (ruleId: LintRuleId) => void;
}

function describeLocation(issue: LintIssue): string {
  if (issue.location.kind === 'line') {
    return `line ${issue.location.line}`;
  }
  return issue.location.path.join('.');
}

export function LintIssueList({ issues, onActivate, onOpenRulePreferences }: Props) {
  const { t } = useTranslation('settings');

  if (issues.length === 0) {
    return (
      <div
        data-testid="lint-issue-list-empty"
        className="rounded border border-dashed border-gray-300 dark:border-gray-700 p-3 text-sm text-gray-500 dark:text-gray-400"
      >
        {t('harness.tools.lint.listEmpty')}
      </div>
    );
  }

  return (
    <div
      data-testid="lint-issue-list"
      className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
    >
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
        {t('harness.tools.lint.listTitle', { count: issues.length })}
      </div>
      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {issues.map((issue, idx) => {
          const ruleI18nKey = LINT_RULE_I18N_KEY[issue.ruleId];
          const ruleTitle = t(`harness.tools.lint.rule.${ruleI18nKey}.title`, {
            defaultValue: issue.ruleId,
          });
          const message = t(issue.messageI18nKey, {
            ...(issue.messageI18nVars ?? {}),
            defaultValue: ruleTitle,
          });
          const dot =
            issue.severity === 'error' ? 'bg-red-600' : 'bg-amber-500';
          const isPathRule = issue.ruleId === 'mcp/command-not-on-path';
          const pathNotice = isPathRule
            ? t('harness.tools.lint.rule.mcpCommandNotOnPath.serverPathNotice', {
                defaultValue: '',
              })
            : '';
          return (
            <li key={`${issue.ruleId}-${idx}`} className="flex flex-col">
              <button
                type="button"
                onClick={() => onActivate(issue)}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                data-testid="lint-issue-row"
              >
                <span className="flex items-center gap-2 font-medium">
                  <span aria-hidden="true" className={'inline-block h-1.5 w-1.5 rounded-full ' + dot} />
                  <span className="text-gray-900 dark:text-gray-100">{ruleTitle}</span>
                  <span className="text-gray-500 dark:text-gray-400 text-xs font-normal">
                    {issue.cardName} · {describeLocation(issue)}
                  </span>
                </span>
                <span className="text-gray-700 dark:text-gray-300 text-xs">{message}</span>
              </button>
              {isPathRule && pathNotice && (
                <div
                  data-testid="lint-issue-row-server-path-notice"
                  className="px-3 pb-2 -mt-1 flex flex-wrap items-start gap-2 text-[11px] text-amber-800 dark:text-amber-300"
                >
                  <span className="flex-1 min-w-0">{pathNotice}</span>
                  {onOpenRulePreferences && (
                    <button
                      type="button"
                      onClick={() => onOpenRulePreferences(issue.ruleId)}
                      data-testid="lint-issue-row-disable-cta"
                      className="shrink-0 px-2 py-0.5 rounded border border-amber-400 dark:border-amber-700 bg-white dark:bg-gray-900 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/40"
                    >
                      {t('harness.tools.lint.preferences.disableRule')}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
