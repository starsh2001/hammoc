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
  const hasData = contextUsage && contextUsage.contextWindow > 0;

  // Don't render until we have actual usage data (prevents misleading 0% display)
  if (!hasData) {
    return null;
  }

  // Calculate total input tokens including cache (SDK's inputTokens only includes uncached tokens)
  const totalInputTokens = contextUsage.inputTokens + contextUsage.cacheCreationInputTokens + contextUsage.cacheReadInputTokens;
  // Match Claude Code's used_percentage: divide by effective available space
  // (context window minus output token reserve and safety buffer)
  const OUTPUT_TOKEN_RESERVE = 20000;
  const SAFETY_BUFFER = 13000;
  const effectiveLimit = contextUsage.contextWindow - OUTPUT_TOKEN_RESERVE - SAFETY_BUFFER;
  const usagePercent = Math.min(100, Math.round((totalInputTokens / effectiveLimit) * 100));

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
      ? [`⚠ 컨텍스트가 거의 찼습니다 (${usagePercent}%)`, '클릭하여 새 세션 시작', '---']
      : ['클릭하여 Context Compaction 실행']),
    `컨텍스트: ${totalInputTokens.toLocaleString()} / ${effectiveLimit.toLocaleString()} 토큰 (${usagePercent}%)`,
    `  (전체 윈도우: ${contextUsage.contextWindow.toLocaleString()} - 출력 예약: ${OUTPUT_TOKEN_RESERVE.toLocaleString()} - 버퍼: ${SAFETY_BUFFER.toLocaleString()})`,
    `  - 신규: ${contextUsage.inputTokens.toLocaleString()}`,
    `  - 캐시 생성: ${contextUsage.cacheCreationInputTokens.toLocaleString()}`,
    `  - 캐시 읽기: ${contextUsage.cacheReadInputTokens.toLocaleString()}`,
    `출력 토큰: ${contextUsage.outputTokens.toLocaleString()}`,
    `비용: $${contextUsage.totalCostUSD.toFixed(4)}`,
    '---',
    '※ tool 실행 중에는 추정치 (실제 값과 약간 차이날 수 있음)',
  ].join('\n');

  return (
    <button
      type="button"
      role="status"
      aria-label={`컨텍스트 사용량 ${usagePercent}%`}
      title={tooltipText}
      disabled={disabled}
      className={`flex items-center gap-2 ml-3 mr-0.5 transition-opacity ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:opacity-80'}`}
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
      {isCritical && (
        <AlertTriangle className="w-4 h-4 text-red-500" data-testid="context-usage-warning" />
      )}
    </button>
  );
}
