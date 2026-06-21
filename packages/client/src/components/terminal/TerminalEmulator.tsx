/**
 * TerminalEmulator - xterm.js wrapper component (read-only display + input bar)
 *
 * The xterm.js viewport is always read-only (disableStdin: true).
 * All user input goes through the bottom input bar, which relays
 * keystrokes to the PTY in real-time while keeping typed text visible.
 *
 * The input bar is uncontrolled — the DOM value is managed via ref,
 * avoiding React/IME composition conflicts. onChange detects new text
 * (typed, pasted, IME-committed) via a length-based diff and sends
 * it to the PTY. Special keys (Enter, Tab, arrows, Ctrl combos)
 * are handled in onKeyDown and bypass the diff path.
 */

import { useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { CornerDownLeft, ClipboardCopy } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../../stores/terminalStore';
import { useTheme } from '../../hooks/useTheme';
import { getXtermTheme } from './xtermTheme';

const QUICK_KEYS: Array<{ label: string; seq: string; title?: string } | 'sep'> = [
  { label: '↑', seq: '\x1b[A', title: 'Up' },
  { label: '↓', seq: '\x1b[B', title: 'Down' },
  { label: '←', seq: '\x1b[D', title: 'Left' },
  { label: '→', seq: '\x1b[C', title: 'Right' },
  'sep',
  { label: 'Tab', seq: '\t' },
  { label: 'Esc', seq: '\x1b' },
  'sep',
  { label: '^C', seq: '\x03', title: 'Ctrl+C' },
  { label: '^D', seq: '\x04', title: 'Ctrl+D' },
  { label: '^Z', seq: '\x1a', title: 'Ctrl+Z' },
];

const KEY_BTN =
  'min-w-[2rem] h-7 px-1.5 text-xs font-mono rounded border ' +
  'bg-gray-200 dark:bg-[#2a3040] border-gray-300 dark:border-gray-600 ' +
  'text-gray-700 dark:text-gray-300 ' +
  'hover:bg-gray-300 dark:hover:bg-[#354050] ' +
  'active:bg-gray-400 dark:active:bg-[#405060] ' +
  'transition-colors select-none';

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isComposingRef = useRef(false);
  const sentLenRef = useRef(0);

  const { resolvedTheme } = useTheme();
  const sendInput = useTerminalStore((s) => s.sendInput);
  const resize = useTerminalStore((s) => s.resize);
  const registerDataCallback = useTerminalStore((s) => s.registerDataCallback);
  const session = useTerminalStore((s) => s.terminals.get(terminalId));
  const status = session?.status ?? null;
  const fontSize = useTerminalStore((s) => s.fontSize);

  useEffect(() => {
    if (inputRef.current) inputRef.current.value = '';
    isComposingRef.current = false;
    sentLenRef.current = 0;
  }, [terminalId]);

  const clearInput = useCallback(() => {
    if (inputRef.current) inputRef.current.value = '';
    sentLenRef.current = 0;
  }, []);

  // Copy terminal content (selection if any, otherwise all)
  const handleCopy = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const sel = terminal.getSelection();
    if (sel) {
      navigator.clipboard.writeText(sel).catch(() => {});
      terminal.clearSelection();
    } else {
      terminal.selectAll();
      const all = terminal.getSelection();
      if (all) navigator.clipboard.writeText(all).catch(() => {});
      terminal.clearSelection();
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Quick-key buttons: send sequence, clear input, refocus
  const sendKey = useCallback(
    (seq: string) => {
      const s = useTerminalStore.getState().terminals.get(terminalId);
      if (s?.status !== 'connected') return;
      sendInput(terminalId, seq);
      clearInput();
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [sendInput, terminalId, clearInput]
  );

  // Send button = Enter
  const handleSend = useCallback(() => {
    const s = useTerminalStore.getState().terminals.get(terminalId);
    if (s?.status !== 'connected') return;
    sendInput(terminalId, '\r');
    clearInput();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [sendInput, terminalId, clearInput]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;

      const s = useTerminalStore.getState().terminals.get(terminalId);
      if (s?.status !== 'connected') return;

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          sendInput(terminalId, '\r');
          clearInput();
          break;
        case 'Backspace':
          sendInput(terminalId, '\x7f');
          break;
        case 'Delete':
          e.preventDefault();
          sendInput(terminalId, '\x1b[3~');
          clearInput();
          break;
        case 'Tab':
          e.preventDefault();
          sendInput(terminalId, '\t');
          clearInput();
          break;
        case 'Escape':
          e.preventDefault();
          sendInput(terminalId, '\x1b');
          clearInput();
          break;
        case 'ArrowUp':
          e.preventDefault();
          sendInput(terminalId, '\x1b[A');
          clearInput();
          break;
        case 'ArrowDown':
          e.preventDefault();
          sendInput(terminalId, '\x1b[B');
          clearInput();
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'Home':
        case 'End':
          e.preventDefault();
          break;
        default:
          if (e.ctrlKey || e.metaKey) {
            const k = e.key.toLowerCase();
            const isCtrl = e.ctrlKey && !e.metaKey;

            if (k === 'c') {
              const input = e.currentTarget;
              if (
                input.selectionStart !== null &&
                input.selectionEnd !== null &&
                input.selectionStart !== input.selectionEnd
              )
                return;

              e.preventDefault();
              const sel = terminalRef.current?.getSelection();
              if (sel) {
                navigator.clipboard.writeText(sel).catch(() => {});
                terminalRef.current?.clearSelection();
              } else if (isCtrl) {
                sendInput(terminalId, '\x03');
                clearInput();
              }
            } else if (k === 'd' && isCtrl) {
              e.preventDefault();
              sendInput(terminalId, '\x04');
              clearInput();
            } else if (k === 'z' && isCtrl) {
              e.preventDefault();
              sendInput(terminalId, '\x1a');
              clearInput();
            } else if (k === '=' || k === '+') {
              e.preventDefault();
              useTerminalStore.getState().increaseFontSize();
            } else if (k === '-') {
              e.preventDefault();
              useTerminalStore.getState().decreaseFontSize();
            } else if (k === '0') {
              e.preventDefault();
              useTerminalStore.getState().resetFontSize();
            }
          }
          // Printable chars: no preventDefault → browser inserts → onChange sends
      }
    },
    [sendInput, terminalId, clearInput]
  );

  // onChange detects new text (typed chars, paste, IME commit) via length diff
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isComposingRef.current) return;

      const val = e.target.value;
      if (val.length > sentLenRef.current) {
        const added = val.slice(sentLenRef.current);
        const s = useTerminalStore.getState().terminals.get(terminalId);
        if (s?.status === 'connected') sendInput(terminalId, added);
      }
      sentLenRef.current = val.length;
    },
    [sendInput, terminalId]
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      isComposingRef.current = false;
      const val = (e.target as HTMLInputElement).value;
      if (val.length > sentLenRef.current) {
        const added = val.slice(sentLenRef.current);
        const s = useTerminalStore.getState().terminals.get(terminalId);
        if (s?.status === 'connected') sendInput(terminalId, added);
      }
      sentLenRef.current = val.length;
    },
    [sendInput, terminalId]
  );

  // ── xterm.js lifecycle ──────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: useTerminalStore.getState().fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      scrollback: 1000,
      allowProposedApi: false,
      theme: getXtermTheme(resolvedTheme),
      disableStdin: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const unregisterData = registerDataCallback(terminalId, (data) => {
      terminal.write(data);
    });

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

    // Redirect focus from xterm to input bar so the mobile keyboard
    // doesn't open on the terminal and keystrokes always go through
    // the input bar.
    const container = containerRef.current;
    const handleFocusIn = () => {
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    container.addEventListener('focusin', handleFocusIn);

    // Touch-based line selection (long-press + drag)
    const LONG_PRESS_MS = 400;
    const MOVE_THRESHOLD = 10;
    let touchTimer: ReturnType<typeof setTimeout> | null = null;
    let selecting = false;
    let startRow = -1;
    let touchStartY = 0;
    let touchStartX = 0;

    const touchToRow = (clientY: number): number => {
      const rect = container.getBoundingClientRect();
      const cellH = rect.height / terminal.rows;
      const vRow = Math.floor((clientY - rect.top) / cellH);
      return terminal.buffer.active.viewportY + Math.max(0, Math.min(vRow, terminal.rows - 1));
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      selecting = false;
      touchTimer = setTimeout(() => {
        selecting = true;
        startRow = touchToRow(t.clientY);
        terminal.selectLines(startRow, startRow);
      }, LONG_PRESS_MS);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!selecting) {
        if (
          Math.abs(t.clientX - touchStartX) > MOVE_THRESHOLD ||
          Math.abs(t.clientY - touchStartY) > MOVE_THRESHOLD
        ) {
          if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
        }
        return;
      }
      e.preventDefault();
      const curRow = touchToRow(t.clientY);
      terminal.selectLines(Math.min(startRow, curRow), Math.max(startRow, curRow));
    };
    const onTouchEnd = () => {
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
      selecting = false;
    };
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);

    let initRafId: number | null = null;
    initRafId = requestAnimationFrame(() => {
      initRafId = null;
      fitAndResize();
      onReady?.();
    });

    return () => {
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      if (touchTimer) clearTimeout(touchTimer);
      unregisterData();
      resizeObserver.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      if (initRafId) cancelAnimationFrame(initRafId);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoFocus && status === 'connected') {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [autoFocus, status]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getXtermTheme(resolvedTheme);
    }
  }, [resolvedTheme]);

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

  const isConnected = status === 'connected';

  return (
    <div className="relative flex flex-col" style={{ height }}>
      <div ref={containerRef} className="w-full flex-1 min-h-0" />

      {isConnected && (
        <div className="flex flex-col gap-1 px-2 py-1.5 bg-gray-50 dark:bg-[#1e2030] border-t border-gray-300 dark:border-gray-600">
          <div className="flex items-center gap-1 overflow-x-auto">
            {QUICK_KEYS.map((k, i) =>
              k === 'sep' ? (
                <span
                  key={i}
                  className="w-px h-5 bg-gray-300 dark:bg-gray-600 shrink-0"
                />
              ) : (
                <button
                  key={k.label}
                  type="button"
                  className={KEY_BTN}
                  title={k.title ?? k.label}
                  onClick={() => sendKey(k.seq)}
                >
                  {k.label}
                </button>
              )
            )}
            <span className="w-px h-5 bg-gray-300 dark:bg-gray-600 shrink-0" />
            <button
              type="button"
              className={KEY_BTN}
              title={t('terminal.copy')}
              onClick={handleCopy}
            >
              <ClipboardCopy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              aria-label={t('terminal.inputPlaceholder')}
              placeholder={t('terminal.inputPlaceholder')}
              className="flex-1 h-7 bg-white dark:bg-[#282a3a] text-sm font-mono text-gray-900 dark:text-gray-100 outline-none rounded px-2 border border-gray-300 dark:border-gray-600 placeholder:text-gray-400 dark:placeholder:text-gray-500 placeholder:text-xs focus:border-blue-500 dark:focus:border-blue-400"
              onKeyDown={handleKeyDown}
              onChange={handleChange}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="send"
            />
            <button
              type="button"
              className="h-7 px-2.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 active:bg-blue-800 transition-colors shrink-0 flex items-center"
              onClick={handleSend}
              aria-label={t('terminal.send')}
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {(status === 'connecting' || !status) && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100 dark:bg-[#1c2129] text-gray-500 dark:text-gray-300"
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">{t('terminal.connecting')}</span>
          </div>
        </div>
      )}

      {status === 'disconnected' && (
        <div
          role="alert"
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50"
        >
          <div className="text-sm text-white bg-red-600/90 px-4 py-2 rounded">
            {t('terminal.disconnected')}
          </div>
        </div>
      )}

      {status === 'exited' && (
        <div
          role="alert"
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50"
        >
          <div className="text-sm text-white bg-gray-600/90 px-4 py-2 rounded">
            {t('terminal.exited', { exitCode: session?.exitCode ?? '?' })}
          </div>
        </div>
      )}
    </div>
  );
}
