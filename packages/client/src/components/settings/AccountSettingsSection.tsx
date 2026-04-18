/**
 * AccountSettingsSection - Claude Code account info and subscription usage.
 */

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { accountApi } from '../../services/api/account';
import type { AccountInfoResponse } from '@hammoc/shared';

function UsageBar({
  label,
  utilization,
  reset,
  resetLabel,
}: {
  label: string;
  utilization: number;
  reset: string | null;
  resetLabel: string;
}) {
  const pct = Math.min(100, Math.max(0, utilization * 100));
  const barColor =
    utilization >= 0.8
      ? 'bg-red-500'
      : utilization >= 0.5
      ? 'bg-yellow-500'
      : 'bg-green-500';
  const resetText = reset ? new Date(reset).toLocaleString() : null;

  return (
    <div>
      <div className="flex justify-between items-baseline text-xs mb-1">
        <span className="text-gray-700 dark:text-gray-200 font-medium">{label}</span>
        <span className="text-gray-500 dark:text-gray-400 tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 dark:bg-[#263240] overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {resetText && (
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          {resetLabel}{resetText}
        </p>
      )}
    </div>
  );
}

export function AccountSettingsSection() {
  const { t } = useTranslation('settings');

  const [accountInfo, setAccountInfo] = useState<AccountInfoResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const subscriptionRateLimit = useChatStore((s) => s.subscriptionRateLimit);

  useEffect(() => {
    accountApi.get()
      .then(setAccountInfo)
      .catch(() => { /* ignore, UI shows empty state */ });

    // Fetch subscription rate limit via REST since the WebSocket listener
    // (useStreaming) only runs on ChatPage.
    accountApi.getUsage()
      .then((res) => {
        if (res.rateLimit) {
          useChatStore.getState().setSubscriptionRateLimit(res.rateLimit);
        }
      })
      .catch(() => { /* ignore, UI shows empty state */ });
  }, []);

  const handleRefreshAccount = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [accountRes, usageRes] = await Promise.all([
        accountApi.refresh(),
        accountApi.refreshUsage(),
      ]);
      setAccountInfo(accountRes);
      if (usageRes.rateLimit) {
        useChatStore.getState().setSubscriptionRateLimit(usageRes.rateLimit);
      }
      if (!accountRes.account) toast.error(t('account.info.refreshFailed'));
      else toast.success(t('account.info.refreshed'));
    } catch {
      toast.error(t('account.info.refreshFailed'));
    } finally {
      setIsRefreshing(false);
    }
  }, [t]);

  const formatFetchedAt = (ts: number | null): string => {
    if (!ts) return t('account.info.never');
    return new Date(ts).toLocaleString();
  };

  const account = accountInfo?.account ?? null;
  const dash = '—';

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('account.info.title')}
        </h3>
        <button
          type="button"
          onClick={handleRefreshAccount}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs
                     text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-[#455568]
                     hover:bg-gray-50 dark:hover:bg-[#263240]
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? t('account.info.refreshing') : t('account.info.refresh')}
        </button>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-gray-500 dark:text-gray-400">{t('account.info.email')}</dt>
        <dd className="text-gray-900 dark:text-white break-all">{account?.email || dash}</dd>

        <dt className="text-gray-500 dark:text-gray-400">{t('account.info.subscription')}</dt>
        <dd className="text-gray-900 dark:text-white">{account?.subscriptionType || dash}</dd>

        <dt className="text-gray-500 dark:text-gray-400">{t('account.info.provider')}</dt>
        <dd className="text-gray-900 dark:text-white">{account?.apiProvider || dash}</dd>

        {account?.organization && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">{t('account.info.organization')}</dt>
            <dd className="text-gray-900 dark:text-white">{account.organization}</dd>
          </>
        )}

        <dt className="text-gray-500 dark:text-gray-400">{t('account.info.fetchedAt')}</dt>
        <dd className="text-gray-900 dark:text-white">{formatFetchedAt(accountInfo?.fetchedAt ?? null)}</dd>
      </dl>

      {!account && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('account.info.emptyHint')}
        </p>
      )}

      {/* Subscription rate limit progress bars */}
      <div className="pt-2">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">
          {t('account.info.usage')}
        </h4>
        {subscriptionRateLimit?.fiveHour || subscriptionRateLimit?.sevenDay ? (
          <div className="space-y-3">
            {subscriptionRateLimit.fiveHour && (
              <UsageBar
                label={t('account.info.fiveHour')}
                utilization={subscriptionRateLimit.fiveHour.utilization}
                reset={subscriptionRateLimit.fiveHour.reset}
                resetLabel={t('account.info.resetAt', { reset: '' })}
              />
            )}
            {subscriptionRateLimit.sevenDay && (
              <UsageBar
                label={t('account.info.sevenDay')}
                utilization={subscriptionRateLimit.sevenDay.utilization}
                reset={subscriptionRateLimit.sevenDay.reset}
                resetLabel={t('account.info.resetAt', { reset: '' })}
              />
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('account.info.usageEmpty')}
          </p>
        )}
      </div>
    </section>
  );
}
