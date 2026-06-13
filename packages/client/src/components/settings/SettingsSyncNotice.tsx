/**
 * SettingsSyncNotice — banner clarifying that the settings on this screen are
 * server-persisted, so they apply to (and now sync live across) every browser
 * signed in to the same server. Shown on settings screens whose values broadcast
 * to other devices: global, advanced, and per-project settings. NOT shown on
 * screens backed by dedicated/credential endpoints (e.g. Telegram) or by
 * device-local UI state (panel width, board view), which stay per-browser.
 */
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';

export function SettingsSyncNotice() {
  const { t } = useTranslation('settings');
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
      <RefreshCw className="w-4 h-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
      <p className="text-xs text-blue-700 dark:text-blue-300">{t('sync.deviceNotice')}</p>
    </div>
  );
}
