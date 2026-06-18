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
 *
 * Both arrow directions are accepted (`[↑↓]`): claude renders the counter as "↓ N tokens"
 * for some phases and "↑ N tokens" for others (실측 2026-06-14 — a long step showed
 * "↑ 95.6k tokens"). The ↓-only regex MISSED the ↑ form, so a long ↑-phase emitted no
 * progress at all and the UI looked frozen ("멈춤 vs 느림" 구분 불가). The arrow is required
 * (not optional) so a bare "N tokens" in prose can't flash a phantom counter.
 */
const GRID_COUNTER_RE = /[↑↓]\s*([\d.,]+k?)\s*tokens/i;

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
 * The THINKING-phase status segment claude renders INSIDE the spinner's paren group, AFTER the
 * token counter: "↓ 143 tokens · thinking with high effort)" / "· still thinking with high effort)"
 * (실측 2026-06-16, verbose:on AND verbose:off real PTY — `cli-verbose-on/off-long-thinking` fixtures).
 *
 * Why a *phase* flag and not a body thinking card: in verbose:true mode (Hammoc's spawn) claude paints
 * NO live thinking *content* into the screen body — only this bottom spinner advances (elapsed clock +
 * token counter + this phrase); the reasoning block lands WHOLE at completion. So the only live
 * "Claude is thinking" signal is this spinner segment. Surfacing it lets the client LABEL the
 * already-live generation-progress indicator as "Thinking…" (vs generic generation) WITHOUT inventing
 * a card from the version-fragile, region-EXCLUDED footer spinner (which `scrollbackBodyRows` drops to
 * avoid resume-repaint poisoning).
 *
 * Anchored `tokens … thinking` WITHIN the paren (`[^)]*`, no `)` crossing) so a rotating gerund word
 * BEFORE the counter (a hypothetical "Thinking…" spinner glyph) can't false-positive — only the
 * post-counter phase label counts. Effort-suffix agnostic ("with high effort" optional). A
 * response-phase row ("↓ 1.3k tokens)") carries no such segment → not thinking.
 */
const THINKING_PHASE_RE = /\btokens\b[^)]*\bthinking\b/i;

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
  /**
   * True only when this spinner frame is in the THINKING phase (status segment reads
   * "… · [still ]thinking …" after the token counter). Additive/optional — ABSENT means
   * "not a recognized thinking phase" (generic generation), so existing callers/tests that
   * read just `{ tokens, elapsedSeconds }` are unaffected. The client uses it to label the
   * live progress indicator "Thinking…" (Story 37.11 AC1, achievable tier). See THINKING_PHASE_RE.
   */
  thinking?: boolean;
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
    // Phase label rides the SAME counter row we already matched (no extra scan, same region —
    // so no new resume-poisoning surface). Set only when true to keep the shape additive.
    const thinking = THINKING_PHASE_RE.test(region[y]);
    return { tokens, elapsedSeconds: sumElapsedSeconds(region[y]), ...(thinking ? { thinking: true } : {}) };
  }
  // Fallback: no token counter yet, but an elapsed clock is on screen → emit time-only (tokens 0). claude
  // paints "(Ns ·" the moment generation starts, BEFORE the first "↓ N tokens" counter appears — without
  // this the live timer stays frozen until tokens show up (the token-less "(12s" the user saw not parsed).
  // Require a real minute/second digit (GRID_ELAPSED_RE leaves both groups undefined for a bare "("), so a
  // stray paren in prose can't flash a phantom. Bottom-most (freshest) within the live region wins.
  for (let y = region.length - 1; y >= 0; y--) {
    const m = GRID_ELAPSED_RE.exec(region[y]);
    if (m && (m[1] !== undefined || m[2] !== undefined)) {
      return { tokens: 0, elapsedSeconds: sumElapsedSeconds(region[y]) };
    }
  }
  return null;
}
