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
import { useMessageStore } from '../../../stores/messageStore';
import {
  saveFrameSnapshot,
  flushSnapshotsNow,
  __resetSnapshotCacheForTests,
} from '../../../utils/sessionSnapshotCache';

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

// rAF stub: the first-frame snap-to-bottom uses requestAnimationFrame; run it synchronously.
// (ResizeObserver/cancelAnimationFrame stubs kept as harmless no-ops since jsdom lacks them.)
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
    // Isolate the pre-paint cache + viewed-session between tests. With no session bound, the
    // mirror's cache read/write is a no-op, so the existing render tests behave exactly as before.
    useMessageStore.setState({ currentSessionId: null });
    __resetSnapshotCacheForTests();
  });

  afterEach(() => {
    cleanup();
    setClipboard(undefined);
    delete (document as { execCommand?: unknown }).execCommand;
  });

  /**
   * The panel now starts COLLAPSED (only the title bar shows) — the xterm and its socket
   * subscription mount lazily on first expand. A short tap (pointer down→up with no drag) on the
   * title bar toggles it open. The title bar is the button whose accessible name contains the
   * title key (copy/clear buttons are named differently and are hidden while collapsed).
   */
  function expandPanel() {
    const bar = screen.getByRole('button', { name: /cliPtyMirror\.title/ });
    fireEvent.pointerDown(bar, { clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientY: 0, pointerId: 1 });
  }

  it('starts collapsed: nothing subscribes and no terminal mounts until expanded', () => {
    render(<CliPtyMirror />);
    // Default collapsed → the xterm effect returns early, so nothing touches the socket yet and
    // the action buttons (which live in the expanded header) are absent.
    expect(socketMock.on).not.toHaveBeenCalled();
    expect(socketMock.emit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('cliPtyMirror.copy')).toBeNull();
  });

  it('subscribes to cli:screen-frame and requests the current screen once expanded', () => {
    render(<CliPtyMirror />);
    expandPanel();
    expect(socketMock.on).toHaveBeenCalledWith('cli:screen-frame', expect.any(Function));
    expect(socketMock.emit).toHaveBeenCalledWith('cli:request-screen-frame');
  });

  it('repaints the whole frame inside a synchronized update (full clear + redraw)', () => {
    render(<CliPtyMirror />);
    expandPanel();
    handlers['cli:screen-frame']?.({ sessionId: 's', frame: '\x1b[31mERR\x1b[0m output' });

    expect(mockTerminal.reset).not.toHaveBeenCalled();
    expect(mockTerminal.write).toHaveBeenCalledWith('\x1b[?2026h\x1b[2J\x1b[H\x1b[31mERR\x1b[0m output\x1b[?2026l');
  });

  it('repaints the whole screen on each frame (no delta accumulation)', () => {
    render(<CliPtyMirror />);
    expandPanel();
    handlers['cli:screen-frame']?.({ sessionId: 's', frame: 'frame one' });
    handlers['cli:screen-frame']?.({ sessionId: 's', frame: 'frame two' });

    expect(mockTerminal.reset).not.toHaveBeenCalled();
    expect(mockTerminal.write).toHaveBeenLastCalledWith('\x1b[?2026h\x1b[2J\x1b[Hframe two\x1b[?2026l');
  });

  it('pre-paints the last-seen cached frame on expand, before any server frame arrives', () => {
    // A session is being viewed and this browser cached its last screen earlier.
    useMessageStore.setState({ currentSessionId: 'sess-X' });
    saveFrameSnapshot('sess-X', 'CACHED SCREEN');
    flushSnapshotsNow();

    render(<CliPtyMirror />);
    expandPanel();

    // The cached frame is painted immediately on mount — no cli:screen-frame event needed — so the
    // user sees the previous screen with zero blank gap. The request is still emitted to refresh it.
    expect(mockTerminal.write).toHaveBeenCalledWith('\x1b[?2026h\x1b[2J\x1b[HCACHED SCREEN\x1b[?2026l');
    expect(socketMock.emit).toHaveBeenCalledWith('cli:request-screen-frame');
  });

  it('caches each incoming frame for the viewed session (so a later remount can pre-paint it)', () => {
    useMessageStore.setState({ currentSessionId: 'sess-Y' });
    render(<CliPtyMirror />);
    expandPanel();
    handlers['cli:screen-frame']?.({ sessionId: 'sess-Y', frame: 'LIVE FRAME' });
    flushSnapshotsNow();

    // Re-mounting (e.g. after a reconnect) pre-paints the frame we just cached.
    cleanup();
    mockTerminal.write.mockClear();
    render(<CliPtyMirror />);
    expandPanel();
    expect(mockTerminal.write).toHaveBeenCalledWith('\x1b[?2026h\x1b[2J\x1b[HLIVE FRAME\x1b[?2026l');
  });

  it('removes the cli:screen-frame listener on unmount (no leak)', () => {
    const { unmount } = render(<CliPtyMirror />);
    expandPanel();
    unmount();
    expect(socketMock.off).toHaveBeenCalledWith('cli:screen-frame', expect.any(Function));
  });

  it('copy button writes the selected screen text via the Clipboard API (secure context)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    mockTerminal.getSelection.mockReturnValue('claude screen text');

    render(<CliPtyMirror />);
    expandPanel();
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
    expandPanel();
    fireEvent.click(screen.getByLabelText('cliPtyMirror.copy'));

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
    expect(toast.success).toHaveBeenCalled();
  });

  it('copy button reports an error on a blank screen (nothing to copy)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    mockTerminal.getSelection.mockReturnValue('   ');

    render(<CliPtyMirror />);
    expandPanel();
    fireEvent.click(screen.getByLabelText('cliPtyMirror.copy'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(writeText).not.toHaveBeenCalled();
  });
});
