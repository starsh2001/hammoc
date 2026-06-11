/**
 * CLI Screen Model (Epic 37 — Story 37.1)
 *
 * A thin server-side **headless terminal** that reconstructs the *final screen grid*
 * the interactive `claude` TUI paints into its PTY. The CLI engine's existing
 * extraction (Story 32.7 spinner / 32.6 permission / 32.8 question / usage-limit)
 * runs regex over a **linear** ANSI-stripped buffer (`stripAnsiForDetect` →
 * `progressBuffer` etc.). A linear buffer has no cursor-movement information, so a
 * counter that claude *overwrites in place* (the spinner's "365" → "366" on the same
 * column) gets **concatenated** ("365" + "366" → "365366" fusion). The accumulated
 * workarounds (digit caps, implausible-jump guards) only paper over that.
 *
 * This model feeds the raw PTY frames (ANSI intact) into a real `@xterm/headless`
 * `Terminal` — the **same terminal core** (`@xterm/xterm` 5.5.x) the client mirror
 * (`CliPtyMirror.tsx`) already renders the identical `cli:pty-raw` stream with. The
 * emulator *applies* the cursor moves claude intended, leaving only the final grid,
 * where same-cell updates are overwrites — so fusion is **structurally impossible**.
 *
 * Story 37.1 is a *spike-bearing gate*: it adds this grid model as a **pure
 * foundation** (no production consumer is moved here yet — that is 37.2~37.4) and
 * proves real-claude frames reconstruct faithfully (GO/NO-GO). The screen model is
 * fed *unconditionally* on every turn ("reconstruct always / display-only toggle",
 * AC3) — unlike the mirror passthrough which is gated by the `cliPtyMirror` pref.
 *
 * Geometry is **120×40 fixed** — identical to `cliSessionPool.spawnClaude`
 * (`cols ?? 120` / `rows ?? 40`) and `CliPtyMirror` (COLS=120 / ROWS=40) — so the
 * coordinates claude addresses line up with what we read.
 *
 * API surface (intentionally thin):
 *   createCliScreenModel(cols=120, rows=40) → { write, flush, readGrid, readScreenText, dispose }
 *
 * @see docs/stories/37.1.story.md
 * [Source: docs/prd/epic-37-cli-terminal-emulation.md#story-371]
 */

// `@xterm/headless` ships CommonJS; under Node ESM the named export `Terminal`
// is not detected by the cjs-module-lexer, so a named import
// (`import { Terminal } from ...`) fails at runtime. The default import resolves
// to the module's `module.exports`, off which `Terminal` is destructured.
// (Verified empirically — not assumed; see Story 37.1 Task 1.)
import headless from '@xterm/headless';
const { Terminal } = headless;

/**
 * Default CLI terminal geometry — MUST match `cliSessionPool.spawnClaude`
 * (`cols ?? 120` / `rows ?? 40`) and `CliPtyMirror` (COLS=120 / ROWS=40). claude
 * draws its in-place redraws at *these* coordinates; a mismatch desyncs the grid.
 */
export const CLI_SCREEN_COLS = 120;
export const CLI_SCREEN_ROWS = 40;

/** The screen model's read/write surface consumed by later stories (37.2~37.4). */
export interface CliScreenModel {
  /**
   * Feed a raw PTY frame (ANSI intact) straight into the emulator. **No linear
   * strip** — the whole point is that the emulator *interprets* the ANSI. Cheap and
   * fire-and-forget: xterm buffers the write and parses it asynchronously, so the
   * grid is not guaranteed settled until `flush()` resolves.
   */
  write(data: string): void;
  /**
   * Resolve once every preceding `write` has been parsed into the buffer. xterm's
   * write pipeline is asynchronous/buffered (verified — an immediate read after
   * `write` returns the pre-write grid), so a reader that needs a *settled* grid
   * must `await flush()` first. Implemented via xterm's own write callback (writes
   * are FIFO, so an empty write's callback fires after all prior writes are parsed).
   */
  flush(): Promise<void>;
  /**
   * The active screen (viewport) as one trimmed string per row — exactly `rows`
   * entries, blank rows included as ''. Later detectors (37.2~37.4) scan these rows
   * for the spinner line / modal box / permission-mode status row.
   */
  readGrid(): string[];
  /** `readGrid().join('\n')` — convenience surface for line-spanning detectors. */
  readScreenText(): string;
  /** Dispose the underlying emulator. Idempotent-safe at the call sites (single teardown path). */
  dispose(): void;
}

/**
 * Create a headless screen model owning one `@xterm/headless` Terminal.
 *
 * `disableStdin: true` (we never type into this emulator — it is read-only), a
 * tiny `scrollback` (only the active grid matters; lines scrolled off are discarded
 * so the viewport always reflects the *current* screen), and `allowProposedApi:
 * true` (the `buffer` namespace used to read the grid is proposed API in 5.x —
 * verified to throw otherwise). `Terminal.open()` is **never** called: headless has
 * no DOM/renderer; we read the buffer model directly.
 */
export function createCliScreenModel(
  cols: number = CLI_SCREEN_COLS,
  rows: number = CLI_SCREEN_ROWS,
): CliScreenModel {
  const terminal = new Terminal({
    cols,
    rows,
    disableStdin: true,
    scrollback: 0,
    allowProposedApi: true,
  });

  return {
    write(data: string): void {
      terminal.write(data);
    },
    flush(): Promise<void> {
      return new Promise<void>((resolve) => {
        terminal.write('', resolve);
      });
    },
    readGrid(): string[] {
      const buffer = terminal.buffer.active;
      const grid: string[] = [];
      // The active viewport is rows [baseY, baseY + rows). `translateToString(true)`
      // trims trailing whitespace so a row reads as the text claude left on it.
      for (let y = 0; y < rows; y++) {
        const line = buffer.getLine(buffer.baseY + y);
        grid.push(line ? line.translateToString(true) : '');
      }
      return grid;
    },
    readScreenText(): string {
      return this.readGrid().join('\n');
    },
    dispose(): void {
      terminal.dispose();
    },
  };
}
