/**
 * Dashboard Store Tests
 * [Source: Story 20.3 - Task 3]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDashboardStore } from '../dashboardStore';
import type { DashboardProjectStatus, DashboardStatusChangeEvent } from '@hammoc/shared';

// Mock the dashboard API
vi.mock('../../services/api/dashboard', () => ({
  dashboardApi: {
    getStatus: vi.fn(),
  },
}));

// Mock socket
const mockSocket = {
  emit: vi.fn(),
};
vi.mock('../../services/socket', () => ({
  getSocket: () => mockSocket,
  joinProjectRoom: vi.fn(),
  leaveProjectRoom: vi.fn(),
  rejoinProjectRooms: vi.fn(),
  forceReconnect: vi.fn(),
  disconnectSocket: vi.fn(),
}));

import { dashboardApi } from '../../services/api/dashboard';

const mockStatus1: DashboardProjectStatus = {
  projectSlug: 'project-a',
  activeSessionCount: 2,
  totalSessionCount: 5,
  queueStatus: 'running',
  terminalCount: 1,
};

const mockStatus2: DashboardProjectStatus = {
  projectSlug: 'project-b',
  activeSessionCount: 0,
  totalSessionCount: 3,
  queueStatus: 'idle',
  terminalCount: 2,
};

describe('useDashboardStore', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      projectStatuses: new Map(),
      isLoading: false,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('fetchStatus', () => {
    it('should populate projectStatuses Map from API response', async () => {
      vi.mocked(dashboardApi.getStatus).mockResolvedValue({
        projects: [mockStatus1, mockStatus2],
      });

      await useDashboardStore.getState().fetchStatus();

      const { projectStatuses } = useDashboardStore.getState();
      expect(projectStatuses.size).toBe(2);
      expect(projectStatuses.get('project-a')).toEqual(mockStatus1);
      expect(projectStatuses.get('project-b')).toEqual(mockStatus2);
    });

    it('should set isLoading during fetch and clear on completion', async () => {
      let resolvePromise: (value: { projects: DashboardProjectStatus[] }) => void;
      vi.mocked(dashboardApi.getStatus).mockReturnValue(
        new Promise((resolve) => { resolvePromise = resolve; })
      );

      const fetchPromise = useDashboardStore.getState().fetchStatus();
      expect(useDashboardStore.getState().isLoading).toBe(true);

      resolvePromise!({ projects: [mockStatus1] });
      await fetchPromise;

      expect(useDashboardStore.getState().isLoading).toBe(false);
    });

    it('should handle API errors gracefully', async () => {
      vi.mocked(dashboardApi.getStatus).mockRejectedValue(new Error('Network error'));

      await useDashboardStore.getState().fetchStatus();

      expect(useDashboardStore.getState().isLoading).toBe(false);
      // Should not throw — silent degradation
    });

    it('should merge response into existing Map (not replace)', async () => {
      // Pre-populate with an existing entry
      useDashboardStore.setState({
        projectStatuses: new Map([['project-c', {
          projectSlug: 'project-c',
          activeSessionCount: 1,
          totalSessionCount: 1,
          queueStatus: 'idle',
          terminalCount: 0,
        }]]),
      });

      vi.mocked(dashboardApi.getStatus).mockResolvedValue({
        projects: [mockStatus1],
      });

      await useDashboardStore.getState().fetchStatus();

      const { projectStatuses } = useDashboardStore.getState();
      // Both old and new entries should exist
      expect(projectStatuses.size).toBe(2);
      expect(projectStatuses.has('project-c')).toBe(true);
      expect(projectStatuses.has('project-a')).toBe(true);
    });
  });

  describe('updateProjectStatus', () => {
    it('should update existing project entry in Map', () => {
      useDashboardStore.setState({
        projectStatuses: new Map([['project-a', mockStatus1]]),
      });

      const updatedStatus: DashboardProjectStatus = {
        ...mockStatus1,
        activeSessionCount: 5,
      };

      useDashboardStore.getState().updateProjectStatus({
        projectSlug: 'project-a',
        status: updatedStatus,
      });

      expect(useDashboardStore.getState().projectStatuses.get('project-a')).toEqual(updatedStatus);
    });

    it('should add new project entry if projectSlug not in Map', () => {
      useDashboardStore.setState({
        projectStatuses: new Map(),
      });

      const event: DashboardStatusChangeEvent = {
        projectSlug: 'project-new',
        status: mockStatus2,
      };

      useDashboardStore.getState().updateProjectStatus(event);

      expect(useDashboardStore.getState().projectStatuses.get('project-new')).toEqual(mockStatus2);
      expect(useDashboardStore.getState().projectStatuses.size).toBe(1);
    });
  });

  describe('getProjectStatus', () => {
    it('should return correct status for known slug', () => {
      useDashboardStore.setState({
        projectStatuses: new Map([['project-a', mockStatus1]]),
      });

      expect(useDashboardStore.getState().getProjectStatus('project-a')).toEqual(mockStatus1);
    });

    it('should return undefined for unknown slug', () => {
      useDashboardStore.setState({
        projectStatuses: new Map([['project-a', mockStatus1]]),
      });

      expect(useDashboardStore.getState().getProjectStatus('unknown')).toBeUndefined();
    });
  });

  describe('getTotals', () => {
    it('should aggregate correctly across all projects', () => {
      useDashboardStore.setState({
        projectStatuses: new Map([
          ['project-a', mockStatus1], // activeSessions: 2, queueStatus: running, terminals: 1
          ['project-b', mockStatus2], // activeSessions: 0, queueStatus: idle, terminals: 2
        ]),
      });

      const totals = useDashboardStore.getState().getTotals();

      expect(totals.totalSessions).toBe(8);  // 5 + 3
      expect(totals.activeSessions).toBe(2); // 2 + 0
      expect(totals.queueRunning).toBe(1);   // only project-a is running
      expect(totals.terminals).toBe(3);       // 1 + 2
    });

    it('should return all zeros when Map is empty', () => {
      const totals = useDashboardStore.getState().getTotals();

      expect(totals.totalSessions).toBe(0);
      expect(totals.activeSessions).toBe(0);
      expect(totals.queueRunning).toBe(0);
      expect(totals.terminals).toBe(0);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('should emit dashboard:subscribe via socket', () => {
      useDashboardStore.getState().subscribe();

      expect(mockSocket.emit).toHaveBeenCalledWith('dashboard:subscribe');
    });

    it('should emit dashboard:unsubscribe via socket', () => {
      useDashboardStore.getState().unsubscribe();

      expect(mockSocket.emit).toHaveBeenCalledWith('dashboard:unsubscribe');
    });
  });
});
