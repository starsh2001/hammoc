/**
 * useQueueRunner Hook Tests
 * [Source: Story 15.3 - Task 7.4]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useQueueRunner } from '../useQueueRunner';
import { useQueueStore } from '../../stores/queueStore';

// Mock socket
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('../../services/socket', () => ({
  getSocket: () => mockSocket,
  joinProjectRoom: vi.fn(),
  leaveProjectRoom: vi.fn(),
  rejoinProjectRooms: vi.fn(),
  forceReconnect: vi.fn(),
  disconnectSocket: vi.fn(),
}));

// Mock queue API
vi.mock('../../services/api/queue', () => ({
  queueApi: {
    getStatus: vi.fn(),
  },
}));

import { queueApi } from '../../services/api/queue';
import { joinProjectRoom, leaveProjectRoom } from '../../services/socket';

const mockedGetStatus = vi.mocked(queueApi.getStatus);
const mockedJoinProjectRoom = vi.mocked(joinProjectRoom);
const mockedLeaveProjectRoom = vi.mocked(leaveProjectRoom);

const defaultStatus = {
  isRunning: false,
  isPaused: false,
  currentIndex: 0,
  totalItems: 0,
  lockedSessionId: null,
  isCompleted: false,
  isErrored: false,
};

describe('useQueueRunner', () => {
  beforeEach(() => {
    useQueueStore.setState({
      script: '',
      parsedItems: [],
      warnings: [],
      isRunning: false,
      isPaused: false,
      isStarting: false,
      currentIndex: 0,
      totalItems: 0,
      pauseReason: undefined,
      lockedSessionId: null,
      currentModel: undefined,
      completedItems: new Set<number>(),
      errorItem: null,
    });
    vi.clearAllMocks();
    // Reset mock after clearAllMocks to preserve implementation
    mockedGetStatus.mockResolvedValue(defaultStatus);
  });

  it('TC-QE-29: should join project room on mount', async () => {
    renderHook(() => useQueueRunner('my-project'));
    await act(async () => {}); // flush pending getStatus promise
    expect(mockedJoinProjectRoom).toHaveBeenCalledWith('my-project');
  });

  it('TC-QE-30: should leave project room on unmount', async () => {
    const { unmount } = renderHook(() => useQueueRunner('my-project'));
    await act(async () => {}); // flush pending getStatus promise
    unmount();
    expect(mockedLeaveProjectRoom).toHaveBeenCalledWith('my-project');
  });

  it('TC-QE-31: should register queue event listeners', async () => {
    renderHook(() => useQueueRunner('my-project'));
    await act(async () => {}); // flush pending getStatus promise

    expect(mockSocket.on).toHaveBeenCalledWith('queue:progress', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('queue:itemComplete', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('queue:error', expect.any(Function));
  });

  it('TC-QE-32: start() should set isStarting and emit queue:start', async () => {
    const { result } = renderHook(() => useQueueRunner('my-project'));
    await act(async () => {}); // flush pending getStatus promise

    const items = [
      { prompt: 'Hello', isNewSession: false },
      { prompt: 'World', isNewSession: true },
    ];

    act(() => {
      result.current.start(items, 'session-1');
    });

    expect(useQueueStore.getState().isStarting).toBe(true);
    expect(mockSocket.emit).toHaveBeenCalledWith('queue:start', expect.objectContaining({
      items,
      sessionId: 'session-1',
      projectSlug: 'my-project',
    }));
  });

  it('TC-QE-33: pause() should emit queue:pause with projectSlug', async () => {
    const { result } = renderHook(() => useQueueRunner('my-project'));
    await act(async () => {}); // flush pending getStatus promise

    act(() => {
      result.current.pause();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('queue:pause', {
      projectSlug: 'my-project',
    });
  });

  it('TC-QE-34: abort() should emit queue:abort and reset store', async () => {
    useQueueStore.setState({
      isRunning: true,
      currentIndex: 3,
      completedItems: new Set([0, 1, 2]),
    });

    const { result } = renderHook(() => useQueueRunner('my-project'));
    await act(async () => {}); // flush pending getStatus promise

    act(() => {
      result.current.abort();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('queue:abort', {
      projectSlug: 'my-project',
    });
    expect(useQueueStore.getState().isRunning).toBe(false);
    expect(useQueueStore.getState().completedItems.size).toBe(0);
  });

  it('TC-QE-35: initial status fetch calls syncFromStatus to backfill completedItems', async () => {
    mockedGetStatus.mockResolvedValueOnce({
      isRunning: true,
      isPaused: false,
      currentIndex: 3,
      totalItems: 5,
      lockedSessionId: 'session-1',
      isCompleted: false,
      isErrored: false,
    });

    renderHook(() => useQueueRunner('my-project'));

    // Wait for async getStatus call to resolve (use @testing-library waitFor for act() wrapping)
    await waitFor(() => {
      expect(useQueueStore.getState().isRunning).toBe(true);
    });

    const state = useQueueStore.getState();
    expect(state.currentIndex).toBe(3);
    expect(state.completedItems).toEqual(new Set([0, 1, 2]));
  });

  it('should cleanup listeners on unmount', async () => {
    const { unmount } = renderHook(() => useQueueRunner('my-project'));
    await act(async () => {}); // flush pending getStatus promise

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('queue:progress', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('queue:itemComplete', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('queue:error', expect.any(Function));
  });
});
