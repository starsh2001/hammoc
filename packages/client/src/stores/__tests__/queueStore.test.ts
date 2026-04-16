/**
 * Queue Store Tests
 * [Source: Story 15.3 - Task 7.1]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useQueueStore } from '../queueStore';

vi.mock('@hammoc/shared', () => ({
  parseQueueScript: vi.fn().mockReturnValue({
    items: [
      { prompt: 'Hello', isNewSession: false },
      { prompt: 'World', isNewSession: true },
    ],
    warnings: [],
  }),
}));

import { parseQueueScript } from '@hammoc/shared';

const mockedParse = vi.mocked(parseQueueScript);

const initialState = {
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
};

describe('useQueueStore', () => {
  beforeEach(() => {
    useQueueStore.setState(initialState);
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('TC-QE-1: setScript', () => {
    it('should update script and trigger debounced parsing', () => {
      useQueueStore.getState().setScript('Hello world');
      expect(useQueueStore.getState().script).toBe('Hello world');

      // Parsing should not be triggered immediately
      expect(mockedParse).not.toHaveBeenCalled();

      // After 300ms debounce, parseScript should be called
      vi.advanceTimersByTime(300);
      expect(mockedParse).toHaveBeenCalledWith('Hello world');
    });
  });

  describe('TC-QE-2: parseScript', () => {
    it('should call parseQueueScript and update parsedItems/warnings', () => {
      useQueueStore.setState({ script: 'test script' });
      useQueueStore.getState().parseScript();

      expect(mockedParse).toHaveBeenCalledWith('test script');
      expect(useQueueStore.getState().parsedItems).toEqual([
        { prompt: 'Hello', isNewSession: false },
        { prompt: 'World', isNewSession: true },
      ]);
      expect(useQueueStore.getState().warnings).toEqual([]);
    });
  });

  describe('TC-QE-3: handleProgress', () => {
    it('should update isRunning/isPaused/currentIndex/totalItems for running status', () => {
      useQueueStore.getState().handleProgress({
        currentIndex: 2,
        totalItems: 5,
        status: 'running',
        sessionId: 'session-1',
      });

      const state = useQueueStore.getState();
      expect(state.isRunning).toBe(true);
      expect(state.isPaused).toBe(false);
      expect(state.currentIndex).toBe(2);
      expect(state.totalItems).toBe(5);
      expect(state.isStarting).toBe(false);
    });

    it('should set paused state for paused status', () => {
      useQueueStore.getState().handleProgress({
        currentIndex: 1,
        totalItems: 3,
        status: 'paused',
        pauseReason: 'User requested',
        sessionId: 'session-1',
      });

      const state = useQueueStore.getState();
      expect(state.isRunning).toBe(true);
      expect(state.isPaused).toBe(true);
      expect(state.pauseReason).toBe('User requested');
    });

    it('should set completed state', () => {
      useQueueStore.setState({ isRunning: true });
      useQueueStore.getState().handleProgress({
        currentIndex: 3,
        totalItems: 3,
        status: 'completed',
        sessionId: 'session-1',
      });

      const state = useQueueStore.getState();
      expect(state.isRunning).toBe(false);
      expect(state.isPaused).toBe(false);
    });

    it('should set error state', () => {
      useQueueStore.setState({ isRunning: true });
      useQueueStore.getState().handleProgress({
        currentIndex: 1,
        totalItems: 3,
        status: 'error',
        sessionId: 'session-1',
      });

      const state = useQueueStore.getState();
      expect(state.isRunning).toBe(false);
      expect(state.isPaused).toBe(false);
    });
  });

  describe('TC-QE-4: handleItemComplete', () => {
    it('should add index to completedItems Set', () => {
      useQueueStore.getState().handleItemComplete({ itemIndex: 0, sessionId: 'session-1' });
      expect(useQueueStore.getState().completedItems.has(0)).toBe(true);

      useQueueStore.getState().handleItemComplete({ itemIndex: 2, sessionId: 'session-1' });
      expect(useQueueStore.getState().completedItems.has(0)).toBe(true);
      expect(useQueueStore.getState().completedItems.has(2)).toBe(true);
    });

    it('should create a new Set for React re-render detection', () => {
      const original = useQueueStore.getState().completedItems;
      useQueueStore.getState().handleItemComplete({ itemIndex: 0, sessionId: 'session-1' });
      const updated = useQueueStore.getState().completedItems;
      expect(original).not.toBe(updated);
    });
  });

  describe('TC-QE-5: handleError', () => {
    it('should set errorItem', () => {
      useQueueStore.getState().handleError({
        itemIndex: 2,
        error: 'Something went wrong',
        sessionId: 'session-1',
      });

      expect(useQueueStore.getState().errorItem).toEqual({
        index: 2,
        error: 'Something went wrong',
      });
    });
  });

  describe('TC-QE-6: reset', () => {
    it('should clear all state including script and execution state', () => {
      useQueueStore.setState({
        script: 'my script',
        parsedItems: [{ prompt: 'Hello', isNewSession: false }],
        isRunning: true,
        isPaused: true,
        isStarting: true,
        currentIndex: 5,
        totalItems: 10,
        pauseReason: 'test',
        lockedSessionId: 'session-1',
        currentModel: 'claude-3',
        completedItems: new Set([0, 1, 2]),
        errorItem: { index: 1, error: 'err' },
      });

      useQueueStore.getState().reset();

      const state = useQueueStore.getState();
      expect(state.script).toBe('');
      expect(state.parsedItems).toEqual([]);
      expect(state.isRunning).toBe(false);
      expect(state.isPaused).toBe(false);
      expect(state.isStarting).toBe(false);
      expect(state.currentIndex).toBe(0);
      expect(state.totalItems).toBe(0);
      expect(state.completedItems.size).toBe(0);
      expect(state.errorItem).toBeNull();
    });
  });

  describe('TC-QE-7: parse empty script', () => {
    it('should return empty items for empty script', () => {
      mockedParse.mockReturnValueOnce({ items: [], warnings: [] });
      useQueueStore.setState({ script: '' });
      useQueueStore.getState().parseScript();

      expect(useQueueStore.getState().parsedItems).toEqual([]);
      expect(useQueueStore.getState().warnings).toEqual([]);
    });
  });

  describe('TC-QE-8: parse script with unknown directive', () => {
    it('should produce warning for unknown directive', () => {
      mockedParse.mockReturnValueOnce({
        items: [{ prompt: '@unknown hello', isNewSession: false }],
        warnings: [{ line: 1, message: 'Unknown directive: @unknown' }],
      });

      useQueueStore.setState({ script: '@unknown hello' });
      useQueueStore.getState().parseScript();

      expect(useQueueStore.getState().warnings).toEqual([
        { line: 1, message: 'Unknown directive: @unknown' },
      ]);
    });
  });

  describe('TC-QE-9s: syncFromStatus', () => {
    it('should populate store and backfill completedItems from currentIndex', () => {
      useQueueStore.getState().syncFromStatus({
        isRunning: true,
        isPaused: false,
        currentIndex: 3,
        totalItems: 5,
        pauseReason: undefined,
        lockedSessionId: 'session-1',
        currentModel: 'claude-3',
        isCompleted: false,
        isErrored: false,
      });

      const state = useQueueStore.getState();
      expect(state.isRunning).toBe(true);
      expect(state.isPaused).toBe(false);
      expect(state.currentIndex).toBe(3);
      expect(state.totalItems).toBe(5);
      expect(state.lockedSessionId).toBe('session-1');
      expect(state.currentModel).toBe('claude-3');
      // Backfill: indices 0, 1, 2
      expect(state.completedItems).toEqual(new Set([0, 1, 2]));
    });

    it('should not backfill completedItems when not running and currentIndex is 0', () => {
      useQueueStore.getState().syncFromStatus({
        isRunning: false,
        isPaused: false,
        currentIndex: 0,
        totalItems: 0,
        lockedSessionId: null,
        isCompleted: false,
        isErrored: false,
      });

      expect(useQueueStore.getState().completedItems.size).toBe(0);
    });
  });

  describe('TC-QE-10s: setStarting', () => {
    it('should set isStarting flag and handleProgress clears it', () => {
      useQueueStore.getState().setStarting(true);
      expect(useQueueStore.getState().isStarting).toBe(true);

      useQueueStore.getState().handleProgress({
        currentIndex: 0,
        totalItems: 3,
        status: 'running',
        sessionId: 'session-1',
      });

      expect(useQueueStore.getState().isStarting).toBe(false);
    });
  });
});
