/**
 * CLI spinner-progress grid reader (Epic 37 — Story 37.2)
 *
 * Reads the generation "↓ N tokens" counter (and the optional leading "(Ns ·" elapsed
 * clock) from a *settled screen grid* produced by the headless screen model (Story
 * 37.1). This is the token data source that replaces the linear ANSI-stripped buffer
 * scan: claude overwrites the spinner counter **in place** (the same screen cell), so a
 * settled grid carries one final value per row — the "365" + "366" → "365366" fusion
 * the linear path suffered is **structurally impossible**, and the old fusion-defense
 * guards (digit cap, malformed-grouping, implausible-jump) are no longer needed.
 *
 * Pure — input is the grid rows, output is the parsed progress or null. The CLI engine
 * schedules a `flush()` and then calls this on the settled grid; the callback contract
 * (`{ tokens, elapsedSeconds }`, emit-on-change) is unchanged.
 *
 * @see docs/stories/37.2.story.md
 * [Source: docs/prd/epic-37-cli-terminal-emulation.md#story-372]
 */

/**
 * The spinner counter as RENDERED in the grid. Captures both the raw ("↓ 108 tokens")
 * and abbreviated ("↓ 1.4k tokens") shapes claude paints — matching the Story 37.1
 * realframes counter regex `↓ ?[\d.,]+k? tokens`. The old linear CLI_PROGRESS_RE used
 * `[\d,]+`, which breaks at `.`/`k` and so MISSED the abbreviated form entirely; reading
 * the grid lets us capture it. The rotating glyph word (Flowing…/Crunched/Brewed/
 * Moseying…) is deliberately NOT part of the match — it is version-fragile, so the row
 * is identified by the counter alone.
 */
const GRID_COUNTER_RE = /↓\s*([\d.,]+k?)\s*tokens/i;

/**
 * The leading elapsed clock, paren-anchored — identical to the old linear time group
 * `\((\d+)\s*s\b`. A minute form "(1m 36s ·" does NOT match (the char after "(" is "1m",
 * not digits+s) and falls through to 0, preserving CURRENT behavior. Accurate "Xm Ys"
 * summation is Story 37.3's responsibility — out of scope here, so the format is not
 * changed and an unparsed clock yields 0.
 */
const GRID_ELAPSED_RE = /\((\d+)\s*s\b/;

export interface SpinnerProgress {
  tokens: number;
  elapsedSeconds: number;
}

/**
 * Read the freshest spinner counter from a settled screen grid. Returns null when no
 * counter row is present (e.g. a thinking-phase spinner with no "↓ N tokens") — the
 * caller treats null as "no emit", preserving the false-0 guard.
 *
 * Since claude overwrites the same cell, a settled grid has at most one counter row; if
 * more than one matches, the BOTTOM-most (freshest rendered) row wins. Rows are never
 * merged or concatenated — a single row already holds the whole current value.
 */
export function readSpinnerProgress(grid: string[]): SpinnerProgress | null {
  for (let y = grid.length - 1; y >= 0; y--) {
    const counter = GRID_COUNTER_RE.exec(grid[y]);
    if (!counter) continue;
    const raw = counter[1];
    // Normalize to an integer token count: strip thousands separators, then expand a
    // "k" suffix ("1.4k" → 1400). The grid never fuses values, so this is plain parsing.
    const tokens = /k$/i.test(raw)
      ? Math.round(parseFloat(raw.slice(0, -1).replace(/,/g, '')) * 1000)
      : parseInt(raw.replace(/,/g, ''), 10);
    if (!Number.isFinite(tokens)) return null;
    const elapsed = GRID_ELAPSED_RE.exec(grid[y]);
    return { tokens, elapsedSeconds: elapsed ? parseInt(elapsed[1], 10) : 0 };
  }
  return null;
}
