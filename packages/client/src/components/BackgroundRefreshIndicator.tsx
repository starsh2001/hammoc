/**
 * BackgroundRefreshIndicator - Small inline indicator for background data refresh
 * Appears when cached/stale data is visible while fresh data loads in the background.
 */

import { Loader2 } from 'lucide-react';

interface BackgroundRefreshIndicatorProps {
  isRefreshing: boolean;
  className?: string;
}

export function BackgroundRefreshIndicator({
  isRefreshing,
  className = '',
}: BackgroundRefreshIndicatorProps) {
  if (!isRefreshing) return null;

  return (
    <span
      className={`inline-flex items-center ${className}`}
      role="status"
      aria-label="백그라운드 새로고침 중"
    >
      <Loader2
        className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 animate-spin"
        aria-hidden="true"
      />
    </span>
  );
}
