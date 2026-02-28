import { Activity, Play, Terminal, MessageSquare } from 'lucide-react';

interface DashboardSummaryBarProps {
  totals: {
    totalSessions: number;
    activeSessions: number;
    queueRunning: number;
    terminals: number;
  };
}

export function DashboardSummaryBar({ totals }: DashboardSummaryBarProps) {
  return (
    <div
      role="status"
      aria-label="Dashboard summary"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-gray-800/50 rounded-lg px-4 py-2 text-sm text-gray-400 mb-4"
    >
      <div className="flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Sessions: {totals.totalSessions}</span>
      </div>
      <span className="text-gray-600" aria-hidden="true">|</span>
      <div className="flex items-center gap-1.5">
        <Activity className={`w-3.5 h-3.5 ${totals.activeSessions > 0 ? 'text-green-400' : ''}`} aria-hidden="true" />
        <span className={totals.activeSessions > 0 ? 'text-green-400' : ''}>
          Active: {totals.activeSessions}
        </span>
      </div>
      <span className="text-gray-600" aria-hidden="true">|</span>
      <div className="flex items-center gap-1.5">
        <Play className={`w-3.5 h-3.5 ${totals.queueRunning > 0 ? 'text-blue-400' : ''}`} aria-hidden="true" />
        <span className={totals.queueRunning > 0 ? 'text-blue-400' : ''}>
          Queue: {totals.queueRunning}
        </span>
      </div>
      <span className="text-gray-600" aria-hidden="true">|</span>
      <div className="flex items-center gap-1.5">
        <Terminal className={`w-3.5 h-3.5 ${totals.terminals > 0 ? 'text-yellow-400' : ''}`} aria-hidden="true" />
        <span className={totals.terminals > 0 ? 'text-yellow-400' : ''}>
          Terminals: {totals.terminals}
        </span>
      </div>
    </div>
  );
}
