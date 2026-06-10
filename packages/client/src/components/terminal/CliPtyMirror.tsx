/**
 * CliPtyMirror — read-only debug mirror of the raw claude TUI screen (CLI mode).
 *
 * When the `cliPtyMirror` preference is ON *and* the effective engine is the CLI engine,
 * the server forwards every raw PTY frame (ANSI intact) over `cli:pty-raw`. This panel
 * renders those frames in a read-only xterm so the otherwise-windowless CLI engine's
 * actual screen is visible — the diagnostic surface for "a card never arrives / the
 * progress counter freezes". It is a pure observer:
 *   - input is disabled (the engine drives the PTY by injecting keystrokes itself; a key
 *     typed here must never reach claude), and
 *   - it subscribes to the socket directly and never touches chat / message state.
 *
 * Self-gating: returns null unless CLI mode + the preference are both on, so SDK-mode
 * chats and the default (preference OFF) pay nothing — the xterm is created only while
 * the panel is actually shown.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { ChevronDown, ChevronRight, Trash2, Copy, SquareTerminal } from 'lucide-react';
import { toast } from 'sonner';
import { getSocket } from '../../services/socket';
import { useTheme } from '../../hooks/useTheme';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useChatStore } from '../../stores/chatStore';
import { getXtermTheme } from './xtermTheme';

/** The actual xterm panel — mounted only when the mirror is enabled (gated by the parent). */
function MirrorPanel() {
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const { resolvedTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  // xterm init + live socket subscription. Re-runs on collapse/expand (the terminal is
  // disposed while collapsed) and on theme change. The subscription is a pure observer
  // of cli:pty-raw — write the unmodified frame straight to xterm.
  useEffect(() => {
    if (collapsed || !containerRef.current) return;

    // Pin xterm to the PTY's fixed geometry (cliSessionPool spawns 120×40). claude draws
    // its screen — including in-place redraws (cursor-addressed overwrites like the spinner's
    // "1m 36s"→"37s") — against THESE coordinates. The old FitAddon sized xterm to the panel
    // (a different column count), so every cursor move landed at the wrong spot and redraws
    // spilled into new lines instead of overwriting. We pin cols/rows and scale the FONT to
    // fit the panel instead.
    const COLS = 120;
    const ROWS = 40;
    const terminal = new Terminal({
      cols: COLS,
      rows: ROWS,
      fontSize: 11,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      scrollback: 5000,
      cursorBlink: false,
      disableStdin: true, // read-only — keystrokes here must never reach the engine's PTY
      theme: getXtermTheme(resolvedTheme),
    });
    terminal.open(containerRef.current);
    terminalRef.current = terminal;

    // Fit by FONT SIZE while cols/rows stay pinned to the PTY. monospace cell ≈ 0.6w × 1.2h
    // of the font size; pick the largest font that keeps the full 120×40 grid inside the panel.
    const fitFont = () => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      if (!w) return;
      // Size the font to the panel WIDTH so all 120 cols fit horizontally — that axis is what
      // matters for in-place redraws. The 40 rows then overflow vertically and the panel
      // scrolls; claude's active area (bottom input / spinner) stays in view.
      const fontSize = Math.max(6, Math.min(13, Math.floor(w / COLS / 0.6)));
      if (terminal.options.fontSize !== fontSize) terminal.options.fontSize = fontSize;
    };

    const socket = getSocket();
    const onRaw = (data: { chunk: string }) => terminal.write(data.chunk);
    socket.on('cli:pty-raw', onRaw);

    let rafId: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fitFont);
    });
    resizeObserver.observe(containerRef.current);
    const initRaf = requestAnimationFrame(fitFont);

    return () => {
      socket.off('cli:pty-raw', onRaw);
      resizeObserver.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      cancelAnimationFrame(initRaf);
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [collapsed, resolvedTheme]);

  const handleClear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  // Grab the whole scrollback as plain text (xterm's selection strips ANSI) so it can be
  // pasted into a chat for diagnosis — the replacement for the removed file dump.
  const handleCopy = useCallback(async () => {
    const term = terminalRef.current;
    if (!term) return;
    term.selectAll();
    const text = term.getSelection();
    term.clearSelection();
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('cliPtyMirror.copied'));
    } catch {
      toast.error(t('cliPtyMirror.copyFailed'));
    }
  }, [t]);

  return (
    <div className="border-t border-gray-300 dark:border-[#3a4d5e] bg-gray-50 dark:bg-[#1a1b26] shrink-0">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <SquareTerminal className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="font-medium">{t('cliPtyMirror.title')}</span>
        </button>
        {!collapsed && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCopy}
              title={t('cliPtyMirror.copy')}
              aria-label={t('cliPtyMirror.copy')}
              className="flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleClear}
              title={t('cliPtyMirror.clear')}
              aria-label={t('cliPtyMirror.clear')}
              className="flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      {!collapsed && <div ref={containerRef} className="w-full h-48 overflow-y-auto px-2 pb-2" />}
    </div>
  );
}

/** Self-gating entry point — render the mirror only in CLI mode with the preference ON. */
export function CliPtyMirror() {
  const engineModeOverride = useChatStore((s) => s.projectSettings?.engineModeOverride);
  const globalEngineMode = usePreferencesStore((s) => s.preferences.engineMode);
  const cliPtyMirror = usePreferencesStore((s) => s.preferences.cliPtyMirror ?? false);
  const isCliMode = (engineModeOverride ?? globalEngineMode ?? 'sdk') === 'cli';
  if (!isCliMode || !cliPtyMirror) return null;
  return <MirrorPanel />;
}
