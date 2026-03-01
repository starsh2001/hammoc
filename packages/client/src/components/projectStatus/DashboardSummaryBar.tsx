import { Activity, Play, Terminal, FolderOpen } from 'lucide-react';

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
}

const cardStyles = {
  default: {
    border: 'border-gray-700/50 bg-gray-800/40',
    icon: 'text-gray-500',
    value: 'text-gray-200',
  },
  green: {
    border: 'border-green-500/30 bg-green-500/10',
    icon: 'text-green-400',
    value: 'text-green-400',
  },
  blue: {
    border: 'border-blue-500/30 bg-blue-500/10',
    icon: 'text-blue-400',
    value: 'text-blue-400',
  },
  yellow: {
    border: 'border-yellow-500/30 bg-yellow-500/10',
    icon: 'text-yellow-400',
    value: 'text-yellow-400',
  },
};

function StatCard({ icon, label, value, variant = 'default' }: StatCardProps) {
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
      <div className="text-xs text-gray-500 mt-1 truncate w-full text-center">{label}</div>
    </div>
  );
}

export function DashboardSummaryBar({ totals, projectCount }: DashboardSummaryBarProps) {
  return (
    <div
      role="status"
      aria-label="Dashboard summary"
      className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4"
    >
      <StatCard
        icon={<FolderOpen className="w-5 h-5" />}
        label="Projects"
        value={projectCount}
      />
      <StatCard
        icon={<Activity className="w-5 h-5" />}
        label="Active"
        value={totals.activeSessions}
        variant="green"
      />
      <StatCard
        icon={<Play className="w-5 h-5" />}
        label="Queue"
        value={totals.queueRunning}
        variant="blue"
      />
      <StatCard
        icon={<Terminal className="w-5 h-5" />}
        label="Terminals"
        value={totals.terminals}
        variant="yellow"
      />
    </div>
  );
}
