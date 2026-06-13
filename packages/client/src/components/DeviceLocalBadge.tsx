/**
 * DeviceLocalBadge — a small "this device only" chip for settings stored in this browser's
 * localStorage (NOT the server), so they stay per-device and aren't synced/broadcast across
 * browsers. Counterpart to the server-synced settings (see SettingsSyncNotice). Used inside the
 * settings screen next to device-local items like the theme picker.
 */
import { useTranslation } from 'react-i18next';
import { MonitorSmartphone } from 'lucide-react';

export function DeviceLocalBadge({ className = '' }: { className?: string }) {
  const { t } = useTranslation('common');
  return (
    <span
      title={t('deviceLocal.tooltip')}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium align-middle
                  bg-gray-100 dark:bg-[#253040] text-gray-500 dark:text-gray-400
                  border border-gray-200 dark:border-[#3a4d5e] ${className}`}
    >
      <MonitorSmartphone className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">{t('deviceLocal.label')}</span>
    </span>
  );
}
