/**
 * Dashboard Store - Zustand store for cross-project dashboard status
 * [Source: Story 20.3 - Task 2]
 */

import { create } from 'zustand';
import type { DashboardProjectStatus, DashboardStatusChangeEvent } from '@hammoc/shared';
import { getSocket } from '../services/socket';
import { dashboardApi } from '../services/api/dashboard';

interface DashboardState {
  projectStatuses: Map<string, DashboardProjectStatus>;
  isLoading: boolean;
}

interface DashboardActions {
  fetchStatus: () => Promise<void>;
  updateProjectStatus: (event: DashboardStatusChangeEvent) => void;
  subscribe: () => void;
  unsubscribe: () => void;
  getProjectStatus: (projectSlug: string) => DashboardProjectStatus | undefined;
  getTotals: () => { totalSessions: number; activeSessions: number; queueRunning: number; terminals: number };
}

type DashboardStore = DashboardState & DashboardActions;

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  projectStatuses: new Map(),
  isLoading: false,

  fetchStatus: async () => {
    set({ isLoading: true });
    try {
      const response = await dashboardApi.getStatus();
      // Merge pattern: iterate and set each entry to avoid overwriting in-flight WebSocket updates
      set((state) => {
        const merged = new Map(state.projectStatuses);
        for (const project of response.projects) {
          merged.set(project.projectSlug, project);
        }
        return { projectStatuses: merged, isLoading: false };
      });
    } catch {
      set({ isLoading: false });
    }
  },

  updateProjectStatus: (event: DashboardStatusChangeEvent) => {
    set((state) => {
      const updated = new Map(state.projectStatuses);
      updated.set(event.projectSlug, event.status);
      return { projectStatuses: updated };
    });
  },

  subscribe: () => {
    const socket = getSocket();
    socket.emit('dashboard:subscribe');
  },

  unsubscribe: () => {
    const socket = getSocket();
    socket.emit('dashboard:unsubscribe');
  },

  getProjectStatus: (projectSlug: string) => {
    return get().projectStatuses.get(projectSlug);
  },

  getTotals: () => {
    const { projectStatuses } = get();
    let totalSessions = 0;
    let activeSessions = 0;
    let queueRunning = 0;
    let terminals = 0;

    for (const status of projectStatuses.values()) {
      totalSessions += status.totalSessionCount;
      activeSessions += status.activeSessionCount;
      if (status.queueStatus === 'running') {
        queueRunning++;
      }
      terminals += status.terminalCount;
    }

    return { totalSessions, activeSessions, queueRunning, terminals };
  },
}));
