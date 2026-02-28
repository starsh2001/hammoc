/**
 * useDashboard - WebSocket integration hook for dashboard status
 * [Source: Story 20.3 - Task 4]
 */

import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { DashboardProjectStatus, DashboardStatusChangeEvent } from '@bmad-studio/shared';
import { getSocket } from '../services/socket';
import { useDashboardStore } from '../stores/dashboardStore';

export interface UseDashboardReturn {
  projectStatuses: Map<string, DashboardProjectStatus>;
  totals: { activeSessions: number; queueRunning: number; terminals: number };
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

    // Handler for WebSocket status change events
    const onStatusChange = (event: DashboardStatusChangeEvent) => {
      updateProjectStatus(event);
    };

    // Handler for (re)connection — subscribe and fetch fresh data
    const onConnect = () => {
      subscribe();
      fetchStatus();
    };

    // If socket is already connected, subscribe + fetch immediately
    if (socket.connected) {
      subscribe();
      fetchStatus();
    }

    // Register listeners
    socket.on('connect', onConnect);
    socket.on('dashboard:status-change', onStatusChange);

    return () => {
      unsubscribe();
      socket.off('dashboard:status-change', onStatusChange);
      socket.off('connect', onConnect);
    };
  }, []);

  // Stable refs from getState() — not subscribed state
  const totals = useDashboardStore.getState().getTotals();
  const getProjectStatus = useDashboardStore.getState().getProjectStatus;

  return {
    projectStatuses,
    totals,
    isLoading,
    getProjectStatus,
  };
}
