/**
 * useDashboard Hook Tests
 * [Source: Story 20.3 - Task 5]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboard } from '../useDashboard';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { DashboardProjectStatus, DashboardStatusChangeEvent } from '@bmad-studio/shared';

// Mock socket
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  connected: true,
};

vi.mock('../../services/socket', () => ({
  getSocket: () => mockSocket,
}));

// Mock dashboard API
vi.mock('../../services/api/dashboard', () => ({
  dashboardApi: {
    getStatus: vi.fn().mockResolvedValue({ projects: [] }),
  },
}));

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

describe('useDashboard', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      projectStatuses: new Map(),
      isLoading: false,
    });
    vi.clearAllMocks();
    mockSocket.connected = true;
  });

  it('should call subscribe() and fetchStatus() on mount when socket is connected', async () => {
    const subscribeSpy = vi.spyOn(useDashboardStore.getState(), 'subscribe');
    const fetchStatusSpy = vi.spyOn(useDashboardStore.getState(), 'fetchStatus');

    renderHook(() => useDashboard());
    await act(async () => {});

    expect(subscribeSpy).toHaveBeenCalled();
    expect(fetchStatusSpy).toHaveBeenCalled();
  });

  it('should not call subscribe/fetchStatus directly on mount when socket is not connected', async () => {
    mockSocket.connected = false;

    // We spy on emit to check subscribe was NOT called directly
    renderHook(() => useDashboard());
    await act(async () => {});

    // subscribe emits 'dashboard:subscribe' — should not be called directly
    // Only the connect handler and status-change listener should be registered
    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('dashboard:status-change', expect.any(Function));
    // dashboard:subscribe should NOT have been emitted (socket not connected)
    expect(mockSocket.emit).not.toHaveBeenCalledWith('dashboard:subscribe');
  });

  it('should register dashboard:status-change socket listener on mount', async () => {
    renderHook(() => useDashboard());
    await act(async () => {});

    expect(mockSocket.on).toHaveBeenCalledWith('dashboard:status-change', expect.any(Function));
  });

  it('should register connect listener for reconnection handling', async () => {
    renderHook(() => useDashboard());
    await act(async () => {});

    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('should call unsubscribe() on unmount', async () => {
    const { unmount } = renderHook(() => useDashboard());
    await act(async () => {});

    unmount();

    expect(mockSocket.emit).toHaveBeenCalledWith('dashboard:unsubscribe');
  });

  it('should remove dashboard:status-change listener on unmount', async () => {
    const { unmount } = renderHook(() => useDashboard());
    await act(async () => {});

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('dashboard:status-change', expect.any(Function));
  });

  it('should remove connect listener on unmount', async () => {
    const { unmount } = renderHook(() => useDashboard());
    await act(async () => {});

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('should re-subscribe and re-fetch when connect event fires (reconnection)', async () => {
    renderHook(() => useDashboard());
    await act(async () => {});

    // Clear previous calls from mount
    mockSocket.emit.mockClear();

    // Find the connect handler registered via socket.on
    const connectCall = mockSocket.on.mock.calls.find(([event]) => event === 'connect');
    expect(connectCall).toBeDefined();

    const connectHandler = connectCall![1];

    // Simulate reconnection
    await act(async () => {
      connectHandler();
    });

    // Should have re-subscribed
    expect(mockSocket.emit).toHaveBeenCalledWith('dashboard:subscribe');
  });

  it('should call updateProjectStatus synchronously when dashboard:status-change fires (AC2)', async () => {
    const updateSpy = vi.spyOn(useDashboardStore.getState(), 'updateProjectStatus');

    renderHook(() => useDashboard());
    await act(async () => {});

    // Find the status-change handler
    const statusChangeCall = mockSocket.on.mock.calls.find(
      ([event]) => event === 'dashboard:status-change'
    );
    expect(statusChangeCall).toBeDefined();

    const statusChangeHandler = statusChangeCall![1];

    const event: DashboardStatusChangeEvent = {
      projectSlug: 'project-a',
      status: mockStatus1,
    };

    // Fire event — should be synchronous (no debounce)
    act(() => {
      statusChangeHandler(event);
    });

    expect(updateSpy).toHaveBeenCalledWith(event);
  });

  it('should return correct projectStatuses, totals, isLoading, getProjectStatus from store', async () => {
    useDashboardStore.setState({
      projectStatuses: new Map([
        ['project-a', mockStatus1],
        ['project-b', mockStatus2],
      ]),
      isLoading: false,
    });

    const { result } = renderHook(() => useDashboard());
    // Wait for mount effect to complete (fetchStatus resolves and sets isLoading: false)
    await act(async () => {});

    expect(result.current.projectStatuses.size).toBe(2);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.totals).toEqual({
      totalSessions: 8,
      activeSessions: 2,
      queueRunning: 1,
      terminals: 3,
    });
    expect(result.current.getProjectStatus('project-a')).toEqual(mockStatus1);
    expect(result.current.getProjectStatus('unknown')).toBeUndefined();
  });
});
