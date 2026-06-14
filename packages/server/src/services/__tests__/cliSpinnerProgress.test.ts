/**
 * CLI spinner-progress grid reader — unit tests (Epic 37 — Story 37.2)
 *
 * Story 37.2 moves the generation *token* data source from the linear ANSI-stripped
 * buffer to the Story 37.1 screen grid. These tests pin the load-bearing invariant: a
 * counter claude overwrites IN PLACE ("365" then "366" on the same cell) reads back as
 * the FINAL value (366), never the linear-fusion artifact "365366" — fusion is
 * structurally impossible in a grid. They drive frames through the REAL headless screen
 * model (the production reconstruction path), flush, then read via `readSpinnerProgress`.
 *
 * Also covered: the abbreviated "↓ 1.4k tokens" form the linear regex MISSED (it broke
 * at `.`/`k`) now reads as 1400; comma form; the false-0 guard (no counter → null); a
 * segment-boundary reset read as a change; and the elapsed-clock rule (Story 37.3) —
 * bare seconds parse ("9s" → 9), the minute form "(1m 36s ·" sums to 96 (paren-anchored
 * Xm Ys), an in-place "1m 36s" → "1m 37s" redraw reads as the latest 97 (no fusion), and
 * a clock-less counter row yields 0.
 *
 * server runs with `globals: false`, so vitest primitives are imported explicitly.
 */

import { describe, it, expect } from 'vitest';
import { createCliScreenModel } from '../cliScreenModel.js';
import { readSpinnerProgress } from '../cliSpinnerProgress.js';

const ESC = '\x1b';
/** Model claude's in-place spinner redraw: address a fixed row, erase it, write text. */
const drawSpinner = (text: string, row = 20): string => `${ESC}[${row};1H${ESC}[2K${text}`;

/** Feed frames into a fresh screen model, flush, and read the spinner progress. */
async function read(frames: string[]): Promise<ReturnType<typeof readSpinnerProgress>> {
  const screen = createCliScreenModel();
  screen.write(`${ESC}[2J${ESC}[H`); // clear
  for (const f of frames) screen.write(f);
  await screen.flush();
  const result = readSpinnerProgress(screen.readGrid());
  screen.dispose();
  return result;
}

describe('readSpinnerProgress (Story 37.2 — grid token reader)', () => {
  it('reads an in-place 365→366 redraw as 366 — fusion "365366" structurally absent', async () => {
    // claude sweeps the counter on the SAME cell each frame. The linear buffer fused
    // these into "365366"; the grid overwrites, so only the final value survives.
    const p = await read([
      drawSpinner('✢ Moseying… (5s · ↓ 365 tokens)'),
      drawSpinner('✢ Moseying… (5s · ↓ 366 tokens)'),
    ]);
    expect(p).toEqual({ tokens: 366, elapsedSeconds: 5 });
  });

  it('sweeps many in-place frames and leaves no digit-run residue', async () => {
    const frames: string[] = [];
    for (let n = 360; n <= 366; n++) frames.push(drawSpinner(`✶ Thinking… (↓ ${n} tokens · 18s)`));
    const p = await read(frames);
    expect(p?.tokens).toBe(366);
  });

  it('expands the abbreviated "k" form (1.4k → 1400) the linear regex missed', async () => {
    const p = await read([drawSpinner('Flowing… (9s · ↓ 1.4k tokens · thinking with high effort)')]);
    expect(p).toEqual({ tokens: 1400, elapsedSeconds: 9 });
  });

  it('strips a thousands separator (12,345 → 12345)', async () => {
    const p = await read([drawSpinner('Crunched (12s · ↓ 12,345 tokens)')]);
    expect(p).toEqual({ tokens: 12345, elapsedSeconds: 12 });
  });

  it('reads the raw counter-only form ("↓ 108 tokens")', async () => {
    const p = await read([drawSpinner('Brewed ↓ 108 tokens')]);
    expect(p?.tokens).toBe(108);
    expect(p?.elapsedSeconds).toBe(0); // no leading "(Ns ·" clock → 0
  });

  it('returns null when no counter row is present (false-0 guard)', async () => {
    const p = await read([drawSpinner('✢ Deliberating…  esc to interrupt')]);
    expect(p).toBeNull();
  });

  it('returns null on a fully blank grid', async () => {
    const p = await read([]);
    expect(p).toBeNull();
  });

  it('reflects a segment-boundary reset (614→79) as the new value (change, not a freeze)', async () => {
    const p = await read([
      drawSpinner('Moseying… (16s · ↓ 614 tokens)'),
      drawSpinner('Moseying… (2s · ↓ 79 tokens)'),
    ]);
    expect(p).toEqual({ tokens: 79, elapsedSeconds: 2 });
  });

  it('sums the minute form "(1m 36s ·" to 96 and preserves bare seconds (Story 37.3 — Xm Ys)', async () => {
    // bare seconds: minutes default to 0, value unchanged from before (regression 0).
    const bare = await read([drawSpinner('Flowing… (9s · ↓ 365 tokens · thinking with high effort)')]);
    expect(bare?.elapsedSeconds).toBe(9);

    // "(1m 36s ·" — paren-anchored Xm Ys summation now reads minutes*60 + seconds = 96
    // (Story 37.2 deliberately pinned this to 0 and deferred the sum here; that pin is
    // intentionally reversed). The 36 is NOT taken alone — the minute segment is summed.
    const minute = await read([drawSpinner('Flowing… (1m 36s · ↓ 365 tokens)')]);
    expect(minute).toEqual({ tokens: 365, elapsedSeconds: 96 });
  });

  it('reads an in-place "1m 36s" → "1m 37s" redraw as the latest 97 (no fusion, grid overwrites)', async () => {
    // The clock advances on the SAME cell each frame. The grid overwrites in place, so the
    // settled row holds only the final "1m 37s" → 97 — never a fused "136137"/"96 97".
    const p = await read([
      drawSpinner('Moseying… (1m 36s · ↓ 365 tokens)'),
      drawSpinner('Moseying… (1m 37s · ↓ 366 tokens)'),
    ]);
    expect(p).toEqual({ tokens: 366, elapsedSeconds: 97 });
  });

  it('sums minute-form boundaries: "(2m 0s ·" → 120 and "(10m 5s ·" → 605', async () => {
    const twoMin = await read([drawSpinner('Crunched (2m 0s · ↓ 500 tokens)')]);
    expect(twoMin?.elapsedSeconds).toBe(120);
    const tenMin = await read([drawSpinner('Crunched (10m 5s · ↓ 9,001 tokens)')]);
    expect(tenMin?.elapsedSeconds).toBe(605);
  });

  it('takes the bottom-most counter row when more than one is present', async () => {
    // claude overwrites in place so this should not happen, but the reader must be
    // unambiguous: the freshest (lowest) rendered counter wins, rows are never merged.
    const p = await read([
      drawSpinner('Moseying… (3s · ↓ 100 tokens)', 18),
      drawSpinner('Moseying… (4s · ↓ 200 tokens)', 22),
    ]);
    expect(p).toEqual({ tokens: 200, elapsedSeconds: 4 });
  });

  it('joins a counter split across two writes once the grid settles (partial-write concatenation)', async () => {
    // A single rendered line arriving in two PTY chunks (NOT an in-place fusion) — the
    // second write continues at the cursor, so the settled grid holds one clean value.
    const p = await read([
      `${ESC}[20;1H${ESC}[2KMoseying… (9s · ↓ 36`,
      `5 tokens · thinking with high effort)`,
    ]);
    expect(p).toEqual({ tokens: 365, elapsedSeconds: 9 });
  });

  // Resume-repaint poisoning class (실측 2026-06-13): a quoted "↓ N tokens" in the scrollback body must
  // not be read as a live counter. These drive the pure reader with hand-built grids (the live counter
  // renders at the bottom; a quote sits far up, outside the live footer region).
  it('ignores a "↓ N tokens" counter QUOTED in far-up scrollback when no live counter is at the bottom', () => {
    const grid = [
      '   설명: 스피너는 "↓ 365 tokens" 처럼 토큰 수를 보여줍니다.',
      '   줄 2', '   줄 3', '   줄 4', '   줄 5', '   줄 6', '   줄 7', '   줄 8', '   줄 9',
      ' ✻ Thinking…',
      ' ❯ ',
    ];
    expect(readSpinnerProgress(grid)).toBeNull();
  });

  it('still reads a LIVE counter at the bottom even with a quoted one far up in scrollback', () => {
    const grid = [
      '   설명: "↓ 999 tokens" 같은 인용은 무시',
      '   줄 2', '   줄 3', '   줄 4', '   줄 5', '   줄 6', '   줄 7', '   줄 8', '   줄 9',
      ' ✻ Working… (3s · ↓ 42 tokens · esc to interrupt)',
      ' ❯ ',
    ];
    expect(readSpinnerProgress(grid)).toEqual({ tokens: 42, elapsedSeconds: 3 });
  });

  it('reads the "↑ N tokens" arrow form too (실측 2026-06-14 — a 22-min step showed "↑ 95.6k tokens", which the ↓-only regex MISSED → the UI looked frozen)', async () => {
    // claude renders the counter with ↑ for some phases; the old ↓-only regex returned null, so a long
    // ↑-phase emitted no progress and the user could not tell "frozen" from "slow". Both arrows now read.
    const p = await read([drawSpinner('✶ Adding unit + flow tests… (22m 22s · ↑ 95.6k tokens · esc to interrupt)')]);
    expect(p).toEqual({ tokens: 95600, elapsedSeconds: 1342 }); // 22m 22s = 1342s; 95.6k → 95600
  });
});
