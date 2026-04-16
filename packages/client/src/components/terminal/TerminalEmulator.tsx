/**
 * TerminalEmulator - xterm.js wrapper component
 * Story 17.2: Terminal Emulator Component
 *
 * Renders a terminal UI using xterm.js and binds it to a PTY session
 * via terminalStore. Data binding (sendInput, resize, registerDataCallback)
 * is done directly through the store, not via useTerminal hook.
 *
 * Mobile: an invisible password-type proxy input captures keyboard input
 * without IME composition (for ASCII/English). An additional visible input
 * bar at the bottom lets users compose CJK text and send it on Enter.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../../stores/terminalStore';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';

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

function getXtermTheme(resolved: 'dark' | 'light') {
  return resolved === 'dark' ? darkTheme : lightTheme;
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
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  const sendInput = useTerminalStore((s) => s.sendInput);
  const resize = useTerminalStore((s) => s.resize);
  const registerDataCallback = useTerminalStore((s) => s.registerDataCallback);
  const session = useTerminalStore((s) => s.terminals.get(terminalId));
  const status = session?.status ?? null;
  const fontSize = useTerminalStore((s) => s.fontSize);

  // Input bar state (for CJK / IME input on mobile)
  const [barText, setBarText] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const proxyInputRef = useRef<HTMLInputElement | null>(null);

  // Reset input state when switching terminals
  useEffect(() => {
    setBarText('');
    setIsComposing(false);
  }, [terminalId]);

  // Send text to terminal (no Enter)
  const handleBarSend = useCallback(() => {
    if (isComposing || !barText) return;
    const s = useTerminalStore.getState().terminals.get(terminalId);
    if (s?.status !== 'connected') return;
    sendInput(terminalId, barText);
    setBarText('');
    // Focus proxy input (terminal) to keep keyboard open for direct typing
    requestAnimationFrame(() => proxyInputRef.current?.focus());
  }, [barText, isComposing, sendInput, terminalId]);

  const handleBarKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isComposing && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
      e.preventDefault();
      if (barText) {
        handleBarSend();
      } else {
        // Empty input bar: send Enter directly to terminal
        const s = useTerminalStore.getState().terminals.get(terminalId);
        if (s?.status === 'connected') sendInput(terminalId, '\r');
      }
    }
  }, [isComposing, handleBarSend, barText, sendInput, terminalId]);

  // Initialize xterm.js
  useEffect(() => {
    if (!containerRef.current) return;

    const isMobileNow = isMobile;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: useTerminalStore.getState().fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      scrollback: 1000,
      allowProposedApi: false,
      theme: getXtermTheme(resolvedTheme),
      // On mobile, disable xterm's own keyboard — proxy input handles it
      disableStdin: isMobileNow,
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

    // Input handler: user keystrokes → server PTY (desktop only)
    const inputDisposable = terminal.onData((data) => {
      const s = useTerminalStore.getState().terminals.get(terminalId);
      if (s?.status !== 'connected') return;
      sendInput(terminalId, data);
    });

    // Mobile: invisible password proxy for direct ASCII input
    // (ref: xtermjs/xterm.js#2403 — password inputs bypass IME/composition)
    let proxyInput: HTMLInputElement | null = null;
    let proxyTapHandler: (() => void) | null = null;
    let proxyFocusTimeoutId: ReturnType<typeof setTimeout> | null = null;

    if (isMobileNow && containerRef.current) {
      proxyInput = document.createElement('input');
      proxyInputRef.current = proxyInput;
      proxyInput.type = 'password';
      proxyInput.autocomplete = 'off';
      proxyInput.setAttribute('autocorrect', 'off');
      proxyInput.setAttribute('autocapitalize', 'off');
      proxyInput.setAttribute('spellcheck', 'false');
      proxyInput.setAttribute('aria-label', 'Terminal input');
      proxyInput.setAttribute('enterkeyhint', 'send');
      proxyInput.tabIndex = -1;
      Object.assign(proxyInput.style, {
        width: '100%',
        height: '100%',
        opacity: '0',
        border: 'none',
        outline: 'none',
        caretColor: 'transparent',
        fontSize: '16px', // prevent iOS auto-zoom on focus
      });

      // Wrap proxy in a <form> to prevent Enter from triggering
      // browser "next field" navigation on mobile password inputs.
      const proxyForm = document.createElement('form');
      proxyForm.addEventListener('submit', (ev) => ev.preventDefault());
      Object.assign(proxyForm.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        margin: '0',
        padding: '0',
        border: 'none',
        zIndex: '2',
        pointerEvents: 'none',
      });
      proxyForm.appendChild(proxyInput);

      containerRef.current.style.position = 'relative';
      containerRef.current.appendChild(proxyForm);

      // Use touchend + setTimeout so the focus happens AFTER xterm.js
      // finishes its own click/focus handling, preventing the keyboard
      // from immediately closing due to xterm stealing focus.
      proxyTapHandler = () => {
        if (proxyFocusTimeoutId) clearTimeout(proxyFocusTimeoutId);
        proxyFocusTimeoutId = setTimeout(() => {
          proxyFocusTimeoutId = null;
          if (proxyInput?.isConnected) proxyInput.focus();
        }, 0);
      };
      containerRef.current.addEventListener('touchend', proxyTapHandler);

      proxyInput.addEventListener('input', () => {
        if (proxyInput && proxyInput.value) {
          const s = useTerminalStore.getState().terminals.get(terminalId);
          if (s?.status !== 'connected') { proxyInput.value = ''; return; }
          sendInput(terminalId, proxyInput.value);
          proxyInput.value = '';
        }
      });

      proxyInput.addEventListener('keydown', (e) => {
        const s = useTerminalStore.getState().terminals.get(terminalId);
        if (s?.status !== 'connected') return;
        if (e.key === 'Enter') {
          e.preventDefault();
          sendInput(terminalId, '\r');
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          sendInput(terminalId, '\x7f');
        } else if (e.key === 'Tab') {
          e.preventDefault();
          sendInput(terminalId, '\t');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          sendInput(terminalId, '\x1b');
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          sendInput(terminalId, '\x1b[A');
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          sendInput(terminalId, '\x1b[B');
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          sendInput(terminalId, '\x1b[C');
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          sendInput(terminalId, '\x1b[D');
        } else if (e.ctrlKey) {
          const k = e.key.toLowerCase();
          if (k === 'c') { e.preventDefault(); sendInput(terminalId, '\x03'); }
          else if (k === 'd') { e.preventDefault(); sendInput(terminalId, '\x04'); }
          else if (k === 'z') { e.preventDefault(); sendInput(terminalId, '\x1a'); }
        }
      });

      if (autoFocus) proxyInput.focus();
    }

    // Data callback: server PTY output → xterm.js
    const unregisterData = registerDataCallback(terminalId, (data) => {
      terminal.write(data);
    });

    // FitAddon: auto-resize with debounce
    let rafId: number | null = null;
    let lastCols = 0;
    let lastRows = 0;
    const fitAndResize = () => {
      fitAddon.fit();
      const { cols, rows } = terminal;
      if (cols !== lastCols || rows !== lastRows) {
        lastCols = cols;
        lastRows = rows;
        resize(terminalId, cols, rows);
      }
    };
    const resizeObserver = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fitAndResize);
    });
    resizeObserver.observe(containerRef.current);

    // Initial fit after render
    let initRafId: number | null = null;
    initRafId = requestAnimationFrame(() => {
      initRafId = null;
      fitAndResize();

      if (autoFocus && !isMobileNow) {
        terminal.focus();
      }
      onReady?.();
    });

    return () => {
      if (proxyFocusTimeoutId) clearTimeout(proxyFocusTimeoutId);
      if (proxyInput) {
        proxyInput.parentElement?.remove(); // remove wrapping <form>
        proxyInputRef.current = null;
      }
      if (proxyTapHandler && containerRef.current) {
        containerRef.current.removeEventListener('touchend', proxyTapHandler);
      }
      inputDisposable.dispose();
      unregisterData();
      resizeObserver.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      if (initRafId) cancelAnimationFrame(initRafId);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
    // Re-run when terminalId or mobile mode changes (remounts terminal
    // to reconfigure disableStdin and proxy input for the new mode).
  }, [terminalId, isMobile]);

  // Dynamic theme update
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getXtermTheme(resolvedTheme);
    }
  }, [resolvedTheme]);

  // Dynamic font size update
  const lastSizeRef = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 });
  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (terminal && fitAddon) {
      terminal.options.fontSize = fontSize;
      fitAddon.fit();
      const { cols, rows } = terminal;
      if (cols !== lastSizeRef.current.cols || rows !== lastSizeRef.current.rows) {
        lastSizeRef.current = { cols, rows };
        resize(terminalId, cols, rows);
      }
    }
  }, [fontSize, terminalId, resize]);

  return (
    <div className="relative flex flex-col" style={{ height }}>
      <div ref={containerRef} className="w-full flex-1 min-h-0" />

      {/* Mobile input bar — for CJK and any text that needs IME composition */}
      {isMobile && status === 'connected' && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-100 dark:bg-[#1e2030] border-t border-gray-300 dark:border-gray-600">
          <input
            type="text"
            aria-label="Terminal input"
            placeholder={t('terminal.imeInputPlaceholder')}
            className="flex-1 bg-white dark:bg-[#282a3a] text-sm font-mono text-gray-900 dark:text-gray-100 outline-none rounded px-2 py-1 border border-gray-300 dark:border-gray-600 placeholder:text-gray-400 dark:placeholder:text-gray-500 placeholder:text-xs"
            value={barText}
            onChange={(e) => setBarText(e.target.value)}
            onKeyDown={handleBarKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="px-2.5 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 active:bg-blue-800 shrink-0"
            onClick={handleBarSend}
          >
            Send
          </button>
        </div>
      )}

      {(status === 'connecting' || !status) && (
        <div role="status" aria-live="polite" className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100 dark:bg-[#1c2129] text-gray-500 dark:text-gray-300">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">{t('terminal.connecting')}</span>
          </div>
        </div>
      )}

      {status === 'disconnected' && (
        <div role="alert" className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
          <div className="text-sm text-white bg-red-600/90 px-4 py-2 rounded">
            {t('terminal.disconnected')}
          </div>
        </div>
      )}

      {status === 'exited' && (
        <div role="alert" className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
          <div className="text-sm text-white bg-gray-600/90 px-4 py-2 rounded">
            {t('terminal.exited', { exitCode: session?.exitCode ?? '?' })}
          </div>
        </div>
      )}
    </div>
  );
}
