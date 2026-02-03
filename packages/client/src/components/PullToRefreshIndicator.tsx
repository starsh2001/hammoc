/**
 * PullToRefreshIndicator - Visual indicator for pull-to-refresh gesture
 * [Source: Story 3.4 - Task 4]
 */

import { RefreshCw } from 'lucide-react';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  threshold: number;
  isRefreshing: boolean;
}

export function PullToRefreshIndicator({
  pullDistance,
  threshold,
  isRefreshing,
}: PullToRefreshIndicatorProps) {
  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 180;

  if (pullDistance === 0 && !isRefreshing) return null;

  return (
    <div
      className="flex justify-center py-4 transition-all"
      style={{ height: pullDistance }}
    >
      <RefreshCw
        className={`w-6 h-6 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`}
        style={{ transform: `rotate(${rotation}deg)` }}
        aria-hidden="true"
      />
      {isRefreshing && (
        <span className="sr-only">새로고침 중...</span>
      )}
    </div>
  );
}
