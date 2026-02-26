/**
 * useTerminal Hook Tests
 * Story 17.2: Terminal Emulator Component - Task 7.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTerminal } from '../useTerminal';
import { useTerminalStore } from '../../stores/terminalStore';

const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('../../services/socket', () => ({
  getSocket: () => mockSocket,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('useTerminal', () => {
  const mockSetup = vi.fn();
  const mockCleanup = vi.fn();
  const mockCreate = vi.fn();
  const mockClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useTerminalStore.setState({
      terminals: new Map(),
      activeTerminalId: null,
      setupTerminalListeners: mockSetup,
      cleanupTerminalListeners: mockCleanup,
      createTerminal: mockCreate,
      closeTerminal: mockClose,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // TC-TERM-H1: Returns null terminalId when no active session
  it('returns null terminalId when no active terminal session', () => {
    const { result } = renderHook(() => useTerminal('test-project'));
    expect(result.current.terminalId).toBeNull();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.shell).toBeNull();
    expect(result.current.status).toBeNull();
  });

  // TC-TERM-H2: create delegates to terminalStore.createTerminal
  it('create delegates to terminalStore.createTerminal', () => {
    const { result } = renderHook(() => useTerminal('test-project'));
    act(() => {
      result.current.create();
    });
    expect(mockCreate).toHaveBeenCalledWith('test-project');
  });

  // TC-TERM-H3: close delegates to terminalStore.closeTerminal
  it('close delegates to terminalStore.closeTerminal with activeTerminalId', () => {
    useTerminalStore.setState({
      activeTerminalId: 'term-1',
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/bash', status: 'connected' as const }],
      ]),
    });

    const { result } = renderHook(() => useTerminal('test-project'));
    act(() => {
      result.current.close();
    });
    expect(mockClose).toHaveBeenCalledWith('term-1');
  });

  // TC-TERM-H4: Returns correct status and shell from store
  it('returns correct terminalId, isConnected, shell, and status', () => {
    useTerminalStore.setState({
      activeTerminalId: 'term-1',
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/zsh', status: 'connected' as const }],
      ]),
    });

    const { result } = renderHook(() => useTerminal('test-project'));
    expect(result.current.terminalId).toBe('term-1');
    expect(result.current.isConnected).toBe(true);
    expect(result.current.shell).toBe('/bin/zsh');
    expect(result.current.status).toBe('connected');
  });

  // TC-TERM-H5: Sets up listeners on mount, cleans up on unmount
  it('calls setupTerminalListeners on mount and cleanupTerminalListeners on unmount', () => {
    const { unmount } = renderHook(() => useTerminal('test-project'));
    expect(mockSetup).toHaveBeenCalledWith(mockSocket);

    unmount();
    expect(mockCleanup).toHaveBeenCalledWith(mockSocket);
  });

  // TC-TERM-H6: isConnected is false for non-connected statuses
  it('isConnected is false when status is exited', () => {
    useTerminalStore.setState({
      activeTerminalId: 'term-1',
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/bash', status: 'exited' as const, exitCode: 1 }],
      ]),
    });

    const { result } = renderHook(() => useTerminal('test-project'));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.status).toBe('exited');
  });
});
