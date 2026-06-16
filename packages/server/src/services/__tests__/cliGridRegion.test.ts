/**
 * cliGridRegion — live-footer / scrollback-body region helpers (Epic 37).
 *
 * Pure string-array functions (grid rows in, region out), so they're driven with hand-built rows.
 * `scrollbackBodyRows` (Story 37.10) is the inverse of `liveFooterRows`: it returns the rows ABOVE
 * the live footer so the card parser never folds the spinner / input box into a card. The cut anchor
 * is the BOTTOMMOST live-footer marker (a scrollback line that merely *quotes* one sits above it —
 * the ISSUE-99 anti-poisoning discipline).
 *
 * server runs with `globals: false`, so vitest primitives are imported explicitly.
 */

import { describe, it, expect } from 'vitest';
import { liveFooterRows, scrollbackBodyRows } from '../cliGridRegion.js';

describe('scrollbackBodyRows (Story 37.10 — body above the live footer)', () => {
  it('cuts at the generation spinner footer ("esc to interrupt")', () => {
    const grid = [
      '  Thought for 5s',
      '● Write(probe.txt)',
      '  ⎿  Wrote 5 lines',
      '✶ Flowing… (5s · ↓ 1.2k tokens · esc to interrupt)',
      'auto mode on',
    ];
    expect(scrollbackBodyRows(grid)).toEqual(['  Thought for 5s', '● Write(probe.txt)', '  ⎿  Wrote 5 lines']);
  });

  it('cuts at the idle input box (❯) when no spinner is present', () => {
    const grid = ['● The answer body.', '', '❯ ', 'auto mode on'];
    expect(scrollbackBodyRows(grid)).toEqual(['● The answer body.', '']);
  });

  it('cuts at a bare token counter footer ("↑/↓ N tokens")', () => {
    const grid = ['● Bash(echo hi)', '  ⎿  hi', '↑ 980 tokens'];
    expect(scrollbackBodyRows(grid)).toEqual(['● Bash(echo hi)', '  ⎿  hi']);
  });

  it('takes the BOTTOMMOST anchor — a scrollback line quoting "esc to interrupt" stays in the body', () => {
    const grid = [
      '● Earlier I mentioned "esc to interrupt" in passing.', // quoted in scrollback — must NOT be the cut
      '● Write(probe.txt)',
      '✶ Flowing… (2s · esc to interrupt)', // the REAL live footer (bottommost)
    ];
    const body = scrollbackBodyRows(grid);
    expect(body).toEqual([
      '● Earlier I mentioned "esc to interrupt" in passing.',
      '● Write(probe.txt)',
    ]);
  });

  it('returns the whole grid when there is no live-footer anchor (pure scrollback frame)', () => {
    const grid = ['● A card', '  continuation', '● Another card'];
    expect(scrollbackBodyRows(grid)).toEqual(grid);
  });

  it('is the structural complement of liveFooterRows (body + footer cover the live frame)', () => {
    const grid = ['● body card', '✶ Flowing… (1s · esc to interrupt)', 'auto mode on'];
    // The body stops before the spinner; the live footer cluster includes it.
    expect(scrollbackBodyRows(grid)).toEqual(['● body card']);
    expect(liveFooterRows(grid)).toContain('✶ Flowing… (1s · esc to interrupt)');
  });
});
