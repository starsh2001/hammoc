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

import { liveFooterRows } from './cliGridRegion.js';

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
 * The leading elapsed clock, paren-anchored (Story 37.3 — "Xm Ys" summation). claude
 * renders the clock as the FIRST thing after the spinner's "(" — either bare seconds
 * "(9s ·" or a minute form "(1m 36s ·". Both the minute and second segments are optional
 * and captured separately; an absent segment counts as 0, so bare seconds preserve their
 * old value ("9s" → 9) and a missing clock yields 0. The "(" anchor is load-bearing: the
 * time is always rendered right after the opening paren, so anchoring keeps a counter or
 * prose number ("↓ 365 tokens", "thinking") from being mistaken for the clock.
 */
const GRID_ELAPSED_RE = /\((?:(\d+)m\s*)?(?:(\d+)s\b)?/;

/**
 * Sum the paren-anchored elapsed clock on a spinner row to integer seconds. Pure — input
 * is the rendered row, output is `minutes * 60 + seconds`. A minute form "(1m 36s ·" → 96,
 * bare seconds "(9s ·" → 9 (minutes default to 0), and a row with no clock segment → 0
 * (Story 37.3 AC3). Hour ("Xh") forms are unobserved and out of scope; if claude ever
 * renders them, the same anchored-sum pattern extends. The grid overwrites the spinner
 * cell in place, so an in-place "(1m 36s" → "(1m 37s" redraw reads as the latest value
 * (97), never a fused "136137" — fusion is structurally impossible here too.
 */
function sumElapsedSeconds(row: string): number {
  const m = GRID_ELAPSED_RE.exec(row);
  if (!m) return 0;
  const minutes = m[1] ? parseInt(m[1], 10) : 0;
  const seconds = m[2] ? parseInt(m[2], 10) : 0;
  return minutes * 60 + seconds;
}

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
  // Live region only: the spinner counter renders at the bottom of the screen, so a "↓ N tokens"
  // value QUOTED in resume-repaint scrollback can't flash a phantom counter during the pre-generation
  // thinking phase (no live counter row yet). Bottom-most (freshest) within the region wins.
  const region = liveFooterRows(grid);
  for (let y = region.length - 1; y >= 0; y--) {
    const counter = GRID_COUNTER_RE.exec(region[y]);
    if (!counter) continue;
    const raw = counter[1];
    // Normalize to an integer token count: strip thousands separators, then expand a
    // "k" suffix ("1.4k" → 1400). The grid never fuses values, so this is plain parsing.
    const tokens = /k$/i.test(raw)
      ? Math.round(parseFloat(raw.slice(0, -1).replace(/,/g, '')) * 1000)
      : parseInt(raw.replace(/,/g, ''), 10);
    if (!Number.isFinite(tokens)) return null;
    return { tokens, elapsedSeconds: sumElapsedSeconds(region[y]) };
  }
  return null;
}
