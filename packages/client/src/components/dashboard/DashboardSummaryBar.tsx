import { Activity, Play, Terminal } from 'lucide-react';

interface DashboardSummaryBarProps {
  totals: {
    activeSessions: number;
    queueRunning: number;
    terminals: number;
  };
}

export function DashboardSummaryBar({ totals }: DashboardSummaryBarProps) {
  if (totals.activeSessions === 0 && totals.queueRunning === 0 && totals.terminals === 0) {
    return null;
  }

  return (
    <div
      role="status"
      aria-label="Dashboard summary"
      className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 bg-gray-800/50 rounded-lg px-4 py-2 text-sm text-gray-400 mb-4"
    >
      <div className="flex items-center gap-1.5">
        <Activity className="w-4 h-4" aria-hidden="true" />
        <span>Active Sessions: {totals.activeSessions}</span>
      </div>
      <span className="hidden sm:inline text-gray-600" aria-hidden="true">|</span>
      <div className="flex items-center gap-1.5">
        <Play className="w-4 h-4" aria-hidden="true" />
        <span>Queue Running: {totals.queueRunning}</span>
      </div>
      <span className="hidden sm:inline text-gray-600" aria-hidden="true">|</span>
      <div className="flex items-center gap-1.5">
        <Terminal className="w-4 h-4" aria-hidden="true" />
        <span>Terminals: {totals.terminals}</span>
      </div>
    </div>
  );
}
