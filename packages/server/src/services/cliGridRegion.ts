/**
 * Shared "live footer region" helper for the CLI settled-grid readers (Epic 37).
 *
 * claude's interactive UI — the idle input box, the generation spinner + "↓ N tokens" / "esc to
 * interrupt" footer, the mode status row, and a selection box's nav/cancel footer — all render flush
 * at the BOTTOM of the screen. Restricting the live-state regexes to this region is the "anchor to
 * the live footer, not the scrollback body" discipline shared by the grid readers: it stops a
 * resume-repaint whose prior answer QUOTED any of those markers in the transcript body from
 * masquerading as a live signal.
 *
 * 실측 2026-06-13: a long answer that *discussed* the CLI spinner ("esc to interrupt" / "↓N tokens")
 * was repainted into the scrollback on resume; the old whole-screen scan matched the quoted phrases,
 * read the idle input box as "generating", returned `unknown` from the pre-injection classifier, and
 * the next turn's prompt was withheld → the turn was lost. Anchoring the readers to the bottom region
 * removes that whole class (idle/generation gate, mode-row read, spinner counter).
 *
 * Uses the last NON-EMPTY rows so trailing blank rows below the box don't shrink the window.
 * Version-fragile like the rest of the CLI screen readers (the bottom UI height can shift across
 * claude TUI revisions), but a strict improvement over scanning the whole screen.
 */

/** How many bottom non-empty rows count as the live UI cluster (box + spinner/footer + status row). */
export const CLI_LIVE_FOOTER_ROWS = 8;

/** The last non-empty rows of a settled grid — the live UI cluster. Empties are dropped first so a
 *  few blank rows below the input box don't push the box out of the window. */
export function liveFooterRows(grid: string[]): string[] {
  const nonEmpty = grid.filter((row) => row.trim().length > 0);
  return nonEmpty.slice(-CLI_LIVE_FOOTER_ROWS);
}

/** `liveFooterRows` joined with '\n', for the line-spanning existence regexes. */
export function liveFooterText(grid: string[]): string {
  return liveFooterRows(grid).join('\n');
}

/**
 * The bottommost live-footer anchor: claude's generation spinner ("… esc to interrupt" / a
 * "↓/↑ N tokens" counter) or the idle input-box prompt glyph (`❯`). The footer always renders flush
 * at the BOTTOM, so the BOTTOMMOST match is the live footer (a scrollback line that merely *quotes*
 * one of these markers sits above it — the same ISSUE-99 anti-poisoning discipline as the readers).
 */
const LIVE_FOOTER_ANCHOR_RE = /esc to interrupt|[↑↓]\s*[\d.,]+\s*k?\s*tokens|❯/i;

/** A pure box-drawing rule row (the input-box top/bottom border `────`, corners, sides) — chrome that
 *  is part of the live-footer cluster, never a content card. */
const BOX_RULE_RE = /^[─╭╮╰╯│]+$/;

/**
 * The SCROLLBACK BODY — the grid rows strictly ABOVE the live footer CLUSTER (the inverse of
 * `liveFooterRows`). Story 37.9/37.10: the card parser (`parseGridCards`) folds a trailing non-glyph
 * row into the open card, so feeding it the footer would pollute the last card — and, worse, fold the
 * live spinner (whose `Ns`/`↓N tokens` counters change every frame) into a thinking card, making its
 * text churn and re-emit endlessly (실측 2026-06-16).
 *
 * During generation claude renders the footer as a CLUSTER of contiguous rows — the spinner
 * (`↓N tokens`), the input box (`────` / `❯` / `────`), the `esc to interrupt` row, then the mode/effort
 * status row at the very bottom. Cutting at only the BOTTOM-most anchor leaves the spinner (the
 * cluster's TOP) inside the body. So: find the bottom-most anchor, then walk UP through the contiguous
 * cluster (anchor rows + box-rule chrome — claude draws no blank WITHIN it) to the cluster top, and cut
 * there. Anything below (incl. the variable status row) is excluded; a blank or content row above the
 * cluster ends the walk and stays in the body. No anchor at all ⇒ a pure scrollback frame ⇒ all body.
 */
export function scrollbackBodyRows(grid: string[]): string[] {
  let bottom = -1;
  for (let i = grid.length - 1; i >= 0; i--) {
    if (LIVE_FOOTER_ANCHOR_RE.test(grid[i])) { bottom = i; break; }
  }
  if (bottom < 0) return grid;
  const isCluster = (r: string) => LIVE_FOOTER_ANCHOR_RE.test(r) || BOX_RULE_RE.test(r.trim());
  let top = bottom;
  let i = bottom - 1;
  while (i >= 0) {
    if (isCluster(grid[i])) { top = i; i--; continue; }
    if (grid[i].trim() === '') {
      // A blank belongs to the cluster only if footer chrome continues ABOVE it (claude pads between
      // the spinner and the input box); a blank with CONTENT above it is a body↔footer separator and
      // stays in the body. Peek past the blank run.
      let j = i - 1;
      while (j >= 0 && grid[j].trim() === '') j--;
      if (j >= 0 && isCluster(grid[j])) { top = j; i = j - 1; continue; }
    }
    break; // content row (or a separator blank) → the cluster ends here
  }
  return grid.slice(0, top);
}
