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
  readPermissionMode,
  permissionModeCycleIndex,
  isIdleInputGrid,
  isGeneratingGrid,
  classifyPreInjectScreen,
  parseConfirmChoiceMenu,
  CLI_PERMISSION_MODE_CYCLE,
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

  describe('readPermissionMode (Story 37.5 — status-row → Hammoc mode)', () => {
    // The mode status row as claude renders it: "<glyph> <label> (shift+tab to cycle) · ← for agents".
    const modeRow = (label: string) => ` ${label} (shift+tab to cycle) · ← for agents`;

    it('maps each of the four cycle labels to its Hammoc mode', () => {
      expect(readPermissionMode([' ❯ ', modeRow('⏵⏵ accept edits on')])).toBe('acceptEdits');
      expect(readPermissionMode([' ❯ ', modeRow('⏸ plan mode on')])).toBe('plan');
      expect(readPermissionMode([' ❯ ', modeRow('⏵⏵ auto mode on')])).toBe('bypassPermissions');
    });

    it('reads the ABSENCE of any mode status row as default (normal)', () => {
      expect(readPermissionMode([' ❯ Try "fix typecheck"', ' ? for shortcuts'])).toBe('default');
      expect(readPermissionMode([])).toBe('default');
    });

    it('does NOT accept a label row that lacks the "shift+tab to cycle" footer (AND-gate)', () => {
      // A half-drawn frame (label painted, footer not yet) or a quoted phrase in prose must NOT win.
      expect(readPermissionMode([' ⏸ plan mode on'])).toBe('default'); // no footer ⇒ not the live row
      expect(readPermissionMode(['  the model said "accept edits on" in passing'])).toBe('default');
    });

    it('takes the bottom-most mode status row when more than one is present (freshest render)', () => {
      // The grid never truly fuses, but if a stale row lingers above, the latest (bottom) row wins.
      expect(
        readPermissionMode([modeRow('⏸ plan mode on'), ' ❯ ', modeRow('⏵⏵ auto mode on')]),
      ).toBe('bypassPermissions');
    });

    it('ignores a full mode-status row QUOTED in far-up scrollback when the live mode is default (resume-repaint poisoning class)', () => {
      // A resumed answer that quoted "⏸ plan mode on (shift+tab to cycle) …" must not be read as the
      // live mode; the live screen is default (no mode row at the bottom). Scrollback is out of region.
      const grid = [
        modeRow('⏸ plan mode on'),
        '   줄 2', '   줄 3', '   줄 4', '   줄 5', '   줄 6', '   줄 7', '   줄 8', '   줄 9',
        ' ❯ ',
      ];
      expect(readPermissionMode(grid)).toBe('default');
    });

    it('still reads the LIVE mode row at the bottom, ignoring a different mode quoted far up', () => {
      const grid = [
        modeRow('⏸ plan mode on'),
        '   줄 2', '   줄 3', '   줄 4', '   줄 5', '   줄 6', '   줄 7', '   줄 8', '   줄 9',
        ' ❯ ',
        modeRow('⏵⏵ auto mode on'),
      ];
      expect(readPermissionMode(grid)).toBe('bypassPermissions');
    });
  });

  describe('CLI_PERMISSION_MODE_CYCLE / permissionModeCycleIndex (Story 37.5)', () => {
    it('orders the four cycle modes exactly as claude cycles them (normal→accept→plan→auto)', () => {
      expect(CLI_PERMISSION_MODE_CYCLE).toEqual(['default', 'acceptEdits', 'plan', 'bypassPermissions']);
    });

    it('returns the cycle index for cycle modes and -1 for the off-cycle dontAsk', () => {
      expect(permissionModeCycleIndex('default')).toBe(0);
      expect(permissionModeCycleIndex('acceptEdits')).toBe(1);
      expect(permissionModeCycleIndex('plan')).toBe(2);
      expect(permissionModeCycleIndex('bypassPermissions')).toBe(3);
      expect(permissionModeCycleIndex('dontAsk')).toBe(-1); // off the cycle ⇒ store-only fallback
    });
  });

  describe('isIdleInputGrid (Story 37.5 — idle input box vs. generating spinner)', () => {
    it('is idle when the input-box marker is present and nothing is generating', () => {
      expect(isIdleInputGrid([' ❯ Try "fix typecheck"', ' ? for shortcuts'])).toBe(true);
      expect(isIdleInputGrid([' ❯ ', ' ⏸ plan mode on (shift+tab to cycle) · ← for agents'])).toBe(true);
    });

    it('is NOT idle on a generation spinner (esc-to-interrupt footer or a token counter)', () => {
      expect(isIdleInputGrid([' ❯ ', '✻ Working… (3s · ↓ 42 tokens)'])).toBe(false); // counter ⇒ generating
      expect(isIdleInputGrid([' ❯ ', '✢ Deliberating…  esc to interrupt'])).toBe(false); // active footer
    });

    it('is NOT idle when no input-box marker is on the grid', () => {
      expect(isIdleInputGrid([' just some output', ' no prompt here'])).toBe(false);
    });

    it('ignores scrollback prose that QUOTES the spinner phrases — an idle box at the bottom survives (실측 2026-06-13)', () => {
      // A resumed turn whose prior answer DISCUSSED the CLI spinner ("esc to interrupt" / "↓N tokens")
      // gets repainted into the scrollback. The live state is the idle input box at the BOTTOM; the
      // quoted phrases higher up must not flip the verdict to "generating" (the whole-screen scan did,
      // so injection was withheld and the next turn was lost).
      const grid = [
        '   대화중(생성 중)에는 claude 화면이 "생성 중 / esc to interrupt / ↓N tokens"',
        '   상태라 유휴가 아닙니다.',
        '   1. 미검증   2. turn-per-process   3. 모달 보호',
        '   - 안 되는 게 아니라, 설계대로입니다.',
        '   - 미러에 라이브로 모드가 바뀌는 모습은 유휴 입력창일 때만.',
        '   혹시 유휴에 바꿨는데도 안 보이면 다른 얘기입니다.',
        '   추가 설명 줄 A',
        '   추가 설명 줄 B',
        ' ✻ Baked for 4m 4s',
        ' ──────────────────────────────────────────────',
        ' ❯ ',
        ' ──────────────────────────────────────────────',
        ' ⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents',
      ];
      expect(isIdleInputGrid(grid)).toBe(true);
    });

    it('still detects a LIVE spinner near the bottom even with a tall scrollback above it', () => {
      const grid = [
        '   line 1', '   line 2', '   line 3', '   line 4', '   line 5',
        '   line 6', '   line 7', '   line 8', '   line 9', '   line 10',
        ' ✻ Baking… (12s · ↓ 3.4k tokens · esc to interrupt)',
        ' ❯ ',
      ];
      expect(isIdleInputGrid(grid)).toBe(false);
    });
  });

  describe('isGeneratingGrid (Story 37.5 — positive generation signal for the live mode gate)', () => {
    it('is generating on an esc-to-interrupt footer or a token counter', () => {
      expect(isGeneratingGrid([' ❯ ', '✻ Working… (3s · ↓ 42 tokens)'])).toBe(true);
      expect(isGeneratingGrid([' ❯ ', '✢ Deliberating…  esc to interrupt'])).toBe(true);
    });

    it('is NOT generating on an idle input box, nor on an unknown screen', () => {
      expect(isGeneratingGrid([' ❯ ', ' ⏸ plan mode on (shift+tab to cycle) · ← for agents'])).toBe(false);
      expect(isGeneratingGrid([' Connecting MCP servers…', ' Loading plugins…'])).toBe(false);
    });

    it('ignores generation phrases QUOTED in far-up scrollback (live region only)', () => {
      // The idle input box is the live state; a prior answer that quoted the spinner phrases sits
      // far up in the scrollback, out of the live footer window, so it must NOT read as generating.
      const grid = [
        '   설명: 생성 중에는 "esc to interrupt" / "↓ 365 tokens" 가 뜹니다.',
        '   줄 2', '   줄 3', '   줄 4', '   줄 5', '   줄 6', '   줄 7', '   줄 8', '   줄 9',
        ' ❯ ',
        ' ⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents',
      ];
      expect(isGeneratingGrid(grid)).toBe(false);
    });
  });

  describe('classifyPreInjectScreen (Story 37.6 — pre-injection 3-way classifier)', () => {
    it('classifies a plain idle input box (just ❯) as input-box', () => {
      expect(classifyPreInjectScreen([' ❯ Try "fix typecheck"', ' ? for shortcuts'])).toBe('input-box');
      expect(classifyPreInjectScreen([' ❯ ', ' ⏸ plan mode on (shift+tab to cycle) · ← for agents'])).toBe('input-box');
    });

    it('classifies a numbered option list WITH a live nav/cancel footer as selection', () => {
      expect(
        classifyPreInjectScreen([
          ' Pick an option',
          ' ❯ 1. First',
          '   2. Second',
          '   3. Third',
          ' Use ↑/↓ to navigate · Enter to select · Esc to cancel',
        ]),
      ).toBe('selection');
    });

    it('classifies the 32.6 permission dialog and the 32.8 question modal as selection', () => {
      // Permission dialog (phrase AND footer — detectPermissionDialog signature).
      expect(
        classifyPreInjectScreen([
          ' ● Write(probe.txt)',
          ' Do you want to create probe.txt?',
          ' ❯ 1. Yes',
          '   2. Yes, allow all edits during this session',
          '   3. No',
          ' Esc to cancel · Tab to amend',
        ]),
      ).toBe('selection');
      // AskUserQuestion modal (nav footer AND the "Chat about this" affordance — detectQuestionModal).
      expect(
        classifyPreInjectScreen([
          ' ☐ Which color?',
          ' ❯ 1. Red',
          '   2. Green',
          ' Enter to select · ↑/↓ to navigate',
          ' Chat about this',
        ]),
      ).toBe('selection');
    });

    it('does NOT mistake resume-repaint scrollback (quoted "❯ 1. …" / numbered list, NO live footer) for a selection', () => {
      // A prior turn's menu quoted in the repainted transcript body has no live nav/cancel footer, so
      // the footer AND-gate withholds `selection`; with ❯ present it reads as a (recoverable) input box.
      expect(
        classifyPreInjectScreen([
          ' Earlier you said:',
          ' ❯ 1. Yes',
          '   2. No',
          ' ❯ ',
        ]),
      ).toBe('input-box');
      // Same quoted list but with no live input box marker either → unknown (no blind key).
      expect(classifyPreInjectScreen([' Earlier you said:', ' 1. Yes', '   2. No'])).toBe('unknown');
    });

    it('classifies an unrecognized screen (neither input box nor known menu) as unknown', () => {
      expect(classifyPreInjectScreen([' Connecting MCP servers…', ' Loading plugins…'])).toBe('unknown');
      expect(classifyPreInjectScreen([])).toBe('unknown');
    });

    it('does NOT classify a mid-generation spinner frame as input-box', () => {
      // ❯ present but an active-generation footer/counter ⇒ isIdleInputGrid is false ⇒ not input-box.
      expect(classifyPreInjectScreen([' ❯ ', '✢ Deliberating…  esc to interrupt'])).toBe('unknown');
      expect(classifyPreInjectScreen([' ❯ ', '✻ Working… (3s · ↓ 42 tokens)'])).toBe('unknown');
    });

    it('does NOT mistake resume-repaint scrollback that quotes "esc to interrupt" / "↓ N tokens" for a live spinner — classifies as input-box (실측 2026-06-13, the turn that was lost)', () => {
      // The old whole-screen scan matched the quoted spinner phrases in the repainted prior answer and
      // returned `unknown` → injection withheld → the next turn aborted ("작업이 취소되었습니다"). The
      // box at the bottom is the LIVE state, so this must classify as input-box and inject.
      const grid = [
        ' ● 확인 완료했습니다.',
        '   대화중(생성 중)에는 claude 화면이 "생성 중 / esc to interrupt / ↓N tokens"',
        '   상태라 유휴가 아닙니다.',
        '   1. 미검증 — 생성 중 스피너 프레임 ...',
        '   2. turn-per-process — 턴마다 별도 프로세스 ...',
        '   3. 모달 보호 — 권한/질문 모달 ...',
        '   - 정리: 다음 턴부터 정확히 적용됩니다.',
        '   추가 설명 줄 A',
        '   추가 설명 줄 B',
        ' ✻ Baked for 4m 4s',
        ' ──────────────────────────────────────────────',
        ' ❯ ',
        ' ──────────────────────────────────────────────',
        ' ⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents',
      ];
      expect(classifyPreInjectScreen(grid)).toBe('input-box');
    });
  });

  describe('parseConfirmChoiceMenu (Story 37.6 follow-up — resume confirm-style menu)', () => {
    const RESUME_MENU = [
      '  This session is 7h 58m old and 165.1k tokens.',
      '  Resuming the full session will consume a substantial portion of your usage limits.',
      '  ❯ 1. Resume from summary (recommended)',
      '    2. Resume full session as-is',
      "    3. Don't ask me again",
      '  Enter to confirm · Esc to cancel',
    ];

    it('parses the numbered options as a single-select ParsedQuestion', () => {
      const parsed = parseConfirmChoiceMenu(RESUME_MENU);
      expect(parsed).not.toBeNull();
      expect(parsed!.multiSelect).toBe(false);
      expect(parsed!.options.map((o) => o.label)).toEqual([
        'Resume from summary (recommended)',
        'Resume full session as-is',
        "Don't ask me again",
      ]);
    });

    it('returns null without the confirm footer (quoted scrollback is not a live menu)', () => {
      expect(
        parseConfirmChoiceMenu(['  ❯ 1. Resume from summary', '    2. Resume full session as-is']),
      ).toBeNull();
    });

    it('returns null for a lone numbered option (a real choice needs ≥2)', () => {
      expect(parseConfirmChoiceMenu(['  1. Only one', '  Enter to confirm · Esc to cancel'])).toBeNull();
    });

    it('returns null when the menu is quoted in scrollback with a live input box below it', () => {
      // False-positive guard (실측 2026-06-12): this feature was discussed in-session, so the menu
      // text got repainted from the transcript — but a real input box renders BELOW it, so it is
      // quoted scrollback, not a live menu.
      const quoted = [
        '  ❯ 1. Resume from summary (recommended)',
        '    2. Resume full session as-is',
        '  Enter to confirm · Esc to cancel',
        '  ────────────────',
        '  ❯ ',
        '  ⏵⏵ bypass permissions on (shift+tab to cycle)',
      ];
      expect(parseConfirmChoiceMenu(quoted)).toBeNull();
    });
  });
});
