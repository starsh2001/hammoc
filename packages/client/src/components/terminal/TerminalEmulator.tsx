/**
 * TerminalEmulator - xterm.js wrapper component
 * Story 17.2: Terminal Emulator Component
 *
 * Renders a terminal UI using xterm.js and binds it to a PTY session
 * via terminalStore. Data binding (sendInput, resize, registerDataCallback)
 * is done directly through the store, not via useTerminal hook.
 */

import { useRef, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../../stores/terminalStore';
import { useTheme } from '../../hooks/useTheme';
import type { Theme } from '../../hooks/useTheme';

// ===== Theme Definitions =====

const darkTheme = {
  background: '#1a1b26',
  foreground: '#c0caf5',
  cursor: '#c0caf5',
  cursorAccent: '#1a1b26',
  selectionBackground: '#33467c',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
};

const lightTheme = {
  background: '#f5f5f5',
  foreground: '#343b58',
  cursor: '#343b58',
  cursorAccent: '#f5f5f5',
  selectionBackground: '#99a7df',
  black: '#0f0f14',
  red: '#8c4351',
  green: '#485e30',
  yellow: '#8f5e15',
  blue: '#34548a',
  magenta: '#5a4a78',
  cyan: '#0f4b6e',
  white: '#343b58',
  brightBlack: '#9699a3',
  brightRed: '#8c4351',
  brightGreen: '#485e30',
  brightYellow: '#8f5e15',
  brightBlue: '#34548a',
  brightMagenta: '#5a4a78',
  brightCyan: '#0f4b6e',
  brightWhite: '#343b58',
};

function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function getXtermTheme(theme: Theme) {
  return resolveTheme(theme) === 'dark' ? darkTheme : lightTheme;
}

// ===== Component =====

export interface TerminalEmulatorProps {
  terminalId: string;
  height?: string | number;
  autoFocus?: boolean;
  onReady?: () => void;
}

export function TerminalEmulator({
  terminalId,
  height = '100%',
  autoFocus = false,
  onReady,
}: TerminalEmulatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const { theme } = useTheme();
  const sendInput = useTerminalStore((s) => s.sendInput);
  const resize = useTerminalStore((s) => s.resize);
  const registerDataCallback = useTerminalStore((s) => s.registerDataCallback);
  const session = useTerminalStore((s) => s.terminals.get(terminalId));
  const status = session?.status ?? null;
  const fontSize = useTerminalStore((s) => s.fontSize);
  const increaseFontSize = useTerminalStore((s) => s.increaseFontSize);
  const decreaseFontSize = useTerminalStore((s) => s.decreaseFontSize);
  const resetFontSize = useTerminalStore((s) => s.resetFontSize);

  // Initialize xterm.js
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: useTerminalStore.getState().fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      scrollback: 1000,
      allowProposedApi: false,
      theme: getXtermTheme(theme),
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Font size shortcuts: Ctrl+= / Ctrl+- / Ctrl+0
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      if (event.ctrlKey || event.metaKey) {
        if (event.key === '=' || event.key === '+') {
          useTerminalStore.getState().increaseFontSize();
          return false;
        }
        if (event.key === '-') {
          useTerminalStore.getState().decreaseFontSize();
          return false;
        }
        if (event.key === '0') {
          useTerminalStore.getState().resetFontSize();
          return false;
        }
      }
      return true;
    });

    // Input handler: user keystrokes → server PTY
    const inputDisposable = terminal.onData((data) => {
      sendInput(terminalId, data);
    });

    // Data callback: server PTY output → xterm.js
    const unregisterData = registerDataCallback(terminalId, (data) => {
      terminal.write(data);
    });

    // FitAddon: auto-resize with debounce
    let rafId: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        fitAddon.fit();
        const { cols, rows } = terminal;
        resize(terminalId, cols, rows);
      });
    });
    resizeObserver.observe(containerRef.current);

    // Initial fit after render
    requestAnimationFrame(() => {
      fitAddon.fit();
      const { cols, rows } = terminal;
      resize(terminalId, cols, rows);

      if (autoFocus) {
        terminal.focus();
      }
      onReady?.();
    });

    return () => {
      inputDisposable.dispose();
      unregisterData();
      resizeObserver.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
    // Only run on mount/unmount — terminalId is stable for a given instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId]);

  // Dynamic theme update
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getXtermTheme(theme);
    }
  }, [theme]);

  // Dynamic font size update
  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (terminal && fitAddon) {
      terminal.options.fontSize = fontSize;
      fitAddon.fit();
      resize(terminalId, terminal.cols, terminal.rows);
    }
  }, [fontSize, terminalId, resize]);

  // Status overlays
  if (status === 'connecting' || !status) {
    return (
      <div
        className="flex items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
        style={{ height }}
      >
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">연결 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />

      {status === 'disconnected' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-sm text-white bg-red-600/90 px-4 py-2 rounded">
            연결이 끊어졌습니다
          </div>
        </div>
      )}

      {status === 'exited' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-sm text-white bg-gray-600/90 px-4 py-2 rounded">
            프로세스 종료 (code: {session?.exitCode ?? '?'})
          </div>
        </div>
      )}
    </div>
  );
}
