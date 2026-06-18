/**
 * cliGridCards — grid card parser unit tests (Epic 37 — Story 37.9, Task 2)
 *
 * The parser is pure (grid rows → ordered cards), so it is driven both with hand-built
 * rows (deterministic boundary cases — the pattern `cliSpinnerProgress`/`cliModalDetect`
 * established) AND with a slice of the REAL captured claude v2.1.162 frame
 * (`cli-real-pty-dump.b64.txt`) rendered through the same screen model, so the classifier
 * is pinned against the actual glyphs/shapes claude paints (not modeled ones).
 *
 * server runs with `globals: false`, so vitest primitives are imported explicitly.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseGridCards, collectToolHeaderKeys, restoreFlickeredToolBullets } from '../cliGridCards.js';
import { createCliScreenModel } from '../cliScreenModel.js';
import { scrollbackBodyRows } from '../cliGridRegion.js';

describe('parseGridCards (hand-built rows)', () => {
  it('classifies a body (text) card from a `●` row without a tool header', () => {
    const cards = parseGridCards(['● 현재 구조를 다 파악했습니다. 정리하면 두 가지 방식이 있습니다.']);
    expect(cards).toEqual([{ kind: 'text', text: '현재 구조를 다 파악했습니다. 정리하면 두 가지 방식이 있습니다.' }]);
  });

  it('classifies a tool-use card and extracts the tool name from `● Tool(…)`', () => {
    const cards = parseGridCards([' ● Write(probe.txt)']);
    expect(cards).toEqual([{ kind: 'tool', text: 'Write(probe.txt)', toolName: 'Write' }]);
  });

  it('classifies a BARE `● ToolName` (input not painted yet) as a TOOL — not a `text:Read` card (Story 37.11)', () => {
    // 실측: claude paints `● Read` for a beat before `● Read(path)`. Parsing the bare form as a tool lets it
    // GROW into `Read(path)` (same kind) instead of leaving a spurious text card that re-emits per tool start.
    expect(parseGridCards(['● Read'])).toEqual([{ kind: 'tool', text: 'Read', toolName: 'Read' }]);
    expect(parseGridCards(['● mcp__playwright__browser_click'])).toEqual([
      { kind: 'tool', text: 'mcp__playwright__browser_click', toolName: 'mcp__playwright__browser_click' },
    ]);
    // A prose card (a sentence — has spaces) is NOT a bare tool name → stays text.
    expect(parseGridCards(['● Read the file and summarize it.'])).toEqual([
      { kind: 'text', text: 'Read the file and summarize it.' },
    ]);
  });

  it('classifies a tool result card from an indented `⎿` row (bullet + extra spaces stripped)', () => {
    const cards = parseGridCards(['  ⎿  Wrote 5 lines to probe.txt']);
    expect(cards).toEqual([{ kind: 'result', text: 'Wrote 5 lines to probe.txt' }]);
  });

  it('classifies a thinking-summary card from a `Thought for Ns` row', () => {
    const cards = parseGridCards(['  Thought for 16s']);
    expect(cards).toEqual([{ kind: 'thinking', text: 'Thought for 16s' }]);
  });

  it('classifies a verbose-mode `∴` reasoning block as a thinking card, folding its continuation rows (Story 37.11)', () => {
    const cards = parseGridCards([
      '∴ I need to calculate D_11 using the derangement formula,',
      '  so let me start by computing 11! = 39,916,800.',
      '  Then D₁₁ = 14,684,570. ✓',
    ]);
    expect(cards).toEqual([
      {
        kind: 'thinking',
        text: 'I need to calculate D_11 using the derangement formula, so let me start by computing 11! = 39,916,800. Then D₁₁ = 14,684,570. ✓',
      },
    ]);
  });

  it('keeps a `∴` thinking block and a following `●` body as SEPARATE ordered cards', () => {
    const cards = parseGridCards(['∴ first I reason about it', '  across two rows', '● Then the answer body.']);
    expect(cards.map((c) => c.kind)).toEqual(['thinking', 'text']);
    expect(cards[0].text).toBe('first I reason about it across two rows');
  });

  it('strips a trailing box-drawing rule that overlapped a streaming card row (Story 37.11 — clean delta)', () => {
    // Mid-repaint, the input-box top border `────` can render at the end of the live card's last row;
    // leaving it in the card text breaks the card's monotonic growth (and pollutes the display).
    const cards = parseGridCards(['∴ reasoning so far ──────────────────────']);
    expect(cards).toEqual([{ kind: 'thinking', text: 'reasoning so far' }]);
  });

  it('DROPS a spinner-headed block (the live generation indicator), keeping the cards around it (Story 37.11)', () => {
    // The spinner paragraph (`✶ Razzmatazzing… (12s · ↑ 140 tokens)`) animates through star dingbats and
    // is claude's generation indicator — never content. A block whose HEADER is a spinner glyph is dropped,
    // including its wrapped continuation row, so it can never fold into the card above it.
    const cards = parseGridCards([
      '● the answer body',
      '',
      '✶ Razzmatazzing… (12s · ↑ 140 tokens)',
      '  · still thinking',
      '',
      '∴ next reasoning',
    ]);
    expect(cards).toEqual([
      { kind: 'text', text: 'the answer body' },
      { kind: 'thinking', text: 'next reasoning' },
    ]);
  });

  it('drops a FROZEN completed spinner left over from a prior turn (`✻ Brewed for …`)', () => {
    // After a turn ends the spinner freezes (the glyph stays) — still a spinner-headed block ⇒ dropped,
    // so a resume-repainted prior turn never injects a stray status line into a card.
    const cards = parseGridCards(['● real answer', '', '✻ Brewed for 24m 9s', '', '⎿ some result']);
    expect(cards).toEqual([
      { kind: 'text', text: 'real answer' },
      { kind: 'result', text: 'some result' },
    ]);
  });

  it('KEEPS a spinner glyph that appears INSIDE prose (a continuation row is not a block header)', () => {
    // A `●` text card that quotes a spinner glyph mid-paragraph: the glyph is on a CONTINUATION row, not a
    // paragraph header, so it folds into the card untouched (the "filter only spinner-HEADERED blocks" rule).
    const cards = parseGridCards(['● The spinner animates through', '  ✶ and ✻ star glyphs.']);
    expect(cards).toEqual([{ kind: 'text', text: 'The spinner animates through ✶ and ✻ star glyphs.' }]);
  });

  it('drops the SMALL spinner frames `·` (middle-dot) and `*` (asterisk) — not just the star frames', () => {
    // claude's spinner pulses ·→*→✢→✶→✻→✽ (a star growing from a dot). The small frames (`·`/`*`) were
    // missed by a star-only glyph match, so the ticking counter folded into the card above and re-emitted
    // every frame (the user's storm). The full captured glyph set drops every frame.
    expect(parseGridCards(['● answer', '', '· Precipitating… (18s · ↓ 154 tokens)', '', '∴ more'])).toEqual([
      { kind: 'text', text: 'answer' },
      { kind: 'thinking', text: 'more' },
    ]);
    expect(parseGridCards(['● answer', '', '* Precipitating… (5s)'])).toEqual([{ kind: 'text', text: 'answer' }]);
  });

  it('strips the trailing collapse affordance "(ctrl+o to expand)" from a card', () => {
    expect(parseGridCards(['  Thought for 16s (ctrl+o to expand)'])).toEqual([
      { kind: 'thinking', text: 'Thought for 16s' },
    ]);
    // A "… +N lines (ctrl+r to expand)" tail is the whole result body of a truncated card, so
    // stripping it leaves nothing and the empty result card is dropped — only the tool remains.
    expect(parseGridCards(['● Read(big.ts)', '  ⎿ … +42 lines (ctrl+r to expand)'])).toEqual([
      { kind: 'tool', text: 'Read(big.ts)', toolName: 'Read' },
    ]);
  });

  it('folds a non-glyph continuation row into the open card (wrapped prose / multi-line output)', () => {
    const cards = parseGridCards([
      '● First the explanation wraps',
      '  across two rendered rows.',
      '● PowerShell("ls")',
      '  ⎿  line one',
      '     line two',
    ]);
    expect(cards).toEqual([
      { kind: 'text', text: 'First the explanation wraps across two rendered rows.' },
      { kind: 'tool', text: 'PowerShell("ls")', toolName: 'PowerShell' },
      { kind: 'result', text: 'line one line two' },
    ]);
  });

  it('joins a continuation row after a BLANK row with a paragraph break (\\n\\n), not a space', () => {
    // claude separates paragraphs with a blank terminal line. A blank row INSIDE a card → "\n\n" so
    // multi-paragraph prose keeps its breaks instead of collapsing into one run. (A blank row BEFORE a
    // new `●` header is still just a spacer — see the next test.)
    const cards = parseGridCards([
      '● First paragraph that',
      '  wraps once.',
      '',
      'Second paragraph after the blank row.',
    ], ['white']);
    expect(cards).toEqual([
      { kind: 'text', text: 'First paragraph that wraps once.\n\nSecond paragraph after the blank row.', bulletColor: 'white' },
    ]);
  });

  it('preserves card ORDER and treats blank rows as spacers (not card breaks)', () => {
    const cards = parseGridCards([
      '  Thought for 3s',
      '',
      '● The body that follows the thinking.',
      '',
      '● Bash(echo hi)',
      '  ⎿  hi',
    ]);
    expect(cards.map((c) => c.kind)).toEqual(['thinking', 'text', 'tool', 'result']);
  });

  it('drops empty cards and ignores loose rows before any card opens', () => {
    expect(parseGridCards(['just some loose text', '   ', '●'])).toEqual([]);
  });

  it('attaches the bullet color class to `●`-opened cards when colors are supplied (Story 37.10 tool status)', () => {
    const rows = ['● PowerShell("ls")', '  ⎿  Running…', '● Read(a.ts)', '  ⎿  ok'];
    const colors = ['gray', 'green', 'green', null] as const; // result rows carry no bullet (null)
    const cards = parseGridCards(rows, [...colors]);
    expect(cards).toEqual([
      { kind: 'tool', text: 'PowerShell("ls")', toolName: 'PowerShell', bulletColor: 'gray' },
      { kind: 'result', text: 'Running…' },
      { kind: 'tool', text: 'Read(a.ts)', toolName: 'Read', bulletColor: 'green' },
      { kind: 'result', text: 'ok' },
    ]);
  });

  it('omits bulletColor entirely when no colors are supplied (backward compat)', () => {
    expect(parseGridCards(['● Write(x)'])).toEqual([{ kind: 'tool', text: 'Write(x)', toolName: 'Write' }]);
  });
});

describe('parseGridCards — color-primary tool/text split (Story 37.13)', () => {
  // 실측 (cli-real-pty-dump): a tool's `●` is green(done)/gray(running), an assistant text body's `●` is
  // white. The COLOR is the primary signal; the name pattern is only the no-color fallback.
  it('classifies a GREEN bullet as a tool — even a HYPHENATED sub-agent name (claude-code-guide)', () => {
    const cards = parseGridCards(['● claude-code-guide(CLI interactive auto-compact behavior)'], ['green']);
    expect(cards).toEqual([{
      kind: 'tool',
      text: 'claude-code-guide(CLI interactive auto-compact behavior)',
      toolName: 'claude-code-guide',
      bulletColor: 'green',
    }]);
  });

  it('classifies a GRAY (running) bullet as a tool', () => {
    expect(parseGridCards(['● Read(big.ts)'], ['gray'])).toEqual([
      { kind: 'tool', text: 'Read(big.ts)', toolName: 'Read', bulletColor: 'gray' },
    ]);
  });

  it('classifies a GREEN BARE tool (input not painted yet) with the bare name', () => {
    expect(parseGridCards(['● Read'], ['green'])).toEqual([
      { kind: 'tool', text: 'Read', toolName: 'Read', bulletColor: 'green' },
    ]);
  });

  it('classifies a WHITE bullet as TEXT even when the body contains call-like parens (foo(bar))', () => {
    expect(parseGridCards(['● 그 함수 foo(bar) 를 호출하면 됩니다.'], ['white'])).toEqual([
      { kind: 'text', text: '그 함수 foo(bar) 를 호출하면 됩니다.', bulletColor: 'white' },
    ]);
  });

  it('classifies a WHITE bullet whose body LOOKS like a tool header as TEXT (color wins over name)', () => {
    // e.g. `● Update something` — capitalized + would pass BARE, but white means assistant prose.
    expect(parseGridCards(['● Update the changelog next'], ['white'])).toEqual([
      { kind: 'text', text: 'Update the changelog next', bulletColor: 'white' },
    ]);
  });

  it('falls back to the name pattern when NO color is supplied (hyphen now covered too)', () => {
    expect(parseGridCards(['● claude-code-guide(x)'])).toEqual([
      { kind: 'tool', text: 'claude-code-guide(x)', toolName: 'claude-code-guide' },
    ]);
    expect(parseGridCards(['● 결론부터: 설명입니다'])).toEqual([{ kind: 'text', text: '결론부터: 설명입니다' }]);
  });
});

describe('parseGridCards — real captured claude v2.1.162 frame (single-source grounding)', () => {
  const REAL_DUMP = Buffer.from(
    readFileSync(new URL('./fixtures/cli-real-pty-dump.b64.txt', import.meta.url), 'utf8').trim(),
    'base64',
  ).toString('utf8');

  it('parses the rendered thinking → tool → result card sequence the real frame painted', async () => {
    const screen = createCliScreenModel();
    screen.write(REAL_DUMP);
    await screen.flush();
    const grid = screen.readGrid();
    screen.dispose();

    // Bound the region to the scrollback body above the live spinner/input footer (the
    // discipline callers follow) so the spinner row isn't folded into the last card.
    const spinnerIdx = grid.findIndex((r) => /[↑↓]\s*[\d.,]+k?\s*tokens/i.test(r));
    const body = spinnerIdx > 0 ? grid.slice(0, spinnerIdx) : grid;
    const cards = parseGridCards(body);

    // The real capture painted a collapsed thinking summary, a PowerShell tool call, and its result.
    const thinking = cards.find((c) => c.kind === 'thinking');
    expect(thinking?.text).toMatch(/^Thought for \d+s$/); // collapse marker stripped
    const tool = cards.find((c) => c.kind === 'tool' && c.toolName === 'PowerShell');
    expect(tool).toBeDefined();
    const result = cards.find((c) => c.kind === 'result');
    expect(result?.text).toContain('Process');
  });

  it('reads the COMPLETED tool ● bullet as green from the real frame (Story 37.10 color status)', async () => {
    const screen = createCliScreenModel();
    screen.write(REAL_DUMP);
    await screen.flush();
    const grid = screen.readGrid();
    const colors = screen.readBulletColors();
    screen.dispose();

    // The real final frame shows a COMPLETED PowerShell tool — its bullet must read green (done).
    const toolRow = grid.findIndex((r) => /^\s*●\s*PowerShell\(/.test(r));
    expect(toolRow).toBeGreaterThan(-1);
    expect(colors[toolRow]).toBe('green');
    // A result/continuation row carries no leading `●` bullet → null (not a false 'green'/'gray').
    const resultRow = grid.findIndex((r) => /^\s*⎿/.test(r));
    if (resultRow > -1) expect(colors[resultRow]).toBeNull();
  });
});

describe('parseGridCards — real verbose-mode thinking capture (Story 37.11 — `∴` block scrape)', () => {
  // Real node-pty capture with PRODUCTION settings (showThinkingSummaries + verbose, effort high)
  // of claude v2.1.177 answering an ultrathink derangement prompt. 실측 2026-06-16: the expanded
  // reasoning lands on screen as a `∴` block ~7s BEFORE the JSONL canonical (written only at turn
  // end). Before this story the parser ignored `∴` → 0 cards → thinking reached Hammoc only via the
  // late file. This pins that the body parser now surfaces the on-screen reasoning as a thinking card.
  const RAW = Buffer.from(
    readFileSync(new URL('./fixtures/cli-verbose-thinking-render.b64.txt', import.meta.url), 'utf8').trim(),
    'base64',
  ).toString('utf8');

  it('captures the full on-screen `∴` reasoning as ONE thinking card (0 → 1; the multi-line block folds in)', async () => {
    const screen = createCliScreenModel();
    const STEP = 600;
    let thinkingText = '';
    for (let i = 0; i < RAW.length; i += STEP) {
      screen.write(RAW.slice(i, i + STEP));
      await screen.flush();
      const grid = screen.readGrid();
      if (grid.some((r) => r.includes('∴'))) {
        const cards = parseGridCards(scrollbackBodyRows(grid));
        const t = cards.find((c) => c.kind === 'thinking');
        if (t && t.text.length > thinkingText.length) thinkingText = t.text;
      }
    }
    screen.dispose();
    // The scraped reasoning is the actual multi-line derangement work claude painted on screen.
    expect(thinkingText.length).toBeGreaterThan(200);
    expect(thinkingText).toMatch(/derangement|39,?916,?800|14,?684,?570/);
    expect(thinkingText).not.toContain('∴'); // glyph stripped → reasoning text only
  });
});

describe('flickered-bullet stickiness (Story 37.12 — tool header glyph flicker)', () => {
  // The fusion the user reported: a running tool's `●` flickers (claude repaints it), and a poll caught on
  // the erased half-frame reads the tool row as prose. Without cross-frame memory it FUSES into the block
  // above; with it the `●` is restored and the tool re-opens as its own card.
  it('FUSES a glyph-less tool header into the prose above when there is no memory (the bug, reproduced)', () => {
    const cards = parseGridCards(['● 좋은 점을 짚으셨습니다.', 'Search(completeStreaming)']);
    expect(cards.map((c) => c.kind)).toEqual(['text']); // bullet-less Search folded in → one fused card
    expect(cards[0].text).toContain('Search(completeStreaming)');
  });

  it('restoreFlickeredToolBullets re-opens the tool when its header was seen in a recent frame', () => {
    const recent = collectToolHeaderKeys(['● Search(completeStreaming)']); // frame N: glyph present
    expect(recent.has('Search(completeStreaming)')).toBe(true);
    // frame N+1: the tool header's glyph flickered off (claude paints a spacer + the `●` answer body below).
    const flickered = ['Search(completeStreaming)', '', '● 좋은 점을 짚으셨습니다.'];
    expect(parseGridCards(flickered).some((c) => c.kind === 'tool')).toBe(false); // tool lost without memory
    const restored = restoreFlickeredToolBullets(flickered, recent);
    const cards = parseGridCards(restored);
    expect(cards.map((c) => c.kind)).toEqual(['tool', 'text']); // restored → tool re-opens, body separate
    expect(cards[0]).toMatchObject({ kind: 'tool', toolName: 'Search' });
    expect(cards[1].text).toBe('좋은 점을 짚으셨습니다.');
  });

  it('does NOT promote prose that merely contains a call (gated on ACTUAL observation, not shape alone)', () => {
    const recent = collectToolHeaderKeys(['● Search(q)']); // only Search(q) was ever a tool header
    // A standalone call-shaped line that was never observed as a tool header stays prose.
    expect(restoreFlickeredToolBullets(['other(y)', 'call foo(x)'], recent)).toEqual(['other(y)', 'call foo(x)']);
  });

  it('collectToolHeaderKeys: bullet-only by default, bullet-less included with the flag (scroll-off scope)', () => {
    const rows = ['● Read(a.ts)', 'Bash(ls)']; // Read carries its bullet; Bash lost its (flickering)
    expect([...collectToolHeaderKeys(rows)]).toEqual(['Read(a.ts)']); // confident set: glyph-carrying only
    expect(collectToolHeaderKeys(rows, true).has('Bash(ls)')).toBe(true); // on-screen scope also counts it
  });

  it('restores a BARE tool header (input not painted yet) too', () => {
    const recent = collectToolHeaderKeys(['● PowerShell']); // bare name, glyph present
    const restored = restoreFlickeredToolBullets(['PowerShell'], recent);
    expect(parseGridCards(restored)).toEqual([{ kind: 'tool', text: 'PowerShell', toolName: 'PowerShell' }]);
  });

  it('is a no-op with empty memory (returns the same array reference — fresh-turn fast path)', () => {
    const rows = ['Search(x)', 'prose'];
    expect(restoreFlickeredToolBullets(rows, new Set())).toBe(rows);
  });
});

describe('parseGridCards — indented tool-output gate (Story 37.17)', () => {
  it('does NOT open a card for a ●/⎿/∴ glyph in indented tool output (only left-margin headers are cards)', () => {
    const cards = parseGridCards([
      '● Bash(cat list.md)', //          tool header at col 0
      '  ⎿  output:', //                 result at col 2
      '       ● item one', //           OUTPUT line starting with a bullet (col 7) — NOT a card
      '       ⎿ nested note', //        OUTPUT line with a result glyph — NOT a card
      '       ∴ looks like thinking', // OUTPUT line with the thinking glyph — NOT a card
    ]);
    // Only the Bash tool + its result; the indented glyph rows fold into the result as continuation.
    expect(cards.filter((c) => c.kind === 'tool')).toHaveLength(1);
    expect(cards.filter((c) => c.kind === 'thinking')).toHaveLength(0);
    expect(cards[0].toolName).toBe('Bash');
    expect(cards.find((c) => c.kind === 'result')?.text).toContain('item one');
  });

  it('still opens cards for headers at the result indent (⎿ col 2) and the bullet margin (● col 0)', () => {
    const cards = parseGridCards(['● Read(config.ts)', '  ⎿  Read 10 lines']);
    expect(cards.map((c) => c.kind)).toEqual(['tool', 'result']);
  });

  it('restoreFlickeredToolBullets resurrects a margin header but NOT a deeply-indented output echo', () => {
    const restored = restoreFlickeredToolBullets(['Bash(x)', '       Bash(x)'], new Set(['Bash(x)']));
    expect(restored[0]).toBe('● Bash(x)'); //       col-0 flickered header → restored
    expect(restored[1]).toBe('       Bash(x)'); //  col-7 output echo → left alone
  });

  it('collectToolHeaderKeys ignores a deeply-indented glyph row (no recentKeys pollution)', () => {
    expect([...collectToolHeaderKeys(['● Bash(x)', '       ● Bash(x)'])]).toEqual(['Bash(x)']);
  });
});
