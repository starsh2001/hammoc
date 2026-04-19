import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../stores/chatStore';
import { usePreferencesStore } from '../stores/preferencesStore';

const WARN_THRESHOLD = 0.8;
const CRITICAL_THRESHOLD = 0.95;

export function BudgetWarningBanner() {
  const { t } = useTranslation('common');
  const contextUsage = useChatStore((s) => s.contextUsage);
  const maxBudgetUsd = usePreferencesStore((s) => s.preferences.maxBudgetUsd);

  if (!maxBudgetUsd || maxBudgetUsd <= 0 || !contextUsage) return null;

  const ratio = contextUsage.totalCostUSD / maxBudgetUsd;
  if (ratio < WARN_THRESHOLD) return null;

  const isCritical = ratio >= CRITICAL_THRESHOLD;
  const pct = Math.min(Math.round(ratio * 100), 999);
  const costStr = contextUsage.totalCostUSD.toFixed(4);
  const budgetStr = maxBudgetUsd.toFixed(4);

  return (
    <div
      role="alert"
      data-testid="budget-warning-banner"
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${
        isCritical
          ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border-b border-red-300 dark:border-red-700'
          : 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 border-b border-yellow-300 dark:border-yellow-700'
      }`}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>
        {isCritical
          ? t('budgetWarning.critical', { pct, cost: costStr, budget: budgetStr })
          : t('budgetWarning.warning', { pct, cost: costStr, budget: budgetStr })}
      </span>
    </div>
  );
}
