import { useTranslation } from 'react-i18next';

interface QueueStatusBadgeProps {
  status: 'idle' | 'running' | 'paused' | 'error';
}

const statusStyles = {
  running: 'bg-blue-500/20 text-blue-400',
  paused: 'bg-yellow-500/20 text-yellow-400',
  error: 'bg-red-500/20 text-red-400',
} as const;

export function QueueStatusBadge({ status }: QueueStatusBadgeProps) {
  const { t } = useTranslation('common');

  if (status === 'idle') return null;

  const className = statusStyles[status];
  const label = t(`queueStatus.${status}` as 'queueStatus.running' | 'queueStatus.paused' | 'queueStatus.error');

  return (
    <span
      role="status"
      aria-label={t('queueStatus.statusLabel', { status: label })}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
