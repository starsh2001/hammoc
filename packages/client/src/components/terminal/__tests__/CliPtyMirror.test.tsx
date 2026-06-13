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
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { CliPtyMirror } from '../CliPtyMirror';

// Stable xterm Terminal mock — the spread copy in the component shares these vi.fn refs.
const mockTerminal = {
  open: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
  reset: vi.fn(),
  scrollToBottom: vi.fn(),
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

// sonner — assert on copy success/failure toasts without rendering them
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** Define a (configurable) navigator.clipboard for the test — undefined simulates http/LAN. */
function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true });
}

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
    mockTerminal.getSelection.mockReturnValue('');
    for (const k of Object.keys(handlers)) handlers[k] = undefined;
  });

  afterEach(() => {
    cleanup();
    setClipboard(undefined);
    delete (document as { execCommand?: unknown }).execCommand;
  });

  it('subscribes to cli:screen-frame and requests the current screen on mount', () => {
    render(<CliPtyMirror />);
    expect(socketMock.on).toHaveBeenCalledWith('cli:screen-frame', expect.any(Function));
    expect(socketMock.emit).toHaveBeenCalledWith('cli:request-screen-frame');
  });

  it('repaints the whole frame inside a synchronized update (full clear + redraw)', () => {
    render(<CliPtyMirror />);
    handlers['cli:screen-frame']?.({ sessionId: 's', frame: '\x1b[31mERR\x1b[0m output' });

    expect(mockTerminal.reset).not.toHaveBeenCalled();
    expect(mockTerminal.write).toHaveBeenCalledWith('\x1b[?2026h\x1b[2J\x1b[H\x1b[31mERR\x1b[0m output\x1b[?2026l');
  });

  it('repaints the whole screen on each frame (no delta accumulation)', () => {
    render(<CliPtyMirror />);
    handlers['cli:screen-frame']?.({ sessionId: 's', frame: 'frame one' });
    handlers['cli:screen-frame']?.({ sessionId: 's', frame: 'frame two' });

    expect(mockTerminal.reset).not.toHaveBeenCalled();
    expect(mockTerminal.write).toHaveBeenLastCalledWith('\x1b[?2026h\x1b[2J\x1b[Hframe two\x1b[?2026l');
  });

  it('removes the cli:screen-frame listener on unmount (no leak)', () => {
    const { unmount } = render(<CliPtyMirror />);
    unmount();
    expect(socketMock.off).toHaveBeenCalledWith('cli:screen-frame', expect.any(Function));
  });

  it('copy button writes the selected screen text via the Clipboard API (secure context)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    mockTerminal.getSelection.mockReturnValue('claude screen text');

    render(<CliPtyMirror />);
    fireEvent.click(screen.getByLabelText('cliPtyMirror.copy'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('claude screen text'));
    expect(toast.success).toHaveBeenCalled();
  });

  it('copy button falls back to execCommand when the Clipboard API is absent (http/LAN)', async () => {
    setClipboard(undefined); // non-secure context → navigator.clipboard is undefined
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true, writable: true });
    mockTerminal.getSelection.mockReturnValue('fallback text');

    render(<CliPtyMirror />);
    fireEvent.click(screen.getByLabelText('cliPtyMirror.copy'));

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
    expect(toast.success).toHaveBeenCalled();
  });

  it('copy button reports an error on a blank screen (nothing to copy)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    mockTerminal.getSelection.mockReturnValue('   ');

    render(<CliPtyMirror />);
    fireEvent.click(screen.getByLabelText('cliPtyMirror.copy'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(writeText).not.toHaveBeenCalled();
  });
});
