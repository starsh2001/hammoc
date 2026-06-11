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
 * segment-boundary reset read as a change; and the elapsed-clock rule — bare seconds
 * parse, while a minute form "(1m 36s ·" yields 0 (paren-anchored, current behavior
 * preserved; accurate "Xm Ys" summation is Story 37.3).
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

  it('parses bare-seconds elapsed but yields 0 for a minute form (Story 37.3 owns Xm Ys)', async () => {
    const bare = await read([drawSpinner('Flowing… (9s · ↓ 365 tokens · thinking with high effort)')]);
    expect(bare?.elapsedSeconds).toBe(9);

    // "(1m 36s ·" — the char after "(" is "1m", not digits+s, so the paren-anchored
    // clock does NOT match and elapsed falls through to 0 (CURRENT behavior preserved).
    // The 36 must NOT leak through as seconds; summing "1m 36s" is Story 37.3's job.
    const minute = await read([drawSpinner('Flowing… (1m 36s · ↓ 365 tokens)')]);
    expect(minute).toEqual({ tokens: 365, elapsedSeconds: 0 });
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
});
