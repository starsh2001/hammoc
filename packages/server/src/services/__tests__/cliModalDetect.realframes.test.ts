/**
 * cliModalDetect / cliGridCards — REAL captured permission-dialog frame (Epic 37 — Story 37.9)
 *
 * The sibling `cliModalDetect.test.ts` and `cliGridCards.test.ts` exercise the parsers with
 * hand-built grid rows. This file closes the "modeled rows ≠ real PTY" gap for Story 37.9's
 * core (scrape the lead-in prose above an input-waiting modal): it replays an ACTUAL capture of
 * the interactive `claude` TUI (v2.1.177, Sonnet 4.6, default permission mode, `verbose:true`)
 * painting a permission dialog with explanatory prose ABOVE the gated `● Write(…)` tool card —
 * collected live via node-pty over the real bundled binary — and asserts the production parsers
 * recognize the real frame:
 *   - `detectPermissionDialog` fires on the real footer,
 *   - `parsePrecedingPermissionText` extracts the real prose claude emitted above the tool card,
 *   - `parseGridCards` classifies the real `● text` body and `● Write(…)` tool cards,
 *   - and the `verbose:true` screen carries NO `(ctrl+o to expand)` collapse marker (AC1 signal).
 *
 * The fixture is a base64 of the raw PTY stream (base64 is git-safe: the raw stream is full of
 * control bytes / CRs that line-ending normalization would corrupt), decoded and fed verbatim
 * through the same screen model the engine uses.
 *
 * server runs with `globals: false`, so vitest primitives are imported explicitly.
 *
 * @see docs/stories/37.9.story.md
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { createCliScreenModel } from '../cliScreenModel.js';
import { parseGridCards } from '../cliGridCards.js';
import {
  parsePrecedingPermissionText,
  parsePrecedingText,
  detectPermissionDialog,
  detectQuestionModal,
  parseQuestionModal,
} from '../cliModalDetect.js';
import { liveFooterText } from '../cliGridRegion.js';

function decodeFixture(name: string): string {
  return Buffer.from(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8').trim(), 'base64').toString('utf8');
}

async function renderGrid(capture: string): Promise<string[]> {
  const screen = createCliScreenModel();
  screen.write(capture);
  await screen.flush();
  const grid = screen.readGrid();
  screen.dispose();
  return grid;
}

const REAL_CAPTURE = decodeFixture('cli-perm-dialog-with-prose.b64.txt');
const renderRealGrid = () => renderGrid(REAL_CAPTURE);
const QUESTION_CAPTURE = decodeFixture('cli-question-modal-with-prose.b64.txt');

describe('Story 37.9 — real captured permission-dialog-with-prose frame', () => {
  it('decodes a non-trivial real capture (fixture sanity)', () => {
    expect(REAL_CAPTURE.length).toBeGreaterThan(5_000);
  });

  it('detectPermissionDialog fires on the real live footer', async () => {
    const grid = await renderRealGrid();
    expect(detectPermissionDialog(liveFooterText(grid))).toBe(true);
  });

  it('parsePrecedingPermissionText extracts the real lead-in prose above the gated tool card (AC4)', async () => {
    const grid = await renderRealGrid();
    const prose = parsePrecedingPermissionText(grid);
    expect(prose).not.toBeNull();
    // The exact sentence claude painted above the `● Write(…)` card — the body that the fix emits
    // BEFORE the permission card so the order is [본문, 선택지].
    expect(prose).toContain('probe_cli_37_9.txt');
    expect(prose).toContain('생성합니다');
    // It must NOT include the tool invocation or dialog chrome — only the explanatory prose.
    expect(prose).not.toMatch(/Write\(/);
    expect(prose).not.toMatch(/Do you want to/i);
  });

  it('parseGridCards classifies the real body (text) and tool (Write) cards (AC2)', async () => {
    const grid = await renderRealGrid();
    const footerIdx = grid.findIndex((r) => /Esc\b[^\n]{0,16}\bcancel\b/i.test(r));
    const body = footerIdx > 0 ? grid.slice(0, footerIdx) : grid;
    const cards = parseGridCards(body);
    const text = cards.find((c) => c.kind === 'text' && c.text.includes('probe_cli_37_9.txt'));
    expect(text).toBeDefined();
    const tool = cards.find((c) => c.kind === 'tool' && c.toolName === 'Write');
    expect(tool).toBeDefined();
  });

  it('the verbose:true screen carries NO "(ctrl+o to expand)" collapse marker (AC1 signal)', async () => {
    const grid = await renderRealGrid();
    expect(grid.some((r) => /ctrl\+[a-z] to expand/i.test(r))).toBe(false);
  });
});

describe('Story 37.9 — real captured AskUserQuestion-modal-with-prose frame', () => {
  it('decodes a non-trivial real capture (fixture sanity)', () => {
    expect(QUESTION_CAPTURE.length).toBeGreaterThan(4_000);
  });

  it('detectQuestionModal fires and parseQuestionModal scrapes the real question + options', async () => {
    const grid = await renderGrid(QUESTION_CAPTURE);
    expect(detectQuestionModal(liveFooterText(grid))).toBe(true);
    const parsed = parseQuestionModal(grid);
    expect(parsed?.question).toContain('선호');
    expect(parsed?.options.map((o) => o.label)).toEqual(['빨강', '초록', '파랑']);
    // The per-option description claude painted on the indented row below each label — captured off
    // the real frame, not just the bare label (the "선택지가 단순" fix). These rows were silently
    // dropped before; now they ride through to the web card.
    expect(parsed?.options.map((o) => o.description)).toEqual([
      '빨간색을 선호합니다.',
      '초록색을 선호합니다.',
      '파란색을 선호합니다.',
    ]);
  });

  it('parsePrecedingText extracts the real SHORT lead-in prose above the question modal (AC4 + 16→4 floor fix)', async () => {
    const grid = await renderGrid(QUESTION_CAPTURE);
    // The 14-char Korean lead-in claude painted above the modal — the regression that the
    // over-aggressive 16-char floor dropped (실측 2026-06-15). It must NOT swallow the echoed
    // prompt above it (stopped by the blank row + the `❯` cursor row).
    const prose = parsePrecedingText(grid);
    expect(prose).toBe('선호 색상을 여쭙겠습니다.');
  });

  it('parseGridCards classifies the real lead-in as a text card (AC2)', async () => {
    const grid = await renderGrid(QUESTION_CAPTURE);
    const footerIdx = grid.findIndex((r) => /to\s+navigate/i.test(r));
    const body = footerIdx > 0 ? grid.slice(0, footerIdx) : grid;
    const cards = parseGridCards(body);
    expect(cards.some((c) => c.kind === 'text' && c.text.includes('선호 색상을 여쭙겠습니다'))).toBe(true);
  });
});
