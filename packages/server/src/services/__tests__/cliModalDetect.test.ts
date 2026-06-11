/**
 * cliModalDetect pure-reader tests (Epic 37 — Story 37.4)
 *
 * The permission / question / usage-limit detectors are pure functions of the settled screen
 * GRID, so they are exercised here with hand-built grid rows — NO engine, NO node-pty, NO PTY
 * frames (the pattern Stories 37.2/37.3 established with `readSpinnerProgress`). Existence
 * detectors take the grid joined to text (`readScreenText()`); the row-structure parsers
 * (`parseQuestionModal` / `parsePrecedingText`) take the grid ROWS directly — reading rows is
 * the whole point of the 32.8 box-chrome resolution.
 *
 * @see docs/stories/37.4.story.md
 */

import { describe, it, expect } from 'vitest';
import {
  detectPermissionDialog,
  detectUsageLimit,
  extractToolName,
  extractPromptSentence,
  detectQuestionModal,
  parseQuestionModal,
  parsePrecedingText,
} from '../cliModalDetect.js';

/** Join grid rows the way `readScreenText()` does, for the line-spanning existence detectors. */
const text = (rows: string[]): string => rows.join('\n');

describe('cliModalDetect (Story 37.4 — pure grid readers)', () => {
  describe('detectPermissionDialog', () => {
    const DIALOG = [
      ' ● Write(probe.txt)',
      ' Do you want to create probe.txt?',
      ' ❯ 1. Yes',
      '   2. Yes, allow all edits during this session',
      '   3. No',
      ' Esc to cancel · Tab to amend',
    ];

    it('detects only when the permission phrase AND the rendered footer are both present', () => {
      expect(detectPermissionDialog(text(DIALOG))).toBe(true);
      // The "Yes, allow all edits" phrase alone (with footer) also qualifies.
      expect(detectPermissionDialog(text([' Yes, allow all edits during this session', ' Esc to cancel']))).toBe(true);
    });

    it('does NOT detect a half-drawn dialog (phrase present, footer not yet painted)', () => {
      // On the grid the footer row simply has not rendered yet — the AND-of-footer withholds.
      expect(detectPermissionDialog(text([' Do you want to create probe.txt?', ' ❯ 1. Yes']))).toBe(false);
    });

    it('does NOT detect ordinary generation output (no permission phrase)', () => {
      expect(detectPermissionDialog(text(['❯ run the bash command', '· Actioning…  esc to interrupt']))).toBe(false);
    });
  });

  describe('extractToolName / extractPromptSentence', () => {
    it('maps the dialog verb to a tool name', () => {
      expect(extractToolName('Do you want to create probe.txt?')).toBe('Write');
      expect(extractToolName('Do you want to edit config.ts?')).toBe('Edit');
      expect(extractToolName('Do you want to run the build?')).toBe('Bash');
      expect(extractToolName('Do you want to read secrets.env?')).toBe('Read');
      expect(extractToolName('Do you want to fetch https://x.test?')).toBe('WebFetch');
    });

    it('falls back to the "● Tool(…)" header hint, else "Tool"', () => {
      expect(extractToolName(' ● Grep(pattern) running')).toBe('Grep');
      expect(extractToolName('no recognizable verb or header')).toBe('Tool');
    });

    it('extracts the prompt sentence verbatim, else a safe default', () => {
      expect(extractPromptSentence(' Do you want to create probe.txt?')).toBe('Do you want to create probe.txt?');
      expect(extractPromptSentence('nothing here')).toBe('Claude is requesting tool permission');
    });
  });

  describe('detectUsageLimit', () => {
    it('detects an exhaustion notice with a window qualifier and a reset clause', () => {
      expect(detectUsageLimit("You've hit your weekly limit · resets 1am (Asia/Seoul)")).toMatch(/weekly limit/i);
      expect(detectUsageLimit('Your 5-hour limit reached — resets at 3pm')).toMatch(/5-hour limit/i);
    });

    it('returns null for the still-usable percentage warning (97%)', () => {
      expect(detectUsageLimit("You've used 97% of your weekly limit · resets 1am")).toBeNull();
    });

    it('returns null without a reset clause (avoid stopping a healthy turn on a stray mention)', () => {
      expect(detectUsageLimit("You've hit your weekly limit while testing")).toBeNull();
    });
  });

  describe('detectQuestionModal (mutual exclusion with the permission path)', () => {
    const Q_FOOTER = ' Enter to select · ↑/↓ to navigate · Esc to cancel';

    it('detects only with BOTH the nav footer and the "Chat about this" affordance', () => {
      expect(detectQuestionModal(text([' ❯ 1. Red', '   5. Chat about this', Q_FOOTER]))).toBe(true);
      // Footer but no affordance (a different list UI) → not a question modal.
      expect(detectQuestionModal(text([' ❯ 1. Option A', Q_FOOTER]))).toBe(false);
    });

    it('never cross-fires with a permission dialog (disjoint signatures)', () => {
      const permText = text([' Do you want to create probe.txt?', ' Esc to cancel · Tab to amend']);
      const questionText = text([' ❯ 1. Red', '   5. Chat about this', Q_FOOTER]);
      expect(detectQuestionModal(permText)).toBe(false); // perm dialog has no "to navigate"
      expect(detectPermissionDialog(questionText)).toBe(false); // question modal has no perm phrase
    });
  });

  describe('parseQuestionModal (row-structure scrape — the 32.8 box-chrome resolution)', () => {
    it('scrapes a single-question modal in grid row order (option index = ↓ navigation index)', () => {
      const rows = [
        ' ☐ Color',
        ' Which color do you want?',
        ' ❯ 1. Red',
        '   2. Green',
        '   3. Blue',
        '   4. Type something.',
        '   5. Chat about this',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ];
      expect(parseQuestionModal(rows)).toEqual({
        question: 'Which color do you want?',
        header: 'Color',
        multiSelect: false,
        // Affordance rows (Type something / Chat about this) dropped; order is top-to-bottom.
        options: [{ label: 'Red' }, { label: 'Green' }, { label: 'Blue' }],
      });
    });

    it('resolves box-drawing chrome (│ ──────) into clean labels — each option on its OWN row (32.8)', () => {
      // The linear buffer fused "│"-laden / "──────"-stretched labels; the grid puts each option on
      // its own row, so a per-row stripBoxChrome leaves the label body intact.
      const rows = [
        ' ☐ Spinner',
        ' Which spinner motion?',
        ' ┌────────────────────────────────┐',
        ' │ ❯ 1. Rotating dot ───────────── │',
        ' │   2. Bounce dot │ one glyph     │',
        ' └────────────────────────────────┘',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ];
      const parsed = parseQuestionModal(rows);
      expect(parsed?.options).toEqual([{ label: 'Rotating dot' }, { label: 'Bounce dot one glyph' }]);
      // No box glyph survives in any label, and the order matches the rows top-to-bottom (AC3).
      parsed?.options.forEach((o) => expect(o.label).not.toMatch(/[─-▟]/));
    });

    it('detects multiSelect from the "[ ]" checkboxes and strips them from labels', () => {
      const rows = [
        ' ←  ☐ Pets  ✔ Submit  →',
        ' Which pets do you want? Choose any.',
        ' ❯ 1. [ ] Cat',
        '   2. [ ] Dog',
        '   3. [ ] Fish',
        '   5. Chat about this',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ];
      expect(parseQuestionModal(rows)).toEqual({
        question: 'Which pets do you want? Choose any.',
        header: 'Pets',
        multiSelect: true,
        options: [{ label: 'Cat' }, { label: 'Dog' }, { label: 'Fish' }],
      });
    });

    it('guards a multi-question (tabbed) modal: >1 header ballot-box tab → null (never half-answer)', () => {
      const rows = [
        ' ←  ☐ Color  ☐ Size  ✔ Submit  →',
        ' Which color do you want?',
        ' ❯ 1. Red',
        '   2. Green',
        '   5. Chat about this',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ];
      expect(parseQuestionModal(rows)).toBeNull();
    });

    it('returns null when there is no footer row or no real options', () => {
      expect(parseQuestionModal([' ❯ 1. Red', '   2. Green'])).toBeNull(); // no "to navigate"
      expect(
        parseQuestionModal([' ☐ Color', '   4. Type something.', '   5. Chat about this', ' Enter to select · ↑/↓ to navigate']),
      ).toBeNull(); // only affordance rows → no real options
    });
  });

  describe('parsePrecedingText (lead-in prose above the modal)', () => {
    it('returns the prose row(s) directly above the modal, box chrome stripped', () => {
      const rows = [
        '현재 구조를 다 파악했습니다. 정리하면 두 가지 방식이 있습니다.',
        ' ☐ Color',
        ' Which color do you want?',
        ' ❯ 1. Red',
        '   2. Green',
        '   5. Chat about this',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ];
      expect(parsePrecedingText(rows)).toContain('정리하면');
    });

    it('returns null for a bare modal with no lead-in prose', () => {
      const rows = [
        ' ☐ Color',
        ' Which color do you want?',
        ' ❯ 1. Red',
        '   5. Chat about this',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ];
      // The header ballot-box tab is the top row, so there is nothing above the modal — no prose.
      expect(parsePrecedingText(rows)).toBeNull();
    });
  });
});
