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
  detectRateLimit,
  extractToolName,
  extractPromptSentence,
  detectQuestionModal,
  parseQuestionModal,
  countQuestionTabs,
  parseQuestionTabHeaders,
  parseQuestionTabBody,
  parsePrecedingText,
  readPermissionMode,
  permissionModeCycleIndex,
  isIdleInputGrid,
  isGeneratingGrid,
  classifyPreInjectScreen,
  parseConfirmChoiceMenu,
  CLI_PERMISSION_MODE_CYCLE,
  CLI_PERMISSION_MODE_CYCLE_WITH_BYPASS,
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

  describe('detectRateLimit', () => {
    it('detects the transient rate-limit throttle', () => {
      expect(detectRateLimit('API Error: Server is temporarily limiting requests (not your usage limit) · Rate limited'))
        .toMatch(/temporarily limiting requests/i);
    });

    it('detects a 529 Overloaded error', () => {
      expect(detectRateLimit('API Error: 529 Overloaded. This is a server-side issue, usually temporary — try again in a moment.'))
        .toMatch(/529 Overloaded/i);
    });

    it('detects a generic 3-digit API error', () => {
      expect(detectRateLimit('API Error: 500 Internal Server Error')).toMatch(/500 Internal Server Error/);
    });

    it('returns null for a bare keyword mention without the "API Error:" prefix (anti self-reference)', () => {
      expect(detectRateLimit('the server is temporarily limiting requests in this design doc')).toBeNull();
      expect(detectRateLimit('if (!/Server is temporarily limiting requests/i.test(text)) return null;')).toBeNull();
    });

    it('returns null when Grep output quotes the detector source code (self-reference false positive)', () => {
      expect(detectRateLimit('Server is temporarily limiting requests/i.test(text)) return null; Rate limited')).toBeNull();
    });

    it('returns null on the usage-cap notice (that is a different path)', () => {
      expect(detectRateLimit("You've hit your weekly limit · resets 1am")).toBeNull();
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

    it('attaches the indented prose rows under each option as its description, joining wraps (실측 2026-06-17)', () => {
      // claude paints each option as "N. label" with the description on the indented row(s) below it.
      // The scrape now captures those rows (label → next-number boundary), space-joining a wrapped
      // description and leaving an option with no prose row as a bare `{ label }`.
      const rows = [
        ' ☐ Color',
        ' Which color do you want?',
        ' ❯ 1. Red',
        '      A warm color,',
        '      good for autumn.',
        '   2. Green',
        '      A calm color.',
        '   3. Blue',
        '   4. Type something.',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ];
      expect(parseQuestionModal(rows)).toEqual({
        question: 'Which color do you want?',
        header: 'Color',
        multiSelect: false,
        options: [
          { label: 'Red', description: 'A warm color, good for autumn.' },
          { label: 'Green', description: 'A calm color.' },
          { label: 'Blue' }, // no prose row below → stays a bare label
        ],
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

  describe('multi-question tab readers (ISSUE-99 — tabbed modal reconstruction)', () => {
    // One tab of a 2-question modal: the tab bar lists every question header + Submit; the body
    // below shows only the ACTIVE question. parseQuestionModal guards this (>1 ballot box → null);
    // the per-tab readers reconstruct it.
    const TAB_COLOR = [
      ' ←  ☐ Color  ☐ Size  ✔ Submit  →',
      ' Which color do you want?',
      ' ❯ 1. Red',
      '   2. Green',
      '   3. Blue',
      '   5. Chat about this',
      ' Enter to select · ↑/↓ to navigate · Esc to cancel',
    ];
    const TAB_SIZE = [
      ' ←  ☐ Color  ☐ Size  ✔ Submit  →',
      ' Pick the sizes. Choose any.',
      ' ❯ 1. [ ] Small',
      '   2. [ ] Large',
      '   5. Chat about this',
      ' Enter to select · ↑/↓ to navigate · Esc to cancel',
    ];

    describe('countQuestionTabs', () => {
      it('counts 1 for a single-select / single multiSelect question, >1 for a tabbed modal', () => {
        expect(countQuestionTabs([' ☐ Color', ' ❯ 1. Red', ' Enter to select · ↑/↓ to navigate'])).toBe(1);
        expect(countQuestionTabs([' ←  ☐ Pets  ✔ Submit  →', ' ❯ 1. [ ] Cat', ' Enter to select · ↑/↓ to navigate'])).toBe(1);
        expect(countQuestionTabs(TAB_COLOR)).toBe(2); // ☐ Color + ☐ Size (Submit's ✔ is not a ballot box)
      });

      it('returns 0 when there is no ballot-box header (a confirm-style menu / not a question modal)', () => {
        expect(countQuestionTabs([' ❯ 1. Resume from summary', ' Enter to confirm · Esc to cancel'])).toBe(0);
        expect(countQuestionTabs([])).toBe(0);
      });
    });

    describe('parseQuestionTabHeaders', () => {
      it('returns the ordered question labels from the tab bar, excluding the Submit tab', () => {
        expect(parseQuestionTabHeaders(TAB_COLOR)).toEqual(['Color', 'Size']);
      });

      it('returns [] when there is no tab bar', () => {
        expect(parseQuestionTabHeaders([' ❯ 1. Red', ' Enter to select · ↑/↓ to navigate'])).toEqual([]);
      });
    });

    describe('parseQuestionTabBody (the per-tab scrape parseQuestionModal guards away)', () => {
      it('scrapes the ACTIVE question of a tabbed modal — where parseQuestionModal returns null', () => {
        // The single-question reader guards the >1-ballot-box tab bar; the per-tab reader does not.
        expect(parseQuestionModal(TAB_COLOR)).toBeNull();
        expect(parseQuestionTabBody(TAB_COLOR)).toEqual({
          question: 'Which color do you want?',
          multiSelect: false,
          options: [{ label: 'Red' }, { label: 'Green' }, { label: 'Blue' }],
        });
      });

      it('detects multiSelect + strips the "[ ]" checkboxes on a tab, ignoring the multi-box tab bar', () => {
        expect(parseQuestionTabBody(TAB_SIZE)).toEqual({
          question: 'Pick the sizes. Choose any.',
          multiSelect: true,
          options: [{ label: 'Small' }, { label: 'Large' }],
        });
      });

      it('returns null for a tab with no real options (half-painted frame)', () => {
        expect(
          parseQuestionTabBody([' ←  ☐ Color  ☐ Size  ✔ Submit  →', '   5. Chat about this', ' Enter to select · ↑/↓ to navigate']),
        ).toBeNull();
      });
    });
  });

  describe('parsePrecedingText (lead-in prose above the modal)', () => {
    it('returns the prose row(s) directly above the modal, box chrome stripped', () => {
      const rows = [
        '● 현재 구조를 다 파악했습니다. 정리하면 두 가지 방식이 있습니다.',
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

    it('returns a SHORT real lead-in (14 chars) — the over-aggressive 16-char floor regression (실측 2026-06-15)', () => {
      // A real AskUserQuestion frame: a short `●` lead-in, a blank line above it (stops the walk so the
      // echoed prompt is not swallowed), a separator below it, then the modal. The old <16 floor
      // dropped this legitimate 14-char Korean sentence; the <4 sub-word floor keeps it.
      const rows = [
        '❯ 선호 색상을 물어봐 줘',
        '',
        '● 선호 색상을 여쭙겠습니다.',
        '────────────────────────',
        ' ☐ 선호 색상',
        ' 어떤 색상을 선호하시나요?',
        ' ❯ 1. 빨강',
        '   5. Chat about this',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ];
      expect(parsePrecedingText(rows)).toBe('선호 색상을 여쭙겠습니다.');
    });

    it('excludes thinking rows (∴ detail + "Thought for" summary) above the modal', () => {
      const rows = [
        '  Thought for 5s',
        '∴ The user wants me to call the AskUserQuestion tool again.',
        '● 재미있는 주제로 질문해 볼게요.',
        ' ☐ 저녁 메뉴',
        ' 오늘 저녁 뭐 먹을까요?',
        ' ❯ 1. 치킨',
        '   5. Chat about this',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ];
      const result = parsePrecedingText(rows);
      expect(result).toBe('재미있는 주제로 질문해 볼게요.');
      expect(result).not.toContain('Thought');
      expect(result).not.toContain('∴');
    });

    it('excludes thinking-only rows and returns null when no text prose exists', () => {
      const rows = [
        '  Thought for 12s',
        '∴ Let me think about what to do here.',
        ' ☐ Approach',
        ' Which approach?',
        ' ❯ 1. Option A',
        '   5. Chat about this',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ];
      expect(parsePrecedingText(rows)).toBeNull();
    });

    it('excludes spinner remnants (✻/✶/etc) — only ● text cards are prose', () => {
      const rows = [
        '✻ Worked for 8s',
        '',
        '● 여기에 제가 준비한 선택지입니다.',
        ' ☐ 메뉴',
        ' 뭘 먹을까요?',
        ' ❯ 1. 치킨',
        '   5. Chat about this',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ];
      const result = parsePrecedingText(rows);
      expect(result).toBe('여기에 제가 준비한 선택지입니다.');
      expect(result).not.toContain('Worked');
    });

    it('returns null when only a spinner sits above the modal (no ● prose)', () => {
      const rows = [
        '✻ Worked for 8s',
        '',
        ' ☐ 메뉴',
        ' 뭘 먹을까요?',
        ' ❯ 1. 치킨',
        '   5. Chat about this',
        ' Enter to select · ↑/↓ to navigate · Esc to cancel',
      ];
      expect(parsePrecedingText(rows)).toBeNull();
    });
  });

  describe('readPermissionMode (Story 37.5 — status-row → Hammoc mode)', () => {
    // The mode status row as claude renders it: "<glyph> <label> (shift+tab to cycle) · ← for agents".
    const modeRow = (label: string) => ` ${label} (shift+tab to cycle) · ← for agents`;

    it('maps each claude mode-row label to its Hammoc mode (auto≠bypass — distinct claude modes)', () => {
      expect(readPermissionMode([' ❯ ', modeRow('⏵⏵ accept edits on')])).toBe('acceptEdits');
      expect(readPermissionMode([' ❯ ', modeRow('⏸ plan mode on')])).toBe('plan');
      expect(readPermissionMode([' ❯ ', modeRow('⏵⏵ auto mode on')])).toBe('auto');
      // bypassPermissions is OFF the live cycle, but a bypass-started session renders this row,
      // so the reader must still recognize it (regression guard for the auto/bypass conflation).
      expect(readPermissionMode([' ❯ ', modeRow('⏵⏵ bypass permissions on')])).toBe('bypassPermissions');
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
      ).toBe('auto');
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
      expect(readPermissionMode(grid)).toBe('auto');
    });
  });

  describe('CLI_PERMISSION_MODE_CYCLE / permissionModeCycleIndex (Story 37.5)', () => {
    it('orders the four cycle modes exactly as claude cycles them (normal→accept→plan→auto)', () => {
      expect(CLI_PERMISSION_MODE_CYCLE).toEqual(['default', 'acceptEdits', 'plan', 'auto']);
    });

    it('returns the cycle index for cycle modes and -1 for off-cycle bypass/dontAsk', () => {
      expect(permissionModeCycleIndex('default')).toBe(0);
      expect(permissionModeCycleIndex('acceptEdits')).toBe(1);
      expect(permissionModeCycleIndex('plan')).toBe(2);
      expect(permissionModeCycleIndex('auto')).toBe(3);
      expect(permissionModeCycleIndex('bypassPermissions')).toBe(-1); // off cycle ⇒ next-spawn fallback
      expect(permissionModeCycleIndex('dontAsk')).toBe(-1); // off cycle ⇒ store-only fallback
    });

    it('puts bypassPermissions in a bypass-STARTED session cycle, inserted between plan and auto', () => {
      // Empirically captured (claude v2.1.177): a session spawned with --permission-mode
      // bypassPermissions cycles default→acceptEdits→plan→bypass→auto. A normal session never shows it.
      expect(CLI_PERMISSION_MODE_CYCLE_WITH_BYPASS).toEqual(['default', 'acceptEdits', 'plan', 'bypassPermissions', 'auto']);
    });

    it('with includeBypass=true, bypassPermissions is an on-cycle live target; dontAsk and the normal session stay off-cycle', () => {
      expect(permissionModeCycleIndex('bypassPermissions', true)).toBe(3); // live-drivable in a bypass-started turn
      expect(permissionModeCycleIndex('dontAsk', true)).toBe(-1); // still headless-only
      expect(permissionModeCycleIndex('bypassPermissions', false)).toBe(-1); // unchanged for a non-bypass turn
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

    it('does NOT mistake a resume-repaint that QUOTES an AskUserQuestion modal high in scrollback for a live selection — classifies as input-box (ISSUE-99, the abort that surfaced as "응답 시간 초과")', () => {
      // The exact poisoning that aborted a resume boot: the conversation was WRITING AskUserQuestion
      // test fixtures, so claude's resume-repaint painted those fixture lines — a numbered option
      // list, the "Enter to select · ↑/↓ to navigate" footer, and the "Chat about this" affordance —
      // into the scrollback BODY, far above the live input box. The OLD whole-screen scan read that as
      // a live question modal and returned 'selection' → injection withheld → boot abort (surfaced as
      // a generic "timeout"). The LIVE state is the idle input box at the BOTTOM, so footer-anchored
      // detection must classify this as input-box and inject. (Whole-screen scan would return
      // 'selection' here — this is the regression guard.)
      const grid = [
        ' ● 멀티질문 파서 유닛 테스트를 추가합니다.',
        "    const Q_MODAL_SINGLE = [",
        "      ' ❯ 1. Red',",
        "      '   2. Green',",
        "      '   5. Chat about this',",
        "      ' Enter to select · ↑/↓ to navigate · Esc to cancel',", // ← quoted modal footer (poison)
        '    ];',
        '    describe("parseQuestionTabHeaders", () => {',
        '    describe("parseQuestionTabBody", () => {',
        '    describe("parsePrecedingText (lead-in prose above the modal)", () => {',
        '      it("returns the prose rows above the modal", () => {',
        '        const rows = [',
        '  ⎿  Interrupted · What should Claude do instead?',
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
