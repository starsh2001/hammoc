/**
 * AccountSettingsSection - Claude Code account info, subscription usage, and
 * multi-account management (Story BS-8).
 */

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RefreshCw, LogOut, Check, Plus, Trash2 } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useAccountStore } from '../../stores/accountStore';
import { accountApi } from '../../services/api/account';
import { getSocket } from '../../services/socket';
import { ClaudeLoginFlow } from '../ClaudeLoginFlow';
import { ConfirmModal } from '../ConfirmModal';
import type { AccountInfoResponse, AccountInfo, AccountSummary } from '@hammoc/shared';

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

/** Multi-account list: active account marked, others switchable/removable, plus "Add account". */
function MultiAccountList({ onActiveChanged }: { onActiveChanged: () => void }) {
  const { t } = useTranslation('settings');
  const accounts = useAccountStore((s) => s.accounts);
  const activeKey = useAccountStore((s) => s.activeKey);
  const pendingKey = useAccountStore((s) => s.pendingKey);
  const fetchAccounts = useAccountStore((s) => s.fetch);
  const switchTo = useAccountStore((s) => s.switchTo);
  const removeAccount = useAccountStore((s) => s.remove);

  const [showAddFlow, setShowAddFlow] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<AccountSummary | null>(null);

  // Load the list + wire cross-tab sync for the lifetime of this section.
  useEffect(() => {
    fetchAccounts();
    const unsubscribe = useAccountStore.getState().subscribe();
    return unsubscribe;
  }, [fetchAccounts]);

  const handleSwitch = useCallback(
    async (key: string) => {
      try {
        const { reauthRequired } = await switchTo(key);
        if (reauthRequired) {
          toast.warning(t('account.multiAccount.reauthRequired'));
          setShowAddFlow(true); // expired stored token → offer BS-7 re-login (AC12)
        } else {
          toast.success(t('account.multiAccount.switched'));
        }
        onActiveChanged();
      } catch {
        toast.error(t('account.multiAccount.switchFailed'));
      }
    },
    [switchTo, t, onActiveChanged],
  );

  const handleRemoveConfirmed = useCallback(async () => {
    if (!pendingRemoval) return;
    const target = pendingRemoval;
    setPendingRemoval(null);
    try {
      await removeAccount(target.key);
      toast.success(t('account.multiAccount.removed'));
    } catch {
      toast.error(t('account.multiAccount.removeFailed'));
    }
  }, [pendingRemoval, removeAccount, t]);

  // Login completion (add account): the server captures the credential on auth:complete;
  // refresh the list + the active-account display above.
  const handleAddComplete = useCallback(() => {
    setShowAddFlow(false);
    fetchAccounts();
    onActiveChanged();
  }, [fetchAccounts, onActiveChanged]);

  const labelFor = (a: AccountSummary): string =>
    a.email || a.key || t('account.multiAccount.unknownEmail');

  return (
    <div className="pt-3 border-t border-gray-200 dark:border-[#263240]">
      <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">
        {t('account.multiAccount.title')}
      </h4>

      {accounts.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('account.multiAccount.empty')}
        </p>
      ) : (
        <ul className="space-y-1.5" role="list">
          {accounts.map((a) => {
            const isActive = a.key === activeKey;
            const isPending = a.key === pendingKey;
            return (
              <li
                key={a.key}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border
                  ${isActive
                    ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/15'
                    : 'border-gray-300 dark:border-[#455568]'}`}
              >
                <div className="min-w-0 flex items-center gap-2">
                  {isActive && <Check className="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />}
                  <div className="min-w-0">
                    <div className="text-sm text-gray-900 dark:text-white truncate">{labelFor(a)}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      {a.tier || '—'}
                      {isActive && ` · ${t('account.multiAccount.active')}`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => handleSwitch(a.key)}
                      disabled={isPending}
                      className="px-2.5 py-1 rounded-md text-xs font-medium
                                 text-blue-600 dark:text-blue-400 border border-gray-300 dark:border-[#455568]
                                 hover:bg-blue-50 dark:hover:bg-blue-900/20
                                 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isPending ? t('account.multiAccount.switching') : t('account.multiAccount.switch')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingRemoval(a)}
                    disabled={isActive || isPending}
                    title={isActive ? t('account.multiAccount.removeActiveDisabled') : t('account.multiAccount.remove')}
                    aria-label={t('account.multiAccount.remove')}
                    className="p-1.5 rounded-md text-gray-500 dark:text-gray-400
                               hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20
                               disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add account: inline BS-7 login flow */}
      {showAddFlow ? (
        <div className="mt-3 p-3 rounded-md border border-gray-200 dark:border-[#455568]">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {t('account.multiAccount.addAccountHint')}
          </p>
          <ClaudeLoginFlow autoStart onComplete={handleAddComplete} />
          <button
            type="button"
            onClick={() => setShowAddFlow(false)}
            className="mt-2 text-xs text-gray-500 dark:text-gray-400 hover:underline"
          >
            {t('account.multiAccount.cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddFlow(true)}
          className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs
                     text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-[#455568]
                     hover:bg-gray-50 dark:hover:bg-[#263240] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('account.multiAccount.addAccount')}
        </button>
      )}

      <ConfirmModal
        isOpen={pendingRemoval !== null}
        title={t('account.multiAccount.confirmRemoveTitle')}
        message={t('account.multiAccount.confirmRemoveBody', {
          name: pendingRemoval ? labelFor(pendingRemoval) : '',
        })}
        confirmText={t('account.multiAccount.confirmRemove')}
        variant="danger"
        onConfirm={handleRemoveConfirmed}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}

export function AccountSettingsSection() {
  const { t } = useTranslation('settings');

  const [accountInfo, setAccountInfo] = useState<AccountInfoResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const subscriptionRateLimit = useChatStore((s) => s.subscriptionRateLimit);

  // Pull the latest active-account info + usage. Shared by initial load, the Refresh
  // button, login completion, and an account switch (BS-8) so the top display stays current.
  const reloadActiveAccount = useCallback(() => {
    accountApi.get()
      .then(setAccountInfo)
      .catch(() => { /* ignore, UI shows empty state */ });
    accountApi.getUsage()
      .then((res) => {
        if (res.rateLimit) useChatStore.getState().setSubscriptionRateLimit(res.rateLimit);
      })
      .catch(() => { /* ignore, UI shows empty state */ });
  }, []);

  useEffect(() => {
    reloadActiveAccount();
  }, [reloadActiveAccount]);

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

  // Story BS-7: logout deletes the credentials file (server) and transitions this section
  // to the inline login flow in-place (optimistic — no page navigation).
  const handleLogout = useCallback(() => {
    getSocket().emit('auth:logout');
    // Switch to the inline login flow in-place; usage bars are hidden in the logged-out branch,
    // so the (now stale) cached rate limit is no longer shown.
    setAccountInfo({ account: null, fetchedAt: Date.now() });
    toast.success(t('account.claudeLogout.done'));
  }, [t]);

  // Story BS-7: login completion transitions back to the account-info display with fresh data.
  const handleLoginComplete = useCallback((acct: AccountInfo | null) => {
    setAccountInfo({ account: acct, fetchedAt: Date.now() });
    accountApi.getUsage()
      .then((res) => {
        if (res.rateLimit) useChatStore.getState().setSubscriptionRateLimit(res.rateLimit);
      })
      .catch(() => { /* ignore */ });
    // BS-8: the credential was captured server-side — refresh the multi-account list.
    useAccountStore.getState().fetch();
  }, []);

  const formatFetchedAt = (ts: number | null): string => {
    if (!ts) return t('account.info.never');
    return new Date(ts).toLocaleString();
  };

  const account = accountInfo?.account ?? null;
  const dash = '—';

  // Logged-out state (AC20): show the inline login flow in place of the account info.
  if (!account) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('account.info.title')}
        </h3>
        <ClaudeLoginFlow onComplete={handleLoginComplete} />
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('account.info.title')}
        </h3>
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs
                       text-red-600 dark:text-red-400 border border-gray-300 dark:border-[#455568]
                       hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            {t('account.claudeLogout.button')}
          </button>
        </div>
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

      {/* Story BS-8: multi-account list with switch / remove / add */}
      <MultiAccountList onActiveChanged={reloadActiveAccount} />
    </section>
  );
}
