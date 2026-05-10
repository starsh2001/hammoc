/**
 * Story 30.2 (Task 5.4): rule preferences dialog.
 *
 * Modal with 7 checkboxes (one per rule) + "Restore defaults" + "Close".
 * Each checkbox is bound to `harnessLintStore.toggleRule()` — the optimistic
 * update + rollback logic lives in the store. Failure surfaces as a toast
 * via the existing toast system.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LINT_RULE_DEFAULTS,
  LINT_RULE_I18N_KEY,
  LINT_RULE_IDS,
  type LintRuleId,
} from '@hammoc/shared';
import { useHarnessLintStore } from '../../../stores/harnessLintStore';

interface Props {
  open: boolean;
  onClose: () => void;
  onError?: (message: string) => void;
}

export function LintRulePreferencesDialog({ open, onClose, onError }: Props) {
  const { t } = useTranslation('settings');
  const rulePrefs = useHarnessLintStore((s) => s.rulePreferences);
  const toggleRule = useHarnessLintStore((s) => s.toggleRule);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [busyRule, setBusyRule] = useState<LintRuleId | null>(null);

  // Auto-focus the close button when the dialog opens — a11y default for
  // ad-hoc preferences modals (no destructive primary action to focus).
  useEffect(() => {
    if (open && closeBtnRef.current) closeBtnRef.current.focus();
  }, [open]);

  if (!open) return null;

  const handleToggle = async (ruleId: LintRuleId, enabled: boolean) => {
    setBusyRule(ruleId);
    try {
      await toggleRule(ruleId, enabled);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('harness.tools.lint.preferences.toggleErrorToast');
      onError?.(message);
    } finally {
      setBusyRule(null);
    }
  };

  const restoreDefaults = async () => {
    for (const id of LINT_RULE_IDS) {
      const target = LINT_RULE_DEFAULTS[id];
      if (rulePrefs[id] !== target) {
        await handleToggle(id, target);
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lint-rule-prefs-title"
      data-testid="lint-rule-prefs-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-900 shadow-xl flex flex-col max-h-[90vh]">
        <header className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 id="lint-rule-prefs-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('harness.tools.lint.preferences.title')}
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <ul className="flex flex-col gap-3">
            {LINT_RULE_IDS.map((id) => {
              const enabled = rulePrefs[id] ?? LINT_RULE_DEFAULTS[id];
              const i18nKey = LINT_RULE_I18N_KEY[id];
              const ruleLabel = t(`harness.tools.lint.preferences.ruleLabel.${i18nKey}`, {
                defaultValue: id,
              });
              const ruleDescription = t(
                `harness.tools.lint.preferences.ruleDescription.${i18nKey}`,
                { defaultValue: '' },
              );
              return (
                <li key={id} className="flex items-start gap-3">
                  <input
                    id={`lint-rule-${id}`}
                    type="checkbox"
                    checked={enabled}
                    disabled={busyRule === id}
                    onChange={(e) => void handleToggle(id, e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                    data-testid={`lint-rule-toggle-${id}`}
                  />
                  <label htmlFor={`lint-rule-${id}`} className="flex flex-col gap-0.5 cursor-pointer">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {ruleLabel}
                    </span>
                    {ruleDescription && (
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {ruleDescription}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <footer className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void restoreDefaults()}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            data-testid="lint-rule-restore-defaults"
          >
            {t('harness.tools.lint.preferences.restoreDefaults')}
          </button>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500"
            data-testid="lint-rule-close"
          >
            {t('harness.tools.lint.preferences.close')}
          </button>
        </footer>
      </div>
    </div>
  );
}
