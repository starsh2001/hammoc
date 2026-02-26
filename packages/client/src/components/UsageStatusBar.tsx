/**
 * UsageStatusBar Component
 * Displays subscription rate limit glow dots (5h/7d utilization) in the ChatInput button row.
 * Data comes from OAuth usage API polling (every 2 minutes).
 */

import type { SubscriptionRateLimit } from '@bmad-studio/shared';

interface UsageStatusBarProps {
  rateLimit?: SubscriptionRateLimit | null;
}

function getGlowDotClasses(utilization: number): string {
  if (utilization >= 0.8) return 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.53)] animate-pulse';
  if (utilization >= 0.5) return 'bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.53)]';
  return 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.53)]';
}

function GlowDot({ utilization, label, reset }: { utilization: number; label: string; reset?: string | null }) {
  const dotClasses = getGlowDotClasses(utilization);
  const pct = (utilization * 100).toFixed(0);
  const tooltip = reset ? `${label}: ${pct}% (리셋: ${new Date(reset).toLocaleTimeString()})` : `${label}: ${pct}%`;

  return (
    <span className="inline-flex items-center gap-1" title={tooltip}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClasses}`} />
      {/* Desktop: single line "5h 89%" / Mobile: stacked label over percentage */}
      <span className="hidden sm:inline text-[11px] text-gray-500 dark:text-gray-400">{label} {pct}%</span>
      <span className="flex flex-col leading-none sm:hidden">
        <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-[9px] text-gray-400 dark:text-gray-500">{pct}%</span>
      </span>
    </span>
  );
}

export function UsageStatusBar({ rateLimit }: UsageStatusBarProps) {
  if (!rateLimit?.fiveHour && !rateLimit?.sevenDay) return null;

  return (
    <div
      className="flex items-center gap-2 select-none"
      role="status"
      aria-label="Rate Limit 사용률"
      data-testid="usage-status-bar"
    >
      {rateLimit.fiveHour && (
        <GlowDot utilization={rateLimit.fiveHour.utilization} label="5h" reset={rateLimit.fiveHour.reset} />
      )}
      {rateLimit.sevenDay && (
        <GlowDot utilization={rateLimit.sevenDay.utilization} label="7d" reset={rateLimit.sevenDay.reset} />
      )}
    </div>
  );
}
