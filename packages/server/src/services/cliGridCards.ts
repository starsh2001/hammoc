/**
 * CLI grid card parser (Epic 37 — Story 37.9)
 *
 * A pure classifier that turns the *settled screen grid* rows (Story 37.1 `readGrid()`)
 * into an ordered list of assistant **cards** — the body/tool/result/thinking blocks the
 * interactive `claude` TUI paints into the scrollback. This is the SINGLE SOURCE for
 * "what cards are on screen", deliberately split out of the modal-only `cliModalDetect`
 * (a card is a more general concept than a permission/question modal) so that:
 *   - Story 37.9 emits the assistant prose ABOVE an input-waiting modal as a provisional
 *     card (the `●` text card), fixing the "choices appear before the answer body" inversion;
 *   - Story 37.10 reuses the SAME parser to stream thinking (`Thought for Ns`) and tool
 *     (`● Tool(…)` / `⎿ result`) cards live, without re-deriving the boundary rules.
 *
 * Grounded in REAL captured frames (HAMMOC_CLI_PTY_DUMP, claude v2.1.162), each rendered
 * exactly as the grid leaves them:
 *   - `● 💻 James — …`                       → an assistant body (text) card
 *   - `● PowerShell("…")`                     → a tool-use card (● + ToolName + `(`)
 *   - `  ⎿  Process : [1]`                    → a tool result card (indented `⎿`)
 *   - `  Thought for 16s (ctrl+o to expand)`  → a thinking-summary card
 * The trailing `(ctrl+o to expand)` / `(ctrl+r to expand)` collapse marker is stripped so
 * the card text is clean (Story 37.9 AC1 spawns claude expanded so these largely disappear,
 * but the parser stays robust whether or not a card is collapsed).
 *
 * Pure by construction (rows in, cards out — no node-pty / no engine state), so the
 * screen-less unit tests drive it with hand-built grid rows — the pattern Stories
 * 37.2/37.3 (`readSpinnerProgress`) and 37.4 (modal parsers) established.
 *
 * The CALLER bounds the region it passes: a card glyph (`●`/`⎿`/`Thought for`) opens a new
 * card and any following non-glyph row is its continuation, so passing the live footer
 * (input box / spinner / mode row) would fold those into the last card. Callers therefore
 * pass the SCROLLBACK BODY (the rows ABOVE the live footer / above a detected modal), the
 * same "anchor to the region, not the whole screen" discipline `cliGridRegion` encodes.
 *
 * Version-fragile like the rest of the CLI screen readers (a TUI revision could change the
 * glyphs or the collapse wording); the grid removes the *fusion* failure mode, not wording
 * fragility.
 *
 * @see docs/stories/37.9.story.md
 * [Source: docs/prd/epic-37-cli-terminal-emulation.md#story-379]
 */

import type { CliBulletColor } from './cliScreenModel.js';

/** The card kinds the parser distinguishes. 37.10 maps each onto a stream callback
 *  (text → onTextChunk, tool → onToolUse, result → onToolResult, thinking → onThinking). */
export type GridCardKind = 'text' | 'tool' | 'result' | 'thinking';

export interface GridCard {
  kind: GridCardKind;
  /** The card body, glyph stripped, continuation rows space-joined, collapse marker removed. */
  text: string;
  /** For a `tool` card: the tool name parsed from `● Tool(…)` (e.g. "Write", "PowerShell"). */
  toolName?: string;
  /**
   * For a card opened on a `●` row: the bullet's foreground-color CLASS (Story 37.10), supplied
   * by the optional `bulletColors` arg. For a `tool` card this is the STATUS signal — 'green' =
   * complete, anything else (gray/other) = still running — far more robust than the `⎿ Waiting…`
   * placeholder text. Undefined when colors weren't passed (pure-row unit tests) or for `result`/
   * `thinking` cards (no `●` bullet).
   */
  bulletColor?: CliBulletColor;
}

/** The assistant card bullet (U+25CF) — opens a body (text) OR a tool-use card. */
const CARD_BULLET = '●';
/** The tool-result bullet (U+23BF) — opens a result card (claude indents it under its tool). */
const RESULT_BULLET = '⎿';
/** The thinking-summary header claude paints once a thinking block lands ("Thought for 16s"). */
const THOUGHT_RE = /^Thought for\b/i;
/**
 * The verbose/expanded thinking-detail glyph (U+2234 THEREFORE). In verbose mode (Hammoc's spawn —
 * `showThinkingSummaries` + `verbose`) claude paints the EXPANDED reasoning as a `∴ <reasoning>`
 * block in the scrollback BODY, NOT a collapsed "Thought for Ns" header (that summary lives in the
 * footer spinner instead). 실측 2026-06-16 (real production-settings PTY capture): the full multi-line
 * reasoning lands on screen ~7s BEFORE the JSONL canonical (which is written only at turn end, with
 * the next block). Recognizing this glyph lets `emitProvisionalCards` scrape the live reasoning so the
 * thinking card shows during that 7s window instead of waiting for the file.
 */
const THINKING_DETAIL_GLYPH = '∴';
/** A tool-use header body: a tool name immediately followed by `(` — "Write(", "PowerShell(". */
const TOOL_HEADER_RE = /^([A-Za-z][A-Za-z0-9_]*)\(/;
/** The collapse affordance claude appends to a truncated card ("(ctrl+o to expand)" / "(ctrl+r …)",
 *  optionally after a "… +N lines" tail) — stripped so the card text is clean. */
const EXPAND_MARKER_RE = /\s*(?:…\s*)?(?:\+\d+\s+lines?\s*)?\(ctrl\+[a-z] to expand\)\s*$/i;

/** Strip the trailing collapse affordance and surrounding whitespace from a card row. */
function clean(s: string): string {
  return s.replace(EXPAND_MARKER_RE, '').trim();
}

/**
 * Classify the (region-bounded) grid rows into an ordered list of assistant cards.
 *
 * A glyph row opens a new card; a following non-glyph, non-blank row is its continuation
 * (space-joined). Blank rows are spacers (claude pads between cards) and neither open nor
 * close a card. Empty cards are dropped, so a lone glyph row with no body yields nothing.
 * Pure — no I/O, no engine state.
 *
 * `bulletColors` (optional, index-aligned with `rows` — from `CliScreenModel.readBulletColors()`)
 * tags each `●`-opened card with its bullet color CLASS (Story 37.10 tool status). When omitted
 * the cards carry no `bulletColor` (pure unit tests / colorless callers).
 */
export function parseGridCards(rows: string[], bulletColors?: CliBulletColor[]): GridCard[] {
  const cards: GridCard[] = [];
  let current: GridCard | null = null;

  const flush = () => {
    if (current) {
      current.text = current.text.trim();
      if (current.text.length > 0) cards.push(current);
    }
    current = null;
  };

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue; // spacer row — does not break a card span

    if (trimmed.startsWith(CARD_BULLET)) {
      flush();
      const body = clean(trimmed.slice(CARD_BULLET.length).trim());
      const toolMatch = body.match(TOOL_HEADER_RE);
      const bulletColor = bulletColors?.[i];
      current = toolMatch
        ? { kind: 'tool', text: body, toolName: toolMatch[1], ...(bulletColor ? { bulletColor } : {}) }
        : { kind: 'text', text: body, ...(bulletColor ? { bulletColor } : {}) };
    } else if (trimmed.startsWith(RESULT_BULLET)) {
      flush();
      current = { kind: 'result', text: clean(trimmed.slice(RESULT_BULLET.length).trim()) };
    } else if (THOUGHT_RE.test(trimmed)) {
      flush();
      current = { kind: 'thinking', text: clean(trimmed) };
    } else if (trimmed.startsWith(THINKING_DETAIL_GLYPH)) {
      // Story 37.11: a verbose-mode expanded reasoning block opens with `∴`; its wrapped continuation
      // rows fold into this card (the `else if (current)` arm below), so the FULL on-screen reasoning
      // is captured as one thinking card — the body counterpart of the footer "Thought for Ns" summary.
      flush();
      current = { kind: 'thinking', text: clean(trimmed.slice(THINKING_DETAIL_GLYPH.length).trim()) };
    } else if (current) {
      // Continuation of the open card (wrapped prose / multi-line tool output).
      const extra = clean(trimmed);
      if (extra) current.text += (current.text ? ' ' : '') + extra;
    }
    // else: a loose non-glyph row before any card opens — not a card, ignored.
  }
  flush();
  return cards;
}
