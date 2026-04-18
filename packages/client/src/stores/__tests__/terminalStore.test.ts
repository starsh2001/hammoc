/**
 * Terminal Store Tests
 * Story 17.2: Terminal Emulator Component - Task 7.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTerminalStore } from '../terminalStore';

const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  connected: true,
};

vi.mock('../../services/socket', () => ({
  getSocket: () => mockSocket,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';

describe('terminalStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useTerminalStore.setState({
      terminals: new Map(),
      activeTerminalId: null,
      currentProjectSlug: null,
    });
  });

  // TC-TERM-S1: createTerminal emits socket event
  it('createTerminal emits terminal:create socket event', () => {
    useTerminalStore.getState().createTerminal('my-project');
    expect(mockSocket.emit).toHaveBeenCalledWith('terminal:create', {
      projectSlug: 'my-project',
    });
  });

  // TC-TERM-S2: reattachTerminal emits socket event with terminalId
  it('reattachTerminal emits terminal:create with terminalId', () => {
    useTerminalStore.getState().reattachTerminal('my-project', 'term-123');
    expect(mockSocket.emit).toHaveBeenCalledWith('terminal:create', {
      projectSlug: 'my-project',
      terminalId: 'term-123',
    });
  });

  // TC-TERM-S3: terminal:created updates state
  it('terminal:created handler adds session to terminals map', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useTerminalStore.getState().setupTerminalListeners(mockSocket as any);

    // Find the terminal:created handler
    const onCreatedCall = mockSocket.on.mock.calls.find(
      (call) => call[0] === 'terminal:created'
    );
    expect(onCreatedCall).toBeDefined();
    const onCreated = onCreatedCall![1];

    // Simulate terminal:created event
    onCreated({ terminalId: 'term-1', shell: '/bin/bash' });

    const state = useTerminalStore.getState();
    expect(state.terminals.get('term-1')).toEqual({
      terminalId: 'term-1',
      shell: '/bin/bash',
      status: 'connected',
    });
    expect(state.activeTerminalId).toBe('term-1');
  });

  // TC-TERM-S4: terminal:exit removes session from map
  it('terminal:exit handler removes session and clears activeTerminalId', () => {
    // Pre-populate a session
    useTerminalStore.setState({
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/bash', status: 'connected' }],
      ]),
      activeTerminalId: 'term-1',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useTerminalStore.getState().setupTerminalListeners(mockSocket as any);

    const onExitCall = mockSocket.on.mock.calls.find(
      (call) => call[0] === 'terminal:exit'
    );
    const onExit = onExitCall![1];

    onExit({ terminalId: 'term-1', exitCode: 0 });

    expect(useTerminalStore.getState().terminals.size).toBe(0);
    expect(useTerminalStore.getState().activeTerminalId).toBeNull();
  });

  // TC-TERM-S5: terminal:error shows toast and updates status
  it('terminal:error handler calls toast.error and sets status to disconnected', () => {
    useTerminalStore.setState({
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/bash', status: 'connected' }],
      ]),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useTerminalStore.getState().setupTerminalListeners(mockSocket as any);

    const onErrorCall = mockSocket.on.mock.calls.find(
      (call) => call[0] === 'terminal:error'
    );
    const onError = onErrorCall![1];

    onError({ terminalId: 'term-1', code: 'PTY_SPAWN_ERROR', message: 'Failed to spawn' });

    expect(toast.error).toHaveBeenCalledWith('Failed to spawn');
    const session = useTerminalStore.getState().terminals.get('term-1');
    expect(session?.status).toBe('disconnected');
  });

  // TC-TERM-S6: terminal:error without terminalId only shows toast
  it('terminal:error without terminalId only shows toast', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useTerminalStore.getState().setupTerminalListeners(mockSocket as any);

    const onErrorCall = mockSocket.on.mock.calls.find(
      (call) => call[0] === 'terminal:error'
    );
    const onError = onErrorCall![1];

    onError({ code: 'MAX_SESSIONS_REACHED', message: 'Too many sessions' });

    expect(toast.error).toHaveBeenCalledWith('Too many sessions');
  });

  // TC-TERM-S7: closeTerminal removes from map and emits event
  it('closeTerminal removes session from map and emits terminal:close', () => {
    useTerminalStore.setState({
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/bash', status: 'connected' }],
      ]),
      activeTerminalId: 'term-1',
    });

    useTerminalStore.getState().closeTerminal('term-1');

    expect(mockSocket.emit).toHaveBeenCalledWith('terminal:close', { terminalId: 'term-1' });
    expect(useTerminalStore.getState().terminals.has('term-1')).toBe(false);
    expect(useTerminalStore.getState().activeTerminalId).toBeNull();
  });

  // TC-TERM-S8: sendInput emits terminal:input
  it('sendInput emits terminal:input socket event', () => {
    useTerminalStore.getState().sendInput('term-1', 'ls\n');
    expect(mockSocket.emit).toHaveBeenCalledWith('terminal:input', {
      terminalId: 'term-1',
      data: 'ls\n',
    });
  });

  // TC-TERM-S9: resize emits terminal:resize
  it('resize emits terminal:resize socket event', () => {
    useTerminalStore.getState().resize('term-1', 120, 40);
    expect(mockSocket.emit).toHaveBeenCalledWith('terminal:resize', {
      terminalId: 'term-1',
      cols: 120,
      rows: 40,
    });
  });

  // TC-TERM-S10: registerDataCallback and terminal:data routing
  it('registerDataCallback routes terminal:data to registered callbacks', () => {
    const cb = vi.fn();
    const unregister = useTerminalStore.getState().registerDataCallback('term-1', cb);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useTerminalStore.getState().setupTerminalListeners(mockSocket as any);

    const onDataCall = mockSocket.on.mock.calls.find(
      (call) => call[0] === 'terminal:data'
    );
    const onData = onDataCall![1];

    onData({ terminalId: 'term-1', data: 'hello world' });
    expect(cb).toHaveBeenCalledWith('hello world');

    // Unregister and verify no more calls
    unregister();
    onData({ terminalId: 'term-1', data: 'bye' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // TC-TERM-S12: setActiveTerminalId sets valid terminal ID
  it('setActiveTerminalId sets activeTerminalId when terminal exists', () => {
    useTerminalStore.setState({
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/bash', status: 'connected' }],
        ['term-2', { terminalId: 'term-2', shell: '/bin/zsh', status: 'connected' }],
      ]),
      activeTerminalId: 'term-1',
    });

    useTerminalStore.getState().setActiveTerminalId('term-2');
    expect(useTerminalStore.getState().activeTerminalId).toBe('term-2');
  });

  // TC-TERM-S13: setActiveTerminalId ignores non-existent ID
  it('setActiveTerminalId ignores non-existent terminal ID', () => {
    useTerminalStore.setState({
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/bash', status: 'connected' }],
      ]),
      activeTerminalId: 'term-1',
    });

    useTerminalStore.getState().setActiveTerminalId('term-999');
    expect(useTerminalStore.getState().activeTerminalId).toBe('term-1');
  });

  // TC-TERM-S14: closeTerminal auto-selects next terminal
  it('closeTerminal auto-selects first remaining terminal when active is closed', () => {
    useTerminalStore.setState({
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/bash', status: 'connected' }],
        ['term-2', { terminalId: 'term-2', shell: '/bin/zsh', status: 'connected' }],
        ['term-3', { terminalId: 'term-3', shell: '/bin/bash', status: 'connected' }],
      ]),
      activeTerminalId: 'term-1',
    });

    useTerminalStore.getState().closeTerminal('term-1');
    expect(useTerminalStore.getState().activeTerminalId).toBe('term-2');
    expect(useTerminalStore.getState().terminals.has('term-1')).toBe(false);
  });

  // TC-TERM-S15: closeTerminal keeps activeTerminalId if non-active is closed
  it('closeTerminal keeps activeTerminalId when non-active terminal is closed', () => {
    useTerminalStore.setState({
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/bash', status: 'connected' }],
        ['term-2', { terminalId: 'term-2', shell: '/bin/zsh', status: 'connected' }],
      ]),
      activeTerminalId: 'term-1',
    });

    useTerminalStore.getState().closeTerminal('term-2');
    expect(useTerminalStore.getState().activeTerminalId).toBe('term-1');
  });

  // TC-TERM-S16: clearTerminalsForProjectChange closes all on project switch
  it('clearTerminalsForProjectChange closes all terminals when project changes', () => {
    useTerminalStore.setState({
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/bash', status: 'connected' }],
        ['term-2', { terminalId: 'term-2', shell: '/bin/zsh', status: 'connected' }],
      ]),
      activeTerminalId: 'term-1',
      currentProjectSlug: 'old-project',
    });

    useTerminalStore.getState().clearTerminalsForProjectChange('new-project');

    // Client state cleared only — server terminals persist per project
    expect(mockSocket.emit).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().terminals.size).toBe(0);
    expect(useTerminalStore.getState().activeTerminalId).toBeNull();
    expect(useTerminalStore.getState().currentProjectSlug).toBe('new-project');
  });

  // TC-TERM-S17: clearTerminalsForProjectChange keeps terminals for same project
  it('clearTerminalsForProjectChange keeps terminals when same project', () => {
    useTerminalStore.setState({
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/bash', status: 'connected' }],
      ]),
      activeTerminalId: 'term-1',
      currentProjectSlug: 'my-project',
    });

    useTerminalStore.getState().clearTerminalsForProjectChange('my-project');

    expect(mockSocket.emit).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().terminals.size).toBe(1);
    expect(useTerminalStore.getState().currentProjectSlug).toBe('my-project');
  });

  // TC-TERM-S18: clearTerminalsForProjectChange sets slug on first call
  it('clearTerminalsForProjectChange sets slug when no previous project', () => {
    useTerminalStore.getState().clearTerminalsForProjectChange('first-project');
    expect(useTerminalStore.getState().currentProjectSlug).toBe('first-project');
  });

  // TC-TERM-S11: cleanupTerminalListeners removes socket handlers
  it('cleanupTerminalListeners removes all socket event handlers', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useTerminalStore.getState().setupTerminalListeners(mockSocket as any);
    expect(mockSocket.on).toHaveBeenCalledTimes(6);

    // Clear mock counts from setup (which internally calls cleanup first)
    mockSocket.off.mockClear();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useTerminalStore.getState().cleanupTerminalListeners(mockSocket as any);
    expect(mockSocket.off).toHaveBeenCalledTimes(6);
    expect(mockSocket.off).toHaveBeenCalledWith('terminal:list', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('terminal:access', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('terminal:created', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('terminal:data', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('terminal:exit', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('terminal:error', expect.any(Function));
  });
});
