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

import { describe, it, expect } from 'vitest';
import {
  createCliScreenModel,
  CLI_SCREEN_COLS,
  CLI_SCREEN_ROWS,
} from '../cliScreenModel.js';

// --- ANSI helpers (model claude's in-place redraw) ---------------------------
const ESC = '\x1b';
const clearScreen = () => `${ESC}[2J${ESC}[H`;
/** Position cursor at 1-based row/col, erase the whole line, then write text. */
const drawLine = (row: number, text: string, col = 1) =>
  `${ESC}[${row};${col}H${ESC}[2K${text}`;

describe('cliScreenModel', () => {
  it('exposes the 120×40 default geometry constants', () => {
    expect(CLI_SCREEN_COLS).toBe(120);
    expect(CLI_SCREEN_ROWS).toBe(40);
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
