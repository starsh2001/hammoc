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

/**
 * Scrollback retention (lines kept ABOVE the viewport). Story 37.11 AC5: a single block (a long tool
 * diff / reasoning) taller than the viewport scrolls its HEAD — the opening glyph the card parser keys
 * on — off the top. With `scrollback:0` that head was discarded, so the parser saw only the glyph-less
 * TAIL and could not classify the block; it fell back to the late JSONL (a screen↔file timing race).
 * Retaining scrollback lets `readGrid(scrollbackRows)` recover the head so the SCREEN stays the single
 * primary card source. The mirror is kept viewport-only via `serialize({scrollback:0})` so this
 * retention never bloats the `cli:screen-frame` payload.
 */
export const CLI_SCREEN_SCROLLBACK = 5000;

/**
 * The foreground color CLASS of a leading `●` card bullet (Story 37.10 — tool running/done).
 * The interactive claude TUI paints the card bullet in a TRUECOLOR that encodes tool status,
 * which the plain-text `readGrid()` (translateToString) discards. Verified against real frames
 * (cli-real-pty-dump): a COMPLETED tool's bullet is green (78,186,101), an IN-PROGRESS tool's
 * bullet is gray (153,153,153), and an assistant TEXT body bullet is white (255,255,255). The
 * class — not the exact RGB — is the stable signal (claude may retune the shade), so we bucket:
 *   - 'green' : tool COMPLETE / success (g clearly dominates r & b — 78,186,101)
 *   - 'red'   : tool FAILED / error (r clearly dominates g & b — 255,107,128, node-pty실측)
 *   - 'white' : assistant text body bullet (all channels high ≥200)
 *   - 'gray'  : tool RUNNING / dim (the remaining low-saturation case)
 *   - 'other' : a non-RGB / palette / default fg (older TUI or unexpected) — treated as not-green
 *   - null    : the row has no leading `●` glyph
 */
export type CliBulletColor = 'green' | 'white' | 'gray' | 'red' | 'other' | null;

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
   *
   * `scrollbackRows` (Story 37.11 AC5, default 0 = viewport-only / unchanged): when > 0, PREPEND up
   * to that many scrolled-off rows ABOVE the viewport so the card parser can read a block whose head
   * scrolled off the top. Footer detectors pass 0 (they want only the live bottom region); only the
   * card scraper passes a window.
   */
  readGrid(scrollbackRows?: number): string[];
  /** `readGrid().join('\n')` — convenience surface for line-spanning detectors. */
  readScreenText(): string;
  /**
   * Per-row foreground-color CLASS of each row's leading `●` card bullet (Story 37.10).
   * One entry per row, index-aligned with `readGrid(scrollbackRows)` for the SAME `scrollbackRows`
   * (so a caller can slice both identically). `null` where a row has no leading `●`. This is the COLOR
   * channel `readGrid()` throws away — used to read tool running(gray)/done(green) status off the
   * bullet, far more robust than the `⎿ Waiting…`/`⎿ Running…` placeholder TEXT (misread as results).
   */
  readBulletColors(scrollbackRows?: number): CliBulletColor[];
  /**
   * Serialize the CURRENT screen to a string WITH ANSI/color escapes (via the serialize
   * addon) — suitable for the client mirror to `reset()` + `write()` into an identical
   * screen. Call AFTER `flush()` so the serialized state is settled. Covers normal +
   * alternate buffers (claude TUI is a full-screen / alt-buffer app); an alt screen is
   * prefixed with the alt-buffer-enter + cursor-home sequence, which the client absorbs
   * via `reset()` before each write. Unlike `readGrid` (plain text for detectors), this
   * preserves color — it is the mirror's content source, not a detection source. VIEWPORT-ONLY
   * (`serialize({scrollback:0})`): the card parser's scrollback retention (Story 37.11 AC5) must NOT
   * bloat the mirror frame, so only the active screen is serialized (its pre-37.11 scope).
   */
  serialize(): string;
  /**
   * Story 37.11 AC3: mark the CURRENT TURN's start at the live cursor (call once, at generation
   * start). Floors `readGrid(scrollbackRows>0)`/`readBulletColors(scrollbackRows>0)` so a resume
   * boot-repaint of the prior conversation (ABOVE this mark) is excluded from the card scrape.
   * 실측 2026-06-16: registered at generation-start ⇒ ZERO prior-turn leak across FIT and overflow
   * frames (a 130-line turn-2 that scrolled the prior repaint into scrollback leaked it 0 times).
   */
  markTurnStart(): void;
  /** Dispose the underlying emulator. Idempotent-safe at the call sites (single teardown path). */
  dispose(): void;
}

/** The assistant card bullet glyph (U+25CF) — its fg color encodes tool status (Story 37.10). */
const CARD_BULLET = '●';

/**
 * Classify a `●` cell's foreground color into a {@link CliBulletColor} bucket. Only TRUECOLOR
 * (claude paints the bullet via `\x1b[38;2;r;g;bm`) carries the status signal; a non-RGB fg is
 * 'other' (not-green → treated as running, the safe default). Thresholds bucket by hue/brightness,
 * not exact RGB, so a TUI shade retune still classifies (green: g clearly dominates; white: all
 * channels bright; gray: the remaining low-saturation case). Verified RGBs: green 78,186,101 /
 * gray 153,153,153 / white 255,255,255 (cli-real-pty-dump).
 */
function classifyBulletFg(cell: { isFgRGB(): boolean; getFgColor(): number }): CliBulletColor {
  if (!cell.isFgRGB()) return 'other';
  const c = cell.getFgColor();
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  if (g - r >= 30 && g - b >= 30) return 'green'; // done — green dominates (78,186,101)
  if (r - g >= 30 && r - b >= 30) return 'red'; // failed — red dominates (255,107,128, node-pty실측)
  if (r >= 200 && g >= 200 && b >= 200) return 'white'; // assistant text body (255,255,255)
  return 'gray'; // running / dim (153,153,153) and any other low-saturation fg
}

/**
 * Create a headless screen model owning one `@xterm/headless` Terminal.
 *
 * `disableStdin: true` (we never type into this emulator — it is read-only), `scrollback:
 * CLI_SCREEN_SCROLLBACK` (Story 37.11 AC5 — retain scrolled-off lines so `readGrid(scrollbackRows)`
 * can recover the HEAD of a block taller than the viewport; was 0, which discarded the head and
 * forced the card parser to fall back to the late JSONL), and `allowProposedApi: true` (the `buffer`
 * namespace used to read the grid is proposed API in 5.x — verified to throw otherwise).
 * `Terminal.open()` is **never** called: headless has no DOM/renderer; we read the buffer model
 * directly. The mirror's `serialize()` is scoped to the viewport so this retention never bloats it.
 */
export function createCliScreenModel(
  cols: number = CLI_SCREEN_COLS,
  rows: number = CLI_SCREEN_ROWS,
): CliScreenModel {
  const terminal = new Terminal({
    cols,
    rows,
    disableStdin: true,
    scrollback: CLI_SCREEN_SCROLLBACK,
    allowProposedApi: true,
  });
  // Load the serialize addon onto the headless terminal. headless has no renderer, but
  // serialize only reads the buffer model, so `open()` is unnecessary (same as readGrid).
  // headless and addon-serialize ship separate (structurally identical) ITerminalAddon
  // types, so the load is cast through `unknown` to bridge the two module declarations.
  const serializeAddon = new SerializeAddon();
  terminal.loadAddon(serializeAddon as unknown as Parameters<typeof terminal.loadAddon>[0]);

  // Story 37.11 AC3: marks the current turn's start (set via markTurnStart at generation start). The
  // card scraper's scrollback read is FLOORED here so a resume boot-repaint of the PRIOR conversation
  // (painted into THIS turn's buffer ABOVE the mark) is never read as a live card. The marker rides
  // scroll/eviction (xterm IMarker — probe-verified). null/absent ⇒ floor 0 (read full window).
  let turnMarker: ReturnType<typeof terminal.registerMarker>;
  const turnFloor = (): number => (turnMarker && !turnMarker.isDisposed ? turnMarker.line : 0);

  return {
    write(data: string): void {
      terminal.write(data);
    },
    flush(): Promise<void> {
      return new Promise<void>((resolve) => {
        terminal.write('', resolve);
      });
    },
    readGrid(scrollbackRows = 0): string[] {
      const buffer = terminal.buffer.active;
      const grid: string[] = [];
      // The active viewport is the absolute range [baseY, baseY + rows). Story 37.11 AC5: when a
      // caller asks for scrollback, START up to `scrollbackRows` lines higher so the scrolled-off HEAD
      // of an over-tall block is included; 0 = viewport-only (unchanged). The start is clamped two ways:
      // `max(turnFloor(), …)` keeps the read AT/below the current-turn mark (AC3 — a resume repaint that
      // scrolled into scrollback ABOVE the mark is excluded), and `min(baseY, …)` keeps it AT/above baseY
      // so the VIEWPORT is ALWAYS fully read (a mark inside the viewport never hides a live card — only
      // the scrollback portion is floored). `translateToString(true)` trims trailing whitespace.
      const startY = scrollbackRows > 0 ? Math.min(buffer.baseY, Math.max(turnFloor(), buffer.baseY - scrollbackRows)) : buffer.baseY;
      for (let absY = startY; absY < buffer.baseY + rows; absY++) {
        const line = buffer.getLine(absY);
        grid.push(line ? line.translateToString(true) : '');
      }
      return grid;
    },
    readScreenText(): string {
      return this.readGrid().join('\n');
    },
    readBulletColors(scrollbackRows = 0): CliBulletColor[] {
      const buffer = terminal.buffer.active;
      const out: CliBulletColor[] = [];
      // Same window as readGrid(scrollbackRows) so the two stay index-aligned (Story 37.11 AC5).
      const startY = scrollbackRows > 0 ? Math.min(buffer.baseY, Math.max(turnFloor(), buffer.baseY - scrollbackRows)) : buffer.baseY;
      for (let absY = startY; absY < buffer.baseY + rows; absY++) {
        const line = buffer.getLine(absY);
        let cls: CliBulletColor = null;
        if (line) {
          for (let x = 0; x < cols; x++) {
            const cell = line.getCell(x);
            if (!cell) continue;
            const ch = cell.getChars();
            if (ch === CARD_BULLET) {
              cls = classifyBulletFg(cell);
              break;
            }
            // The bullet must be the LEADING glyph of the row (after indent spaces); a non-blank
            // non-bullet first glyph (e.g. `⎿`, box-drawing, prose) means this row has no card bullet.
            if (ch && ch.trim().length > 0) break;
          }
        }
        out.push(cls);
      }
      return out;
    },
    serialize(): string {
      // VIEWPORT-ONLY (Story 37.11 AC5): the card parser's scrollback retention must not bloat the
      // mirror frame, so serialize just the active screen (its pre-37.11 scope). Probe-verified: the
      // addon honors `{scrollback:0}` (default incl-scrollback payload was ~2x the viewport-only one).
      return serializeAddon.serialize({ scrollback: 0 });
    },
    markTurnStart(): void {
      // Drop a marker at the live cursor = the current turn's start. Replaces any prior mark so a
      // re-entrant call can't drift the floor downward (it must stay at the FIRST generation frame).
      turnMarker?.dispose();
      turnMarker = terminal.registerMarker(0);
    },
    dispose(): void {
      turnMarker?.dispose();
      terminal.dispose();
    },
  };
}
