/**
 * TerminalEmulator - xterm.js wrapper component (read-only display + input bar)
 *
 * The xterm.js viewport is always read-only (disableStdin: true).
 * All user input goes through the bottom input bar, which relays
 * keystrokes to the PTY in real-time while keeping typed text visible.
 *
 * Touch selection: long-press + drag selects characters with draggable
 * handles, then a floating "Copy" popup copies the selection. Copy uses
 * a clipboard helper that falls back to execCommand in non-secure
 * contexts (e.g. phone accessing the app over http://LAN-IP), where
 * navigator.clipboard is unavailable.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { CornerDownLeft, ClipboardCopy } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../../stores/terminalStore';
import { useTheme } from '../../hooks/useTheme';
import { getXtermTheme } from './xtermTheme';

/**
 * Copy text to clipboard. Falls back to execCommand for non-secure
 * contexts (HTTP over LAN), where navigator.clipboard is undefined.
 */
function copyText(text: string): void {
  if (!text) return;
  try {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
      return;
    }
  } catch {
    /* fall through to execCommand */
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch {
    /* nothing else we can do */
  }
  document.body.removeChild(textarea);
}

const QUICK_KEYS: Array<{ label: string; seq: string; title?: string } | 'sep'> = [
  { label: '↑', seq: '\x1b[A', title: 'Up' },
  { label: '↓', seq: '\x1b[B', title: 'Down' },
  { label: '←', seq: '\x1b[D', title: 'Left' },
  { label: '→', seq: '\x1b[C', title: 'Right' },
  'sep',
  { label: 'Tab', seq: '\t' },
  { label: 'Esc', seq: '\x1b' },
  'sep',
  { label: '⌫', seq: '\x7f', title: 'Backspace' },
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

const HANDLE_SIZE = 24;

interface SelectionUI {
  sLeft: number;
  sTop: number;
  eLeft: number;
  eTop: number;
  copyLeft: number;
  copyTop: number;
}

// ===== Component =====

export interface TerminalEmulatorProps {
  terminalId: string;
  height?: string | number;
  onReady?: () => void;
}

export function TerminalEmulator({
  terminalId,
  height = '100%',
  onReady,
}: TerminalEmulatorProps) {
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isComposingRef = useRef(false);
  const justEndedCompositionRef = useRef(false);

  const { resolvedTheme } = useTheme();
  const sendInput = useTerminalStore((s) => s.sendInput);
  const resize = useTerminalStore((s) => s.resize);
  const registerDataCallback = useTerminalStore((s) => s.registerDataCallback);
  const session = useTerminalStore((s) => s.terminals.get(terminalId));
  const status = session?.status ?? null;
  const fontSize = useTerminalStore((s) => s.fontSize);

  // Touch selection UI (handles + copy popup positions)
  const [selUI, setSelUI] = useState<SelectionUI | null>(null);
  const hasSelectionRef = useRef(false);
  const draggingRef = useRef<'start' | 'end' | null>(null);
  const selSRef = useRef({ col: 0, row: 0 });
  const selERef = useRef({ col: 0, row: 0 });

  useEffect(() => {
    if (inputRef.current) inputRef.current.value = '';
    isComposingRef.current = false;
    justEndedCompositionRef.current = false;
    hasSelectionRef.current = false;
    setSelUI(null);
  }, [terminalId]);

  // Toolbar copy button: selection if any, otherwise whole terminal
  const handleToolbarCopy = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    let text = terminal.getSelection();
    if (!text) {
      terminal.selectAll();
      text = terminal.getSelection();
      terminal.clearSelection();
    } else {
      terminal.clearSelection();
    }
    copyText(text);
    setSelUI(null);
  }, []);

  // Floating popup copy: copy current selection, then dismiss
  const handlePopupCopy = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    copyText(terminal.getSelection());
    terminal.clearSelection();
    setSelUI(null);
  }, []);

  const sendKey = useCallback(
    (seq: string) => {
      const s = useTerminalStore.getState().terminals.get(terminalId);
      if (s?.status !== 'connected') return;
      sendInput(terminalId, seq);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [sendInput, terminalId]
  );

  const handleSend = useCallback(() => {
    const s = useTerminalStore.getState().terminals.get(terminalId);
    if (s?.status !== 'connected') return;
    sendInput(terminalId, '\r');
    if (inputRef.current) inputRef.current.value = '';
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [sendInput, terminalId]);

  // Key-relay model: each keystroke is sent to PTY immediately.
  // The input bar stays empty except during IME composition.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;

      const s = useTerminalStore.getState().terminals.get(terminalId);
      if (s?.status !== 'connected') return;

      // Printable character → send + prevent (input stays empty)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        sendInput(terminalId, e.key);
        return;
      }

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          sendInput(terminalId, '\r');
          break;
        case 'Backspace':
          e.preventDefault();
          sendInput(terminalId, '\x7f');
          break;
        case 'Delete':
          e.preventDefault();
          sendInput(terminalId, '\x1b[3~');
          break;
        case 'Tab':
          e.preventDefault();
          sendInput(terminalId, '\t');
          break;
        case 'Escape':
          e.preventDefault();
          sendInput(terminalId, '\x1b');
          break;
        case 'ArrowUp':
          e.preventDefault();
          sendInput(terminalId, '\x1b[A');
          break;
        case 'ArrowDown':
          e.preventDefault();
          sendInput(terminalId, '\x1b[B');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          sendInput(terminalId, '\x1b[D');
          break;
        case 'ArrowRight':
          e.preventDefault();
          sendInput(terminalId, '\x1b[C');
          break;
        case 'Home':
        case 'End':
          e.preventDefault();
          break;
        default:
          if (e.ctrlKey || e.metaKey) {
            const k = e.key.toLowerCase();
            const isCtrl = e.ctrlKey && !e.metaKey;

            if (k === 'c') {
              e.preventDefault();
              const sel = terminalRef.current?.getSelection();
              if (sel) {
                copyText(sel);
                terminalRef.current?.clearSelection();
                setSelUI(null);
              } else if (isCtrl) {
                sendInput(terminalId, '\x03');
              }
            } else if (k === 'd' && isCtrl) {
              e.preventDefault();
              sendInput(terminalId, '\x04');
            } else if (k === 'z' && isCtrl) {
              e.preventDefault();
              sendInput(terminalId, '\x1a');
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
      }
    },
    [sendInput, terminalId]
  );

  // onChange only fires for IME composition display and post-composition
  // spillover (e.g. the space that triggered compositionEnd, or paste).
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isComposingRef.current) return;
      const input = e.target as HTMLInputElement;
      if (justEndedCompositionRef.current) {
        justEndedCompositionRef.current = false;
        input.value = '';
        return;
      }
      // Paste or post-composition character (e.g. space)
      if (input.value) {
        const s = useTerminalStore.getState().terminals.get(terminalId);
        if (s?.status === 'connected') sendInput(terminalId, input.value);
        input.value = '';
      }
    },
    [sendInput, terminalId]
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      isComposingRef.current = false;
      const input = e.target as HTMLInputElement;
      if (input.value) {
        const s = useTerminalStore.getState().terminals.get(terminalId);
        if (s?.status === 'connected') sendInput(terminalId, input.value);
      }
      input.value = '';
      justEndedCompositionRef.current = true;
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

    if (terminal.textarea) {
      terminal.textarea.setAttribute('inputmode', 'none');
      terminal.textarea.setAttribute('tabindex', '-1');
      terminal.textarea.style.pointerEvents = 'none';
    }

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

    // ── Touch selection (long-press + drag) ──────────────────────
    const container = containerRef.current;
    const LONG_PRESS_MS = 400;
    const MOVE_THRESHOLD = 10;
    let touchTimer: ReturnType<typeof setTimeout> | null = null;
    let selecting = false;
    let touchActive = false;
    let tStartX = 0;
    let tStartY = 0;

    const toCell = (cx: number, cy: number) => {
      const r = container.getBoundingClientRect();
      const cw = r.width / terminal.cols;
      const ch = r.height / terminal.rows;
      const col = Math.max(0, Math.min(Math.floor((cx - r.left) / cw), terminal.cols - 1));
      const vr = Math.max(0, Math.min(Math.floor((cy - r.top) / ch), terminal.rows - 1));
      return { col, row: terminal.buffer.active.viewportY + vr };
    };

    const refreshUI = () => {
      const sS = selSRef.current;
      const sE = selERef.current;
      let s = sS, e = sE;
      if (s.row > e.row || (s.row === e.row && s.col > e.col)) { s = sE; e = sS; }
      const len = s.row === e.row
        ? e.col - s.col + 1
        : (terminal.cols - s.col) + (e.row - s.row - 1) * terminal.cols + (e.col + 1);
      terminal.select(s.col, s.row, len);

      const r = container.getBoundingClientRect();
      const cw = r.width / terminal.cols;
      const ch = r.height / terminal.rows;
      const vy = terminal.buffer.active.viewportY;
      const half = HANDLE_SIZE / 2;
      const midX = (s.col * cw + (e.col + 1) * cw) / 2;
      setSelUI({
        sLeft: s.col * cw - half,
        sTop: (s.row - vy + 1) * ch,
        eLeft: (e.col + 1) * cw - half,
        eTop: (e.row - vy + 1) * ch,
        copyLeft: Math.max(28, Math.min(midX, r.width - 28)),
        copyTop: Math.max(2, (s.row - vy) * ch - 38),
      });
      hasSelectionRef.current = true;
    };

    const isWordCol = (line: ReturnType<typeof terminal.buffer.active.getLine>, col: number): boolean => {
      if (!line || col < 0 || col >= terminal.cols) return false;
      const c = line.getCell(col);
      if (!c) return false;
      if (c.getWidth() === 0) return true; // second half of a wide char (CJK)
      const ch = c.getChars();
      return ch.length > 0 && !/\s/.test(ch);
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      tStartX = t.clientX;
      tStartY = t.clientY;
      selecting = false;
      touchActive = true;

      if (hasSelectionRef.current) {
        hasSelectionRef.current = false;
        terminal.clearSelection();
        setSelUI(null);
      }

      touchTimer = setTimeout(() => {
        if (!touchActive) return;
        selecting = true;
        const cell = toCell(t.clientX, t.clientY);
        const line = terminal.buffer.active.getLine(cell.row);
        let wStart = cell.col;
        let wEnd = cell.col;

        // If on the empty second half of a wide char, back up
        if (!isWordCol(line, wStart) && isWordCol(line, wStart - 1)) wStart--;
        wEnd = wStart;

        if (isWordCol(line, wStart)) {
          while (isWordCol(line, wStart - 1)) wStart--;
          while (isWordCol(line, wEnd + 1)) wEnd++;
          // Include the second cell of a trailing wide character
          const ec = line?.getCell(wEnd);
          if (ec && (ec.getWidth() > 1)) wEnd++;
        }
        selSRef.current = { col: wStart, row: cell.row };
        selERef.current = { col: wEnd, row: cell.row };
        refreshUI();
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];

      if (draggingRef.current) {
        e.preventDefault();
        const cell = toCell(t.clientX, t.clientY);
        if (draggingRef.current === 'start') selSRef.current = { ...cell };
        else selERef.current = { ...cell };
        refreshUI();
        return;
      }

      if (!selecting) {
        if (Math.abs(t.clientX - tStartX) > MOVE_THRESHOLD ||
            Math.abs(t.clientY - tStartY) > MOVE_THRESHOLD) {
          if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
        }
        return;
      }
      e.preventDefault();
      const cell = toCell(t.clientX, t.clientY);
      selERef.current = { ...cell };
      refreshUI();
    };

    const onTouchEnd = () => {
      touchActive = false;
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
      draggingRef.current = null;
      selecting = false;
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);

    // Hide popup/handles when selection clears or terminal scrolls
    const selDisp = terminal.onSelectionChange(() => {
      if (!terminal.hasSelection()) {
        hasSelectionRef.current = false;
        setSelUI(null);
      }
    });
    const scrollDisp = terminal.onScroll(() => {
      hasSelectionRef.current = false;
      setSelUI(null);
      terminal.clearSelection();
    });

    let initRafId: number | null = null;
    initRafId = requestAnimationFrame(() => {
      initRafId = null;
      fitAndResize();
      onReady?.();
    });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
      if (touchTimer) clearTimeout(touchTimer);
      selDisp.dispose();
      scrollDisp.dispose();
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
      <div ref={containerRef} className="relative w-full flex-1 min-h-0" />

      {/* Touch selection handles + floating copy popup */}
      {selUI && (
        <>
          <div
            className="absolute w-6 h-6 rounded-full bg-blue-500 border-2 border-white z-20"
            style={{
              left: selUI.sLeft,
              top: selUI.sTop,
              boxShadow: '0 1px 4px rgba(0,0,0,.35)',
              touchAction: 'none',
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              draggingRef.current = 'start';
            }}
          />
          <div
            className="absolute w-6 h-6 rounded-full bg-blue-500 border-2 border-white z-20"
            style={{
              left: selUI.eLeft,
              top: selUI.eTop,
              boxShadow: '0 1px 4px rgba(0,0,0,.35)',
              touchAction: 'none',
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              draggingRef.current = 'end';
            }}
          />
          <button
            type="button"
            className="absolute z-20 flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-gray-900/95 dark:bg-gray-700 rounded-lg active:bg-gray-800"
            style={{
              left: selUI.copyLeft,
              top: selUI.copyTop,
              transform: 'translateX(-50%)',
              boxShadow: '0 2px 10px rgba(0,0,0,.4)',
              touchAction: 'none',
            }}
            onClick={handlePopupCopy}
          >
            <ClipboardCopy className="w-4 h-4" />
            {t('terminal.copyAction')}
          </button>
        </>
      )}

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
              onClick={handleToolbarCopy}
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
