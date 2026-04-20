/**
 * useQueueSession Hook Tests
 * [Source: Story 15.4 - Task 5.1]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useQueueSession } from '../useQueueSession';
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
import { leaveProjectRoom } from '../../services/socket';

const mockedGetStatus = vi.mocked(queueApi.getStatus);
const mockedLeaveProjectRoom = vi.mocked(leaveProjectRoom);

const defaultStoreState = {
  script: '',
  parsedItems: [],
  warnings: [],
  isRunning: false,
  isPaused: false,
  isStarting: false,
  isCompleted: false,
  isErrored: false,
  currentIndex: 0,
  totalItems: 0,
  pauseReason: undefined,
  lockedSessionId: null,
  currentModel: undefined,
  completedItems: new Set<number>(),
  errorItem: null,
};

describe('useQueueSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useQueueStore.setState(defaultStoreState);
    vi.clearAllMocks();
    // Default: getStatus returns "no active queue" → rejected so it doesn't
    // overwrite our manually set store state.
    mockedGetStatus.mockRejectedValue(new Error('no active queue'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('TC-QL-1: returns isQueueLocked true when lockedSessionId matches and queue is running', async () => {
    useQueueStore.setState({
      isRunning: true,
      isPaused: false,
      lockedSessionId: 'session-1',
      currentIndex: 2,
      totalItems: 5,
    });

    const { result } = renderHook(() => useQueueSession('my-project', 'session-1'));
    await act(async () => {});

    expect(result.current.isQueueLocked).toBe(true);
  });

  it('TC-QL-2: returns isQueueLocked false when lockedSessionId does not match', async () => {
    useQueueStore.setState({
      isRunning: true,
      isPaused: false,
      lockedSessionId: 'other-session',
    });

    const { result } = renderHook(() => useQueueSession('my-project', 'session-1'));
    await act(async () => {});

    expect(result.current.isQueueLocked).toBe(false);
  });

  it('TC-QL-3: returns isQueueLocked false when queue is not running', async () => {
    useQueueStore.setState({
      isRunning: false,
      isPaused: false,
      lockedSessionId: 'session-1',
    });

    const { result } = renderHook(() => useQueueSession('my-project', 'session-1'));
    await act(async () => {});

    expect(result.current.isQueueLocked).toBe(false);
  });

  it('TC-QL-4: isQueueCompleted becomes true when queue transitions from locked to unlocked without error', async () => {
    useQueueStore.setState({
      isRunning: true,
      isPaused: false,
      lockedSessionId: 'session-1',
      currentIndex: 2,
      totalItems: 5,
    });

    const { result } = renderHook(() => useQueueSession('my-project', 'session-1'));
    await act(async () => {});

    expect(result.current.isQueueLocked).toBe(true);

    // Queue completes — store sets isCompleted: true
    act(() => {
      useQueueStore.setState({
        isRunning: false,
        isPaused: false,
        isCompleted: true,
        lockedSessionId: 'session-1',
        errorItem: null,
      });
    });

    expect(result.current.isQueueCompleted).toBe(true);
    expect(result.current.isQueueErrored).toBe(false);
  });

  it('TC-QL-4b: isQueueErrored becomes true when queue transitions from locked to unlocked with errorItem', async () => {
    useQueueStore.setState({
      isRunning: true,
      isPaused: false,
      lockedSessionId: 'session-1',
      currentIndex: 2,
      totalItems: 5,
    });

    const { result } = renderHook(() => useQueueSession('my-project', 'session-1'));
    await act(async () => {});

    expect(result.current.isQueueLocked).toBe(true);

    // Queue errors — store sets isErrored: true with errorItem
    act(() => {
      useQueueStore.setState({
        isRunning: false,
        isPaused: false,
        isErrored: true,
        lockedSessionId: 'session-1',
        errorItem: { index: 2, error: 'Pauseword detected' },
      });
    });

    expect(result.current.isQueueErrored).toBe(true);
    expect(result.current.isQueueCompleted).toBe(false);
  });

  it('TC-QL-5: isQueueCompleted auto-resets to false after TERMINAL_BANNER_DURATION (4s)', async () => {
    useQueueStore.setState({
      isRunning: true,
      isPaused: false,
      lockedSessionId: 'session-1',
    });

    const { result } = renderHook(() => useQueueSession('my-project', 'session-1'));
    await act(async () => {});

    // Queue completes — store sets isCompleted: true
    act(() => {
      useQueueStore.setState({
        isRunning: false,
        isPaused: false,
        isCompleted: true,
        errorItem: null,
      });
    });

    expect(result.current.isQueueCompleted).toBe(true);

    // Advance 4 seconds (TERMINAL_BANNER_DURATION)
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.isQueueCompleted).toBe(false);
  });

  it('TC-QL-5b: isQueueErrored auto-resets to false after TERMINAL_BANNER_DURATION (4s)', async () => {
    useQueueStore.setState({
      isRunning: true,
      isPaused: false,
      lockedSessionId: 'session-1',
    });

    const { result } = renderHook(() => useQueueSession('my-project', 'session-1'));
    await act(async () => {});

    // Queue errors — store sets isErrored: true
    act(() => {
      useQueueStore.setState({
        isRunning: false,
        isPaused: false,
        isErrored: true,
        errorItem: { index: 1, error: 'Something failed' },
      });
    });

    expect(result.current.isQueueErrored).toBe(true);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.isQueueErrored).toBe(false);
  });

  it('TC-QL-6: pause() emits queue:pause with projectSlug', async () => {
    const { result } = renderHook(() => useQueueSession('my-project', 'session-1'));
    await act(async () => {});

    act(() => {
      result.current.pause();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('queue:pause', {
      projectSlug: 'my-project',
    });
  });

  it('TC-QL-7: resume() emits queue:resume with projectSlug', async () => {
    const { result } = renderHook(() => useQueueSession('my-project', 'session-1'));
    await act(async () => {});

    act(() => {
      result.current.resume();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('queue:resume', {
      projectSlug: 'my-project',
    });
  });

  it('TC-QL-8: abort() emits queue:abort and resets store', async () => {
    useQueueStore.setState({
      isRunning: true,
      currentIndex: 3,
      completedItems: new Set([0, 1, 2]),
    });

    const { result } = renderHook(() => useQueueSession('my-project', 'session-1'));
    await act(async () => {});

    act(() => {
      result.current.abort();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('queue:abort', {
      projectSlug: 'my-project',
    });
    expect(useQueueStore.getState().isRunning).toBe(false);
    expect(useQueueStore.getState().completedItems.size).toBe(0);
  });

  it('TC-QL-9: currentItemSummary returns truncated prompt from parsedItems', async () => {
    const longPrompt = 'A'.repeat(200);
    useQueueStore.setState({
      isRunning: true,
      isPaused: false,
      lockedSessionId: 'session-1',
      currentIndex: 0,
      totalItems: 1,
      parsedItems: [{ prompt: longPrompt, isNewSession: false }],
    });

    const { result } = renderHook(() => useQueueSession('my-project', 'session-1'));
    await act(async () => {});

    expect(result.current.currentItemSummary).toBe('A'.repeat(100));
  });

  it('TC-QL-10: initial status fetch calls syncFromStatus', async () => {
    // Use real timers for this test since waitFor needs them
    vi.useRealTimers();

    mockedGetStatus.mockResolvedValueOnce({
      isRunning: true,
      isPaused: false,
      currentIndex: 3,
      totalItems: 5,
      lockedSessionId: 'session-1',
      isCompleted: false,
      isErrored: false,
    });

    renderHook(() => useQueueSession('my-project', 'session-1'));

    await waitFor(() => {
      expect(useQueueStore.getState().isRunning).toBe(true);
    });

    expect(useQueueStore.getState().currentIndex).toBe(3);

    // Restore fake timers for subsequent tests
    vi.useFakeTimers();
  });

  it('TC-QL-11: hook registers queue WebSocket listeners on mount', async () => {
    renderHook(() => useQueueSession('my-project', 'session-1'));
    await act(async () => {});

    expect(mockSocket.on).toHaveBeenCalledWith('queue:progress', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('queue:itemComplete', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('queue:error', expect.any(Function));
  });

  it('TC-QL-12: hook removes queue WebSocket listeners on unmount', async () => {
    const { unmount } = renderHook(() => useQueueSession('my-project', 'session-1'));
    await act(async () => {});

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('queue:progress', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('queue:itemComplete', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('queue:error', expect.any(Function));
    expect(mockedLeaveProjectRoom).toHaveBeenCalledWith('my-project');
  });
});
