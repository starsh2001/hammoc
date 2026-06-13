/**
 * CLI modal/usage-limit grid detectors (Epic 37 — Story 37.4)
 *
 * Pure readers for the permission dialog (Story 32.6), the AskUserQuestion selection
 * modal (Story 32.8), and the subscription usage-limit notice — moved here, *input
 * source switched from a linear ANSI-stripped buffer to the settled screen grid*
 * produced by the headless screen model (Story 37.1). This is the final extraction
 * surface to leave the linear path: Stories 37.2/37.3 already moved the spinner
 * progress reader (`cliSpinnerProgress`), and once these modal/limit consumers read
 * the grid, the linear `stripAnsiForDetect` + rolling-buffer skeleton is deleted (37.4).
 *
 * Why the grid matters here (the 32.8 box-chrome fix): claude paints the modal with
 * *box-drawing borders* (┌─┐ │ └─┘) and *in-place overwrites*. A linear buffer has no
 * 2D coordinates, so box glyphs fused into option labels ("│"-laden / "──────"-stretched
 * rows) and same-cell redraws concatenated. The screen grid *applies* claude's cursor
 * moves, so **each option lands on its own row** — a per-row read keeps every label
 * intact and fusion is structurally impossible. The per-row `stripBoxChrome` still trims
 * the left/right border cells, but rows no longer fuse, so the label body survives.
 *
 * Two input shapes, same settled grid:
 *   - *Existence* detectors (`detectPermissionDialog` / `detectUsageLimit` /
 *     `detectQuestionModal`) and the verb/sentence scrapes (`extractToolName` /
 *     `extractPromptSentence`) run line-spanning regex → they take `readScreenText()`
 *     (the grid joined with '\n').
 *   - *Row-structure* parsers (`parseQuestionModal` / `parsePrecedingText`) read the
 *     grid ROWS (`readGrid()` → string[]) directly — reading rows is the whole point of
 *     the box-chrome fix.
 *
 * Pure by construction (no node-pty / no engine state), so the screen-less unit tests
 * exercise them with hand-built grid rows — the pattern Stories 37.2/37.3 established
 * with `readSpinnerProgress`. Still version-fragile (a TUI revision could reword the
 * footers/phrases or change the box layout); the grid removes the *fusion / box-chrome*
 * failure mode, not the wording fragility.
 *
 * @see docs/stories/37.4.story.md
 * [Source: docs/prd/epic-37-cli-terminal-emulation.md#story-374]
 */

import type { PermissionMode } from '@hammoc/shared';
import { liveFooterRows, liveFooterText } from './cliGridRegion.js';

/** A single scraped AskUserQuestion choice (Story 32.8 — single-question scope). */
export interface ParsedQuestion {
  question: string;
  header?: string;
  multiSelect: boolean;
  options: Array<{ label: string }>;
}

/** "Chat about this" is auto-appended to every AskUserQuestion modal — a marker unique to
 *  it (absent from the permission dialog and other selection menus), used to disambiguate. */
const CLI_QUESTION_AFFORDANCE_RE = /Chat about this/i;

/** The terminal box-drawing / block range (U+2500–U+259F: ─ │ ┌ ▏ …). */
const BOX_CHROME_RE = /[─-▟]/g;

/**
 * Conservative permission-dialog matcher. Requires a permission-specific phrase
 * AND the fully-rendered footer ("Esc to cancel" / "Tab to amend") so a half-drawn
 * dialog, a spinner, or the echoed prompt can never match — a false positive would
 * inject a stray Enter/Esc and corrupt the session. On the grid a half-drawn dialog
 * simply has no footer row yet, so the AND-of-footer naturally withholds detection
 * until the modal is fully painted. The dialog chrome renders in English regardless of
 * the model's reply language (observed); a future TUI revision could change these
 * strings (documented version-fragility).
 */
export function detectPermissionDialog(text: string): boolean {
  const hasPermPhrase =
    /Yes,\s*allow all edits/i.test(text) ||
    /Do you want to (?:create|make|write|edit|update|apply|run|execute|read|proceed|allow)/i.test(text);
  const hasFooter = /Esc\b[^\n]{0,16}\bcancel\b/i.test(text) || /Tab\b[^\n]{0,16}\bamend\b/i.test(text);
  return hasPermPhrase && hasFooter;
}

/**
 * Detect the subscription **usage-limit exhaustion** notice on the screen and return its
 * scraped sentence (else null). Why this exists: the interactive TUI prints "You've hit your
 * weekly limit · resets 1am (Asia/Seoul)" ONLY on screen — it is NEVER written to the session
 * JSONL — so the JSONL watch (how every other turn-completion is detected) never sees it and the
 * turn would otherwise hang forever waiting for an `end_turn` that never comes. Detecting it lets
 * the engine fail fast with the exact message claude showed (including the reset time).
 *
 * Conservative by construction so it can never stop a healthy turn:
 *   - requires an exhaustion verb (hit/reached/exceeded) OR "<window> limit reached",
 *   - requires an explicit window qualifier (weekly / 5-hour / daily / usage / session),
 *   - requires a nearby "reset" clause (the real notice always has one),
 *   - and explicitly EXCLUDES the still-usable percentage warning ("used 97% of your weekly
 *     limit") — at 97% generation continues, so that must NOT stop the turn.
 * The call site adds the OAuth-usage corroboration + POST-INJECTION gating (preserved in the
 * engine dispatch). Version-fragile (a TUI revision could reword these) — the same documented
 * constraint as the permission/question detectors, which also read screen *state*.
 */
export function detectUsageLimit(text: string): string | null {
  const m = text.match(
    /(?:hit|reached|exceeded)\s+your\s+(?:weekly|5-hour|daily|usage|session)\s+limit\b[^\n]{0,60}|(?:weekly|usage|5-hour|daily|session)\s+limit\s+(?:reached|exceeded)\b[^\n]{0,60}/i,
  );
  if (!m) return null;
  if (/\bused\s+\d+\s*%/i.test(m[0])) return null; // percentage warning — still usable, don't stop
  if (!/\breset/i.test(m[0])) return null; // require the reset clause for confidence
  return m[0].replace(/\s{2,}/g, ' ').trim().slice(0, 160);
}

/**
 * Best-effort tool name from the dialog's question verb (screen scrape — low
 * fidelity; the structured tool name is not in the JSONL until after approval).
 */
export function extractToolName(text: string): string {
  const verb = (text.match(/Do you want to (\w+)/i)?.[1] ?? '').toLowerCase();
  if (/^(create|write|make)$/.test(verb)) return 'Write';
  if (/^(edit|update|apply|modify|change)$/.test(verb)) return 'Edit';
  if (/^(run|execute)$/.test(verb)) return 'Bash';
  if (/^(read|view)$/.test(verb)) return 'Read';
  if (/^(fetch|access)$/.test(verb)) return 'WebFetch';
  // Secondary hint: the tool header line "● Write(…)".
  return text.match(/[●·]\s*([A-Z][a-zA-Z]+)\s*\(/)?.[1] ?? 'Tool';
}

/** Best-effort human-readable prompt sentence (the dialog's own words). */
export function extractPromptSentence(text: string): string {
  return (text.match(/Do you want to [^?\n]{1,160}\?/i)?.[0] ?? 'Claude is requesting tool permission').trim();
}

/**
 * Conservative AskUserQuestion-modal matcher (Story 32.8). Requires the selection footer
 * ("Enter to select" + "↑/↓ to navigate") AND the auto-appended "Chat about this"
 * affordance — together unique to the question modal and absent from a permission dialog
 * ("Do you want to…" / "Yes, allow all edits", which has no list navigation) and from
 * ordinary output, so neither can false-trigger a stray keypress. `detectPermissionDialog`
 * is checked first and is mutually exclusive (it needs a permission phrase this modal lacks;
 * this needs "to navigate" the dialog lacks), so the two never cross-fire. Version-fragile
 * (a TUI revision could reword these) — the documented constrained surface.
 */
export function detectQuestionModal(text: string): boolean {
  const hasNavFooter = /Enter\b[^\n]{0,12}\bselect\b/i.test(text) && /to\s+navigate/i.test(text);
  return hasNavFooter && CLI_QUESTION_AFFORDANCE_RE.test(text);
}

/** Index of the LAST grid row matching `re`, or -1. (The footer sits at the bottom of the modal.) */
function lastRowMatching(rows: string[], re: RegExp): number {
  for (let i = rows.length - 1; i >= 0; i--) if (re.test(rows[i])) return i;
  return -1;
}

/** Strip box-drawing / block chrome from a row, collapse runs to one space, trim (a chrome-only
 *  row collapses to ''). Each option is its OWN grid row, so this only removes the border cells —
 *  the label body no longer fuses with a neighbour the way the linear buffer fused them (32.8). */
function stripBoxChrome(s: string): string {
  return s.replace(BOX_CHROME_RE, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Scrape one question + its options from the modal's screen ROWS (Story 32.8 — low fidelity,
 * the documented constraint; Story 37.4 — reads the settled grid rows instead of a linear
 * buffer). The grid renders **each option on its own row**, so the box-chrome that used to fuse
 * into labels is now confined to each row's border cells and `stripBoxChrome` removes it cleanly
 * (the "│"-laden / "──────"-stretched labels of the 32.8 bug report are structurally gone).
 *
 * Returns null when it cannot build a usable *single*-question structure — no options, or a
 * **multi-question** tabbed modal (more than one header ballot-box tab) which this constrained
 * bridge does not drive (the caller then cancels with Esc). Crucially the scrape order equals the
 * grid row order (top-to-bottom), which equals the ↓-count used to drive the answer, so the
 * option↔index mapping is self-consistent — the grid only *strengthens* this (row order IS the
 * navigation index).
 */
export function parseQuestionModal(rows: string[]): ParsedQuestion | null {
  const footerIdx = lastRowMatching(rows, /to\s+navigate/i);
  if (footerIdx < 0) return null;
  // The modal sits directly above the footer. Bound the scan to the rendered box by starting at
  // its header ballot-box tab row (☐/☒) when present, so lead-in prose far above cannot leak in.
  const region = rows.slice(0, footerIdx);
  const headerIdx = region.findIndex((r) => /[☐☒]/.test(r));
  const modalRows = headerIdx >= 0 ? region.slice(headerIdx) : region;
  // Multi-question modals show >1 ballot-box tab in the header row (☐ Q1 ☐ Q2 ✔ Submit) — not a
  // single round-trip, so guard rather than half-answer.
  if ((modalRows.join('').match(/[☐☒]/g) || []).length > 1) return null;
  const multiSelect = modalRows.some((r) => /\[\s*[✔x ]?\s*\]/.test(r)); // [ ] / [✔] ⇒ multiSelect
  // Numbered option rows; last label wins per number, then order by number. One option per row, so
  // a per-row match suffices — no cross-row scanning, no fusion.
  const byNum = new Map<number, string>();
  for (const r of modalRows) {
    const m = r.match(/(\d{1,2})\.\s+(?:\[[✔x ]?\s*\]\s*)?(.*\S)/);
    if (m) byNum.set(parseInt(m[1], 10), stripBoxChrome(m[2]));
  }
  const options = [...byNum.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((e) => e[1])
    // Drop rows that were ONLY box-drawing chrome (empty after stripBoxChrome) and the
    // auto-appended affordance rows — none of these are real answer options.
    .filter((l) => l.length > 0)
    .filter((l) => !/^Type something\.?$/i.test(l) && !/^Chat about this\.?$/i.test(l))
    .map((label) => ({ label }));
  if (options.length === 0) return null;
  const headerRow = headerIdx >= 0 ? region[headerIdx] : undefined;
  const headerMatch = headerRow?.match(/[☐☒]\s*([^✔→\n]+?)(?:\s{2,}|$)/);
  const header = headerMatch ? headerMatch[1].trim() : undefined;
  // Question = the last meaningful row between the header tab and the first numbered option
  // (best-effort; it may not end in '?' — e.g. "Which pets? Choose any."). Strip tab/cursor glyphs
  // and drop the header line itself.
  const firstOptOffset = modalRows.findIndex((r) => /\d{1,2}\.\s/.test(r));
  const preOptionRows = firstOptOffset > 0 ? modalRows.slice(0, firstOptOffset) : [];
  const question = (
    preOptionRows
      .map((l) => stripBoxChrome(l.replace(/[←→✔☐☒❯]/g, '')))
      .filter((l) => l && l !== header)
      .pop() ??
    header ??
    'Claude is asking a question'
  ).trim();
  return { question, header, multiSelect, options };
}

/** A confirm-style choice menu — e.g. claude's "resume full session vs summary" prompt shown when
 *  resuming a large/old session. It differs from the AskUserQuestion modal in two ways: the footer
 *  reads "Enter to confirm · Esc to cancel" (not "↑↓ to navigate · Enter to select") and there is
 *  no ballot-box header tab. It is still a single-select numbered list, so it returns the SAME
 *  `ParsedQuestion` shape (multiSelect:false) and the existing web card round-trip + the
 *  `buildQuestionKeys` driver (↓×index + Enter) handle it verbatim — the boot-stage gate hands a
 *  detected one to the same card instead of Esc-cancelling it (Story 37.6 follow-up). Kept as a
 *  SEPARATE parser so the AskUserQuestion path stays byte-for-byte untouched (regression-0). */
const CLI_CONFIRM_FOOTER_RE = /Enter\b[^\n]{0,16}\bconfirm\b/i;

export function parseConfirmChoiceMenu(rows: string[]): ParsedQuestion | null {
  // AND-gate: require the live confirm footer alongside the numbered rows (same conservative spirit
  // as the other detectors — a quoted "Enter to confirm" in scrollback prose, with no numbered
  // options below it, must not read as a live menu).
  const footerIdx = lastRowMatching(rows, CLI_CONFIRM_FOOTER_RE);
  if (footerIdx < 0) return null;
  // Live-menu gate (false-positive guard, 실측 2026-06-12): a REAL confirm menu occupies the input
  // area at the bottom of the screen, so its footer is the LAST meaningful row — nothing renders
  // below it. If ANY non-blank row follows the footer, the numbered rows are quoted SCROLLBACK:
  // transcript prose/lists that merely contain a "1." "2." sequence and the literal "Enter to
  // confirm" phrase (e.g. THIS feature discussed in the very session, repainted on resume). A
  // footer-phrase match alone is far too weak — ordinary chat ("press Enter to confirm", numbered
  // steps) trips it; requiring the footer to be the last painted row is what isolates a live menu.
  const below = rows.slice(footerIdx + 1);
  if (below.some((r) => r.trim().length > 0)) return null;
  const region = rows.slice(0, footerIdx);
  // Numbered option rows ("❯ 1. …" / "  2. …"), one per row; last label wins per number, ordered by
  // number. The optional leading "❯" is the highlight cursor on the current row.
  const byNum = new Map<number, string>();
  for (const r of region) {
    const m = r.match(/^\s*[❯>]?\s*(\d{1,2})\.\s+(.*\S)/);
    if (m) byNum.set(parseInt(m[1], 10), stripBoxChrome(m[2]));
  }
  const options = [...byNum.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((e) => e[1])
    .filter((l) => l.length > 0)
    .map((label) => ({ label }));
  // A real choice needs at least two options (a lone "1." quoted in scrollback is not a live menu).
  if (options.length < 2) return null;
  // Question = the trailing prose row above the first numbered option (best-effort, like
  // parseQuestionModal). The card shows every option regardless, so a weak question is non-fatal.
  const firstOptIdx = region.findIndex((r) => /^\s*[❯>]?\s*\d{1,2}\.\s/.test(r));
  const preOption = firstOptIdx > 0 ? region.slice(0, firstOptIdx) : [];
  const question = (
    preOption.map((l) => stripBoxChrome(l)).filter((l) => l).pop() ?? 'Claude is asking a question'
  ).trim();
  return { question, header: undefined, multiSelect: false, options };
}

/**
 * Scrape the assistant prose the TUI rendered ABOVE the question modal (the explanation that
 * leads into the choices), else null. Why this exists (ordering fix): that prose and the
 * AskUserQuestion are flushed to the session JSONL only AFTER the user answers (the whole
 * assistant message lands post-selection — verified), while the question CARD is shown the moment
 * the modal is detected on screen. So reading the prose from the file always puts it AFTER the
 * card ("선택지 누른 뒤에 설명이 나온다"). The screen is the ONLY pre-answer source, so we scrape
 * it and emit it first. Best-effort and lossy (collapsed to one line, may catch nothing) — the
 * turn-end reload replaces it with the authoritative JSONL copy; the caller dedups the matching
 * JSONL block's live re-emit.
 *
 * Reads the same grid rows as parseQuestionModal: it finds where the modal begins (the header
 * ballot-box tab ☐/☒, or the row above the first numbered option) and returns the trailing
 * contiguous block of prose rows above it (box chrome stripped, option/footer/affordance rows
 * excluded). Returns null for a trivial fragment so a bare modal with no lead-in prose never
 * emits scrape noise.
 */
export function parsePrecedingText(rows: string[]): string | null {
  const footerIdx = lastRowMatching(rows, /to\s+navigate/i);
  if (footerIdx < 0) return null;
  const region = rows.slice(0, footerIdx);
  // The modal begins at its header ballot-box row (☐/☒), or failing that at the first numbered
  // option row. Everything above that is the lead-in prose.
  let modalStart = region.findIndex((r) => /[☐☒]/.test(r));
  if (modalStart < 0) modalStart = region.findIndex((r) => /^\s*1\.\s/.test(r));
  if (modalStart <= 0) return null;
  const isNoise = (l: string): boolean =>
    l.length === 0 ||
    /^[\s─-▟]*$/.test(l) || // blank or pure box-drawing chrome
    /^\d{1,2}\.\s/.test(l) || // a numbered option row
    /❯/.test(l) || // cursor / prompt marker
    /to\s+navigate|Enter\b[^\n]{0,12}\bselect\b|Esc\b[^\n]{0,16}\bcancel\b/i.test(l) ||
    /Chat about this|Type something/i.test(l);
  const lines = region.slice(0, modalStart).map((l) => stripBoxChrome(l));
  const prose: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isNoise(lines[i])) {
      if (prose.length > 0) break; // stop at the first noise line above the prose block
      continue; // skip trailing noise between the prose and the modal
    }
    prose.unshift(lines[i]);
  }
  const text = prose.join(' ').trim();
  return text.length < 16 ? null : text.slice(0, 2000);
}

/**
 * Story 37.5 — permission-mode control (the *write* application of the same settled grid).
 *
 * Hammoc permission modes that map 1:1 onto claude's Shift+Tab (`CSI Z`) cycle, **in cycle
 * order**: claude cycles `normal → accept edits on → plan mode on → auto mode on → (wrap)
 * normal` (empirically verified, claude v2.1.162). The forward step count from current→target
 * is `(targetIdx - curIdx + N) % N`.
 *
 * The shared `PermissionMode` union has a FIFTH value, `dontAsk`, which has NO position on
 * claude's cycle — it is intentionally ABSENT from this array, so `permissionModeCycleIndex`
 * returns -1 for it and the engine routes it to the store-only / next-spawn `--permission-mode`
 * path instead of driving a live closed loop with no reachable target.
 *
 * version-fragile: the `auto mode on ↔ bypassPermissions` mapping rests on the spike-observed
 * cycle label/order plus the *semantic* assumption that "auto mode" == permission bypass; the
 * label wording and cycle order can shift across claude versions (left as a live-verify item).
 */
export const CLI_PERMISSION_MODE_CYCLE: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];

/** Cycle position of a mode, or -1 when the mode is off the Shift+Tab cycle (`dontAsk`). */
export function permissionModeCycleIndex(mode: PermissionMode): number {
  return CLI_PERMISSION_MODE_CYCLE.indexOf(mode);
}

/** Status-row label → Hammoc mode. Each is anchored by its claude label phrase. `default`
 *  (normal) has NO label row, so it is read as the *absence* of any of these (see below). */
const CLI_MODE_LABELS: Array<{ re: RegExp; mode: PermissionMode }> = [
  { re: /accept edits on/i, mode: 'acceptEdits' },
  { re: /plan mode on/i, mode: 'plan' },
  { re: /auto mode on/i, mode: 'bypassPermissions' },
];

/** The mode status row renders the label together with this footer ("… (shift+tab to cycle) ·
 *  ← for agents"). Requiring the footer on the SAME row is the AND-gate that keeps a half-drawn
 *  frame or a quoted "plan mode on" in conversation prose from being read as the live mode (the
 *  same conservative AND-of-footer spirit the permission / question detectors use). */
const CLI_MODE_CYCLE_FOOTER_RE = /shift\s*\+?\s*tab\s+to\s+cycle/i;

/**
 * Read claude's current permission mode from the settled screen grid's status row (Story 37.5).
 * Pure: input is the grid rows, output is the Hammoc `PermissionMode`. A row is accepted as the
 * mode status row ONLY when it carries the `shift+tab to cycle` footer (AND-gate); among such
 * rows the bottom-most (freshest rendered) wins, matching `readSpinnerProgress`. When NO mode
 * status row is present the mode is `default` (normal) — but note this is a *weak* signal (it is
 * the absence of a row), so the caller MUST read it from a `flush()`-settled grid: a half-drawn
 * frame whose label has not painted yet would otherwise read transiently as `default`.
 */
export function readPermissionMode(grid: string[]): PermissionMode {
  // Live region only: the mode status row renders in the bottom UI cluster, so a full mode row
  // ("⏸ plan mode on (shift+tab to cycle) …") QUOTED far up in resume-repaint scrollback cannot be
  // read as the live mode when the live screen is `default` (no row). Bottom-most (freshest) wins.
  const region = liveFooterRows(grid);
  for (let y = region.length - 1; y >= 0; y--) {
    const row = region[y];
    if (!CLI_MODE_CYCLE_FOOTER_RE.test(row)) continue; // AND-gate: only a real mode status row
    for (const { re, mode } of CLI_MODE_LABELS) {
      if (re.test(row)) return mode;
    }
  }
  // No mode status row (or a footer with no recognized label) = normal = default.
  return 'default';
}

/**
 * Is the settled grid mid-GENERATION? The live footer carries claude's active-generation footer
 * ("esc to interrupt") or a spinner token counter ("↓ N tokens"). Scanned over the LIVE FOOTER
 * REGION only (`liveFooterText`) so scrollback prose that quotes these phrases can't poison the
 * verdict (same discipline as `isIdleInputGrid`).
 *
 * Story 37.5 follow-up (owner-confirmed 2026-06-13): the mode status row renders at the very bottom
 * of the reconstructed grid in BOTH idle and generating states (spinner above, input box + mode row
 * below), and Shift+Tab cycles the permission mode live in either. So the permission-mode closed
 * loop drives on this POSITIVE generation signal too — it distinguishes a real generating frame
 * (safe to read the mode + cycle) from an UNKNOWN boot/loading screen (where blind keys stay
 * forbidden). Version-fragile like the rest of this module.
 */
export function isGeneratingGrid(grid: string[]): boolean {
  const footer = liveFooterText(grid);
  return /esc to interrupt/i.test(footer) || /↓\s*[\d.,]+k?\s*tokens/i.test(footer);
}

/**
 * Is the settled grid showing claude's idle INPUT BOX (ready to accept a keypress), as opposed to a
 * mid-generation spinner frame? (Story 37.5 — distinguishes idle from generating; both render the
 * mode status row, but the live Shift+Tab gate treats them separately where it needs to.)
 *
 * Heuristic on a settled grid (half-drawn frames are excluded upstream by `flush()`), scanned over
 * the LIVE FOOTER REGION only (so scrollback prose that quotes these phrases can't poison it):
 *   - a generation footer/counter (`isGeneratingGrid`) ⇒ NOT idle;
 *   - else the input-box prompt glyph (❯) present ⇒ idle.
 *
 * Left as a shared named helper so Story 37.6's "pre-injection screen classification" (which draws
 * the same input-box-vs-spinner line, and likewise treats `❯` alone as insufficient) can reuse it
 * rather than re-deriving it. This story is self-sufficient and does NOT depend on 37.6.
 */
export function isIdleInputGrid(grid: string[]): boolean {
  if (isGeneratingGrid(grid)) return false; // active generation footer / spinner counter ⇒ generating
  return /❯/.test(liveFooterText(grid)); // idle input-box marker (live region only — not scrollback)
}

/**
 * Story 37.6 — PRE-INJECTION screen classification (the *read* sibling of 37.4's post-injection
 * detectors). The boot/resume readiness check used to be a single linear test —
 * `bootBuffer.includes('❯')` → inject. But `❯` is a *shared* glyph: claude paints it for the idle
 * input box, for the highlighted row of a selection menu, AND inside the permission dialog. So the
 * marker is *necessary but not sufficient*; a resume frame that lands on a selection menu reads `❯`
 * and the old path injected an Enter into the first option (e.g. `/compact`), losing the prompt and
 * compacting the conversation (실측 2026-06-11).
 *
 * This 3-way classifier of the SETTLED grid removes that ambiguity:
 *   - `selection`  — a recognized selection menu/modal: the 32.6 permission dialog OR the 32.8
 *                    question modal (both AND-gated detectors, reused verbatim), OR a generic
 *                    numbered-option list THAT ALSO carries a live selection footer.
 *   - `input-box`  — no selection signature AND `isIdleInputGrid` holds (an `❯` is present with no
 *                    mid-generation spinner). This is the ONLY class that injects (AC1).
 *   - `unknown`    — neither. The caller presses NO blind key and (at the decisive checkpoint) ends
 *                    the turn with an explicit error ("모르면 치지 않는다", AC3).
 *
 * The **footer AND-gate is essential** (AC2): a resume-repaint can quote a prior turn's "❯ 1. Yes"
 * / numbered list / table in the scrollback BODY, but the *live* nav/cancel footer renders only at
 * the bottom of an actually-live selection box. Requiring the footer alongside the numbered rows
 * stops quoted scrollback from being mistaken for a live menu — the same half-drawn / quoted-text
 * defense the permission/question detectors already use.
 *
 * Pure by construction (grid rows in, union out) so the screen-less unit tests drive it with
 * hand-built rows. **Settled-grid precondition:** the `input-box`/`selection` distinction partly
 * rests on the *absence* of a row (no footer ⇒ not a live menu), a weak signal that a half-drawn
 * frame can transiently violate, so the CALLER must classify only an `await flush()`-settled grid
 * (37.5 weak-signal discipline). Still version-fragile (the option/footer wording can shift across
 * claude TUI revisions) — the grid removes the *fusion* failure mode, not the wording fragility.
 *
 * @see docs/stories/37.6.story.md
 * [Source: docs/prd/epic-37-cli-terminal-emulation.md#story-376]
 */
export type PreInjectScreen = 'input-box' | 'selection' | 'unknown';

/** A LIVE selection footer (bottom-of-box nav/cancel affordance) — the AND-gate partner that keeps
 *  quoted scrollback ("❯ 1. Yes" in resume-repaint prose) from reading as a live menu. */
const CLI_SELECTION_FOOTER_RE = /to\s+navigate|Esc\b[^\n]{0,16}\bcancel\b|↑\s*\/?\s*↓/i;
/** A numbered option row ("1. …" / " 2. …"), anchored at the row start (one option per grid row). */
const CLI_NUMBERED_OPTION_RE = /^\s*\d{1,2}\.\s/;

/**
 * Classify a SETTLED screen grid as input box / selection menu / unknown for the pre-injection
 * readiness gate (Story 37.6). MUST be called on a `flush()`-settled grid (see the absence-signal
 * note above). Pure — no node-pty / no engine state.
 */
export function classifyPreInjectScreen(grid: string[]): PreInjectScreen {
  const text = grid.join('\n');
  // (1) Recognized selection menus/modals, OR a numbered list WITH a live footer (AND-gate). The
  // footer is matched over the LIVE region only (`liveFooterText`) so a resume-repaint that quotes a
  // nav/cancel footer ("↑/↓ to navigate") in the scrollback body can't pair with quoted numbered
  // rows and read as a live menu — the symmetric scrollback-poisoning guard to isIdleInputGrid's.
  const hasNumberedOption = grid.some((row) => CLI_NUMBERED_OPTION_RE.test(row));
  const hasSelectionFooter = CLI_SELECTION_FOOTER_RE.test(liveFooterText(grid));
  if (detectPermissionDialog(text) || detectQuestionModal(text) || (hasNumberedOption && hasSelectionFooter)) {
    return 'selection';
  }
  // (2) A verified idle input box (no selection signature + `❯` present + not mid-generation).
  if (isIdleInputGrid(grid)) return 'input-box';
  // (3) Neither — do not press blind keys (AC3).
  return 'unknown';
}
