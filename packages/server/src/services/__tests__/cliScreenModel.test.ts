/**
 * CLI Screen Model — unit tests (Epic 37 — Story 37.1)
 *
 * Story 37.1 is the technical feasibility gate for Epic 37: prove that feeding
 * claude's raw PTY frames (ANSI intact) into a headless xterm reconstructs the
 * *final screen grid* faithfully, so that fusion ("365" + "366" → "365366") is
 * **structurally impossible** and modal/status rows survive row-by-row.
 *
 * These fixtures model claude v2.1.162's real redraw mechanics — absolute cursor
 * addressing (`CSI <row>;<col> H`), line erase (`CSI 2K`), screen clear
 * (`CSI 2J` + home), and box-drawing chrome — the exact ANSI the emulator must
 * interpret. The emulator behavior was first verified empirically against the
 * installed `@xterm/headless` (Task 1); these lock it as a deterministic regression.
 *
 * server runs with `globals: false`, so vitest primitives are imported explicitly.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  createCliScreenModel,
  CLI_SCREEN_COLS,
  CLI_SCREEN_ROWS,
} from '../cliScreenModel.js';
import { parseGridCards } from '../cliGridCards.js';
import { scrollbackBodyRows } from '../cliGridRegion.js';

// --- ANSI helpers (model claude's in-place redraw) ---------------------------
const ESC = '\x1b';
const clearScreen = () => `${ESC}[2J${ESC}[H`;
/** Position cursor at 1-based row/col, erase the whole line, then write text. */
const drawLine = (row: number, text: string, col = 1) =>
  `${ESC}[${row};${col}H${ESC}[2K${text}`;

describe('cliScreenModel', () => {
  it('exposes the 120×80 default geometry constants', () => {
    expect(CLI_SCREEN_COLS).toBe(120);
    expect(CLI_SCREEN_ROWS).toBe(80);
  });

  it('reconstructs a screen with exactly `rows` grid lines', async () => {
    const screen = createCliScreenModel();
    screen.write(clearScreen());
    screen.write(drawLine(1, 'first row'));
    screen.write(drawLine(2, 'second row'));
    await screen.flush();

    const grid = screen.readGrid();
    expect(grid).toHaveLength(CLI_SCREEN_ROWS);
    expect(grid[0]).toBe('first row');
    expect(grid[1]).toBe('second row');
    // Trailing rows are blank, not undefined.
    expect(grid[39]).toBe('');
    screen.dispose();
  });

  it('honors a custom geometry', async () => {
    const screen = createCliScreenModel(40, 10);
    screen.write(clearScreen());
    screen.write(drawLine(3, 'hi'));
    await screen.flush();
    const grid = screen.readGrid();
    expect(grid).toHaveLength(10);
    expect(grid[2]).toBe('hi');
    screen.dispose();
  });

  // --- AC2(a): spinner counter — final value only, fusion structurally absent --
  it('reads only the FINAL spinner value with no fusion (in-place redraw)', async () => {
    const screen = createCliScreenModel();
    screen.write(clearScreen());
    // claude sweeps the spinner counter on a fixed status row, erasing+rewriting
    // the SAME row each frame. A linear strip would concatenate these into
    // "365366367…"; the emulator overwrites in place.
    const STATUS_ROW = 20;
    for (let n = 360; n <= 366; n++) {
      screen.write(drawLine(STATUS_ROW, `✶ Thinking… (↓ ${n} tokens · ${n - 348}s)`));
    }
    await screen.flush();

    const grid = screen.readGrid();
    const statusLine = grid[STATUS_ROW - 1];
    expect(statusLine).toBe('✶ Thinking… (↓ 366 tokens · 18s)');
    // The fusion bug, asserted gone structurally: no row anywhere contains a
    // run-on counter, and the intermediate values left no residue.
    const whole = screen.readScreenText();
    expect(whole).toContain('366 tokens');
    expect(whole).not.toContain('365366');
    expect(whole).not.toContain('365 tokens'); // the prior frame was overwritten
    screen.dispose();
  });

  it('handles a thousands-separated counter without digit-run fusion', async () => {
    const screen = createCliScreenModel();
    screen.write(clearScreen());
    const ROW = 20;
    screen.write(drawLine(ROW, '↓ 9,999 tokens'));
    screen.write(drawLine(ROW, '↓ 10,001 tokens'));
    await screen.flush();
    const line = screen.readGrid()[ROW - 1];
    expect(line).toBe('↓ 10,001 tokens');
    expect(line).not.toContain('9,99910,001');
    screen.dispose();
  });

  // --- AC2(b): permission modal — REAL borderless format (claude v2.1.162) ------
  it('reconstructs a real-format (borderless) permission modal row-by-row', async () => {
    const screen = createCliScreenModel();
    screen.write(clearScreen());
    // Real claude v2.1.162 permission prompts are BORDERLESS — verified against a
    // captured live PTY dump (Story 37.1 follow-up). An earlier modeled version drew a
    // ╭─╮ box that real claude does NOT use; corrected here to the observed format:
    // a question line, indented numbered options, and an "Esc to cancel" footer.
    const top = 30;
    const lines = [
      ' Do you want to create probe-real-frames.mjs?',
      ' ❯ 1. Yes',
      '   2. Yes, allow all edits during this session (shift+tab)',
      '   3. No',
      ' Esc to cancel · Tab to amend',
    ];
    lines.forEach((text, i) => screen.write(drawLine(top + i, text)));
    await screen.flush();

    const grid = screen.readGrid();
    lines.forEach((text, i) => {
      expect(grid[top + i - 1]).toBe(text);
    });
    // No box-drawing chrome anywhere — real claude modals are borderless.
    expect(grid.some((r) => /[│╭╮╰╯]/.test(r))).toBe(false);
    expect(grid[top + 1 - 1]).toBe(' ❯ 1. Yes');
    expect(grid[top + 4 - 1]).toContain('Esc to cancel · Tab to amend');
    screen.dispose();
  });

  // --- AC2(c): question (AskUserQuestion) modal — borderless selection box (header chrome varies) -
  it('reconstructs a borderless question modal (cursor + indented descriptions)', async () => {
    const screen = createCliScreenModel();
    screen.write(clearScreen());
    // claude v2.1.162's AskUserQuestion modal is borderless: a question line, then
    // numbered options each with an indented description; the SELECTED option carries
    // the ❯ cursor at column 0, unselected options are indented. Two real captured
    // samples agreed on this STRUCTURE but DIFFERED on header chrome — one showed a
    // ` ☐ <header> ` line, another had none — so the header is intentionally NOT
    // asserted here; the load-bearing check is the structural reconstruction.
    const top = 24;
    const lines = [
      'Which database should we use?',
      '❯ 1. PostgreSQL',
      '     Robust relational database, great for complex queries.',
      '  2. SQLite',
      '     Lightweight, file-based, zero-config.',
    ];
    lines.forEach((text, i) => screen.write(drawLine(top + i, text)));
    await screen.flush();

    const grid = screen.readGrid();
    lines.forEach((text, i) => {
      expect(grid[top + i - 1]).toBe(text);
    });
    expect(grid[top + 1 - 1]).toBe('❯ 1. PostgreSQL'); // selected — cursor at column 0
    expect(grid[top + 3 - 1]).toBe('  2. SQLite'); // unselected — indented
    expect(grid.some((r) => /[│╭╮╰╯]/.test(r))).toBe(false); // borderless
    screen.dispose();
  });

  // --- AC2(d): permission-mode status row stands alone ------------------------
  it('reconstructs the permission-mode status row as a standalone line', async () => {
    const screen = createCliScreenModel();
    screen.write(clearScreen());
    const STATUS_ROW = 38;
    screen.write(drawLine(STATUS_ROW, '⏵⏵ accept edits on (shift+tab to cycle) · 12 tokens'));
    await screen.flush();
    const line = screen.readGrid()[STATUS_ROW - 1];
    expect(line).toBe('⏵⏵ accept edits on (shift+tab to cycle) · 12 tokens');
    expect(line).toContain('accept edits on');
    screen.dispose();
  });

  it('reflects a permission-mode cycle in place (no stale mode residue)', async () => {
    const screen = createCliScreenModel();
    screen.write(clearScreen());
    const ROW = 38;
    screen.write(drawLine(ROW, '⏵⏵ accept edits on (shift+tab to cycle)'));
    screen.write(drawLine(ROW, '⏵⏵ bypass permissions on (shift+tab to cycle)'));
    await screen.flush();
    const line = screen.readGrid()[ROW - 1];
    expect(line).toBe('⏵⏵ bypass permissions on (shift+tab to cycle)');
    expect(line).not.toContain('accept edits');
    screen.dispose();
  });

  // --- robustness: empty / partial frames / dispose ---------------------------
  it('handles an empty screen (no writes) as all-blank rows', async () => {
    const screen = createCliScreenModel();
    await screen.flush();
    const grid = screen.readGrid();
    expect(grid).toHaveLength(CLI_SCREEN_ROWS);
    expect(grid.every((row) => row === '')).toBe(true);
    expect(screen.readScreenText()).toBe('\n'.repeat(CLI_SCREEN_ROWS - 1));
    screen.dispose();
  });

  it('tolerates a partial ANSI frame split across writes', async () => {
    const screen = createCliScreenModel();
    screen.write(clearScreen());
    // A single CSI sequence + text deliberately split mid-escape across two writes.
    screen.write(`${ESC}[5`);
    screen.write(`;1H${ESC}[2Khalf-and-half`);
    await screen.flush();
    expect(screen.readGrid()[4]).toBe('half-and-half');
    screen.dispose();
  });

  it('dispose() is safe to call and idempotent', async () => {
    const screen = createCliScreenModel();
    screen.write('something');
    await screen.flush();
    expect(() => screen.dispose()).not.toThrow();
    expect(() => screen.dispose()).not.toThrow();
  });

  // --- Story 37.11 AC5: scrollback read recovers an over-tall block's HEAD ------
  // 130 newline-terminated rows scroll the head off an 80-row viewport (baseY advances).
  const overflow130 = (): string => {
    let data = 'HEADX\r\n';
    for (let i = 2; i <= 129; i++) data += `filler-${i}\r\n`;
    return data + 'TAILX\r\n';
  };

  it('readGrid(scrollbackRows) recovers a scrolled-off block HEAD the viewport-only read drops', async () => {
    const screen = createCliScreenModel();
    screen.write(overflow130());
    await screen.flush();

    const viewport = screen.readGrid();   // [baseY, baseY+rows) — the footer-detector read (default 0)
    const full = screen.readGrid(500);    // viewport + up to 500 scrollback rows — the card read

    expect(viewport).toHaveLength(CLI_SCREEN_ROWS);
    expect(viewport.some((r) => r === 'HEADX')).toBe(false);  // head scrolled OFF the viewport
    expect(viewport.some((r) => r === 'TAILX')).toBe(true);   // only the tail is visible
    expect(full.some((r) => r === 'HEADX')).toBe(true);       // scrollback read RECOVERS the head
    expect(full.some((r) => r === 'TAILX')).toBe(true);
    expect(full.length).toBeGreaterThan(CLI_SCREEN_ROWS);
    screen.dispose();
  });

  it('readBulletColors(scrollbackRows) stays index-aligned with readGrid(scrollbackRows)', async () => {
    const screen = createCliScreenModel();
    screen.write(overflow130());
    await screen.flush();
    expect(screen.readBulletColors(500).length).toBe(screen.readGrid(500).length);
    expect(screen.readBulletColors().length).toBe(CLI_SCREEN_ROWS); // default 0 = viewport (unchanged)
    screen.dispose();
  });

  it('serialize() stays VIEWPORT-ONLY so the scrollback retention never bloats the mirror frame', async () => {
    const screen = createCliScreenModel();
    screen.write(overflow130());
    await screen.flush();
    const frame = screen.serialize();
    expect(frame).not.toContain('HEADX'); // scrolled-off head is NOT in the mirror frame
    expect(frame).toContain('TAILX');     // the visible tail IS
    screen.dispose();
  });

  it('recovers an over-tall block head from a REAL overflow capture (Story 37.11 AC5)', async () => {
    // Real node-pty capture: claude printed 130 "ROW-k" lines (> the 80-row viewport), so the head
    // ROW-1 scrolled off. 실측 2026-06-16: the viewport-only read sees only the tail (the parser gets
    // 0 cards from the glyph-less continuation); the scrollback read recovers the head → the `●` block
    // parses as ONE complete text card. Pins that claude SCROLLS over-tall output into scrollback.
    const RAW = Buffer.from(
      readFileSync(new URL('./fixtures/cli-overflow-block.b64.txt', import.meta.url), 'utf8').trim(),
      'base64',
    ).toString('utf8');
    const screen = createCliScreenModel();
    let viewportLostHeadButFullKeptIt = false;
    let fullCardSpannedHeadToTail = false;
    const STEP = 600;
    for (let i = 0; i < RAW.length; i += STEP) {
      screen.write(RAW.slice(i, i + STEP));
      await screen.flush();
      const vpHead = screen.readGrid().some((r) => /\bROW-1\b/.test(r));
      const fullHead = screen.readGrid(500).some((r) => /\bROW-1\b/.test(r));
      if (!vpHead && fullHead) viewportLostHeadButFullKeptIt = true;
      const card = parseGridCards(scrollbackBodyRows(screen.readGrid(500))).find((c) => c.kind === 'text');
      if (card && /\bROW-1\b/.test(card.text) && /\bROW-130\b/.test(card.text)) fullCardSpannedHeadToTail = true;
    }
    screen.dispose();
    expect(viewportLostHeadButFullKeptIt).toBe(true);  // the gap the fix closes
    expect(fullCardSpannedHeadToTail).toBe(true);       // scrollback read → ONE complete card (head→tail)
  });

  it('markTurnStart() floors the scrollback read at the turn boundary — excludes pre-mark content (Story 37.11 AC3)', async () => {
    const screen = createCliScreenModel();
    // Simulate a resume boot-repaint of the PRIOR conversation (30 lines).
    let prev = '';
    for (let i = 1; i <= 30; i++) prev += `PREVCONV-${i}\r\n`;
    screen.write(prev);
    await screen.flush();
    expect(screen.readGrid(500).some((r) => r.startsWith('PREVCONV'))).toBe(true); // visible BEFORE the mark

    // Generation starts → mark the boundary; the current turn then paints an OVER-TALL block that
    // scrolls the prior repaint up (실측: marking at generation-start leaks the prior turn in 0 frames).
    screen.markTurnStart();
    let curr = '';
    for (let i = 1; i <= 130; i++) curr += `CURRTURN-${i}\r\n`;
    screen.write(curr);
    await screen.flush();

    const full = screen.readGrid(500);
    expect(full.some((r) => r.startsWith('PREVCONV'))).toBe(false); // prior conversation FLOORED OUT
    expect(full.some((r) => r === 'CURRTURN-1')).toBe(true);        // current-turn HEAD still recovered
    expect(full.some((r) => r === 'CURRTURN-130')).toBe(true);      // current-turn tail
    // The viewport read (scrollbackRows=0) is never floored — detectors still see the live bottom.
    expect(screen.readGrid().some((r) => r === 'CURRTURN-130')).toBe(true);
    screen.dispose();
  });

  it('isolates state between independent model instances', async () => {
    const a = createCliScreenModel();
    const b = createCliScreenModel();
    a.write(clearScreen());
    a.write(drawLine(1, 'model A'));
    b.write(clearScreen());
    b.write(drawLine(1, 'model B'));
    await a.flush();
    await b.flush();
    expect(a.readGrid()[0]).toBe('model A');
    expect(b.readGrid()[0]).toBe('model B');
    a.dispose();
    b.dispose();
  });
});

/**
 * Story 37.8 — serialize() feeds the full-screen mirror. Proves the serialize addon works on
 * the headless emulator (GO/NO-GO) and is COLOR-preserving, while readGrid() stays plain text
 * so the detector path (progress / modal / usage-limit) is unaffected.
 */
describe('cliScreenModel.serialize (Story 37.8)', () => {
  it('serializes the current screen content to a string', async () => {
    const screen = createCliScreenModel(CLI_SCREEN_COLS, CLI_SCREEN_ROWS);
    screen.write('hello world');
    await screen.flush();
    const out = screen.serialize();
    expect(typeof out).toBe('string');
    expect(out).toContain('hello world');
    screen.dispose();
  });

  it('preserves ANSI color (an SGR escape survives) in the serialized frame', async () => {
    const screen = createCliScreenModel(CLI_SCREEN_COLS, CLI_SCREEN_ROWS);
    // Red "ERR", then reset, then plain " ok".
    screen.write('\x1b[31mERR\x1b[0m ok');
    await screen.flush();
    const out = screen.serialize();
    expect(out).toContain('ERR');
    // The serialized frame re-emits styling as ANSI escapes — color is NOT stripped.
    expect(out).toContain('\x1b[');
    screen.dispose();
  });

  it('readGrid stays plain text (no ANSI) — the detector path is unchanged', async () => {
    const screen = createCliScreenModel(CLI_SCREEN_COLS, CLI_SCREEN_ROWS);
    screen.write('\x1b[31mRED\x1b[0m');
    await screen.flush();
    const joined = screen.readGrid().join('');
    expect(joined).toContain('RED');
    expect(joined).not.toContain('\x1b'); // plain text — escapes stripped by translateToString
    screen.dispose();
  });
});
