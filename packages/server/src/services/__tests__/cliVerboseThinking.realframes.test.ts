/**
 * Story 37.9 AC1 — verbose:true expanded-mode spawn (REAL PTY A/B discrimination)
 *
 * AC1 spawns the interactive `claude` with the session-scoped `verbose: true` setting so that
 * thinking / long output renders EXPANDED (not collapsed behind "(ctrl+o to expand)"), giving
 * Story 37.10 a fully-painted screen to stream cards from. The first QA pass raised
 * AC1-VERIFY-DISCRIMINATION: the original verbose:true fixture carried no collapse marker, but
 * its captured turn was too SHORT to ever collapse — so "marker absent" did not prove that
 * verbose actively prevents folding (it could just be a short turn). This file closes that gap.
 *
 * Both fixtures are REAL node-pty captures of the SAME bundled binary (claude v2.1.177) answering
 * the SAME ultrathink prompt (a by-hand derangement D_12 computation that forces a long, many-line
 * thinking block with a short final answer). The ONLY difference between the two runs is the
 * `verbose` flag in `--settings`:
 *
 *   - CONTROL  (verbose:false): a 22s thinking block COLLAPSES to "Thought for 22s (ctrl+o to
 *     expand)" — the multi-line reasoning is hidden behind the expand affordance.
 *   - TREATMENT (verbose:true): the same-prompt thinking (14s, well past the ~3s+ fold threshold
 *     the control and the older HAMMOC_CLI_PTY_DUMP both demonstrate) renders EXPANDED inline —
 *     the `∴` thinking-detail lines and the term-by-term work are visible, with ZERO collapse
 *     markers anywhere in the stream.
 *
 * Because the control proves this very prompt produces a foldable-length thinking block, the
 * treatment's *positively expanded* reasoning + zero markers is a DISCRIMINATING signal: verbose
 * actively keeps thinking expanded. This locks the AC1 mechanism (option (a) of the spike) against
 * a future binary that might change the folding behavior.
 *
 * The fixtures are base64 of the raw PTY stream (base64 is git-safe: the raw stream is full of
 * control bytes / CRs that line-ending normalization would corrupt). server runs with
 * `globals: false`, so vitest primitives are imported explicitly.
 *
 * @see docs/stories/37.9.story.md
 * @see packages/server/src/services/cliChatEngine.ts (settingsObj.verbose = true)
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/** Decode a base64 PTY-capture fixture to its raw UTF-8 stream. */
function decodeFixture(name: string): string {
  return Buffer.from(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8').trim(), 'base64').toString('utf8');
}

/** Strip ANSI CSI sequences and OSC title sets so plain-text assertions are stable. */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
}

const CONTROL = stripAnsi(decodeFixture('cli-verbose-off-long-thinking.b64.txt')); // verbose:false
const TREATMENT = stripAnsi(decodeFixture('cli-verbose-on-long-thinking.b64.txt')); // verbose:true

describe('Story 37.9 AC1 — verbose:true keeps long thinking EXPANDED (real PTY A/B)', () => {
  it('both captures are non-trivial real PTY streams (fixture sanity)', () => {
    expect(CONTROL.length).toBeGreaterThan(5_000);
    expect(TREATMENT.length).toBeGreaterThan(5_000);
  });

  it('CONTROL (verbose:false): a long (≥10s) thinking block COLLAPSES behind "(ctrl+o to expand)"', () => {
    // Two-digit seconds → the thinking ran ≥10s, i.e. long enough that folding is expected.
    expect(CONTROL).toMatch(/Thought for \d{2,}s\b/);
    // And it is in fact collapsed, with the expand affordance — proving THIS prompt yields a
    // foldable-length thinking block (so the treatment below is a fair A/B, not a short-turn fluke).
    expect(CONTROL).toMatch(/Thought for \d+s\s*\(ctrl\+[a-z] to expand\)/);
  });

  it('TREATMENT (verbose:true): the SAME-prompt thinking renders EXPANDED with NO collapse marker', () => {
    // The discriminator. (1) NOT a short turn: the stream shows prolonged thinking.
    expect(TREATMENT).toMatch(/still thinking with high effort/);
    // (2) ZERO collapse affordances anywhere — verbose did not fold the thinking.
    expect(/ctrl\+[a-z] to expand/i.test(TREATMENT)).toBe(false);
    // (3) Positively expanded: the reasoning claude painted inline is visible (∴ detail glyph +
    // the actual term-by-term derangement work), not merely absent because the turn was short.
    expect(TREATMENT).toContain('∴');
    expect(TREATMENT).toMatch(/alternating|479001600/i);
  });
});
