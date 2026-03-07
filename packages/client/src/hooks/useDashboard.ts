/**
 * useDashboard - WebSocket integration hook for dashboard status
 * [Source: Story 20.3 - Task 4]
 */

import { useEffect, useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { DashboardProjectStatus, DashboardStatusChangeEvent } from '@bmad-studio/shared';
import { getSocket } from '../services/socket';
import { useDashboardStore } from '../stores/dashboardStore';

export interface UseDashboardReturn {
  projectStatuses: Map<string, DashboardProjectStatus>;
  totals: { totalSessions: number; activeSessions: number; queueRunning: number; terminals: number };
  isLoading: boolean;
  getProjectStatus: (projectSlug: string) => DashboardProjectStatus | undefined;
}

export function useDashboard(): UseDashboardReturn {
  const { projectStatuses, isLoading } = useDashboardStore(
    useShallow((s) => ({
      projectStatuses: s.projectStatuses,
      isLoading: s.isLoading,
    }))
  );

  useEffect(() => {
    const socket = getSocket();
    const { subscribe, unsubscribe, fetchStatus, updateProjectStatus } =
      useDashboardStore.getState();

    const onStatusChange = (event: DashboardStatusChangeEvent) => {
      updateProjectStatus(event);
    };

    const onConnect = () => {
      subscribe();
      fetchStatus();
    };

    if (socket.connected) {
      subscribe();
      fetchStatus();
    }

    socket.on('connect', onConnect);
    socket.on('dashboard:status-change', onStatusChange);

    return () => {
      unsubscribe();
      socket.off('dashboard:status-change', onStatusChange);
      socket.off('connect', onConnect);
    };
  }, []);

  // Reactive totals — recomputed only when projectStatuses changes
  const totals = useMemo(() => {
    let totalSessions = 0;
    let activeSessions = 0;
    let queueRunning = 0;
    let terminals = 0;
    for (const status of projectStatuses.values()) {
      totalSessions += status.totalSessionCount;
      activeSessions += status.activeSessionCount;
      if (status.queueStatus === 'running') queueRunning++;
      terminals += status.terminalCount;
    }
    return { totalSessions, activeSessions, queueRunning, terminals };
  }, [projectStatuses]);

  const getProjectStatus = useCallback(
    (projectSlug: string) => projectStatuses.get(projectSlug),
    [projectStatuses]
  );

  return {
    projectStatuses,
    totals,
    isLoading,
    getProjectStatus,
  };
}
