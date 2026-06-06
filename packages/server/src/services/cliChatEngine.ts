/**
 * CliChatEngine (Epic 32 — Story 32.4)
 *
 * The **second `ChatEngine` implementation** behind the Epic 32 seam — the CLI
 * (subscription-pool) conversation engine. Where `ChatService` drives the Claude
 * Agent SDK, this engine:
 *   1. spawns an *interactive* `claude` TUI in a PTY (no `--print` — headless
 *      output uses the same billing as the SDK, which Epic 32 exists to avoid),
 *   2. injects the prompt over stdin,
 *   3. watches that session's JSONL file and re-emits each completed `assistant`
 *      content block through the **existing `StreamCallbacks`** (so the client and
 *      `@hammoc/shared` need zero changes — the wire shape matches SDK mode).
 *
 * Granularity differs from SDK mode by design: the session JSONL only gains a line
 * when a content block *completes*, so text arrives as one chunk per block rather
 * than token-by-token (accepted constraint, spike §1/§9-2). SDK mode keeps real
 * token streaming.
 *
 * The CLI engine grows by story: 32.4 built the core happy-path (prompt → block
 * response); 32.5 fills standalone rewind (`rewindFiles`, below — billing-neutral
 * SDK file-rewind reuse); 32.6 wires the interactive tool-approval round-trip
 * (`canUseTool` web dialog) — **constrained**: the permission prompt leaves NO
 * session-JSONL signal (the `tool_use` line is written only *after* approval —
 * spike §10 closed by Story 32.6 Task 1), so the dialog is detected from the PTY
 * ANSI *state* (§6.2-class modal, §7.1-sanctioned state-signal use) and driven by
 * keys (Enter = approve, Esc = deny); the scraped tool name/input are best-effort
 * and `updatedInput` is unsupported (claude runs its own tool). See
 * `handlePermission` below for the full constraint list. 32.7 adds the generation
 * *progress* signal (the spinner's "↓ N tokens · Ns", parsed from the same PTY frames
 * and emitted on value change via `onGenerationProgress` — see `emitProgress`) and
 * *verifies* thinking display (mechanism-complete; see the thinking branch in
 * `handleAssistantLine`). 32.8 wires the last interactive flow — the `AskUserQuestion`
 * selection modal (`canUseTool` web question card) — also **constrained**: like the
 * permission dialog it leaves no pre-answer JSONL signal (verified Task 1), so the modal
 * is detected from the PTY ANSI state and its questions/options are scraped, the reused
 * `canUseTool` answer is translated to menu keys (single-select ↓+Enter; multiSelect
 * Space-toggle + → Submit), and any non-drivable case (multi-question, unparseable,
 * custom "Other") is Esc-cancelled so the modal can never deadlock the response path.
 * See `handleQuestion` below. Still deferred to Epic 33: synthetic typing (the client
 * frame-coalescing path is shared with SDK mode, so per-block animation needs the
 * Epic 33 mode toggle), the on/off toggles, and mode-selection UI.
 *
 * [Source: docs/spike-32.1-cli-output-source.md#7.1; docs/prd/epic-32-cli-engine-core.md#Story 32.4+]
 */

import type { CanUseTool, PermissionResult, RewindFilesResult } from '@anthropic-ai/claude-agent-sdk';
import type {
  ChatServiceConfig,
  ChatOptions,
  ChatResponse,
  ChatUsage,
  PermissionMode,
  StreamCallbacks,
  SessionMetadata,
  RawJSONLMessage,
  ContentBlock,
  TextContentBlock,
  ThinkingContentBlock,
} from '@hammoc/shared';
import { resolveEffectiveModel } from '@hammoc/shared';
import path from 'path';
import fs from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import { sessionService } from './sessionService.js';
import { cliSessionPool } from './cliSessionPool.js';
import { parseJSONLFile } from './historyParser.js';
import { rewindSessionFiles } from './fileRewind.js';
import type { ChatEngine } from './chatEngine.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('cliChatEngine');

/**
 * Poll interval (ms) for session-file detection + draining. `fs.watch` is wired
 * as the low-latency trigger, but its reliability varies by platform (§7.2-2),
 * so a poll loop is the deterministic fallback that also covers the case where
 * the project's sessions directory does not exist yet (brand-new project).
 */
const POLL_MS = 60;

/**
 * Prompt-injection timing (all empirically tuned against claude v2.1.162 — verified
 * by a real-PTY smoke, not assumed; the spike's `content + '\r'` single-write
 * assumption was stale). Two footguns the engine works around:
 *
 *  1. **Readiness.** claude emits a few setup frames, *pauses* during setup checks,
 *     then renders the input box. Injecting during that pre-box pause loses the
 *     prompt. So injection waits until the input-box marker (`❯`) has rendered and
 *     output then goes quiet (with a hard fallback if the marker never appears).
 *  2. **Submit.** A prompt and its Enter arriving close together are coalesced as a
 *     *paste* — the CR becomes a literal newline, not a submit (a 150ms gap failed;
 *     a 1000ms gap submitted cleanly). So Enter is a SEPARATE write sent a clear gap
 *     after the typed text, read as a distinct Enter keypress.
 */
const CLI_PROMPT_MARKER = '❯'; // Claude Code interactive input-box prompt glyph
const CLI_BOOT_SETTLE_MS = 400; // quiet after the box marker before typing
const CLI_MAX_BOOT_WAIT_MS = 4000; // fallback inject if the marker never renders
const CLI_SUBMIT_GAP_MS = 1000; // Enter sent this long after the prompt text

/**
 * Tool-approval interception (Story 32.6 — *constrained*; keys verified against
 * claude v2.1.162 by a real-PTY observation, Task 1). The interactive permission
 * prompt leaves **no signal in the session JSONL** — the `tool_use` line is written
 * only *after* the user approves (spike §10 closed: at dialog time the JSONL held
 * only bookkeeping; the assistant `tool_use` line appeared post-approval). So the
 * dialog exists only on the PTY ANSI screen — a §6.2-class absolute-coordinate modal
 * — and detection is an ANSI *state* signal (§7.1-sanctioned, the same channel the
 * `❯` readiness marker uses), never a content source.
 *
 * Verified key mapping (claude permission dialog: "❯ 1. Yes / 2. Yes, allow all
 * edits… / 3. No · Esc to cancel") — BOTH directions empirically keyed against a
 * real PTY: **Enter** selects the pre-highlighted "1. Yes" (approve — the file was
 * created only after Enter); **Esc** ("Esc to cancel") denies — the dialog dismissed,
 * the file was NOT created, and the JSONL recorded a `tool_result` with
 * `is_error:true` ("The user doesn't want to proceed…") + "[Request interrupted by
 * user for tool use]", i.e. the *same* envelope SDK deny (`interrupt:true`) produces,
 * so a denied tool renders identically on reload. ("3. No" continue-after-deny is the
 * alternate deny affordance; we map deny→Esc for the interrupt semantics.)
 */
const CLI_PERMISSION_ALLOW_KEY = '\r'; // Enter → pre-highlighted "1. Yes"
const CLI_PERMISSION_DENY_KEY = '\x1b'; // Esc → "Esc to cancel"

/** Rolling post-injection ANSI buffer cap for dialog-state detection. */
const CLI_DIALOG_BUFFER_CAP = 4000;

/**
 * AskUserQuestion selection-modal interception (Story 32.8 — *constrained*; the JSONL/ANSI
 * behavior and EVERY key were verified against claude v2.1.162 by a real-PTY observation,
 * Task 1). Like the permission dialog (32.6), the question modal leaves **no structured
 * signal in the session JSONL before the user answers** — the `tool_use(AskUserQuestion)`
 * line (carrying the full questions/options) is written only *after* selection (Task 1 (a):
 * at modal-display time the JSONL held only bookkeeping; the assistant `tool_use` +
 * `tool_result(type=user)` + `text(end_turn)` appeared post-selection, the *same*
 * envelope SDK mode produces, so it renders on reload — AC5, no code). So the modal lives
 * only on the PTY ANSI screen (a §6.2-class absolute-coordinate box), detection is an ANSI
 * *state* signal (§7.1-sanctioned, the channel the `❯` readiness marker uses), and the
 * questions/options are *scraped* from that screen — low fidelity, the documented constraint.
 *
 * Verified key model (claude v2.1.162; Task 1 (b)) — the highlight starts on the first
 * option (row 0):
 *   - **Single-select:** `↓` × targetIndex, then **Enter** — selects AND submits in one
 *     keypress (Task 1: ↓ moved Red→Green, Enter confirmed `=Green`).
 *   - **multiSelect:** **Space** toggles the highlighted `[ ]` checkbox; after toggling,
 *     **→** (right) moves to the header "✔ Submit" tab and **Enter** submits — count-
 *     independent (Task 1: Space on Cat, →, Enter confirmed `=Cat`).
 *   - **Esc** cancels the modal — the deadlock guard for an unparseable modal, a
 *     multi-question (tabbed) modal, or an answer that maps to no listed option.
 *
 * Scope (*constrained*) = **single-question** only. A multi-question modal is *tabbed*
 * (one question's options visible at a time → `←  ☐ Q1  ☐ Q2  ✔ Submit  →`), so a faithful
 * single-round-trip card cannot be built from the first frame; those are cancelled (Esc)
 * rather than half-answered. The web card/round-trip (`canUseTool('AskUserQuestion')` →
 * `updatedInput.answers`) is reused verbatim (client + `@hammoc/shared` unchanged — the
 * engine only *calls* it and translates the answer to keys). See `handleQuestion` below.
 */
const CLI_QUESTION_DOWN_KEY = '\x1b[B'; // ↓ — move highlight to the next option
const CLI_QUESTION_RIGHT_KEY = '\x1b[C'; // → — move to the header "✔ Submit" tab (multiSelect)
const CLI_QUESTION_SPACE_KEY = ' '; // toggle the highlighted multiSelect checkbox
const CLI_QUESTION_ENTER_KEY = '\r'; // select+submit (single) / activate Submit (multi)
const CLI_QUESTION_ESC_KEY = '\x1b'; // cancel the modal (deadlock guard — AC4)
/** Let the modal finish painting after the footer first appears, before scrape + drive. */
const CLI_QUESTION_SETTLE_MS = 400;
/**
 * Gap between injected menu keys. Arrow/Space/Enter are *discrete* key events — not the
 * typed-text-then-Enter pair that bracketed-paste coalesces (§32.4) — and Task 1 drove
 * them reliably at 500–700ms spacing; 350ms keeps each a distinct keypress while bounding
 * the post-answer latency (correctness over speed — a dropped arrow would mis-select).
 */
const CLI_QUESTION_KEY_GAP_MS = 350;
/** "Chat about this" is auto-appended to every AskUserQuestion modal — a marker unique to
 *  it (absent from the permission dialog and other selection menus), used to disambiguate. */
const CLI_QUESTION_AFFORDANCE_RE = /Chat about this/i;

// ANSI/control matchers for the dialog *state* strip below. Control chars are
// intentional (we are literally stripping terminal escapes), so no-control-regex
// is disabled per-pattern — the same convention as gitController / harness* services.
// eslint-disable-next-line no-control-regex -- OSC … BEL/ST
const ANSI_OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
// eslint-disable-next-line no-control-regex -- 2-byte Fe escapes
const ANSI_FE_RE = /\x1b[@-Z\\-_]/g;
// eslint-disable-next-line no-control-regex -- CSI … final byte
const ANSI_CSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
// eslint-disable-next-line no-control-regex -- stray C0 control bytes (keep \t \n)
const CTRL_BYTES_RE = /[\x00-\x08\x0b-\x1f]/g;

/** Crude ANSI/control strip — for dialog *state* detection only, not content. */
function stripAnsiForDetect(s: string): string {
  return s.replace(ANSI_OSC_RE, '').replace(ANSI_FE_RE, '').replace(ANSI_CSI_RE, '').replace(CTRL_BYTES_RE, ' ');
}

/**
 * Generation-progress parser (Story 32.7). During generation the ONLY real-time PTY
 * signal is the spinner's "↓ N tokens" counter + elapsed seconds (spike §4.7). This is
 * an ANSI *state* signal (§7.1-sanctioned — the same channel as the `❯` readiness
 * marker and the permission dialog), version-fragile (a TUI revision could change the
 * wording), and never a content source — token *text* streaming stays impossible
 * (§4.5/§9-2; SDK mode keeps real streaming).
 *
 * The regex matches an optional leading "(Ns · " elapsed clock then the "↓ N tokens"
 * counter, capturing both. Verified against a real PTY (claude v2.1.162 — Story 32.7
 * Task 1): "Moseying… (9s · ↓ 365 tokens · thinking with high effort)" and the
 * counter-only "↓ 246 tokens" form, structurally identical to the §4.7 baseline
 * "✢ Elucidating… (5s · ↓ 212 tokens · thinking with low effort)". The middot `·`,
 * `↓`, and `…` are printable multi-byte chars that survive `stripAnsiForDetect`.
 * Global so the *last* (freshest) match in a rolling buffer wins.
 */
const CLI_PROGRESS_RE = /(?:\((\d+)\s*s\b[^↓\n]{0,40})?↓\s*([\d,]+)\s*tokens/g;
/** Rolling stripped-PTY buffer cap for progress parsing (survives frame splits). */
const CLI_PROGRESS_BUFFER_CAP = 2048;

/**
 * Conservative permission-dialog matcher. Requires a permission-specific phrase
 * AND the fully-rendered footer ("Esc to cancel" / "Tab to amend") so a half-drawn
 * dialog, a spinner, or the echoed prompt can never match — a false positive would
 * inject a stray Enter/Esc and corrupt the session. The dialog chrome renders in
 * English regardless of the model's reply language (observed), but a future TUI
 * revision could change these strings (documented version-fragility).
 */
function detectPermissionDialog(text: string): boolean {
  const hasPermPhrase =
    /Yes,\s*allow all edits/i.test(text) ||
    /Do you want to (?:create|make|write|edit|update|apply|run|execute|read|proceed|allow)/i.test(text);
  const hasFooter = /Esc\b[^\n]{0,16}\bcancel\b/i.test(text) || /Tab\b[^\n]{0,16}\bamend\b/i.test(text);
  return hasPermPhrase && hasFooter;
}

/**
 * Best-effort tool name from the dialog's question verb (ANSI scrape — low
 * fidelity; the structured tool name is not in the JSONL until after approval).
 */
function extractToolName(text: string): string {
  const verb = (text.match(/Do you want to (\w+)/i)?.[1] ?? '').toLowerCase();
  if (/^(create|write|make)$/.test(verb)) return 'Write';
  if (/^(edit|update|apply|modify|change)$/.test(verb)) return 'Edit';
  if (/^(run|execute)$/.test(verb)) return 'Bash';
  if (/^(read|view)$/.test(verb)) return 'Read';
  if (/^(fetch|access)$/.test(verb)) return 'WebFetch';
  // Secondary hint: the tool header line "● Write(…)".
  return text.match(/[●·]\s*([A-Z][a-zA-Z]+)\s*\(/)?.[1] ?? 'Tool';
}

/** Best-effort human-readable prompt sentence (the dialog's own words). */
function extractPromptSentence(text: string): string {
  return (text.match(/Do you want to [^?\n]{1,160}\?/i)?.[0] ?? 'Claude is requesting tool permission').trim();
}

/** A single scraped AskUserQuestion choice (Story 32.8 — single-question scope). */
interface ParsedQuestion {
  question: string;
  header?: string;
  multiSelect: boolean;
  options: Array<{ label: string }>;
}

/**
 * Conservative AskUserQuestion-modal matcher (Story 32.8). Requires the selection footer
 * ("Enter to select" + "↑/↓ to navigate") AND the auto-appended "Chat about this"
 * affordance — together unique to the question modal and absent from a permission dialog
 * ("Do you want to…" / "Yes, allow all edits", which has no list navigation) and from
 * ordinary output, so neither can false-trigger a stray keypress. `detectPermissionDialog`
 * is checked first and is mutually exclusive (it needs a permission phrase this modal lacks;
 * this needs "to navigate" the dialog lacks), so the two never cross-fire. Version-fragile
 * (a TUI revision could reword these) — the documented constrained surface.
 */
function detectQuestionModal(text: string): boolean {
  const hasNavFooter = /Enter\b[^\n]{0,12}\bselect\b/i.test(text) && /to\s+navigate/i.test(text);
  return hasNavFooter && CLI_QUESTION_AFFORDANCE_RE.test(text);
}

/**
 * Scrape one question + its options from the modal's ANSI *state* (Story 32.8 — low
 * fidelity, the documented constraint). Reads the LAST modal render (from its header tab
 * to the footer) so earlier spinner frames are excluded, and keeps the last label seen per
 * option number (the rolling buffer repeats the modal). Returns null when it cannot build a
 * usable *single*-question structure — no options, or a **multi-question** tabbed modal
 * (more than one header ballot-box tab) which this constrained bridge does not drive (the
 * caller then cancels with Esc). Crucially the scrape order equals the modal row order,
 * which equals the ↓-count used to drive the answer, so the option↔index mapping is
 * self-consistent even when a label's text is imperfectly captured.
 */
function parseQuestionModal(buf: string): ParsedQuestion | null {
  const navIdx = buf.lastIndexOf('to navigate');
  if (navIdx < 0) return null;
  const region = buf.slice(Math.max(0, navIdx - 2500), navIdx);
  // Multi-question modals show >1 ballot-box tab in the header (☐ Q1 ☐ Q2 ✔ Submit) — not
  // a single round-trip, so guard rather than half-answer.
  if ((region.match(/[☐☒]/g) || []).length > 1) return null;
  const multiSelect = /\[\s*[✔x ]?\s*\]/.test(region); // [ ] / [✔] checkboxes ⇒ multiSelect
  // Numbered option rows; last label wins per number, then order by number.
  const byNum = new Map<number, string>();
  for (const m of region.matchAll(/(\d{1,2})\.\s+(?:\[[✔x ]?\s*\]\s*)?([^\n]*\S)/g)) {
    byNum.set(parseInt(m[1], 10), m[2].trim());
  }
  const options = [...byNum.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((e) => e[1])
    // Drop the auto-appended affordance rows — not real answer options (they trail the
    // real options in every observed render).
    .filter((l) => !/^Type something\.?$/i.test(l) && !/^Chat about this\.?$/i.test(l))
    .map((label) => ({ label }));
  if (options.length === 0) return null;
  const headerMatch = region.match(/[☐☒]\s*([^✔→\n]+?)(?:\s{2,}|\n|$)/);
  const header = headerMatch ? headerMatch[1].trim() : undefined;
  // Question = the last meaningful line between the header tab and the first option
  // (best-effort; the question may not end in '?' — e.g. "Which pets? Choose any.").
  // Strip tab/cursor glyphs and drop the header line itself.
  const question = (
    region
      .slice(0, Math.max(0, region.search(/\d{1,2}\.\s/)))
      .split('\n')
      .map((l) => l.replace(/[←→✔☐☒❯]/g, '').trim())
      .filter((l) => l && l !== header)
      .pop() ??
    header ??
    'Claude is asking a question'
  ).trim();
  return { question, header, multiSelect, options };
}

/**
 * Translate the user's answer (canUseTool `updatedInput.answers`) into the TUI menu key
 * sequence (Story 32.8). The highlight starts on option 0 (verified Task 1). Returns null
 * when the answer maps to no scraped option (e.g. a custom "Other" entry) — not safely
 * drivable, so the caller cancels (Esc) rather than risk a wrong selection.
 */
function buildQuestionKeys(parsed: ParsedQuestion, answer: string | string[] | undefined): string[] | null {
  const labels = parsed.options.map((o) => o.label);
  // Normalize the answer into individual option tokens. A multiSelect answer arrives here as a
  // single ", "-joined string, because the reused canUseTool('AskUserQuestion') branch joins the
  // web card's bare answer array on that separator (websocket.ts:2674 / queueService.ts:845).
  // Split it back on the same separator so every chosen label is recovered — otherwise the joined
  // string ("Cat, Fish") matches no single option label, `selected` is empty, and the modal is
  // silently Esc-cancelled (the 32.8-MULTISELECT-DROP defect). A single-select answer is one label
  // and must NOT be split (a label may itself contain ", ").
  const tokens = Array.isArray(answer)
    ? answer
    : answer == null
      ? []
      : parsed.multiSelect
        ? answer.split(', ')
        : [answer];
  const selected = tokens
    .map((a) => labels.indexOf(a))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (selected.length === 0) return null;
  const keys: string[] = [];
  if (!parsed.multiSelect) {
    // Single-select: ↓ to the option, Enter selects + submits.
    for (let i = 0; i < selected[0]; i++) keys.push(CLI_QUESTION_DOWN_KEY);
    keys.push(CLI_QUESTION_ENTER_KEY);
    return keys;
  }
  // multiSelect: walk down toggling each selected checkbox, then → to Submit + Enter.
  let cur = 0;
  for (const idx of selected) {
    for (let i = cur; i < idx; i++) keys.push(CLI_QUESTION_DOWN_KEY);
    keys.push(CLI_QUESTION_SPACE_KEY);
    cur = idx;
  }
  keys.push(CLI_QUESTION_RIGHT_KEY, CLI_QUESTION_ENTER_KEY);
  return keys;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The `assistant` message envelope carries fields not declared on
 * `RawJSONLMessage.message` (`stop_reason`, `usage`, `model`). Read them via this
 * structural view — the JSONL envelope is identical to SDK mode plus an
 * `entrypoint:"cli"` tag (spike §3.1).
 */
interface AssistantEnvelope {
  role?: string;
  model?: string;
  content?: string | ContentBlock[];
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

async function listJsonl(dir: string): Promise<Set<string>> {
  try {
    const files = await fs.readdir(dir);
    return new Set(files.filter((f) => f.endsWith('.jsonl')));
  } catch {
    return new Set();
  }
}

async function fileSize(file: string): Promise<number> {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return 0;
  }
}

/** Find the newest `*.jsonl` in `dir` that is not in the pre-spawn `baseline`. */
async function newestNewJsonl(dir: string, baseline: Set<string>): Promise<string | null> {
  try {
    const candidates = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl') && !baseline.has(f));
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    let best: { name: string; mtime: number } | null = null;
    for (const name of candidates) {
      const mtime = (await fs.stat(path.join(dir, name))).mtimeMs;
      if (!best || mtime > best.mtime) best = { name, mtime };
    }
    return best?.name ?? null;
  } catch {
    return null;
  }
}

export class CliChatEngine implements ChatEngine {
  private workingDirectory: string | undefined;
  private permissionMode: PermissionMode;
  /**
   * Story 33.3: user-configured `claude` binary path override (global preference).
   * Forwarded to every spawn; empty/undefined = auto-detect, invalid = graceful
   * fallback in `cliSessionPool.resolveClaudeBinary`.
   */
  private cliBinaryPath: string | undefined;

  /**
   * CLI mode performs no inline rewind-before-send, so this stays null. (Standalone
   * rewind is the separate `rewindFiles` operation below — implemented in Story 32.5.)
   */
  rewindWarning: string | null = null;

  constructor(config: ChatServiceConfig = {}) {
    this.workingDirectory = config.workingDirectory;
    this.permissionMode = config.permissionMode ?? 'default';
    this.cliBinaryPath = config.cliBinaryPath;
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    // Stored so the next claude spawn maps it to `--permission-mode` (AC7). There is
    // no live query to update mid-turn (unlike the SDK engine) — the interactive PTY
    // takes its posture from launch flags.
    this.permissionMode = mode;
  }

  /**
   * Standalone file rewind (Story 32.5). Delegates to the shared billing-neutral
   * `rewindSessionFiles` helper: a throwaway `query({ prompt: '' })` resumed only to
   * drive its file-checkpoint rewind (0 tokens → no conflict with CLI mode's
   * subscription-pool purpose). This is the documented exception to 32.4's "the CLI
   * engine never spawns the SDK directly" rule, and the ONLY programmatic rewind path
   * (interactive claude exposes no non-interactive rewind flag; `/rewind` is an ANSI
   * picker; control-protocol rewind is headless-only — verified §AC2). Verified
   * billing-neutral + working against a real CLI-created session (AC4).
   *
   * Separate from the inline rewind-before-send (`rewindWarning`, always null for
   * CLI) — the "two rewinds"; do not conflate.
   */
  async rewindFiles(params: { sessionId: string; messageUuid: string; dryRun?: boolean }): Promise<RewindFilesResult> {
    if (!this.workingDirectory) {
      // Rewind needs the session JSONL + tracked files under cwd. Mirrors the
      // sendMessageWithCallbacks cwd guard, surfaced as the rewind contract's
      // canRewind:false (not a throw) so the handler maps it to a clean result.
      return { canRewind: false, error: 'CliChatEngine requires a workingDirectory to locate the session JSONL' };
    }
    return rewindSessionFiles(params, this.workingDirectory);
  }

  /**
   * Core: inject `content` into an interactive claude PTY, watch the session JSONL,
   * and re-emit completed assistant blocks through `callbacks`. Resolves with the
   * assembled `ChatResponse` on `stop_reason:"end_turn"`. When `canUseTool` is
   * provided, an interactive permission dialog detected on the PTY screen is routed
   * through it (Story 32.6 — reuses the existing web round-trip; see
   * `handlePermission`). `onRawMessage` is the inactivity-timeout heartbeat (S-1).
   * `onGenerationProgress` (Story 32.7) is the transient "↓ N tokens · Ns" signal
   * parsed from the same spinner frames — emitted on value change (see `emitProgress`).
   */
  async sendMessageWithCallbacks(
    content: string,
    callbacks: StreamCallbacks,
    options: ChatOptions = {},
    canUseTool?: CanUseTool,
    onRawMessage?: (messageType: string) => void,
    onGenerationProgress?: (progress: { tokens: number; elapsedSeconds: number }) => void,
  ): Promise<ChatResponse> {
    const cwd = this.workingDirectory;
    if (!cwd) {
      throw new Error('CliChatEngine requires a workingDirectory to locate the session JSONL');
    }

    const projectSlug = sessionService.encodeProjectPath(cwd);
    const sessionsDir = sessionService.getSessionsDir(cwd);
    const resumeId = typeof options.resume === 'string' && options.resume.length > 0 ? options.resume : undefined;

    // Build interactive claude args. NEVER --print / --output-format stream-json:
    // headless output bills like the SDK, which is the whole reason CLI mode exists.
    const args: string[] = [];
    if (resumeId) {
      // Resume an existing session. (Do NOT also pass --session-id — claude rejects
      // --session-id + --resume unless --fork-session, mirroring the SDK; verified
      // via `claude --help`. See chatService.ts:488-491.)
      args.push('--resume', resumeId);
    } else if (options.sessionId && UUID_RE.test(options.sessionId)) {
      // Pre-allocate the session id (verified standalone flag) so the CLI session id
      // matches the caller's id — keeps the wire identical to SDK mode (no rekey).
      args.push('--session-id', options.sessionId);
    }
    // AC7 best-effort permission posture (all Hammoc modes are valid CLI values).
    args.push('--permission-mode', this.permissionMode);
    // Apply the same 1M policy as SDK mode (resolveEffectiveModel): Opus auto-1M,
    // Sonnet bare unless explicitly opted in. Keeps both engines consistent.
    if (options.model) args.push('--model', resolveEffectiveModel(options.model)!);
    if (options.effort) args.push('--effort', options.effort);

    // New-session detection: snapshot existing JSONL before spawn (§7.2-1).
    const baselineFiles = resumeId ? new Set<string>() : await listJsonl(sessionsDir);

    // Resume targets a known file; record its current size so only NEW appended
    // assistant lines are emitted (not the replayed history), and seed the emitted
    // set with the existing assistant uuids.
    let sessionFile: string | null = null;
    let resolvedSessionId: string | null = null;
    let lastSize = 0;
    const emittedUuids = new Set<string>();

    if (resumeId) {
      sessionFile = sessionService.getSessionFilePath(projectSlug, resumeId);
      resolvedSessionId = resumeId;
      lastSize = await fileSize(sessionFile);
      for (const m of await parseJSONLFile(sessionFile)) {
        if (m.type === 'assistant') emittedUuids.add(m.uuid);
      }
    }

    const { handle, pty } = cliSessionPool.spawnClaude({ cwd, args, binaryPathOverride: this.cliBinaryPath });

    return new Promise<ChatResponse>((resolve, reject) => {
      let settled = false;
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let dirWatcher: FSWatcher | null = null;
      let fileWatcher: FSWatcher | null = null;
      let sessionInitEmitted = false;
      let draining = false;
      let accumulatedText = '';
      let lastUsage: ChatUsage | undefined;
      let lastAssistantUuid = '';
      // Prompt-injection state (see CLI_* constants).
      let injected = false;
      let bootBuffer = ''; // accumulated boot output, scanned for the box marker (pre-injection only)
      let bootSettleTimer: ReturnType<typeof setTimeout> | null = null;
      let bootFallbackTimer: ReturnType<typeof setTimeout> | null = null;
      let submitTimer: ReturnType<typeof setTimeout> | null = null;
      // Permission-dialog state (Story 32.6 — post-injection only).
      let dialogBuffer = ''; // rolling stripped PTY output, scanned for the dialog
      let permissionPending = false; // guards re-entry while awaiting the user's decision
      let permCounter = 0; // synthesizes a toolUseID (the real id is not in JSONL pre-approval)
      // AskUserQuestion-modal state (Story 32.8 — post-injection only; SEPARATE buffer from
      // the permission path so the verified 32.6 detection is byte-for-byte untouched).
      let questionBuffer = ''; // rolling stripped PTY output, scanned for the question modal
      let questionPending = false; // guards re-entry while awaiting the user's answer
      let questionSettleTimer: ReturnType<typeof setTimeout> | null = null; // modal paint settle
      let questionCounter = 0; // synthesizes a toolUseID (the real id is not in JSONL pre-answer)
      // Generation-progress state (Story 32.7 — post-injection only).
      let progressBuffer = ''; // rolling stripped PTY output, scanned for the spinner counter
      let lastProgressTokens = -1; // last emitted token count; -1 = none yet (a real 0 still emits once)

      const teardown = () => {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        if (bootSettleTimer) {
          clearTimeout(bootSettleTimer);
          bootSettleTimer = null;
        }
        if (bootFallbackTimer) {
          clearTimeout(bootFallbackTimer);
          bootFallbackTimer = null;
        }
        if (submitTimer) {
          clearTimeout(submitTimer);
          submitTimer = null;
        }
        if (questionSettleTimer) {
          clearTimeout(questionSettleTimer);
          questionSettleTimer = null;
        }
        try {
          dirWatcher?.close();
        } catch {
          /* ignore */
        }
        try {
          fileWatcher?.close();
        } catch {
          /* ignore */
        }
        dirWatcher = null;
        fileWatcher = null;
      };

      // The pool owns PTY + watcher cleanup together (1 PTY : 1 watcher, §9-3):
      // disposing the handle runs this teardown and kills the PTY in one place.
      cliSessionPool.registerDisposer(handle, teardown);

      const detachAbort = () => {
        options.abortController?.signal.removeEventListener('abort', onAbort);
      };

      const finish = (response: ChatResponse) => {
        if (settled) return;
        settled = true;
        detachAbort();
        cliSessionPool.dispose(handle);
        callbacks.onComplete?.(response);
        resolve(response);
      };

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        detachAbort();
        cliSessionPool.dispose(handle);
        callbacks.onError?.(err);
        reject(err);
      };

      function onAbort() {
        if (settled) return;
        settled = true;
        detachAbort();
        // Interrupt claude (Ctrl+C) then tear down PTY + watcher. No onError — abort
        // is caller-initiated (timeout/stop); the caller's catch owns the UX, the
        // same way an SDK abort surfaces as a thrown error upstream.
        cliSessionPool.interrupt(handle);
        cliSessionPool.dispose(handle);
        reject(new Error('CLI engine request aborted'));
      }

      if (options.abortController) {
        if (options.abortController.signal.aborted) {
          onAbort();
          return;
        }
        options.abortController.signal.addEventListener('abort', onAbort);
      }

      // Type the prompt, then submit Enter as a SEPARATE write (bracketed-paste safe
      // — see CLI_*_MS). Guarded so abort/exit before it fires writes nothing.
      const injectPrompt = () => {
        if (injected || settled) return;
        injected = true;
        bootBuffer = ''; // done with readiness detection — release it
        if (bootSettleTimer) {
          clearTimeout(bootSettleTimer);
          bootSettleTimer = null;
        }
        if (bootFallbackTimer) {
          clearTimeout(bootFallbackTimer);
          bootFallbackTimer = null;
        }
        try {
          pty.write(content);
          submitTimer = setTimeout(() => {
            submitTimer = null;
            if (settled) return;
            try {
              pty.write('\r');
            } catch (err) {
              fail(err instanceof Error ? err : new Error(String(err)));
            }
          }, CLI_SUBMIT_GAP_MS);
        } catch (err) {
          fail(err instanceof Error ? err : new Error(String(err)));
        }
      };

      /**
       * Permission round-trip (Story 32.6 — *constrained*). The dialog is detected
       * from the PTY screen (no JSONL signal exists pre-approval). We reuse the
       * **already-passed** `canUseTool` (same closure that drives SDK-mode web
       * permissions — `websocket.ts` / `queueService.ts`) so the wire contract,
       * client, and `@hammoc/shared` are unchanged: the engine only *calls* it and
       * translates the verdict to a key. Honest constraints:
       *   - Detection is ANSI-state-only (version-fragile) — no structured JSONL.
       *   - `toolName`/`input` are best-effort scrapes; `toolUseID` is synthesized
       *     (the real id is not in JSONL until after approval).
       *   - `updatedInput` is unsupported — claude runs its own tool, so allow/deny
       *     (a keypress) is the only channel (vs SDK mode rewriting tool input).
       *   - `AskUserQuestion` (claude's own TUI question UI) is a *separate* modal,
       *     handled by `handleQuestion` below (Story 32.8) — also *constrained*.
       * Fired fire-and-forget from `onData`; guarded by `permissionPending` (no
       * re-entry on dialog re-renders) and by `settled` (abort race — AC3 ②).
       */
      const handlePermission = (toolName: string, sentence: string, toolUseID: string): void => {
        void (async () => {
          let result: PermissionResult;
          try {
            const signal = options.abortController?.signal ?? new AbortController().signal;
            result = await canUseTool!(toolName, { prompt: sentence }, { signal, toolUseID, title: sentence });
          } catch (err) {
            log.warn(`canUseTool threw, denying: ${err instanceof Error ? err.message : String(err)}`);
            result = { behavior: 'deny', message: 'permission callback error' };
          }
          // Abort race (AC3 ②): if the turn ended/aborted while we awaited the user's
          // decision, the PTY is being torn down (onAbort sends Ctrl+C, which cancels
          // the dialog) — do nothing rather than write a stray key to a dead PTY.
          if (settled) return;
          try {
            pty.write(result.behavior === 'allow' ? CLI_PERMISSION_ALLOW_KEY : CLI_PERMISSION_DENY_KEY);
          } catch (err) {
            log.warn(`permission key injection failed: ${err instanceof Error ? err.message : String(err)}`);
          }
          // Allow a subsequent permission in the same turn to be detected afresh.
          permissionPending = false;
        })();
      };

      /**
       * AskUserQuestion round-trip (Story 32.8 — *constrained*; verified Task 1). The
       * selection modal is detected from the PTY screen (no JSONL signal exists pre-answer,
       * same as the permission dialog) and the question/options are scraped from it. We
       * reuse the **already-passed** `canUseTool` — the SAME closure that drives SDK-mode
       * web question cards (`websocket.ts` / `queueService.ts`, `interactionType:'question'`)
       * — so the wire contract, client, and `@hammoc/shared` are unchanged: the engine only
       * *calls* it with the scraped questions/options, then translates the returned
       * `updatedInput.answers` into TUI menu keys (`buildQuestionKeys`). Honest constraints:
       *   - Detection + the questions/options are ANSI scrapes (version-fragile, low fidelity).
       *   - Scope is **single-question**; a multi-question (tabbed) modal, an unparseable
       *     modal, or an answer that maps to no listed option (custom "Other") is **not
       *     driven** — the modal is cancelled with **Esc** so the turn ends cleanly instead
       *     of hanging (AC4 deadlock guard; the response-path is restored, never frozen).
       *   - The wait inherits the same inactivity-timeout posture as 32.6 until Story 35.1
       *     stops the timer during input-wait (the existing S-1 heartbeat is unchanged —
       *     degrade-to-32.6; a static modal emits no frames, so a very slow answer still
       *     times out cleanly, never a permanent hang).
       * Fired fire-and-forget from `onData` (after a paint settle); guarded by
       * `questionPending` (no re-entry on modal re-renders) and by `settled` (abort race).
       */
      const handleQuestion = (parsed: ParsedQuestion | null, toolUseID: string): void => {
        void (async () => {
          // Esc-cancel + clear the guard: the single exit for every non-drivable case, so a
          // detected modal never leaves the turn without a response path (AC4 — root-cause
          // fix of the response-path deadlock, not a new freeze hidden behind a workaround).
          const cancel = (why: string) => {
            log.warn(`AskUserQuestion: ${why} — cancelling modal (Esc) to keep the turn responsive`);
            if (!settled) {
              try {
                pty.write(CLI_QUESTION_ESC_KEY);
              } catch {
                /* PTY may already be gone */
              }
            }
            questionPending = false;
          };

          if (!parsed) {
            cancel('modal not parseable as a single-question choice (or it is multi-question)');
            return;
          }

          let result: PermissionResult;
          const input = {
            questions: [
              { question: parsed.question, header: parsed.header, multiSelect: parsed.multiSelect, options: parsed.options },
            ],
          };
          try {
            const signal = options.abortController?.signal ?? new AbortController().signal;
            result = await canUseTool!('AskUserQuestion', input as unknown as Record<string, unknown>, {
              signal,
              toolUseID,
              title: parsed.question,
            });
          } catch (err) {
            cancel(`canUseTool threw (${err instanceof Error ? err.message : String(err)})`);
            return;
          }

          // Abort race: if the turn ended/aborted while awaiting the answer, the PTY is being
          // torn down (onAbort sends Ctrl+C, which cancels the modal) — write nothing.
          if (settled) return;

          const answers =
            result.behavior === 'allow' && result.updatedInput
              ? ((result.updatedInput as Record<string, unknown>).answers as Record<string, string | string[]> | undefined)
              : undefined;
          const answer = answers ? (answers[parsed.question] ?? Object.values(answers)[0]) : undefined;
          const keys = buildQuestionKeys(parsed, answer);
          if (!keys) {
            cancel('answer did not map to a listed option (custom/Other is not drivable)');
            return;
          }

          // Drive the menu keys spaced out (each a discrete keypress — CLI_QUESTION_KEY_GAP_MS),
          // re-checking the abort guard before each write.
          for (const key of keys) {
            if (settled) return;
            try {
              pty.write(key);
            } catch (err) {
              log.warn(`question key injection failed: ${err instanceof Error ? err.message : String(err)}`);
              questionPending = false;
              return;
            }
            await new Promise((r) => setTimeout(r, CLI_QUESTION_KEY_GAP_MS));
          }
          // Allow a subsequent question in the same turn to be detected afresh.
          questionPending = false;
        })();
      };

      /**
       * Parse the freshest "↓ N tokens" counter from the rolling progress buffer and
       * emit it through `onGenerationProgress` — but only when the value *changed*
       * (Story 32.7). Throttling on *change* (not increase) is deliberate: Task 1
       * observed the counter resetting at generation-segment boundaries (tool use →
       * next API call: 614→79), so a reset is forwarded as just another change and the
       * indicator never freezes at the prior segment's peak. Frames without a counter
       * (e.g. a "Deliberating…" thinking-phase spinner) produce no match → no emit
       * (false-0 guard). `matchAll` is used so the shared global regex's lastIndex is
       * never mutated across engine instances.
       */
      const emitProgress = (buf: string): void => {
        if (!onGenerationProgress || settled) return; // no stray emit after finish/abort
        const matches = [...buf.matchAll(CLI_PROGRESS_RE)];
        const last = matches[matches.length - 1];
        if (!last) return; // no counter on this frame → don't emit a phantom 0
        const tokens = parseInt(last[2].replace(/,/g, ''), 10);
        if (!Number.isFinite(tokens) || tokens === lastProgressTokens) return; // change-only throttle
        lastProgressTokens = tokens;
        const elapsedSeconds = last[1] ? parseInt(last[1], 10) : 0;
        onGenerationProgress({ tokens, elapsedSeconds });
      };

      // S-1 heartbeat: during generation the session JSONL is silent until a block
      // completes (§4.5), so onTextChunk/onThinking can't keep the caller's
      // inactivity timer alive. The ONLY real-time signal is PTY data (spinner /
      // "↓ N tokens" frames, §4.7) — forward each frame through onRawMessage so the
      // timer is reset. This timer-reset channel is wired **only on the browser path**
      // (websocket.ts:2843-2845, which has the activity-based inactivity timeout); the
      // queue path passes no `onRawMessage` and has no inactivity timeout (only the
      // inter-prompt `delayMs`), so a permission `await` there simply blocks naturally.
      //
      // The same data stream drives injection readiness (pre-injection: accumulate
      // boot output, inject once the `❯` box marker renders and output goes quiet —
      // CLI_PROMPT_MARKER) and, post-injection, permission-dialog (32.6) and
      // AskUserQuestion-modal (32.8) detection (below). (Trusted-folder happy-path — a
      // new/untrusted folder's trust dialog is deferred, §7.3.)
      pty.onData((data: string) => {
        onRawMessage?.('cli-pty-activity');
        if (!injected) {
          bootBuffer += data;
          if (bootBuffer.includes(CLI_PROMPT_MARKER)) {
            if (bootSettleTimer) clearTimeout(bootSettleTimer);
            bootSettleTimer = setTimeout(injectPrompt, CLI_BOOT_SETTLE_MS);
          }
          return;
        }
        // Post-injection: strip ANSI once and reuse the same frame for two *state*
        // signals — generation progress (32.7) and permission dialog (32.6). They are
        // independent (progress is always useful; the dialog branch needs canUseTool),
        // and they co-exist per §7.1 (both are PTY state, never content).
        const stripped = stripAnsiForDetect(data);
        // Generation progress (Story 32.7): roll a capped buffer (survives frame
        // splits) and emit the freshest counter on change.
        if (onGenerationProgress) {
          progressBuffer = (progressBuffer + stripped).slice(-CLI_PROGRESS_BUFFER_CAP);
          emitProgress(progressBuffer);
        }
        // Permission modal (Story 32.6): scan a rolling stripped buffer for the dialog.
        if (canUseTool && !permissionPending) {
          dialogBuffer = (dialogBuffer + stripped).slice(-CLI_DIALOG_BUFFER_CAP);
          if (detectPermissionDialog(dialogBuffer)) {
            permissionPending = true;
            const toolName = extractToolName(dialogBuffer);
            const sentence = extractPromptSentence(dialogBuffer);
            dialogBuffer = ''; // consume — don't re-match the same dialog text
            handlePermission(toolName, sentence, `cli-perm-${++permCounter}`);
          }
        }
        // AskUserQuestion modal (Story 32.8): a SEPARATE rolling buffer + guard so the
        // verified 32.6 permission path above stays byte-for-byte untouched. Rolling is
        // gated on !questionPending so the buffer freezes at detection (the full modal —
        // the footer marker implies a finished paint) and the same modal cannot re-fire
        // after it is answered. The settle delay then lets the on-screen modal stabilize
        // before keys are driven into it.
        if (canUseTool && !permissionPending && !questionPending) {
          questionBuffer = (questionBuffer + stripped).slice(-CLI_DIALOG_BUFFER_CAP);
          if (detectQuestionModal(questionBuffer)) {
            questionPending = true;
            questionSettleTimer = setTimeout(() => {
              questionSettleTimer = null;
              const parsed = parseQuestionModal(questionBuffer);
              questionBuffer = ''; // consume — don't re-match the same modal text
              handleQuestion(parsed, `cli-q-${++questionCounter}`);
            }, CLI_QUESTION_SETTLE_MS);
          }
        }
      });

      pty.onExit(({ exitCode }) => {
        // Interactive claude is a REPL — it should not exit before end_turn. An early
        // exit means spawn/auth/onboarding failure. (Our own kill after finish sets
        // settled=true first, so this is a no-op on the normal path.)
        if (settled) return;
        fail(new Error(`claude CLI exited (code ${exitCode}) before completing the turn`));
      });

      // Fallback: inject even if claude emits no boot output at all.
      bootFallbackTimer = setTimeout(injectPrompt, CLI_MAX_BOOT_WAIT_MS);

      const emitSessionInitOnce = (model?: string) => {
        if (sessionInitEmitted || !resolvedSessionId) return;
        sessionInitEmitted = true;
        const metadata: SessionMetadata = { model, cwd };
        callbacks.onSessionInit?.(resolvedSessionId, metadata);
      };

      // Resume: session id is known up front, so announce it immediately (the
      // caller emits session:resumed + marks the stream active).
      if (resumeId) emitSessionInitOnce();

      /** Process one parsed assistant line. Returns true when the turn ended. */
      const handleAssistantLine = (raw: RawJSONLMessage): boolean => {
        if (emittedUuids.has(raw.uuid)) return false;
        emittedUuids.add(raw.uuid);
        lastAssistantUuid = raw.uuid;

        const envelope = raw.message as AssistantEnvelope | undefined;
        emitSessionInitOnce(envelope?.model);

        const blockContent = envelope?.content;
        if (Array.isArray(blockContent)) {
          let textIdx = 0;
          for (const block of blockContent) {
            if (block.type === 'thinking') {
              // Thinking display (verified Story 32.7 Task 1, real-PTY): the thinking
              // block flows through the SAME onThinking → thinking:chunk path as SDK mode
              // (envelope-identical; renders the same live and on reload). When populated
              // it renders at parity; the empty-thinking guard below is load-bearing
              // because claude writes thinking blocks EMPTY by default — surfacing the
              // *summary* content requires the global `showThinkingSummaries` Claude Code
              // setting (no per-session spawn flag exists: `--effort` controls thinking
              // depth, not summary surfacing; `MAX_THINKING_TOKENS` is the budget). So
              // thinking-display is mechanism-complete here; the on/off toggle + a
              // per-mode "surface summaries" lever are Epic 33 (not synthesized to avoid
              // a false success — spike §4.6/§4.7).
              const thinking = (block as ThinkingContentBlock).thinking;
              if (thinking && thinking.trim()) callbacks.onThinking?.(thinking);
            } else if (block.type === 'text') {
              const text = (block as TextContentBlock).text;
              if (text && text.trim() && text.trim() !== '(no content)') {
                accumulatedText += text;
                callbacks.onTextChunk?.({
                  sessionId: resolvedSessionId ?? '',
                  messageId: `${raw.uuid}-t${textIdx++}`,
                  content: text,
                  done: false,
                });
              }
            }
            // tool_use blocks render naturally on history reload (envelope-compatible
            // — verified in the Story 32.6 observation: thinking → tool_use →
            // tool_result → text on reload). A *live* onToolUse emit here was weighed
            // (AC5) and deliberately skipped: it adds no core value (the approval
            // round-trip is the real gap) and risks ordering races with the
            // permission flow — regression-0 takes precedence. The interactive
            // approval itself is handled out-of-band by handlePermission (PTY).
          }
        } else if (typeof blockContent === 'string') {
          const text = blockContent;
          if (text.trim() && text.trim() !== '(no content)') {
            accumulatedText += text;
            callbacks.onTextChunk?.({
              sessionId: resolvedSessionId ?? '',
              messageId: raw.uuid,
              content: text,
              done: false,
            });
          }
        }

        if (envelope?.usage) {
          lastUsage = {
            inputTokens: envelope.usage.input_tokens ?? 0,
            outputTokens: envelope.usage.output_tokens ?? 0,
            cacheReadInputTokens: envelope.usage.cache_read_input_tokens ?? 0,
            cacheCreationInputTokens: envelope.usage.cache_creation_input_tokens ?? 0,
            totalCostUSD: 0,
            contextWindow: 0,
            model: envelope.model,
          };
        }

        return envelope?.stop_reason === 'end_turn';
      };

      const finishTurn = () => {
        finish({
          id: lastAssistantUuid,
          sessionId: resolvedSessionId ?? '',
          content: accumulatedText,
          done: true,
          isError: false,
          usage: lastUsage,
        });
      };

      const tick = async () => {
        if (settled || draining) return;
        draining = true;
        try {
          // Phase 1 — locate this turn's session file (new session: diff-detect).
          if (!sessionFile) {
            const found = await newestNewJsonl(sessionsDir, baselineFiles);
            if (!found) return;
            sessionFile = path.join(sessionsDir, found);
            resolvedSessionId = found.replace(/\.jsonl$/, '');
            lastSize = 0;
            attachFileWatcher();
          }

          // Phase 2 — drain only when the file grew (avoids redundant re-parses).
          const size = await fileSize(sessionFile);
          if (size <= lastSize) return;
          lastSize = size;

          const messages = await parseJSONLFile(sessionFile);
          for (const raw of messages) {
            // Filter (§6.3): only assistant lines are render targets; bookkeeping
            // (type ∉ {user,assistant}), meta, and command sentinels are excluded.
            if (raw.type !== 'assistant' || raw.isMeta) continue;
            if (emittedUuids.has(raw.uuid)) continue;
            if (handleAssistantLine(raw)) {
              finishTurn();
              return;
            }
          }
        } catch (err) {
          log.warn(`tick error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          draining = false;
        }
      };

      const scheduleTick = () => {
        void tick();
      };

      function attachFileWatcher() {
        if (!sessionFile) return;
        try {
          fileWatcher = watch(sessionFile, scheduleTick);
        } catch {
          // fs.watch unreliable/unsupported here — polling covers it.
        }
      }

      // Best-effort low-latency triggers; the poll loop is the reliable fallback.
      try {
        dirWatcher = watch(sessionsDir, scheduleTick);
      } catch {
        // Sessions dir may not exist yet (brand-new project) — polling handles it.
      }
      pollTimer = setInterval(scheduleTick, POLL_MS);
      scheduleTick();
    });
  }
}
