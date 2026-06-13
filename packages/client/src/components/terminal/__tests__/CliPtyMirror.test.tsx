/**
 * CliPtyMirror tests (Story 37.8) — single self-contained screen frame: reset + write.
 *
 * xterm.js is mocked (jsdom has no Canvas). The socket is mocked so a test can drive the
 * captured event handlers and assert how the mirror renders. Covers:
 *   - on mount: subscribes to cli:screen-frame AND emits cli:request-screen-frame (pull current screen)
 *   - cli:screen-frame → terminal.reset() then write(frame) (whole-screen render, color intact)
 *   - each frame re-resets (no delta accumulation)
 *   - effect cleanup removes the socket listener (no leak)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { CliPtyMirror } from '../CliPtyMirror';

// Stable xterm Terminal mock — the spread copy in the component shares these vi.fn refs.
const mockTerminal = {
  open: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
  reset: vi.fn(),
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

describe('CliPtyMirror — full-screen frame (Story 37.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(handlers)) handlers[k] = undefined;
  });

  afterEach(() => cleanup());

  it('subscribes to cli:screen-frame and requests the current screen on mount', () => {
    render(<CliPtyMirror />);
    expect(socketMock.on).toHaveBeenCalledWith('cli:screen-frame', expect.any(Function));
    expect(socketMock.emit).toHaveBeenCalledWith('cli:request-screen-frame');
  });

  it('overwrites in place (home + per-row erase, no full reset → no flicker)', () => {
    render(<CliPtyMirror />);
    handlers['cli:screen-frame']?.({ sessionId: 's', frame: '\x1b[31mERR\x1b[0m output' });

    expect(mockTerminal.reset).not.toHaveBeenCalled();
    expect(mockTerminal.write).toHaveBeenCalledWith('\x1b[H\x1b[31mERR\x1b[0m output\x1b[K\x1b[0J');
  });

  it('overwrites the whole screen on each frame (no delta accumulation)', () => {
    render(<CliPtyMirror />);
    handlers['cli:screen-frame']?.({ sessionId: 's', frame: 'frame one' });
    handlers['cli:screen-frame']?.({ sessionId: 's', frame: 'frame two' });

    expect(mockTerminal.reset).not.toHaveBeenCalled();
    expect(mockTerminal.write).toHaveBeenLastCalledWith('\x1b[Hframe two\x1b[K\x1b[0J');
  });

  it('removes the cli:screen-frame listener on unmount (no leak)', () => {
    const { unmount } = render(<CliPtyMirror />);
    unmount();
    expect(socketMock.off).toHaveBeenCalledWith('cli:screen-frame', expect.any(Function));
  });
});
