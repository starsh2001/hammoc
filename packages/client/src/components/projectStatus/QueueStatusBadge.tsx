import { useTranslation } from 'react-i18next';
import { Play, Pause, AlertTriangle } from 'lucide-react';

interface QueueStatusBadgeProps {
  status: 'idle' | 'running' | 'paused' | 'error';
}

const statusStyles = {
  running: 'bg-blue-500/20 text-blue-400',
  paused: 'bg-amber-500/20 text-amber-400',
  error: 'bg-red-500/20 text-red-400',
} as const;

const StatusIcon = {
  running: Play,
  paused: Pause,
  error: AlertTriangle,
} as const;

export function QueueStatusBadge({ status }: QueueStatusBadgeProps) {
  const { t } = useTranslation('common');

  if (status === 'idle') return null;

  const className = statusStyles[status];
  const Icon = StatusIcon[status];
  const label = t(`queueStatus.${status}` as 'queueStatus.running' | 'queueStatus.paused' | 'queueStatus.error');

  return (
    <span
      role="status"
      aria-label={t('queueStatus.statusLabel', { status: label })}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {label}
    </span>
  );
}
