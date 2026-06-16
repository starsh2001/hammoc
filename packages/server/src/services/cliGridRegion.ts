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

/**
 * The SCROLLBACK BODY — the grid rows strictly ABOVE the live footer (the inverse of `liveFooterRows`).
 * Story 37.9/37.10: the card parser (`parseGridCards`) folds a trailing non-glyph row into the open
 * card, so feeding it the spinner / input-box / mode-status footer would pollute the last card's text
 * (and, worse, fold the spinner into a thinking card). Callers therefore pass ONLY this region — the
 * "anchor to the region, not the whole screen" discipline. Cut at the bottommost live-footer anchor;
 * with no anchor at all (a pure scrollback frame) the whole grid is body.
 */
export function scrollbackBodyRows(grid: string[]): string[] {
  for (let i = grid.length - 1; i >= 0; i--) {
    if (LIVE_FOOTER_ANCHOR_RE.test(grid[i])) return grid.slice(0, i);
  }
  return grid;
}
