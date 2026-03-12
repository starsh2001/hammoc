/**
 * ContextUsageDisplay Component
 * Displays context window usage with circular donut chart, color thresholds, and tooltip
 * [Source: Story 5.6 - Task 7]
 */

import { useTranslation } from 'react-i18next';
import { CONTEXT_USAGE_THRESHOLDS, CONTEXT_TOKEN_RESERVES, getEffectiveContextLimit, getContextUsagePercent } from '@hammoc/shared';
import type { ChatUsage } from '@hammoc/shared';

interface ContextUsageDisplayProps {
  contextUsage: ChatUsage | null;
  onNewSession?: () => void;
  /** Trigger manual context compaction */
  onCompact?: () => void;
  /** Disable click actions (e.g. during queue execution) */
  disabled?: boolean;
}

function getStrokeColor(percent: number): string {
  if (percent > CONTEXT_USAGE_THRESHOLDS.DANGER) return '#ef4444';   // red-500
  if (percent >= CONTEXT_USAGE_THRESHOLDS.WARNING) return '#eab308'; // yellow-500
  return '#22c55e'; // green-500
}

// SVG donut chart constants
const SIZE = 28;
const STROKE_WIDTH = 3;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ContextUsageDisplay({ contextUsage, onNewSession, onCompact, disabled }: ContextUsageDisplayProps) {
  const { t } = useTranslation('common');
  const hasData = contextUsage && contextUsage.contextWindow > 0;

  // Don't render until we have actual usage data (prevents misleading 0% display)
  if (!hasData) {
    return null;
  }

  // Calculate total input tokens including cache (SDK's inputTokens only includes uncached tokens)
  const totalInputTokens = contextUsage.inputTokens + contextUsage.cacheCreationInputTokens + contextUsage.cacheReadInputTokens;
  // Match Claude Code's used_percentage: divide by effective available space
  // (context window minus output token reserve and safety buffer)
  const effectiveLimit = getEffectiveContextLimit(contextUsage.contextWindow);
  const usagePercent = getContextUsagePercent(totalInputTokens, contextUsage.contextWindow);

  const isCritical = usagePercent > CONTEXT_USAGE_THRESHOLDS.CRITICAL;
  const strokeColor = getStrokeColor(usagePercent);
  const dashOffset = CIRCUMFERENCE - (Math.min(usagePercent, 100) / 100) * CIRCUMFERENCE;

  const handleClick = () => {
    if (isCritical && onNewSession) {
      onNewSession();
    } else if (onCompact) {
      onCompact();
    }
  };

  const tooltipText = [
    ...(isCritical
      ? [t('contextUsage.criticalWarning', { percent: usagePercent }), t('contextUsage.clickNewSession'), '---']
      : [t('contextUsage.clickCompaction')]),
    t('contextUsage.contextTokens', { used: totalInputTokens.toLocaleString(), limit: effectiveLimit.toLocaleString(), percent: usagePercent }),
    t('contextUsage.contextWindow', { window: contextUsage.contextWindow.toLocaleString(), reserve: CONTEXT_TOKEN_RESERVES.OUTPUT_TOKEN_RESERVE.toLocaleString(), buffer: CONTEXT_TOKEN_RESERVES.SAFETY_BUFFER.toLocaleString() }),
    t('contextUsage.newTokens', { value: contextUsage.inputTokens.toLocaleString() }),
    t('contextUsage.cacheCreation', { value: contextUsage.cacheCreationInputTokens.toLocaleString() }),
    t('contextUsage.cacheRead', { value: contextUsage.cacheReadInputTokens.toLocaleString() }),
    t('contextUsage.outputTokens', { value: contextUsage.outputTokens.toLocaleString() }),
    t('contextUsage.cost', { cost: contextUsage.totalCostUSD.toFixed(4) }),
    '---',
    t('contextUsage.estimateNote'),
  ].join('\n');

  return (
    <button
      type="button"
      role="status"
      aria-label={t('contextUsage.ariaLabel', { percent: usagePercent })}
      title={tooltipText}
      disabled={disabled}
      className={`flex items-center gap-2 ml-1 sm:ml-3 mr-0.5 transition-opacity ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:opacity-80'}`}
      onClick={disabled ? undefined : handleClick}
      data-testid="context-usage-display"
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="flex-shrink-0"
        data-testid="context-usage-ring"
      >
        {/* Background ring */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          className="text-gray-200 dark:text-gray-600"
        />
        {/* Progress ring */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          className="transition-all duration-300"
          data-testid="context-usage-progress"
        />
        {/* Center percentage text */}
        <text
          x={SIZE / 2}
          y={SIZE / 2 - 1}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="8"
          fontWeight="600"
          className="fill-gray-600 dark:fill-gray-300"
        >
          {usagePercent}
        </text>
      </svg>
    </button>
  );
}
