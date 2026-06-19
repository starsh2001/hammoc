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
 * The verbose/expanded thinking-detail glyph (U+2234 THEREFORE). In verbose mode claude paints the
 * EXPANDED reasoning as a `∴ <reasoning>` block in the body (실측 2026-06-16). It STREAMS — the block
 * grows frame by frame — so `emitProvisionalCards` must emit only the growing DELTA, not the full text
 * each frame (a full re-emit duplicated the card ~48× live). See the delta-streaming path there.
 */
const THINKING_DETAIL_GLYPH = '∴';
/**
 * The live generation spinner / status line's LEADING glyph ("<glyph> Precipitating… (18s …)"). claude's
 * spinner is a 6-frame pulse — a star that grows from a dot — and its glyph is the ONLY reliable signal
 * (the gerund word and the elapsed-time are version-fragile). The EXACT set was enumerated from real PTY
 * captures (NOT guessed): `·`U+00B7 `*`U+002A `✢`U+2722 `✶`U+2736 `✻`U+273B `✽`U+273D. A paragraph whose
 * HEADER is one of these IS the spinner — the parser drops that block, so its ticking counter never folds
 * into the card above and re-emits each frame. None collide with a content header (`●`U+25CF `∴`U+2234
 * `⎿`U+23BF) or the input prompt (`❯`U+276F). Matched ONLY at a paragraph header (`atBlockStart`), so one
 * of these glyphs QUOTED inside prose (a continuation row) stays folded into its real card. If a future
 * claude revision changes the animation, re-enumerate from a capture — do not guess. */
const SPINNER_HEADER_RE = /^[·*✢✶✻✽]/;
/**
 * The interactive input-prompt glyph (U+276F ❯) opening claude's input BOX — the line echoes the
 * USER's typed message, never assistant content. The upstream footer-strip (`scrollbackBodyRows`)
 * normally removes the box, but an INTERRUPT layout paints it ABOVE the regenerating spinner with a
 * content row between, breaking the footer cluster so the `❯ …` line survives into the body. Guarding
 * it here (flush + drop, like the spinner) stops the bare line from folding into the card above and
 * gluing the user's typed message onto an assistant card (실측 2026-06-19 dump replay).
 */
const INPUT_PROMPT_RE = /^❯/;
/** CLI chrome lines painted with a white `●` bullet that are NOT assistant prose — e.g.
 *  `● User answered Claude's questions:` (the AskUserQuestion response echo). Dropped so
 *  they don't spawn a spurious text card. */
const UI_CHROME_BODY_RE = /^User answered/;
/** A tool-use header body: a tool name immediately followed by `(` — "Write(", "PowerShell(", and
 *  HYPHENATED sub-agent names like "claude-code-guide(" (실측: the bullet is a tool, but the strict
 *  identifier set dropped the `-`). Used as the tool-NAME extractor + the no-color FALLBACK classifier. */
const TOOL_HEADER_RE = /^([A-Za-z][A-Za-z0-9_-]*)\(/;
/** A tool whose input hasn't painted yet: the `●` body is JUST the tool name, no `(` (실측: claude paints
 *  `● Read` for a beat before `● Read(path)`). A single CapitalizedWord or an `mcp__…` name with no spaces
 *  — never a prose card (claude heads prose with a sentence, which has spaces / lowercase / punctuation).
 *  Parsing it as a tool (not a `text:Read` card) lets it GROW into `Read(path)` instead of leaving a
 *  spurious text card that re-emits each time another `● Read` tool starts. */
const BARE_TOOL_RE = /^(?:[A-Z][A-Za-z0-9_]*|mcp__[\w-]+)$/;
/** The collapse affordance claude appends to a truncated card ("(ctrl+o to expand)" / "(ctrl+r …)",
 *  optionally after a "… +N lines" tail) — stripped so the card text is clean. */
const EXPAND_MARKER_RE = /\s*(?:…\s*)?(?:\+\d+\s+lines?\s*)?\(ctrl\+[a-z] to expand\)\s*$/i;
/**
 * Max left indentation (columns) at which a header glyph (`●`/`⎿`/`∴`/`Thought for`) opens a CARD.
 * 실측 (HAMMOC_CLI_PTY_DUMP replay): a real card header sits at the left margin — `●` col 0, `⎿` col 2,
 * `∴` col 0. A glyph DEEPER than this is inside a tool's INDENTED verbose output (a bash line that prints
 * a `●`/`⎿`, a Write file preview — measured at col 5–7), so it must NOT open a card. Gating the header
 * globs on this stops that output from being misread as a tool/result/thinking card. (Story 37.17)
 */
const MAX_CARD_INDENT = 3;

/** Strip the trailing collapse affordance, any trailing box-drawing rule (the input-box top border
 *  `────` can overlap a streaming card's last row mid-repaint, polluting the card text and breaking
 *  its monotonic growth — 실측 2026-06-16), and surrounding whitespace from a card row. */
function clean(s: string): string {
  return s.replace(EXPAND_MARKER_RE, '').replace(/[─╭╮╰╯│]+\s*$/, '').trim();
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
  // Story 37.11 (spinner-block drop): claude's blocks are blank-line-separated paragraphs, each opened
  // by a HEADER glyph on its first row (● / ∴ / ⎿ / "Thought for" for content, a star dingbat for the
  // live spinner). `atBlockStart` is true at the start and after every blank spacer, so it marks a row
  // as a paragraph HEADER vs a wrapped continuation — letting us drop a SPINNER-headed block while
  // keeping a spinner glyph that merely appears INSIDE prose (a continuation row). `droppingSpinner`
  // swallows the spinner paragraph's own wrapped rows until the next blank/header.
  let atBlockStart = true;
  let droppingSpinner = false;
  // Preserve paragraph breaks. A blank row INSIDE an open card is claude's paragraph separator (markdown
  // \n\n, rendered as a blank terminal line). Mark it so the next continuation row joins with "\n\n"
  // instead of a space — otherwise multi-paragraph prose collapses into one run. (Wrapped lines — no
  // blank between them — still space-join: the screen can't tell a soft wrap from a hard newline.)
  let pendingBreak = false;

  const flush = () => {
    if (current) {
      current.text = current.text.trim();
      if (current.text.length > 0) cards.push(current);
    }
    current = null;
    pendingBreak = false;
  };

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const trimmed = raw.trim();
    // Header glyphs open cards ONLY at their fixed left margin (실측: ● col 0, ⎿ col 2, ∴ col 0,
    // `Thought for` col 2). The SAME glyph at a different indent is tool verbose output or a footer
    // widget — it falls through to the continuation branch instead of spawning a spurious card.
    const indent = raw.length - raw.trimStart().length;
    if (trimmed.length === 0) {
      if (current) pendingBreak = true; // blank row inside an open card = a paragraph break (\n\n)
      atBlockStart = true; // a blank spacer opens a new paragraph and ends a spinner block's span
      droppingSpinner = false;
      continue;
    }

    // Input-prompt row (`❯ …`): claude's input BOX echoing the USER's typed message — never an assistant
    // card. Guarded REGARDLESS of `atBlockStart`: an interrupt layout paints it right after a
    // `⎿ Interrupted` content row (so it is NOT at a block start), and the bare `❯` line would otherwise
    // fall to the continuation branch and fold into the card above, gluing the user's message onto it.
    // Treat it like the spinner — flush the open card and swallow it (+ any wrapped rows of the message).
    if (indent === 0 && INPUT_PROMPT_RE.test(trimmed)) {
      flush();
      droppingSpinner = true;
      atBlockStart = false;
      continue;
    }

    // A SPINNER-headed row is claude's generation indicator or a frozen prior-turn status line — never
    // content. Drop it and any wrapped continuation rows. The col-0 gate prevents a prose line that
    // merely contains a spinner glyph (indented) from being dropped; `atBlockStart` is NOT required
    // because a frozen spinner (`✻ Churned for 20s`) can appear flush after content with no blank
    // separator, and must still be dropped rather than folded into the card above.
    if ((atBlockStart || !current) && indent <= MAX_CARD_INDENT && SPINNER_HEADER_RE.test(trimmed)) {
      flush();
      droppingSpinner = true;
      atBlockStart = false;
      continue;
    }
    if (droppingSpinner) {
      atBlockStart = false; // still inside the spinner paragraph — swallow its wrapped rows
      continue;
    }

    if (indent === 0 && trimmed.startsWith(CARD_BULLET)) {
      flush();
      const body = clean(trimmed.slice(CARD_BULLET.length).trim());
      const bulletColor = bulletColors?.[i];
      // Story 37.13: the bullet COLOR is the PRIMARY tool/text signal (실측 cli-real-pty-dump: a tool's
      // bullet is green=done / gray=running, an assistant text body's bullet is white — the SAME `●` glyph,
      // the COLOR splits them). The name pattern (`Tool(` / bare `Tool`) is only the FALLBACK when no color
      // is supplied (pure unit tests) or the fg is a non-RGB 'other'. This makes hyphenated sub-agent names
      // (claude-code-guide) read as tools, and stops a prose line that merely contains `foo(bar)` from being
      // misread as a tool.
      const isTool =
        bulletColor === 'green' || bulletColor === 'gray'
          ? true
          : bulletColor === 'white'
            ? false
            : TOOL_HEADER_RE.test(body) || BARE_TOOL_RE.test(body); // 'other' / no color → name pattern
      if (isTool) {
        // Tool name: the part before `(` (covers hyphens/dots the strict regex would miss), else the body.
        const toolMatch = body.match(TOOL_HEADER_RE);
        const parenIdx = body.indexOf('(');
        const toolName = (toolMatch ? toolMatch[1] : parenIdx > 0 ? body.slice(0, parenIdx) : body).trim() || 'Tool';
        current = { kind: 'tool', text: body, toolName, ...(bulletColor ? { bulletColor } : {}) };
      } else if (UI_CHROME_BODY_RE.test(body)) {
        droppingSpinner = true; // drop this line + any continuation rows below it
      } else {
        current = { kind: 'text', text: body, ...(bulletColor ? { bulletColor } : {}) };
      }
    } else if (indent === 2 && trimmed.startsWith(RESULT_BULLET)) {
      flush();
      current = { kind: 'result', text: clean(trimmed.slice(RESULT_BULLET.length).trim()) };
    } else if (indent === 2 && THOUGHT_RE.test(trimmed)) {
      flush();
      current = { kind: 'thinking', text: clean(trimmed) };
    } else if (indent === 0 && trimmed.startsWith(THINKING_DETAIL_GLYPH)) {
      // Story 37.11: a verbose-mode expanded reasoning block opens with `∴`; its wrapped continuation
      // rows fold into this thinking card. The block STREAMS (grows each frame) — the engine emits the
      // delta, not the full text, to avoid the live re-emit storm.
      flush();
      current = { kind: 'thinking', text: clean(trimmed.slice(THINKING_DETAIL_GLYPH.length).trim()) };
    } else if (current) {
      // Continuation of the open card (wrapped prose / multi-line tool output). A pending paragraph
      // break (a blank row preceded this row) joins with "\n\n"; a plain wrapped line joins with a space.
      const extra = clean(trimmed);
      if (extra) {
        current.text += (current.text ? (pendingBreak ? '\n\n' : ' ') : '') + extra;
        pendingBreak = false;
      }
    }
    // else: a loose non-glyph row before any card opens — not a card, ignored.
    atBlockStart = false;
  }
  flush();
  return cards;
}

/**
 * Story 37.12 (flickered-bullet stickiness — the user's "detect across frames, not one frame" insight):
 * `parseGridCards` classifies a row as a TOOL only by its leading `●` glyph, but that glyph FLICKERS while
 * the tool runs — claude repaints the bullet, and the 60ms poll can land on the half-frame where it's
 * momentarily erased. A frame caught with the glyph gone reads the tool row as prose and FUSES it into the
 * block above (실측: the `Search(…)` header glued onto the answer body). These two helpers give the caller a
 * tiny CROSS-FRAME memory: {@link collectToolHeaderKeys} records the tool-header lines it actually saw, and
 * {@link restoreFlickeredToolBullets} re-adds the `●` on a later frame's bullet-less line whose body was
 * recently a tool header. Content-gated on BOTH the tool-header SHAPE and recent observation, so prose that
 * merely contains `foo(x)` is never promoted.
 */

/** The cleaned body of a row IFF it stands alone as a tool header (`Tool(…)` or a bare `Tool`/`mcp__…`),
 *  any leading `●` stripped first. Null for prose / results / blanks. This is the cross-frame match KEY. */
function toolHeaderKey(row: string): string | null {
  const body = clean(row.trim().replace(/^●\s*/, ''));
  if (!body) return null;
  return TOOL_HEADER_RE.test(body) || BARE_TOOL_RE.test(body) ? body : null;
}

/**
 * The tool-header match keys present in `rows`. With `includeBulletless: false` (default) it counts ONLY
 * rows that actually carry the `●` glyph this frame — the confident set to REMEMBER. With `true` it also
 * counts bullet-less rows whose shape matches — used to scope retention to lines still on screen, so a
 * tool that scrolled off drops out of memory and can't later re-promote unrelated prose.
 */
export function collectToolHeaderKeys(rows: string[], includeBulletless = false): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    const t = row.trim();
    if (t.length === 0) continue;
    if (row.length - row.trimStart().length > MAX_CARD_INDENT) continue; // deep = tool output, not a header
    if (!t.startsWith(CARD_BULLET) && !includeBulletless) continue;
    const key = toolHeaderKey(t);
    if (key) out.add(key);
  }
  return out;
}

/**
 * Restore the `●` on any bullet-less row whose body was a tool header in a recent frame (`recentKeys`,
 * supplied by the caller and scoped to on-screen lines). Returns a NEW rows array — the parser stays pure.
 * No-op when `recentKeys` is empty. Restoring the glyph makes `parseGridCards` open the row as its own
 * tool card again instead of folding it into the prose above (the fusion the user reported).
 */
export function restoreFlickeredToolBullets(rows: string[], recentKeys: ReadonlySet<string>): string[] {
  if (recentKeys.size === 0) return rows;
  return rows.map((row) => {
    const t = row.trim();
    if (t.length === 0 || t.startsWith(CARD_BULLET)) return row;
    // Story 37.17: don't resurrect a `●` on a DEEPLY indented row — that's a tool's verbose output, not a
    // flickered header. Restoring it would strip the indent (`● ${t}` lands at col 0) and bypass the parser's
    // indent gate, re-introducing the exact misdetection the gate prevents.
    if (row.length - row.trimStart().length > MAX_CARD_INDENT) return row; // deep = tool output, not a header
    const key = toolHeaderKey(t);
    return key && recentKeys.has(key) ? `${CARD_BULLET} ${t}` : row;
  });
}
