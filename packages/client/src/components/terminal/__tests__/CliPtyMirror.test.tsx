/**
 * CliPtyMirror tests (Story 37.7) — late-join screen snapshot + live raw convergence.
 *
 * xterm.js is mocked (jsdom has no Canvas). The socket is mocked so a test can drive the
 * captured event handlers and assert how the mirror initializes/clears. Covers:
 *   - cli:screen-snapshot → terminal.clear() then writes the grid as the current screen
 *   - a following cli:pty-raw frame is still written (live convergence after the snapshot)
 *   - effect cleanup removes BOTH socket listeners (no leak)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { CliPtyMirror } from '../CliPtyMirror';

// Stable xterm Terminal mock — the spread copy in the component shares these vi.fn refs.
const mockTerminal = {
  open: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
  dispose: vi.fn(),
  selectAll: vi.fn(),
  getSelection: vi.fn(() => ''),
  clearSelection: vi.fn(),
  options: {} as Record<string, unknown>,
};

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({ ...mockTerminal })),
}));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

// Socket mock with a captured-handler registry so tests can fire server events.
const { socketMock, handlers } = vi.hoisted(() => {
  const handlers: Record<string, ((d: unknown) => void) | undefined> = {};
  const on = vi.fn((event: string, cb: (d: unknown) => void) => { handlers[event] = cb; });
  const off = vi.fn((event: string) => { handlers[event] = undefined; });
  const emit = vi.fn();
  return { socketMock: { on, off, emit }, handlers };
});
vi.mock('../../../services/socket', () => ({ getSocket: () => socketMock }));

// useTheme
vi.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', resolvedTheme: 'dark', toggleTheme: vi.fn(), setTheme: vi.fn() }),
}));

// i18n — return the key unchanged
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Stores — force CLI mode + mirror ON (default) so the panel renders.
vi.mock('../../../stores/preferencesStore', () => ({
  usePreferencesStore: (selector: (s: unknown) => unknown) =>
    selector({ preferences: { engineMode: 'cli', cliPtyMirror: true } }),
}));
vi.mock('../../../stores/chatStore', () => ({
  useChatStore: (selector: (s: unknown) => unknown) =>
    selector({ projectSettings: { engineModeOverride: 'cli' } }),
}));

// ResizeObserver + rAF stubs (the panel fits font on resize).
vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(() => ({
  observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn(),
})));
vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 0; });
vi.stubGlobal('cancelAnimationFrame', vi.fn());

describe('CliPtyMirror — late-join snapshot (Story 37.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(handlers)) handlers[k] = undefined;
  });

  afterEach(() => cleanup());

  it('subscribes to both cli:pty-raw and cli:screen-snapshot on mount', () => {
    render(<CliPtyMirror />);
    expect(socketMock.on).toHaveBeenCalledWith('cli:pty-raw', expect.any(Function));
    expect(socketMock.on).toHaveBeenCalledWith('cli:screen-snapshot', expect.any(Function));
  });

  it('clears xterm then writes the grid as the current screen on snapshot', () => {
    render(<CliPtyMirror />);
    handlers['cli:screen-snapshot']?.({ grid: ['line one', 'line two', ''] });

    expect(mockTerminal.clear).toHaveBeenCalledTimes(1);
    // Grid rows written (clear precedes the writes). Short rows are written then a newline.
    expect(mockTerminal.write).toHaveBeenCalledWith('line one');
    expect(mockTerminal.write).toHaveBeenCalledWith('line two');
  });

  it('keeps writing live raw frames after a snapshot (convergence)', () => {
    render(<CliPtyMirror />);
    handlers['cli:screen-snapshot']?.({ grid: ['init'] });
    mockTerminal.write.mockClear();

    handlers['cli:pty-raw']?.({ chunk: '\x1b[2Jlive frame' });
    expect(mockTerminal.write).toHaveBeenCalledWith('\x1b[2Jlive frame');
  });

  it('removes BOTH socket listeners on unmount (no leak)', () => {
    const { unmount } = render(<CliPtyMirror />);
    unmount();
    expect(socketMock.off).toHaveBeenCalledWith('cli:pty-raw', expect.any(Function));
    expect(socketMock.off).toHaveBeenCalledWith('cli:screen-snapshot', expect.any(Function));
  });
});
