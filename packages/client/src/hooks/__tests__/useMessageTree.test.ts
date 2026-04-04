import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { HistoryMessage } from '@hammoc/shared';
import { useMessageTree } from '../useMessageTree';
import { useMessageStore } from '../../stores/messageStore';
import { useChatStore, cancelBranchSwitchTimer, scheduleBranchSwitchEmit } from '../../stores/chatStore';

// Mock socket
const mockEmit = vi.fn();
vi.mock('../../services/socket', () => ({
  getSocket: () => ({ emit: mockEmit }),
}));

function makeMsg(overrides: Partial<HistoryMessage> & { id: string }): HistoryMessage {
  return {
    type: 'user',
    content: `msg-${overrides.id}`,
    timestamp: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const UUID_A = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const UUID_B = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const UUID_C = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

describe('useMessageTree', () => {
  beforeEach(() => {
    // Reset stores to default state
    useMessageStore.setState({
      serverBranchPoints: null,
      currentBranchSelections: null,
      currentProjectSlug: 'test-project',
      currentSessionId: 'test-session',
    });
    useChatStore.setState({
      isStreaming: false,
      isCompacting: false,
      isBranchViewerMode: false,
      viewerBranchSelections: {},
    });
    mockEmit.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cancelBranchSwitchTimer();
    vi.useRealTimers();
  });

  it('returns messages directly as displayMessages', () => {
    const messages = [
      makeMsg({ id: 'msg-1' }),
      makeMsg({ id: 'msg-2', parentId: 'msg-1' }),
      makeMsg({ id: 'msg-3', parentId: 'msg-2' }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    expect(result.current.displayMessages).toBe(messages);
    expect(result.current.displayMessages).toHaveLength(3);
  });

  it('returns empty branchPoints when serverBranchPoints is null', () => {
    const messages = [makeMsg({ id: 'msg-1' })];

    const { result } = renderHook(() => useMessageTree(messages));

    expect(result.current.branchPoints.size).toBe(0);
  });

  it('builds branchPoints from message.branchInfo', () => {
    const messages = [
      makeMsg({ id: 'root' }),
      makeMsg({
        id: UUID_A,
        parentId: 'root',
        branchInfo: { total: 3, current: 1, selectionKey: 'parent-key' },
      }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    expect(result.current.branchPoints.size).toBe(1);
    expect(result.current.branchPoints.get(UUID_A)).toEqual({
      total: 3,
      current: 1,
      selectionKey: 'parent-key',
    });
  });

  it('only includes messages that have branchInfo', () => {
    const messages = [
      makeMsg({ id: 'root' }),
      makeMsg({
        id: UUID_A,
        parentId: 'root',
        branchInfo: { total: 2, current: 0, selectionKey: 'sel-a' },
      }),
      makeMsg({ id: `${UUID_A}-text-1`, parentId: 'root' }),
      makeMsg({ id: UUID_B, parentId: 'root' }),
    ];

    const { result } = renderHook(() => useMessageTree(messages));

    // Only the message with branchInfo should be in branchPoints
    expect(result.current.branchPoints.size).toBe(1);
    expect(result.current.branchPoints.has(UUID_A)).toBe(true);
    expect(result.current.branchPoints.has(`${UUID_A}-text-1`)).toBe(false);
    expect(result.current.branchPoints.has(UUID_B)).toBe(false);
  });

  it('isBranchNavigationDisabled is true when streaming', () => {
    useChatStore.setState({ isStreaming: true });
    const { result } = renderHook(() => useMessageTree([]));
    expect(result.current.isBranchNavigationDisabled).toBe(true);
  });

  it('isBranchNavigationDisabled is true when compacting', () => {
    useChatStore.setState({ isCompacting: true });
    const { result } = renderHook(() => useMessageTree([]));
    expect(result.current.isBranchNavigationDisabled).toBe(true);
  });

  it('isBranchNavigationDisabled is false when idle', () => {
    const { result } = renderHook(() => useMessageTree([]));
    expect(result.current.isBranchNavigationDisabled).toBe(false);
  });

  // --- Story 27.3: Branch Viewer Mode Tests ---

  describe('navigateBranch (branch viewer mode)', () => {
    const branchMsg = makeMsg({
      id: UUID_A,
      branchInfo: { total: 3, current: 1, selectionKey: 'sel-key' },
    });

    beforeEach(() => {
      useMessageStore.setState({ messages: [branchMsg] });
    });

    it('does nothing when isBranchViewerMode is false', () => {
      useChatStore.setState({ isBranchViewerMode: false });
      const { result } = renderHook(() => useMessageTree([branchMsg]));

      act(() => { result.current.navigateBranch(UUID_A, 'next'); });

      expect(mockEmit).not.toHaveBeenCalled();
      expect(useChatStore.getState().viewerBranchSelections).toEqual({});
    });

    it('does nothing during streaming', () => {
      useChatStore.setState({ isBranchViewerMode: true, isStreaming: true });
      const { result } = renderHook(() => useMessageTree([branchMsg]));

      act(() => { result.current.navigateBranch(UUID_A, 'next'); });

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('does nothing during compacting', () => {
      useChatStore.setState({ isBranchViewerMode: true, isCompacting: true });
      const { result } = renderHook(() => useMessageTree([branchMsg]));

      act(() => { result.current.navigateBranch(UUID_A, 'next'); });

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('emits messages:switch-branch with accumulated branchSelections after debounce', () => {
      useChatStore.setState({ isBranchViewerMode: true });
      const { result } = renderHook(() => useMessageTree([branchMsg]));

      act(() => { result.current.navigateBranch(UUID_A, 'next'); });

      // Should not emit before debounce
      expect(mockEmit).not.toHaveBeenCalled();
      // viewerBranchSelections should be updated immediately
      expect(useChatStore.getState().viewerBranchSelections).toEqual({ 'sel-key': 2 });

      // After debounce (150ms)
      act(() => { vi.advanceTimersByTime(150); });

      expect(mockEmit).toHaveBeenCalledWith('messages:switch-branch', {
        sessionId: 'test-session',
        branchSelections: { 'sel-key': 2 },
      });
    });

    it('accumulates selections across multiple navigations (multi-level)', () => {
      const branchMsg2 = makeMsg({
        id: UUID_B,
        branchInfo: { total: 2, current: 0, selectionKey: 'sel-key-2' },
      });
      useMessageStore.setState({ messages: [branchMsg, branchMsg2] });
      useChatStore.setState({ isBranchViewerMode: true });
      const { result } = renderHook(() => useMessageTree([branchMsg, branchMsg2]));

      act(() => { result.current.navigateBranch(UUID_A, 'next'); });
      act(() => { vi.advanceTimersByTime(150); });
      mockEmit.mockClear();

      act(() => { result.current.navigateBranch(UUID_B, 'next'); });
      act(() => { vi.advanceTimersByTime(150); });

      expect(useChatStore.getState().viewerBranchSelections).toEqual({
        'sel-key': 2,
        'sel-key-2': 1,
      });
      expect(mockEmit).toHaveBeenCalledWith('messages:switch-branch', {
        sessionId: 'test-session',
        branchSelections: { 'sel-key': 2, 'sel-key-2': 1 },
      });
    });

    it('debounce: rapid sequential calls result in only one socket emit', () => {
      useChatStore.setState({ isBranchViewerMode: true });
      const msgs = [
        makeMsg({ id: UUID_A, branchInfo: { total: 5, current: 2, selectionKey: 'sel-key' } }),
      ];
      useMessageStore.setState({ messages: msgs });
      const { result } = renderHook(() => useMessageTree(msgs));

      act(() => { result.current.navigateBranch(UUID_A, 'next'); });
      act(() => { vi.advanceTimersByTime(50); });
      // Update store to simulate msg with new current (would come from server in reality)
      useMessageStore.setState({
        messages: [makeMsg({ id: UUID_A, branchInfo: { total: 5, current: 3, selectionKey: 'sel-key' } })],
      });
      act(() => { result.current.navigateBranch(UUID_A, 'next'); });
      act(() => { vi.advanceTimersByTime(150); });

      // Only one emit (the second debounced call)
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });

    it('debounce callback skips emit if viewer mode exited before timer fires', () => {
      useChatStore.setState({ isBranchViewerMode: true });
      const { result } = renderHook(() => useMessageTree([branchMsg]));

      act(() => { result.current.navigateBranch(UUID_A, 'next'); });

      // Exit viewer before debounce fires (but don't cancel timer manually — test the guard)
      useChatStore.setState({ isBranchViewerMode: false });

      act(() => { vi.advanceTimersByTime(150); });

      // Should NOT emit because viewer mode is no longer active
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('debounce callback skips emit if session changed before timer fires', () => {
      useChatStore.setState({ isBranchViewerMode: true });
      const { result } = renderHook(() => useMessageTree([branchMsg]));

      act(() => { result.current.navigateBranch(UUID_A, 'next'); });

      // Switch session before debounce fires
      useMessageStore.setState({ currentSessionId: 'different-session' });

      act(() => { vi.advanceTimersByTime(150); });

      // Should NOT emit because session changed
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  describe('branch viewer store actions', () => {
    it('enterBranchViewer sets isBranchViewerMode to true', () => {
      useChatStore.getState().enterBranchViewer();
      expect(useChatStore.getState().isBranchViewerMode).toBe(true);
      expect(useChatStore.getState().viewerBranchSelections).toEqual({});
    });

    it('enterBranchViewer blocks during streaming', () => {
      useChatStore.setState({ isStreaming: true });
      useChatStore.getState().enterBranchViewer();
      expect(useChatStore.getState().isBranchViewerMode).toBe(false);
    });

    it('exitBranchViewer resets state and emits switch-branch with empty map', () => {
      useChatStore.setState({
        isBranchViewerMode: true,
        viewerBranchSelections: { key: 1 },
      });
      useMessageStore.setState({ currentSessionId: 'test-session' });

      useChatStore.getState().exitBranchViewer();

      expect(useChatStore.getState().isBranchViewerMode).toBe(false);
      expect(useChatStore.getState().viewerBranchSelections).toEqual({});
      expect(mockEmit).toHaveBeenCalledWith('messages:switch-branch', {
        sessionId: 'test-session',
        branchSelections: {},
      });
    });

    it('exitBranchViewer(true) skips socket emit', () => {
      useChatStore.setState({ isBranchViewerMode: true });
      useMessageStore.setState({ currentSessionId: 'test-session' });

      useChatStore.getState().exitBranchViewer(true);

      expect(useChatStore.getState().isBranchViewerMode).toBe(false);
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('exitBranchViewer cancels pending debounce timer', () => {
      const fn = vi.fn();
      scheduleBranchSwitchEmit(fn, 200);

      useChatStore.setState({ isBranchViewerMode: true });
      useChatStore.getState().exitBranchViewer(true);

      vi.advanceTimersByTime(300);
      expect(fn).not.toHaveBeenCalled();
    });

    it('session switch resets isBranchViewerMode via exitBranchViewer(true)', () => {
      useChatStore.setState({ isBranchViewerMode: true });

      // Simulate what ChatPage does on session switch
      const chat = useChatStore.getState();
      if (chat.isBranchViewerMode) {
        chat.exitBranchViewer(true);
      }

      expect(useChatStore.getState().isBranchViewerMode).toBe(false);
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('scheduleBranchSwitchEmit / cancelBranchSwitchTimer work correctly', () => {
      const fn = vi.fn();
      scheduleBranchSwitchEmit(fn, 100);

      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      cancelBranchSwitchTimer();
      vi.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
    });
  });

});
