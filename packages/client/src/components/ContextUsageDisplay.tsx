/**
 * ContextUsageDisplay Component
 * Displays context window usage with progress bar, color thresholds, and tooltip
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

function getBarColor(percent: number): string {
  if (percent > CONTEXT_USAGE_THRESHOLDS.DANGER) return 'bg-red-500';
  if (percent >= CONTEXT_USAGE_THRESHOLDS.WARNING) return 'bg-yellow-500';
  return 'bg-green-500';
}

export function ContextUsageDisplay({ contextUsage, onNewSession, onCompact }: ContextUsageDisplayProps) {
  if (!contextUsage || contextUsage.contextWindow === 0) return null;

  const usagePercent = Math.round(
    (contextUsage.inputTokens / contextUsage.contextWindow) * 100
  );
  const isCritical = usagePercent > CONTEXT_USAGE_THRESHOLDS.CRITICAL;
  const barColor = getBarColor(usagePercent);

  const handleClick = () => {
    if (isCritical && onNewSession) {
      onNewSession();
    } else if (onCompact) {
      onCompact();
    }
  };

  const tooltipLines = [
    ...(isCritical
      ? [`⚠ 컨텍스트가 거의 찼습니다 (${usagePercent}%)`, '클릭하여 새 세션 시작', '---']
      : ['클릭하여 Context Compaction 실행']),
    `컨텍스트: ${contextUsage.inputTokens.toLocaleString()} / ${contextUsage.contextWindow.toLocaleString()} 토큰 (${usagePercent}%)`,
    `출력 토큰: ${contextUsage.outputTokens.toLocaleString()}`,
    `캐시 읽기: ${contextUsage.cacheReadInputTokens.toLocaleString()}`,
    `비용: $${contextUsage.totalCostUSD.toFixed(4)}`,
  ];
  const tooltipText = tooltipLines.join('\n');

  return (
    <button
      type="button"
      role="status"
      aria-label={`컨텍스트 사용량 ${usagePercent}%`}
      title={tooltipText}
      className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
      onClick={handleClick}
      data-testid="context-usage-display"
    >
      <div className="w-20 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-colors duration-300 rounded-full`}
          style={{ width: `${Math.min(usagePercent, 100)}%` }}
          data-testid="context-usage-bar"
        />
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {usagePercent}%
      </span>
      {isCritical && (
        <AlertTriangle className="w-4 h-4 text-red-500" data-testid="context-usage-warning" />
      )}
    </button>
  );
}
