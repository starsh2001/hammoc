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
