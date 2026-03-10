import { Activity, Play, Terminal, FolderOpen, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DashboardSummaryBarProps {
  totals: {
    totalSessions: number;
    activeSessions: number;
    queueRunning: number;
    terminals: number;
  };
  projectCount: number;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  variant?: 'default' | 'green' | 'blue' | 'yellow';
  subValue?: string;
}

const cardStyles = {
  default: {
    border: 'border-gray-200 bg-white dark:border-gray-600/50 dark:bg-gray-700/40',
    icon: 'text-gray-400 dark:text-gray-400',
    value: 'text-gray-700 dark:text-gray-200',
  },
  green: {
    border: 'border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/15',
    icon: 'text-green-500 dark:text-green-400',
    value: 'text-green-600 dark:text-green-400',
  },
  blue: {
    border: 'border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/15',
    icon: 'text-blue-500 dark:text-blue-400',
    value: 'text-blue-600 dark:text-blue-400',
  },
  yellow: {
    border: 'border-yellow-200 bg-yellow-50 dark:border-yellow-500/30 dark:bg-yellow-500/15',
    icon: 'text-yellow-500 dark:text-yellow-400',
    value: 'text-yellow-600 dark:text-yellow-400',
  },
};

function StatCard({ icon, label, value, variant = 'default', subValue }: StatCardProps) {
  const isActive = variant !== 'default' && value > 0;
  const style = isActive ? cardStyles[variant] : cardStyles.default;

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border px-3 py-3 min-w-0 transition-colors ${style.border}`}
    >
      <div className={`mb-1 ${style.icon}`}>
        {icon}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${style.value}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-gray-500 mt-0.5">{subValue}</div>
      )}
      <div className="text-xs text-gray-500 mt-1 truncate w-full text-center">{label}</div>
    </div>
  );
}

export function DashboardSummaryBar({ totals, projectCount }: DashboardSummaryBarProps) {
  const { t } = useTranslation('common');

  return (
    <div
      role="status"
      aria-label={t('dashboard.summaryStatus')}
      className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3 mb-4"
    >
      <StatCard
        icon={<FolderOpen className="w-5 h-5" />}
        label={t('dashboard.projects')}
        value={projectCount}
      />
      <StatCard
        icon={<MessageSquare className="w-5 h-5" />}
        label={t('dashboard.sessions')}
        value={totals.totalSessions}
      />
      <StatCard
        icon={<Activity className="w-5 h-5" />}
        label={t('dashboard.active')}
        value={totals.activeSessions}
        variant="green"
      />
      <StatCard
        icon={<Play className="w-5 h-5" />}
        label={t('dashboard.queue')}
        value={totals.queueRunning}
        variant="blue"
      />
      <StatCard
        icon={<Terminal className="w-5 h-5" />}
        label={t('dashboard.terminals')}
        value={totals.terminals}
        variant="yellow"
      />
    </div>
  );
}
