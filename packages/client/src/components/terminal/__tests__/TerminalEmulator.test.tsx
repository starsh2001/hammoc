/**
 * TerminalEmulator Component Tests
 * Story 17.2: Terminal Emulator Component - Task 7.4
 *
 * xterm.js Terminal and FitAddon are mocked since jsdom doesn't support Canvas.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TerminalEmulator } from '../TerminalEmulator';

// Mock xterm.js
const mockTerminal = {
  open: vi.fn(),
  write: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  dispose: vi.fn(),
  loadAddon: vi.fn(),
  focus: vi.fn(),
  attachCustomKeyEventHandler: vi.fn(),
  options: {} as Record<string, unknown>,
  cols: 80,
  rows: 24,
};

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({ ...mockTerminal })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
    dispose: vi.fn(),
  })),
}));

// Mock CSS import
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

// Mock useTheme
let mockTheme = 'dark';
vi.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: mockTheme,
    toggleTheme: vi.fn(),
    setTheme: vi.fn(),
  }),
}));

// Mock socket
vi.mock('../../../services/socket', () => ({
  getSocket: () => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

// Mock ResizeObserver
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
vi.stubGlobal(
  'ResizeObserver',
  vi.fn().mockImplementation(() => ({
    observe: mockObserve,
    disconnect: mockDisconnect,
    unobserve: vi.fn(),
  }))
);

// Mock requestAnimationFrame
vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
  cb();
  return 0;
});
vi.stubGlobal('cancelAnimationFrame', vi.fn());

import { Terminal } from '@xterm/xterm';
import { useTerminalStore } from '../../../stores/terminalStore';

describe('TerminalEmulator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = 'dark';
    // Set up a connected terminal session in store
    useTerminalStore.setState({
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/bash', status: 'connected' as const }],
      ]),
      activeTerminalId: 'term-1',
    });
  });

  afterEach(() => {
    cleanup();
  });

  // TC-TERM-C1: Creates Terminal instance on mount
  it('creates xterm Terminal instance on mount', () => {
    render(<TerminalEmulator terminalId="term-1" />);
    expect(Terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        cursorBlink: true,
        fontSize: 14,
        scrollback: 1000,
      })
    );
  });

  // TC-TERM-C2: Calls terminal.open with container element
  it('calls terminal.open with container ref element', () => {
    render(<TerminalEmulator terminalId="term-1" />);
    // The mock terminal's open should have been called
    const instance = (Terminal as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(instance.open).toHaveBeenCalled();
  });

  // TC-TERM-C3: Disposes terminal on unmount
  it('calls terminal.dispose on unmount', () => {
    const { unmount } = render(<TerminalEmulator terminalId="term-1" />);
    const instance = (Terminal as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    unmount();
    expect(instance.dispose).toHaveBeenCalled();
  });

  // TC-TERM-C4: Registers onData handler for user input
  it('registers onData handler for keyboard input', () => {
    render(<TerminalEmulator terminalId="term-1" />);
    const instance = (Terminal as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(instance.onData).toHaveBeenCalledWith(expect.any(Function));
  });

  // TC-TERM-C5: Sets up ResizeObserver
  it('sets up ResizeObserver on container', () => {
    render(<TerminalEmulator terminalId="term-1" />);
    expect(mockObserve).toHaveBeenCalled();
  });

  // TC-TERM-C6: Disconnects ResizeObserver on unmount
  it('disconnects ResizeObserver on unmount', () => {
    const { unmount } = render(<TerminalEmulator terminalId="term-1" />);
    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  // TC-TERM-C7: Shows connecting spinner when status is connecting
  it('shows connecting spinner when status is connecting', () => {
    useTerminalStore.setState({
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '', status: 'connecting' as const }],
      ]),
      activeTerminalId: 'term-1',
    });
    const { container } = render(<TerminalEmulator terminalId="term-1" />);
    expect(container.textContent).toContain('연결 중...');
  });

  // TC-TERM-C8: Shows disconnected overlay
  it('shows disconnected overlay when status is disconnected', () => {
    useTerminalStore.setState({
      terminals: new Map([
        ['term-1', { terminalId: 'term-1', shell: '/bin/bash', status: 'disconnected' as const }],
      ]),
      activeTerminalId: 'term-1',
    });
    const { container } = render(<TerminalEmulator terminalId="term-1" />);
    expect(container.textContent).toContain('연결이 끊어졌습니다');
  });

  // TC-TERM-C9: Shows exited overlay with exit code
  it('shows exited overlay with exit code', () => {
    useTerminalStore.setState({
      terminals: new Map([
        [
          'term-1',
          { terminalId: 'term-1', shell: '/bin/bash', status: 'exited' as const, exitCode: 130 },
        ],
      ]),
      activeTerminalId: 'term-1',
    });
    const { container } = render(<TerminalEmulator terminalId="term-1" />);
    expect(container.textContent).toContain('프로세스 종료 (code: 130)');
  });

  // TC-TERM-C10: Uses dark theme when theme is dark
  it('applies dark theme to xterm Terminal options', () => {
    mockTheme = 'dark';
    render(<TerminalEmulator terminalId="term-1" />);
    expect(Terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({
          background: '#1a1b26',
          foreground: '#c0caf5',
        }),
      })
    );
  });

  // TC-TERM-C11: Uses light theme when theme is light
  it('applies light theme to xterm Terminal options', () => {
    mockTheme = 'light';
    render(<TerminalEmulator terminalId="term-1" />);
    expect(Terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({
          background: '#f5f5f5',
          foreground: '#343b58',
        }),
      })
    );
  });

  // TC-TERM-C12: Loads FitAddon
  it('loads FitAddon into terminal', () => {
    render(<TerminalEmulator terminalId="term-1" />);
    const instance = (Terminal as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(instance.loadAddon).toHaveBeenCalled();
  });
});
