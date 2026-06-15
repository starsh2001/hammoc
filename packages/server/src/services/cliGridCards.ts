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

/** The card kinds the parser distinguishes. 37.10 maps each onto a stream callback
 *  (text → onTextChunk, tool → onToolUse, result → onToolResult, thinking → onThinking). */
export type GridCardKind = 'text' | 'tool' | 'result' | 'thinking';

export interface GridCard {
  kind: GridCardKind;
  /** The card body, glyph stripped, continuation rows space-joined, collapse marker removed. */
  text: string;
  /** For a `tool` card: the tool name parsed from `● Tool(…)` (e.g. "Write", "PowerShell"). */
  toolName?: string;
}

/** The assistant card bullet (U+25CF) — opens a body (text) OR a tool-use card. */
const CARD_BULLET = '●';
/** The tool-result bullet (U+23BF) — opens a result card (claude indents it under its tool). */
const RESULT_BULLET = '⎿';
/** The thinking-summary header claude paints once a thinking block lands ("Thought for 16s"). */
const THOUGHT_RE = /^Thought for\b/i;
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
 */
export function parseGridCards(rows: string[]): GridCard[] {
  const cards: GridCard[] = [];
  let current: GridCard | null = null;

  const flush = () => {
    if (current) {
      current.text = current.text.trim();
      if (current.text.length > 0) cards.push(current);
    }
    current = null;
  };

  for (const raw of rows) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue; // spacer row — does not break a card span

    if (trimmed.startsWith(CARD_BULLET)) {
      flush();
      const body = clean(trimmed.slice(CARD_BULLET.length).trim());
      const toolMatch = body.match(TOOL_HEADER_RE);
      current = toolMatch ? { kind: 'tool', text: body, toolName: toolMatch[1] } : { kind: 'text', text: body };
    } else if (trimmed.startsWith(RESULT_BULLET)) {
      flush();
      current = { kind: 'result', text: clean(trimmed.slice(RESULT_BULLET.length).trim()) };
    } else if (THOUGHT_RE.test(trimmed)) {
      flush();
      current = { kind: 'thinking', text: clean(trimmed) };
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
