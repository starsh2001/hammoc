interface QueueStatusBadgeProps {
  status: 'idle' | 'running' | 'paused' | 'error';
}

const statusConfig = {
  running: { label: 'Running', className: 'bg-blue-500/20 text-blue-400' },
  paused: { label: 'Paused', className: 'bg-yellow-500/20 text-yellow-400' },
  error: { label: 'Error', className: 'bg-red-500/20 text-red-400' },
} as const;

export function QueueStatusBadge({ status }: QueueStatusBadgeProps) {
  if (status === 'idle') return null;

  const config = statusConfig[status];

  return (
    <span
      role="status"
      aria-label={`Queue status: ${config.label}`}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
