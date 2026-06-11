/**
 * CLI Screen Model — REAL captured-frame regression (Epic 37 — Story 37.1, GATE-37.1-1)
 *
 * The sibling `cliScreenModel.test.ts` proves the screen model against frames that
 * *faithfully model* claude v2.1.162's redraw mechanics. QA gate GATE-37.1-1 flagged
 * that the epic-gating GO judgment rested on *modeled* frames rather than *real* PTY
 * bytes captured from a live claude session. This file closes that gap: it replays an
 * actual capture — collected via the shipped opt-in dump (`HAMMOC_CLI_PTY_DUMP=1`)
 * over a live CLI chat — through the same screen model and asserts the same invariants
 * (token-counter fusion structurally absent, permission-mode status row standalone,
 * box/separator chrome reconstructed) now pinned against *real* output.
 *
 * The fixture is a base64 prefix of one raw dump (base64 is git-safe: the raw stream is
 * full of control bytes / CRs that line-ending normalization would corrupt). It is
 * decoded to the original PTY string and fed verbatim.
 *
 * NOTE: the raw stream does NOT contain rendered phrases like "↓ 108 tokens"
 * contiguously — claude interleaves color escapes between the number and the unit, so
 * such phrases only become contiguous *after* the emulator renders the grid. Every
 * assertion below therefore reads the rendered grid, never the raw bytes.
 *
 * server runs with `globals: false`, so vitest primitives are imported explicitly.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { createCliScreenModel, CLI_SCREEN_ROWS } from '../cliScreenModel.js';

// Decode the committed real capture to its original PTY string.
const REAL_DUMP = Buffer.from(
  readFileSync(new URL('./fixtures/cli-real-pty-dump.b64.txt', import.meta.url), 'utf8').trim(),
  'base64',
).toString('utf8');

// A spinner token-counter as it appears *rendered*: "↓ 108 tokens", "↓ 1.4k tokens".
const COUNTER = /↓ ?[\d.,]+k? tokens/g;

describe('cliScreenModel — real captured claude v2.1.162 frames (GATE-37.1-1)', () => {
  it('decodes a non-trivial real capture (fixture sanity)', () => {
    expect(REAL_DUMP.length).toBeGreaterThan(10_000);
  });

  it('renders the real capture as a faithful 40-row grid (status row + chrome)', async () => {
    const screen = createCliScreenModel();
    screen.write(REAL_DUMP);
    await screen.flush();
    const grid = screen.readGrid();

    expect(grid).toHaveLength(CLI_SCREEN_ROWS);

    // (d) permission-mode status row reconstructs as a clean STANDALONE line —
    // not fused with the input-box chrome above it, not fused with a spinner counter.
    const status = grid.find((r) => r.includes('bypass permissions on'));
    expect(status).toBeDefined();
    // claude indents the status row; translateToString trims only the right side.
    expect(status).toMatch(/^\s*⏵⏵ bypass permissions on \(shift\+tab to cycle\)/);
    expect(status).not.toMatch(/[│╭╮╰╯]/);
    expect(status).not.toContain('tokens');

    // (b) box/separator chrome reconstructs: a full-width rule and the input prompt.
    expect(grid.some((r) => /^─{100,}$/.test(r))).toBe(true);
    expect(grid.some((r) => r.startsWith('❯'))).toBe(true);

    screen.dispose();
  });

  it('never fuses the token counter across the whole real stream, and reads real spinner frames', async () => {
    // The linear-buffer fusion bug ("365" + "366" → "365366") would surface as a row
    // carrying TWO counters. Replay the real stream incrementally and assert the
    // invariant holds at every settled point — fusion is structurally impossible in a
    // grid that overwrites in place.
    const screen = createCliScreenModel();
    const seenSpinner = new Set<string>();
    const STEP = 1024;

    for (let i = 0; i < REAL_DUMP.length; i += STEP) {
      screen.write(REAL_DUMP.slice(i, i + STEP));
      await screen.flush();
      for (const row of screen.readGrid()) {
        const hits = (row.match(COUNTER) || []).length;
        expect(hits).toBeLessThanOrEqual(1);
        if (hits === 1 && /Flowing…|Crunched|Brewed/.test(row)) {
          // Drop the rotating spinner glyph prefix so frames dedupe by content.
          seenSpinner.add(row.replace(/^[^A-Za-z]+/, ''));
        }
      }
    }

    // The capture really did exercise an active spinner...
    expect(seenSpinner.size).toBeGreaterThan(0);
    // ...and at least one frame read as a clean, complete, single-counter line.
    expect(
      [...seenSpinner].some((r) => /Flowing… \(\d+s · ↓ [\d.,]+k? tokens/.test(r)),
    ).toBe(true);

    screen.dispose();
  });

  it('reconstructs a specific real spinner frame (↓ 108 tokens) as a single clean value', async () => {
    // Incrementally feed until the grid first shows this frame — no hard-coded byte
    // offset (the raw position of color-interleaved text is opaque); the committed
    // fixture makes the rendered result deterministic.
    const screen = createCliScreenModel();
    let row: string | undefined;
    const STEP = 512;
    for (let i = 0; i < REAL_DUMP.length && !row; i += STEP) {
      screen.write(REAL_DUMP.slice(i, i + STEP));
      await screen.flush();
      row = screen.readGrid().find((r) => r.includes('108 tokens'));
    }

    expect(row).toBeDefined();
    const found = row ?? '';
    expect(found).toMatch(/Flowing….*↓ 108 tokens/);
    // exactly one counter on the row — the prior frame left no residue.
    expect((found.match(COUNTER) || []).length).toBe(1);

    screen.dispose();
  });
});
