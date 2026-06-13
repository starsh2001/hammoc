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
 * (`CliPtyMirror.tsx`) also renders into, now via the serialized `cli:screen-frame`. The
 * emulator *applies* the cursor moves claude intended, leaving only the final grid,
 * where same-cell updates are overwrites — so fusion is **structurally impossible**.
 *
 * Story 37.1 is a *spike-bearing gate*: it adds this grid model as a **pure
 * foundation** (no production consumer is moved here yet — that is 37.2~37.4) and
 * proves real-claude frames reconstruct faithfully (GO/NO-GO). The screen model is
 * fed *unconditionally* on every turn ("reconstruct always / display-only toggle",
 * AC3) — unlike the mirror passthrough which is gated by the `cliPtyMirror` pref.
 *
 * Geometry is **120×80** — the engine passes `cols`/`rows` to `cliSessionPool.spawnClaude`
 * explicitly, matching this model and `CliPtyMirror` (COLS=120 / ROWS=80) — so the
 * coordinates claude addresses line up with what we read. (Story 37.8 raised rows 40→80 so
 * the mirror shows more of claude's screen at once.)
 *
 * API surface (intentionally thin):
 *   createCliScreenModel(cols=120, rows=40) → { write, flush, readGrid, readScreenText, serialize, dispose }
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

// @xterm/addon-serialize ships CJS as well, so it hits the same named-import caveat as
// headless above — default-import and destructure. SerializeAddon reads the buffer model
// directly (no DOM/renderer), which is exactly the `@xterm/headless` + serialize-addon
// combo xterm.js documents for server-side state capture and reconnection restore.
import serializeMod from '@xterm/addon-serialize';
const { SerializeAddon } = serializeMod;

/**
 * Default CLI terminal geometry — MUST match `cliSessionPool.spawnClaude` (the engine passes
 * these explicitly) and `CliPtyMirror` (COLS=120 / ROWS=80). claude draws its in-place redraws
 * at *these* coordinates; a mismatch desyncs the grid. (Story 37.8 raised ROWS 40→80 so the
 * mirror shows more of claude's screen at once.)
 */
export const CLI_SCREEN_COLS = 120;
export const CLI_SCREEN_ROWS = 80;

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
  /**
   * Serialize the CURRENT screen to a string WITH ANSI/color escapes (via the serialize
   * addon) — suitable for the client mirror to `reset()` + `write()` into an identical
   * screen. Call AFTER `flush()` so the serialized state is settled. Covers normal +
   * alternate buffers (claude TUI is a full-screen / alt-buffer app); an alt screen is
   * prefixed with the alt-buffer-enter + cursor-home sequence, which the client absorbs
   * via `reset()` before each write. Unlike `readGrid` (plain text for detectors), this
   * preserves color — it is the mirror's content source, not a detection source.
   */
  serialize(): string;
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
  // Load the serialize addon onto the headless terminal. headless has no renderer, but
  // serialize only reads the buffer model, so `open()` is unnecessary (same as readGrid).
  // headless and addon-serialize ship separate (structurally identical) ITerminalAddon
  // types, so the load is cast through `unknown` to bridge the two module declarations.
  const serializeAddon = new SerializeAddon();
  terminal.loadAddon(serializeAddon as unknown as Parameters<typeof terminal.loadAddon>[0]);

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
    serialize(): string {
      return serializeAddon.serialize();
    },
    dispose(): void {
      terminal.dispose();
    },
  };
}
