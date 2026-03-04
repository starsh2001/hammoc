import { Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { DashboardProjectStatus } from '@bmad-studio/shared';
import { QueueStatusBadge } from './QueueStatusBadge';

interface ProjectStatusIndicatorsProps {
  status: DashboardProjectStatus | undefined;
}

function buildAriaLabel(status: DashboardProjectStatus, t: TFunction): string {
  const parts: string[] = [
    t('dashboard.activeSessionsFormat', { active: status.activeSessionCount, total: status.totalSessionCount }),
  ];

  if (status.queueStatus !== 'idle') {
    parts.push(t('dashboard.queueStatusFormat', { status: t(`queueStatus.${status.queueStatus}`) }));
  }

  if (status.terminalCount > 0) {
    parts.push(t('dashboard.terminalsFormat', { count: status.terminalCount }));
  }

  return t('dashboard.projectStatus', { details: parts.join(', ') });
}

export function ProjectStatusIndicators({ status }: ProjectStatusIndicatorsProps) {
  const { t } = useTranslation('common');

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
      aria-label={buildAriaLabel(status, t)}
    >
      {/* Active sessions */}
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 bg-green-500 rounded-full" />
        <span>{t('dashboard.activeFormat', { active: status.activeSessionCount, total: status.totalSessionCount })}</span>
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
