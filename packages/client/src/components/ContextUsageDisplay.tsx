/**
 * ContextUsageDisplay Component
 * Displays context window usage with circular donut chart, color thresholds, and tooltip
 * [Source: Story 5.6 - Task 7]
 */

import { AlertTriangle } from 'lucide-react';
import { CONTEXT_USAGE_THRESHOLDS } from '@bmad-studio/shared';
import type { ChatUsage } from '@bmad-studio/shared';

interface ContextUsageDisplayProps {
  contextUsage: ChatUsage | null;
  onNewSession?: () => void;
  /** Trigger manual context compaction */
  onCompact?: () => void;
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

export function ContextUsageDisplay({ contextUsage, onNewSession, onCompact }: ContextUsageDisplayProps) {
  const hasData = contextUsage && contextUsage.contextWindow > 0;
  const usagePercent = hasData
    ? Math.round((contextUsage.inputTokens / contextUsage.contextWindow) * 100)
    : 0;
  const isCritical = usagePercent > CONTEXT_USAGE_THRESHOLDS.CRITICAL;
  const strokeColor = getStrokeColor(usagePercent);
  const dashOffset = CIRCUMFERENCE - (Math.min(usagePercent, 100) / 100) * CIRCUMFERENCE;

  const handleClick = () => {
    if (!hasData) return;
    if (isCritical && onNewSession) {
      onNewSession();
    } else if (onCompact) {
      onCompact();
    }
  };

  const tooltipText = hasData
    ? [
        ...(isCritical
          ? [`⚠ 컨텍스트가 거의 찼습니다 (${usagePercent}%)`, '클릭하여 새 세션 시작', '---']
          : ['클릭하여 Context Compaction 실행']),
        `컨텍스트: ${contextUsage.inputTokens.toLocaleString()} / ${contextUsage.contextWindow.toLocaleString()} 토큰 (${usagePercent}%)`,
        `출력 토큰: ${contextUsage.outputTokens.toLocaleString()}`,
        `캐시 읽기: ${contextUsage.cacheReadInputTokens.toLocaleString()}`,
        `비용: $${contextUsage.totalCostUSD.toFixed(4)}`,
      ].join('\n')
    : '컨텍스트 사용량 (대기 중)';

  return (
    <button
      type="button"
      role="status"
      aria-label={`컨텍스트 사용량 ${usagePercent}%`}
      title={tooltipText}
      className={`flex items-center gap-2 ml-3 mr-0.5 transition-opacity ${hasData ? 'cursor-pointer hover:opacity-80' : 'cursor-default opacity-50'}`}
      onClick={handleClick}
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
      {isCritical && (
        <AlertTriangle className="w-4 h-4 text-red-500" data-testid="context-usage-warning" />
      )}
    </button>
  );
}
