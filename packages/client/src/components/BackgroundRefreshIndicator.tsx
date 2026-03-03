/**
 * BackgroundRefreshIndicator - Small inline indicator for background data refresh
 * Appears when cached/stale data is visible while fresh data loads in the background.
 */

import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface BackgroundRefreshIndicatorProps {
  isRefreshing: boolean;
  className?: string;
}

export function BackgroundRefreshIndicator({
  isRefreshing,
  className = '',
}: BackgroundRefreshIndicatorProps) {
  const { t } = useTranslation('common');

  if (!isRefreshing) return null;

  return (
    <span
      className={`inline-flex items-center ${className}`}
      role="status"
      aria-label={t('backgroundRefreshAria')}
    >
      <Loader2
        className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 animate-spin"
        aria-hidden="true"
      />
    </span>
  );
}
