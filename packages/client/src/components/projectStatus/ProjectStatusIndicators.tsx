import { Terminal } from 'lucide-react';
import type { DashboardProjectStatus } from '@bmad-studio/shared';
import { QueueStatusBadge } from './QueueStatusBadge';

interface ProjectStatusIndicatorsProps {
  status: DashboardProjectStatus | undefined;
}

function buildAriaLabel(status: DashboardProjectStatus): string {
  const parts: string[] = [
    `${status.activeSessionCount} active sessions`,
  ];

  if (status.queueStatus !== 'idle') {
    parts.push(`queue ${status.queueStatus}`);
  }

  if (status.terminalCount > 0) {
    parts.push(`${status.terminalCount} terminal${status.terminalCount !== 1 ? 's' : ''}`);
  }

  return `Project status: ${parts.join(', ')}`;
}

export function ProjectStatusIndicators({ status }: ProjectStatusIndicatorsProps) {
  if (!status) return null;

  const allZeroAndIdle =
    status.activeSessionCount === 0 &&
    status.totalSessionCount === 0 &&
    status.terminalCount === 0 &&
    status.queueStatus === 'idle';

  if (allZeroAndIdle) return null;

  return (
    <div
      className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1"
      aria-label={buildAriaLabel(status)}
    >
      {/* Active sessions */}
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 bg-green-500 rounded-full" />
        <span>{status.activeSessionCount} active</span>
      </div>

      {/* Queue status badge */}
      <QueueStatusBadge status={status.queueStatus} />

      {/* Terminal count */}
      {status.terminalCount > 0 && (
        <div className="flex items-center gap-1">
          <Terminal className="w-3 h-3" aria-hidden="true" />
          <span>{status.terminalCount}</span>
        </div>
      )}
    </div>
  );
}
