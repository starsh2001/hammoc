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
import { parseGridCards } from '../cliGridCards.js';
import { createCliScreenModel } from '../cliScreenModel.js';

describe('parseGridCards (hand-built rows)', () => {
  it('classifies a body (text) card from a `●` row without a tool header', () => {
    const cards = parseGridCards(['● 현재 구조를 다 파악했습니다. 정리하면 두 가지 방식이 있습니다.']);
    expect(cards).toEqual([{ kind: 'text', text: '현재 구조를 다 파악했습니다. 정리하면 두 가지 방식이 있습니다.' }]);
  });

  it('classifies a tool-use card and extracts the tool name from `● Tool(…)`', () => {
    const cards = parseGridCards([' ● Write(probe.txt)']);
    expect(cards).toEqual([{ kind: 'tool', text: 'Write(probe.txt)', toolName: 'Write' }]);
  });

  it('classifies a tool result card from an indented `⎿` row (bullet + extra spaces stripped)', () => {
    const cards = parseGridCards(['  ⎿  Wrote 5 lines to probe.txt']);
    expect(cards).toEqual([{ kind: 'result', text: 'Wrote 5 lines to probe.txt' }]);
  });

  it('classifies a thinking-summary card from a `Thought for Ns` row', () => {
    const cards = parseGridCards(['  Thought for 16s']);
    expect(cards).toEqual([{ kind: 'thinking', text: 'Thought for 16s' }]);
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
});
