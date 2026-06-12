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
 * *progress* signal (the spinner's "↓ N tokens · Ns", read from the same PTY frames
 * and emitted on value change via `onGenerationProgress` — see `emitProgressFromGrid`,
 * whose token source became the Story 37.1 screen grid in Story 37.2) and
 * *verifies* thinking display (mechanism-complete; see the thinking branch in
 * `handleAssistantLine`). 32.8 wires the last interactive flow — the `AskUserQuestion`
 * selection modal (`canUseTool` web question card) — also **constrained**: like the
 * permission dialog it leaves no pre-answer JSONL signal (verified Task 1), so the modal
 * is detected from the PTY ANSI state and its questions/options are scraped, the reused
 * `canUseTool` answer is translated to menu keys (single-select ↓+Enter; multiSelect
 * Space-toggle + → Submit), and any non-drivable case (multi-question, unparseable,
 * custom "Other") is Esc-cancelled so the modal can never deadlock the response path.
 * See `handleQuestion` below. 32.9 fills the last gap 32.6 AC5 left as "(optional) live
 * `onToolUse` parity, only when it does not collide with the permission order / regression-0":
 * `handleAssistantLine` now *emits* each tool_use block (and the drain emits each tool_result
 * line) through the SAME `onToolUse`/`onToolResult` callbacks SDK mode uses (mapping copied
 * from `streamHandler`), so a tool card renders live — which file is being written shows the
 * moment it happens, not only on reload. The verification gate (Task 1) found the permission
 * card's id namespace (synthetic `cli-perm-N`) and the real tool id (`toolu_…`) can never
 * match, so id-merge is impossible; the honest floor is taken: a tool that went through the
 * 32.6 permission dialog is *suppressed* live (it already has the standalone permission card
 * and renders on reload), while auto-approved / safe tools (Bypass mode; read-only/auto-
 * approved tools in default mode) emit live. No double-render: `stream:complete-messages`
 * replaces the live cards with the authoritative reload at turn end (same as SDK mode), so
 * client + `@hammoc/shared` are unchanged — the engine only *calls* the existing callbacks.
 * Synthetic typing (the client-side per-block typewriter effect for CLI mode) is now
 * implemented in the client render layer (`utils/syntheticTyper.ts`, wired into
 * `useStreaming`) — gated by the `cliSyntheticTyping` toggle AND the effective CLI engine,
 * with the shared SDK frame-coalescing path left untouched. The on/off toggles and
 * mode-selection UI shipped in Epic 33.
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
  ToolUseContentBlock,
  ToolResultContentBlock,
  TrackedToolCall,
  ToolResult,
} from '@hammoc/shared';
import { resolveEffectiveModel, sanitizeToolResultContent, effectiveModelIs1M, isAutoNative1MModel } from '@hammoc/shared';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { watch, mkdirSync, writeFileSync, createWriteStream, type FSWatcher, type WriteStream } from 'fs';
import { sessionService } from './sessionService.js';
import { cliSessionPool } from './cliSessionPool.js';
import { createCliScreenModel, CLI_SCREEN_COLS, CLI_SCREEN_ROWS } from './cliScreenModel.js';
import { setCliScreen } from './cliScreenCache.js';
import { readSpinnerProgress } from './cliSpinnerProgress.js';
import {
  detectPermissionDialog,
  detectUsageLimit,
  extractToolName,
  extractPromptSentence,
  detectQuestionModal,
  parseQuestionModal,
  parseConfirmChoiceMenu,
  parsePrecedingText,
  readPermissionMode,
  permissionModeCycleIndex,
  isIdleInputGrid,
  classifyPreInjectScreen,
  CLI_PERMISSION_MODE_CYCLE,
  type ParsedQuestion,
  type PreInjectScreen,
} from './cliModalDetect.js';
import { rateLimitProbeService } from './rateLimitProbeService.js';
import { parseJSONLFile } from './historyParser.js';
import { rewindSessionFiles } from './fileRewind.js';
import type { ChatEngine } from './chatEngine.js';
import { createLogger } from '../utils/logger.js';
import { SDKError, SDKErrorCode } from '../utils/errors.js';

const log = createLogger('cliChatEngine');

/**
 * CLI attachment passthrough (image support in CLI mode). The interactive PTY carries
 * only text, so image attachments — already saved to disk by `imageStorageService` —
 * are referenced *by path* rather than embedded as base64 (SDK mode's approach). Two
 * cooperating pieces:
 *  - `uniqueAttachmentDirs`: directories to grant read access to via `--add-dir`. The
 *    attachments live under `~/.claude/projects/<slug>/images`, OUTSIDE the project
 *    cwd, so without this the model's Read is blocked (or prompts for permission).
 *  - `appendAttachmentInstruction`: an explicit "use your Read tool to open these
 *    files" line appended to the prompt. A bare path in the text does NOT reliably
 *    trigger a Read — the model must be told. Verified by real-PTY smoke: a
 *    `--add-dir`'d image referenced this way is read (vision) with no permission
 *    prompt in default mode.
 */
function uniqueAttachmentDirs(paths?: string[]): string[] {
  if (!paths || paths.length === 0) return [];
  const dirs = new Set<string>();
  for (const p of paths) dirs.add(path.dirname(p));
  return [...dirs];
}

function appendAttachmentInstruction(content: string, paths?: string[]): string {
  if (!paths || paths.length === 0) return content;
  const many = paths.length > 1;
  const list = paths.map((p) => `- ${p}`).join('\n');
  return `${content}\n\n[Attached image${many ? 's' : ''} — use your Read tool to open ${many ? 'these files' : 'this file'} and view ${many ? 'them' : 'it'}:\n${list}]`;
}

/**
 * Poll interval (ms) for session-file detection + draining. `fs.watch` is wired
 * as the low-latency trigger, but its reliability varies by platform (§7.2-2),
 * so a poll loop is the deterministic fallback that also covers the case where
 * the project's sessions directory does not exist yet (brand-new project).
 */
const POLL_MS = 60;

/**
 * Path to the bundled CLI PreToolUse command-hook script (Story 36.1 — background
 * block). Resolves to packages/server/resources/hooks/block-background.cjs in both
 * dev (src) and prod (dist) — resources/ ships via npm `files` (same pattern as
 * manualSyncService). Forward-slashed so the `node "..."` command is shell-safe.
 */
const BACKGROUND_HOOK_SCRIPT = path
  .resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'resources',
    'hooks',
    'block-background.cjs'
  )
  .replace(/\\/g, '/');

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
const CLI_MAX_BOOT_WAIT_MS = 4000; // first fallback checkpoint: inject if the ❯ marker has settled
// Hard ceiling when the ❯ marker has NOT appeared by the first checkpoint. A heavy startup
// (e.g. an MCP-laden project whose input box took ~6s to render) pushes the box past 4s, and
// injecting blind before it exists loses the prompt and hangs the turn forever. So past the
// first checkpoint we keep waiting for the marker up to this ceiling before a last-resort inject.
const CLI_MAX_BOOT_WAIT_NO_MARKER_MS = 20000;
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

/**
 * Shift+Tab (`CSI Z` = `\x1b[Z`) — advances claude's permission-mode cycle by ONE step
 * (normal → accept edits → plan → auto → wrap). The ONLY mechanism that cycles the mode
 * (Meta+M is NOT a mode switch — empirically refuted, Story 37.5). Driven through the same
 * `pty.write` path the permission/question keys use; spaced by `CLI_QUESTION_KEY_GAP_MS`
 * (each Shift+Tab is a discrete keypress, like the menu keys).
 */
const CLI_PERMISSION_CYCLE_KEY = '\x1b[Z';

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

/** Best-effort dump of the pre-injection PTY screen for the Epic 37.6 grid classifier. Story 37.6
 *  extends it from raw-only (observe-only) to ALSO enclosing the settled grid + the classifier's
 *  verdict (`input-box` / `selection` / `unknown`), so an `unknown`/`selection` screen's identity can
 *  be captured (the AC4 extension-point material) and an explicit-error fail can name the snapshot for
 *  the operator (AC3 — expose, don't blind-inject). Best-effort: never breaks a turn. */
function capturePreInjectScreen(
  sessionId: string | null,
  raw: string,
  grid?: string[],
  classification?: PreInjectScreen,
): string | null {
  try {
    const dir = path.join(process.cwd(), 'logs', 'claude-debug');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${sessionId ?? 'unknown'}-${Date.now()}-preinject-screen.log`);
    const gridSection =
      grid !== undefined
        ? `\n\n===== SETTLED GRID (classification: ${classification ?? 'n/a'}) =====\n${grid.join('\n')}`
        : '';
    writeFileSync(file, raw + gridSection);
    return file;
  } catch {
    return null;
  }
}

/** Normalize text to a whitespace-free lowercase key for the preceding-text dedup fingerprint. */
function normalizeForFp(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
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

/** Map the cliResumeChoice auto-pick ('summary' | 'full') to the matching resume-menu option label.
 *  Match by keyword on claude's wording ("Resume from summary …" / "Resume full session as-is"),
 *  falling back to position (summary first, full second) when the wording shifts across versions. */
function pickAutoResumeOption(options: { label: string }[], choice: 'summary' | 'full'): string | undefined {
  const kw = choice === 'summary' ? /summary/i : /full/i;
  const byKeyword = options.find((o) => kw.test(o.label));
  if (byKeyword) return byKeyword.label;
  return options[choice === 'summary' ? 0 : 1]?.label;
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

/**
 * Story 37.5 — the engine instance only reaches the LIVE PTY *while a turn runs*. claude's
 * PTY, the screen model, and the turn-local modal-pending flags all live inside the
 * `sendMessageWithCallbacks` Promise closure (turn-per-process); an instance method such as
 * `setPermissionMode` cannot see them directly. This control handle is created *inside* that
 * closure (so its getters capture the turn-local state) and published on the engine field
 * `activeCliControl` for the duration of the turn, then released on the single teardown path —
 * the same set-at-spawn / clear-at-teardown lifecycle the screen model uses. It is the bridge
 * that lets the closed loop drive keys + read the grid + observe liveness/modal state without
 * widening any public seam.
 */
interface CliLiveControl {
  /** Inject one key into the live PTY (same path as the permission/question keys). */
  writeKey(key: string): void;
  /** Flush + read the settled screen grid (the same deterministic read the detectors use). */
  readSettledGrid(): Promise<string[]>;
  /** False once the turn settled (finish/abort/exit) — the last-line abort-race guard. */
  isAlive(): boolean;
  /** True while a permission/question modal is up (captures the turn-local pending flags). */
  isModalPending(): boolean;
}

export class CliChatEngine implements ChatEngine {
  private workingDirectory: string | undefined;
  private permissionMode: PermissionMode;
  /**
   * Story 37.5: the live control surface for the in-flight turn (set at spawn, cleared at
   * teardown). Null between turns — `setPermissionMode` reads it to decide live closed loop
   * vs. store-only fallback. See `CliLiveControl`.
   */
  private activeCliControl: CliLiveControl | null = null;
  /**
   * Story 33.3: user-configured `claude` binary path override (global preference).
   * Forwarded to every spawn; empty/undefined = auto-detect, invalid = graceful
   * fallback in `cliSessionPool.resolveClaudeBinary`.
   */
  private cliBinaryPath: string | undefined;
  /**
   * When true (default), inject `--settings '{"showThinkingSummaries":true}'` so the
   * interactive claude is asked to surface thinking summaries (Opus 4.7+ omit them by
   * default). Session-scoped via `--settings` — the global config is untouched. NOTE:
   * the actual effect depends on the server honoring the parameter for the active auth;
   * a real CLI-mode chat must confirm it (the interactive PTY could not be reproduced in
   * the dev shell — no Windows console there; a real entrypoint:cli session was observed
   * to surface thinking, so this is expected to work).
   */
  private cliShowThinkingSummaries: boolean;
  // Epic 37.6 follow-up: auto-pick for the resume confirm menu ('ask' = card, else auto-select).
  private cliResumeChoice: 'ask' | 'summary' | 'full';

  /**
   * CLI mode performs no inline rewind-before-send, so this stays null. (Standalone
   * rewind is the separate `rewindFiles` operation below — implemented in Story 32.5.)
   */
  rewindWarning: string | null = null;

  constructor(config: ChatServiceConfig = {}) {
    this.workingDirectory = config.workingDirectory;
    this.permissionMode = config.permissionMode ?? 'default';
    this.cliBinaryPath = config.cliBinaryPath;
    this.cliShowThinkingSummaries = config.cliShowThinkingSummaries ?? true;
    this.cliResumeChoice = config.cliResumeChoice ?? 'ask';
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    // Story 37.5 — live Shift+Tab closed loop vs. store-only fallback. The stored
    // `this.permissionMode` is always the authority the NEXT spawn maps to
    // `--permission-mode` (AC7); when a live turn is idle we ALSO drive the running claude's
    // mode in place and adopt the *verified* (screen-confirmed) mode rather than the request.
    const control = this.activeCliControl;

    // Store-only fallbacks (no live key injection). Three pre-emptive cases, in order:
    //   (1) No live control — turn outside, OR the narrow spawn/teardown race where the handler
    //       still sees status==='running' but `activeCliControl` is not (yet/any longer) set.
    //   (2) A permission/question modal is up (the flag is checked BEFORE reading the grid — the
    //       pre-emptive last line of defense, same shape as the 37.4 abort-race guard — so a stray
    //       CSI Z can never land in a modal and disturb its key wiring).
    //   (3) The target mode is OFF the Shift+Tab cycle (`dontAsk`) — no reachable cycle index, so
    //       there is nothing to drive; the next spawn applies it via `--permission-mode`.
    if (!control || control.isModalPending() || permissionModeCycleIndex(mode) < 0) {
      this.permissionMode = mode;
      return;
    }

    // The turn is live and modal-free — but only an IDLE input box accepts a verified mode-cycle
    // keypress. A mid-generation spinner frame's CSI Z behavior is unverified (idle was the only
    // observed state), so classify the settled grid and, if generating (or the PTY died), fall back
    // to store-only (the next spawn applies `--permission-mode`).
    if (!control.isAlive()) {
      this.permissionMode = mode;
      return;
    }
    const grid = await control.readSettledGrid();
    if (!control.isAlive() || !isIdleInputGrid(grid)) {
      this.permissionMode = mode;
      return;
    }

    // Idle: drive the closed loop and adopt the VERIFIED settled mode (never the assumed target).
    this.permissionMode = await this.cyclePermissionMode(control, mode, grid);
  }

  /**
   * Story 37.5 — the CSI Z (Shift+Tab) closed loop. Reads the current mode from the settled grid,
   * advances claude's cycle to `target` with wrap-aware forward steps, then RE-READS to verify the
   * mode the screen actually landed on. Returns the VERIFIED mode (never the assumed target):
   *   - on convergence that is `target`;
   *   - on non-convergence (fail-safe) it is whatever the screen actually shows — the SCREEN is the
   *     authority, so the live claude and the stored next-spawn flag never disagree. No extra keys
   *     are injected on non-convergence (no "wind it back to the assumed target"); a single warning
   *     is logged.
   * `initialGrid` is the caller's already-read, idle-verified settled grid — reused as the first
   * current-mode read so we do not double-flush.
   */
  private async cyclePermissionMode(
    control: CliLiveControl,
    target: PermissionMode,
    initialGrid: string[],
  ): Promise<PermissionMode> {
    const N = CLI_PERMISSION_MODE_CYCLE.length;
    const targetIdx = permissionModeCycleIndex(target); // caller guaranteed >= 0
    const current = readPermissionMode(initialGrid);
    const curIdx = permissionModeCycleIndex(current); // read from cycle labels ⇒ always >= 0
    // Wrap-aware forward step count, bounded to [0, N-1] — so at most N-1 keypresses: the cycle
    // length is the hard injection ceiling (a turn that can't reach the target within one lap is
    // abnormal, so we never keep spinning). 0 steps ⇒ already on target ⇒ inject nothing.
    const steps = (((targetIdx - curIdx) % N) + N) % N;
    for (let i = 0; i < steps; i++) {
      if (!control.isAlive()) return current; // PTY died mid-loop — stop, report last known
      control.writeKey(CLI_PERMISSION_CYCLE_KEY);
      // Discrete keypresses, spaced like the menu keys (a coalesced burst could drop a step).
      await new Promise((r) => setTimeout(r, CLI_QUESTION_KEY_GAP_MS));
    }
    // Re-read is async; re-check liveness before trusting the grid (37.4 abort-race shape — never
    // adopt a grid read after the PTY was torn down).
    if (!control.isAlive()) return current;
    const finalGrid = await control.readSettledGrid();
    if (!control.isAlive()) return current;
    const verified = readPermissionMode(finalGrid);
    if (verified !== target) {
      // Fail-safe: do NOT inject more. Adopt the ACTUAL landed mode as the authority (not the
      // target) so the live screen and the stored next-spawn flag stay in lockstep. Warn once.
      log.warn(
        `CLI permission-mode cycle did not converge: target=${target} landed=${verified} (steps=${steps}) — adopting the verified on-screen mode`,
      );
    }
    return verified;
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
   * `handlePermission`). `onRawMessage` is the *generation-activity* signal (S-1): it
   * resets the browser path's inactivity timer while a turn streams. It no longer keeps
   * an input-wait alive — Story 35.1 pauses that timer for the whole input-wait.
   * `onGenerationProgress` (Story 32.7) is the transient "↓ N tokens · Ns" signal
   * read from the same spinner frames — emitted on value change (see `emitProgressFromGrid`).
   * `onPhase` (Story 36.2) reports the pre-generation boot/inject phase
   * (launching → submitting → waiting → null) so the UI shows "working" through the ~3s
   * before the first block instead of a frozen spinner; null hands off to onGenerationProgress.
   */
  async sendMessageWithCallbacks(
    content: string,
    callbacks: StreamCallbacks,
    options: ChatOptions = {},
    canUseTool?: CanUseTool,
    onRawMessage?: (messageType: string) => void,
    onGenerationProgress?: (progress: { tokens: number; elapsedSeconds: number }) => void,
    onPhase?: (phase: 'launching' | 'submitting' | 'waiting' | null) => void,
    onPtyRaw?: (chunk: string) => void,
  ): Promise<ChatResponse> {
    const cwd = this.workingDirectory;
    if (!cwd) {
      throw new Error('CliChatEngine requires a workingDirectory to locate the session JSONL');
    }

    // Reference image attachments by path in the prompt (the PTY can't carry base64
    // the way SDK mode does). No-op when there are no attachments. Paired with the
    // `--add-dir` grants built into `args` below so the referenced files are readable.
    const promptToInject = appendAttachmentInstruction(content, options.attachedImagePaths);

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
    // Image attachments (CLI mode): grant read access to each attachment directory.
    // The files live outside the project cwd (~/.claude/projects/.../images), so
    // without --add-dir the model's Read is blocked. The matching prompt-side reference
    // (`appendAttachmentInstruction`, applied to `promptToInject`) is what actually
    // triggers the read.
    for (const dir of uniqueAttachmentDirs(options.attachedImagePaths)) {
      args.push('--add-dir', dir);
    }
    // Session-scoped `--settings` JSON (the global ~/.claude/settings.json is never
    // modified). Two things ride on it:
    //  - Story 36.1: a PreToolUse command hook that denies background Bash
    //    (run_in_background) — ALWAYS injected, since turn-per-process makes a
    //    backgrounded task doomed. The deny bypasses canUseTool, so it also blocks
    //    auto-approved calls (mirrors the SDK engine's inline hook in chatService).
    //  - thinking summaries (default ON): Opus 4.7+ omit summaries unless asked; this
    //    requests them. Effect under subscription auth must be confirmed in a real
    //    CLI-mode chat (see field doc).
    const settingsObj: Record<string, unknown> = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: `node "${BACKGROUND_HOOK_SCRIPT}"` }],
          },
        ],
      },
    };
    if (this.cliShowThinkingSummaries) {
      settingsObj.showThinkingSummaries = true;
    }
    args.push('--settings', JSON.stringify(settingsObj));

    // Experimental CLI debug instrumentation (HAMMOC_CLI_DEBUG=1). Adds claude's own
    // --debug-file so its internal reasoning (including any auto-compact decision) is
    // captured per spawn, to diagnose why claude self-compacts on some long-idle resumes.
    // No-op unless the env flag is set; *.log is gitignored. Best-effort — instrumentation
    // must never break a turn.
    if (process.env.HAMMOC_CLI_DEBUG) {
      try {
        const dbgDir = path.join(process.cwd(), 'logs', 'claude-debug');
        mkdirSync(dbgDir, { recursive: true });
        const dbgSid = resumeId ?? options.sessionId ?? 'new';
        const dbgFile = path.join(dbgDir, `${dbgSid}-${Date.now()}.log`);
        args.push('--debug-file', dbgFile);
        log.info(`[CLI-DEBUG] spawn resume=${resumeId ?? 'none'} sid=${dbgSid} debugFile=${dbgFile}`);
      } catch (e) {
        log.warn(`[CLI-DEBUG] debug-file setup failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Pin this turn's session file by id whenever the id is known up front. The file
    // name is deterministic — claude writes `<id>.jsonl` for BOTH `--resume <id>` and
    // the pre-allocated `--session-id <id>` (same flag built into `args` above) — so we
    // target that file directly. The previous path only pinned on resume and otherwise
    // adopted "the newest NEW *.jsonl" (newestNewJsonl); that cannot tell two new
    // sessions in the SAME project apart, so a new-session turn could latch onto the
    // OTHER session's freshly-created file (the new-session file-matching race —
    // reproduced in cliChatEngine.sessionIsolation.test.ts). Hammoc always supplies a
    // client-generated UUID for new sessions (ChatPage route `/session/:sessionId`), so
    // the unpinned diff-detect fallback below only triggers when no id was supplied at
    // all (claude self-assigns the id) — the one case where the file name is unknown.
    const preallocId =
      !resumeId && options.sessionId && UUID_RE.test(options.sessionId) ? options.sessionId : undefined;
    const pinnedId = resumeId ?? preallocId;

    // New-session detection baseline (§7.2-1) is only needed for the unpinned fallback;
    // when pinned we never scan for new files, so skip the pre-spawn snapshot.
    const baselineFiles = pinnedId ? new Set<string>() : await listJsonl(sessionsDir);

    // A pinned id resolves the session file up front; resume additionally records the
    // current size so only NEW appended assistant lines are emitted (not the replayed
    // history) and seeds the emitted set with the existing assistant uuids.
    let sessionFile: string | null = null;
    let resolvedSessionId: string | null = null;
    let lastSize = 0;
    const emittedUuids = new Set<string>();

    if (pinnedId) {
      sessionFile = sessionService.getSessionFilePath(projectSlug, pinnedId);
      resolvedSessionId = pinnedId;
      if (resumeId) {
        lastSize = await fileSize(sessionFile);
        for (const m of await parseJSONLFile(sessionFile)) {
          // Seed assistant uuids AND any prior compact_boundary so resume replays neither. The
          // compact_boundary seed is load-bearing for the hang fix in `tick` below: without it a
          // compaction already in the transcript would be re-read as "this turn ended" the instant
          // we resume, finishing the turn before the model ever responds.
          if (m.type === 'assistant' || (m.type === 'system' && m.subtype === 'compact_boundary')) {
            emittedUuids.add(m.uuid);
          }
        }
      }
      // Pre-allocated new session: the file does not exist yet (claude creates it on the
      // first write); lastSize stays 0 so the whole file drains once it appears.
    }

    const { handle, pty } = cliSessionPool.spawnClaude({ cwd, args, binaryPathOverride: this.cliBinaryPath });
    // Story 37.1: a headless screen model, one per turn (same lifecycle as the PTY),
    // fed every PTY frame UNCONDITIONALLY (unlike the gated mirror) so the final screen
    // grid is always reconstructed — "reconstruct always / display-only toggle" (AC3).
    // Geometry matches the spawn geometry (120×40) so claude's in-place redraw
    // coordinates line up. Pure foundation: no production consumer reads it yet (37.2~).
    const screen = createCliScreenModel(CLI_SCREEN_COLS, CLI_SCREEN_ROWS);

    // Story 37.1 (Task 4 — GO/NO-GO fixture capture): opt-in raw PTY frame dump. The
    // interactive claude PTY cannot be reproduced in a dev shell (no Windows console —
    // a constraint documented throughout Epic 32.x), so the real v2.1.162 frames that
    // become regression fixtures are collected from the owner's live CLI chat. Gated by
    // HAMMOC_CLI_PTY_DUMP (OFF by default — same opt-in shape as HAMMOC_CLI_DEBUG); the
    // raw bytes (ANSI intact) are appended to a gitignored logs/cli-pty-dump/*.log.
    // Best-effort — instrumentation must never break a turn.
    let ptyDumpStream: WriteStream | null = null;
    if (process.env.HAMMOC_CLI_PTY_DUMP) {
      try {
        const dumpDir = path.join(process.cwd(), 'logs', 'cli-pty-dump');
        mkdirSync(dumpDir, { recursive: true });
        const dumpSid = resumeId ?? options.sessionId ?? 'new';
        const dumpFile = path.join(dumpDir, `${dumpSid}-${Date.now()}.log`);
        ptyDumpStream = createWriteStream(dumpFile, { encoding: 'utf8' });
        log.info(`[CLI-PTY-DUMP] raw frame capture → ${dumpFile}`);
      } catch (e) {
        log.warn(`[CLI-PTY-DUMP] setup failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Story 36.2: report the pre-generation phase so the UI shows progress through the
    // ~3s boot/inject window instead of a frozen spinner. launching → (❯ seen) submitting
    // → (Enter sent) waiting → (first block) null, handing off to onGenerationProgress.
    onPhase?.('launching');

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
      let bootMarkerSeen = false; // ❯ input box has rendered — gates the blind fallback inject (never inject before the box exists)
      let bootSettleTimer: ReturnType<typeof setTimeout> | null = null;
      let bootFallbackTimer: ReturnType<typeof setTimeout> | null = null;
      let bootRecoverTimer: ReturnType<typeof setTimeout> | null = null; // Story 37.6: post-Esc re-classify timer
      let choiceMenuHandled = false; // Story 37.6 follow-up: one-shot handoff of a drivable confirm menu (resume prompt)
      let submitTimer: ReturnType<typeof setTimeout> | null = null;
      // Permission-dialog state (Story 32.6 — post-injection only). Story 37.4: detection reads
      // the settled screen grid (no rolling buffer); `permissionPending` is the per-modal re-fire
      // guard that the old buffer-clear consume used to provide.
      let permissionPending = false; // guards re-entry while awaiting the user's decision
      let permCounter = 0; // synthesizes a toolUseID (the real id is not in JSONL pre-approval)
      // Live tool-card state (Story 32.9 — post-injection only).
      // FIFO count of permission-gated tools whose live tool_use emit must be SUPPRESSED:
      // each detected 32.6 dialog already shows a standalone permission card (synthetic
      // `cli-perm-N`), so emitting a second card under the real `toolu_…` id would split it
      // (the two id namespaces never match — Task 1). Incremented at dialog detection,
      // decremented per tool_use block; the invariant "#suppressed == #permission cards" means
      // a permission-gated tool can never produce a duplicate live card. Auto-approved/safe
      // tools (count 0) emit live. The suppressed tool still renders on reload (no loss).
      let permissionGatedToolsPending = 0;
      // tool_use ids emitted live this turn (gates which tool_results to mirror live — a
      // suppressed tool is absent here, so its result is left to reload too, no orphan).
      const liveEmittedToolIds = new Set<string>();
      // tool_use ids whose tool_result was already emitted (the drain re-parses the whole
      // file as it grows; this dedups so a result is mirrored exactly once).
      const resultEmittedToolIds = new Set<string>();
      // AskUserQuestion-modal state (Story 32.8 — post-injection only). Story 37.4: detection
      // reads the settled grid; `questionPending` is the per-modal re-fire guard (replacing the
      // old buffer-clear consume), held across the settle timer + the round-trip.
      let questionPending = false; // guards re-entry while awaiting the user's answer
      let questionSettleTimer: ReturnType<typeof setTimeout> | null = null; // modal paint settle
      let questionCounter = 0; // synthesizes a toolUseID (the real id is not in JSONL pre-answer)
      // Ordering fix: when the prose above a question modal is scraped + emitted live (it is not
      // in the JSONL until post-answer), this holds a normalized prefix of it so the matching
      // JSONL text block's live re-emit is suppressed (no transient duplicate; reload is authoritative).
      let scrapedPrecedingFingerprint: string | null = null;
      // Usage-limit notice state (POST-INJECTION only — see the onData handler). The limit shows
      // only on the PTY, never in the JSONL, so without detection the turn would hang waiting for
      // an end_turn that never arrives. Detection is deferred until after prompt injection so the
      // resumed-transcript repaint (which may merely *quote* the banner) cannot false-trigger it.
      // Story 37.4: read from the settled grid; a refuted scrape is simply ignored every frame
      // (idempotent) and logged once — no buffer to clear.
      let limitFalsePositiveLogged = false; // log a refuted (usage-contradicted) scrape once per turn

      // Generation-progress state (Story 32.7 — post-injection only; token source = screen grid, 37.2).
      let lastProgressTokens = -1; // last emitted token count; -1 = none yet (a real 0 still emits once)
      // Story 36.2: the phase indicator ends once generation actually starts (first
      // progress counter). Idempotent — only the first call emits the null hand-off.
      let phaseCleared = false;
      const clearPhase = () => {
        if (phaseCleared) return;
        phaseCleared = true;
        onPhase?.(null);
      };

      // Story 37.5: publish the live control surface for THIS turn. Created here (inside the turn
      // closure) so its getters capture the turn-local `settled` / `permissionPending` /
      // `questionPending` that the instance method `setPermissionMode` cannot reach directly
      // (out-of-scope). `writeKey` reuses the modal-key `pty.write` path; `readSettledGrid` reuses
      // the same flush→readGrid deterministic read the detectors use. Released on teardown (below).
      this.activeCliControl = {
        writeKey: (key: string) => pty.write(key),
        readSettledGrid: async () => {
          await screen.flush();
          return screen.readGrid();
        },
        isAlive: () => !settled,
        isModalPending: () => permissionPending || questionPending,
      };

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
        if (bootRecoverTimer) {
          clearTimeout(bootRecoverTimer);
          bootRecoverTimer = null;
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
        // Story 37.5: release the live control surface on the SAME single teardown path — once the
        // turn is gone there is no live PTY to drive, so a later setPermissionMode falls back to
        // store-only (next spawn `--permission-mode`). Set before screen.dispose so no closed loop
        // can read a disposed grid.
        this.activeCliControl = null;
        // Story 37.7: hand off the per-turn emulator's FINAL grid to the session-lifetime
        // screen cache BEFORE dispose — turn-per-process means there is no emulator between
        // turns, so this cached grid is the only "current screen" a late-join can receive.
        // Read BEFORE screen.dispose() (a disposed emulator can't be read — the same
        // ordering discipline as the activeCliControl release above). Best-effort: a read
        // failure must never break teardown.
        if (resolvedSessionId) {
          try {
            setCliScreen(resolvedSessionId, screen.readGrid());
          } catch {
            /* ignore — snapshot succession best-effort */
          }
        }
        // Story 37.1: release the per-turn headless emulator on the SAME single teardown
        // path (no new dispose route) — registerDisposer routes finish/fail/onAbort/onExit
        // and server shutdown (destroyAll) all through here, so the screen model is freed
        // alongside the timers/watchers on every exit.
        try {
          screen.dispose();
        } catch {
          /* ignore — dispose best-effort */
        }
        // Story 37.1 (Task 4): close the opt-in fixture dump on the same teardown path.
        try {
          ptyDumpStream?.end();
          ptyDumpStream = null;
        } catch {
          /* ignore — dump best-effort */
        }
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
        // Story 37.6: the pre-injection snapshot is now taken UPSTREAM by attemptInjectFromGrid (it
        // holds the settled grid + classification). Injection is reached only on the verified
        // `input-box` path, so there is no blind inject left to capture here.
        onPhase?.('submitting'); // input box verified — typing the prompt now
        bootBuffer = ''; // done with readiness detection — release it
        if (bootSettleTimer) {
          clearTimeout(bootSettleTimer);
          bootSettleTimer = null;
        }
        if (bootFallbackTimer) {
          clearTimeout(bootFallbackTimer);
          bootFallbackTimer = null;
        }
        if (bootRecoverTimer) {
          clearTimeout(bootRecoverTimer);
          bootRecoverTimer = null;
        }
        try {
          pty.write(promptToInject);
          submitTimer = setTimeout(() => {
            submitTimer = null;
            if (settled) return;
            try {
              pty.write('\r');
              onPhase?.('waiting'); // prompt submitted — awaiting the first response block
            } catch (err) {
              fail(err instanceof Error ? err : new Error(String(err)));
            }
          }, CLI_SUBMIT_GAP_MS);
        } catch (err) {
          fail(err instanceof Error ? err : new Error(String(err)));
        }
      };

      /**
       * Story 37.6 — pre-injection screen classification gate. The `❯` readiness marker is a
       * *shared* glyph (idle input box, selection-menu highlight, and permission dialog all paint
       * it), so its presence is necessary but NOT sufficient to inject. Once boot output settles we
       * read the SETTLED grid (37.1) and act on a 3-way verdict instead of blind-injecting:
       *   - `input-box`  → inject (AC1, the only injecting path).
       *   - `selection`  → never let an Enter hit the first option (AC2). A *recognized* menu is
       *                    safe to cancel with Esc (32.8's deadlock-guard key) — try ONCE, then
       *                    re-classify (AC4). No second key if Esc fails to recover.
       *   - `unknown`    → press NO blind key (AC3); at the decisive checkpoint, end the turn with
       *                    an explicit error and expose the screen.
       * This replaces the old `bootBuffer.includes('❯')`→inject path that mis-injected an Enter into
       * a resume-time selection menu's first option (e.g. `/compact`), losing the prompt (실측
       * 2026-06-11). `screen.write(data)` runs unconditionally before the boot branch, so the
       * settled grid is already readable here (the 37.1 foundation that makes this possible).
       */
      const snapshotPreInject = (grid: string[], classification: PreInjectScreen): string | null =>
        capturePreInjectScreen(resolvedSessionId, bootBuffer, grid, classification);

      /** AC3 hard-fail: never blind-inject — expose the screen (snapshot path + grid text) and end the
       *  turn with an explicit error so the operator can see what the pre-injection screen was. */
      const failUnready = (reason: string, grid: string[], classification: PreInjectScreen) => {
        if (injected || settled) return;
        const snapPath = snapshotPreInject(grid, classification);
        log.warn(
          `CLI boot: ${reason} — withholding injection (no blind key). Screen (${classification}):\n${grid.join('\n').trim()}`,
        );
        fail(
          new Error(
            `CLI boot aborted: ${reason}. The pre-injection screen was not a usable input box` +
              (snapPath ? ` (screen snapshot: ${snapPath})` : '') +
              '.',
          ),
        );
      };

      /**
       * Decide from the SETTLED grid (flush first — absence-based signals must not read a half-drawn
       * frame, 37.5 weak-signal discipline). `isFinal` marks the decisive ceiling checkpoint: a
       * non-input-box that cannot be recovered ends the turn; a non-final settle simply waits for the
       * ceiling fallback. Async (`flush().then`), so `injected`/`settled` are re-checked at read time.
       */
      const attemptInjectFromGrid = (isFinal: boolean) => {
        if (injected || settled) return;
        void screen.flush().then(() => {
          if (injected || settled) return;
          const grid = screen.readGrid();
          const classification = classifyPreInjectScreen(grid);
          if (process.env.HAMMOC_CLI_DEBUG) snapshotPreInject(grid, classification);
          if (classification === 'input-box') {
            injectPrompt(); // AC1 — verified input box
            return;
          }
          if (classification === 'selection') {
            // Story 37.6 follow-up: a confirm-style choice menu (claude's resume "summary vs full
            // session" prompt) is DRIVABLE — hand it to the same web card the AskUserQuestion modal
            // uses, or auto-pick per cliResumeChoice, instead of blind-Esc (which cancelled the
            // resume and hung the turn — the root cause). One-shot so a mid-round-trip re-render does
            // not re-fire it; a non-confirm (truly unknown) menu still falls through to Esc recovery.
            const choiceMenu = parseConfirmChoiceMenu(grid);
            if (choiceMenu && !choiceMenuHandled) {
              choiceMenuHandled = true;
              void driveBootChoiceMenu(choiceMenu);
              return;
            }
            // Esc-cancel REMOVED (오너 지시 2026-06-12): the old "selection → Esc to recover" rule
            // closed claude's resume confirm menu mid-card (the boot stage Esc'd the very menu its own
            // card was showing — the "flash" the user saw; originally it also hung the turn outright).
            // Once a confirm menu is handed to the card (choiceMenuHandled), the boot stage must NOT
            // touch the screen — driveBootChoiceMenu owns it through to injection. A selection that is
            // NOT a drivable confirm menu is exposed as an explicit error at the ceiling — never a key.
            if (choiceMenuHandled) return;
            if (isFinal) failUnready('selection menu is not a drivable confirm menu', grid, classification);
            return;
          }
          // classification === 'unknown' — blind keys forbidden (AC3). Expose only; the ceiling
          // checkpoint escalates to an explicit error.
          if (isFinal)
            failUnready('pre-injection screen is neither an input box nor a recognized selection menu', grid, classification);
        });
      };

      /**
       * Story 37.6 follow-up: drive a boot-stage confirm choice menu (claude's resume "summary vs
       * full session" prompt). cliResumeChoice='ask' (default) shows it via the SAME web card the
       * AskUserQuestion modal uses and injects the user's pick; 'summary'/'full' auto-selects that
       * option. Either way `buildQuestionKeys` maps the choice to menu keys (↓×index + Enter). After
       * the keys land the menu closes and the input box appears, so we re-run the gate to inject the
       * prompt (the boot ceiling still covers a missed settle). A non-drivable answer (no card
       * channel, or an unmapped pick) Esc-cancels so the turn stays responsive instead of hanging.
       */
      const driveBootChoiceMenu = async (parsed: ParsedQuestion): Promise<void> => {
        const cancelToStayResponsive = () => {
          if (!settled) {
            try {
              pty.write(CLI_QUESTION_ESC_KEY);
            } catch {
              /* PTY may already be gone */
            }
          }
        };
        let answer: string | string[] | undefined;
        if (this.cliResumeChoice === 'ask') {
          // The card is an open-ended user interaction with no boot deadline — clear the boot
          // fallback/settle timers so the ceiling can't fire mid-card and Esc-cancel the very menu
          // we're showing (an unanswered card is ended by the user's own abort). Injection is
          // re-attempted right after the chosen keys land.
          if (bootFallbackTimer) {
            clearTimeout(bootFallbackTimer);
            bootFallbackTimer = null;
          }
          if (bootSettleTimer) {
            clearTimeout(bootSettleTimer);
            bootSettleTimer = null;
          }
          if (bootRecoverTimer) {
            clearTimeout(bootRecoverTimer);
            bootRecoverTimer = null;
          }
          if (!canUseTool) {
            cancelToStayResponsive();
            return;
          }
          let result: PermissionResult;
          try {
            const signal = options.abortController?.signal ?? new AbortController().signal;
            result = await canUseTool(
              'AskUserQuestion',
              {
                questions: [
                  { question: parsed.question, header: parsed.header, multiSelect: parsed.multiSelect, options: parsed.options },
                ],
              } as unknown as Record<string, unknown>,
              { signal, toolUseID: `cli-resume-choice-${resolvedSessionId ?? 'boot'}`, title: parsed.question },
            );
          } catch {
            cancelToStayResponsive();
            return;
          }
          if (settled) return;
          const answers =
            result.behavior === 'allow' && result.updatedInput
              ? ((result.updatedInput as Record<string, unknown>).answers as Record<string, string | string[]> | undefined)
              : undefined;
          answer = answers ? (answers[parsed.question] ?? Object.values(answers)[0]) : undefined;
        } else {
          // Auto-pick: 'summary' | 'full' → the matching option label (keyword, else position).
          answer = pickAutoResumeOption(parsed.options, this.cliResumeChoice);
        }
        const keys = buildQuestionKeys(parsed, answer);
        if (!keys) {
          cancelToStayResponsive();
          return;
        }
        for (const key of keys) {
          if (settled) return;
          try {
            pty.write(key);
          } catch {
            return;
          }
          await new Promise((r) => setTimeout(r, CLI_QUESTION_KEY_GAP_MS));
        }
        // Menu answered → claude closes it and paints the input box. The boot timers are suppressed
        // while choiceMenuHandled (nothing else can Esc or re-inject), so drive the injection here:
        // poll for the input box and inject once it settles; never hang — error out if it never comes.
        for (let i = 0; i < 30 && !settled && !injected; i++) {
          await new Promise((r) => setTimeout(r, 100));
          await screen.flush();
          if (isIdleInputGrid(screen.readGrid())) {
            injectPrompt();
            return;
          }
        }
        if (!settled && !injected) {
          failUnready('input box did not appear after answering the resume menu', screen.readGrid(), 'unknown');
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
       *   - The wait no longer times out: Story 35.1 pauses the browser path's inactivity
       *     timer for the whole input-wait, so even a static modal (which emits no PTY
       *     frames) waits indefinitely — "respond when you can". The S-1 onRawMessage
       *     heartbeat is now only a generation-activity signal, not what keeps the modal
       *     alive; the deadlock guard below (Esc on any non-drivable case) is what still
       *     ends the turn cleanly.
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
       * Read the freshest "↓ N tokens" counter from the *settled screen grid* and emit
       * it through `onGenerationProgress` — but only when the value *changed* (Story
       * 32.7; data source moved to the grid in Story 37.2). The grid overwrites the
       * spinner cell in place, so fusion is structurally impossible — no fusion-defense
       * guards needed. Preserved:
       *   - change-only throttle (not increase-only): Task 1 observed the counter
       *     resetting at generation-segment boundaries (tool use → next API call:
       *     614→79), so a reset is forwarded as just another change and the indicator
       *     never freezes at the prior segment's peak;
       *   - false-0 guard: a frame with no counter (e.g. a "Deliberating…" thinking-
       *     phase spinner) reads as null → no emit;
       *   - `settled` guard: this runs ASYNC after `flush()`, so settled is re-checked
       *     HERE at emit time — no stray emit after finish/abort;
       *   - `clearPhase`: the first counter ends the phase indicator (idempotent).
       */
      const emitProgressFromGrid = (grid: string[]): void => {
        if (settled || !onGenerationProgress) return; // async — re-check at emit time
        const progress = readSpinnerProgress(grid);
        if (!progress) return; // no counter row → don't emit a phantom 0
        if (progress.tokens === lastProgressTokens) return; // change-only throttle
        lastProgressTokens = progress.tokens;
        clearPhase(); // spinner counter appeared → generation started; end the phase indicator
        onGenerationProgress({ tokens: progress.tokens, elapsedSeconds: progress.elapsedSeconds });
      };

      /**
       * Story 37.4: ALL post-injection screen consumers (generation progress 32.7/37.2/37.3,
       * usage limit, permission modal 32.6, question modal 32.8) read ONE settled grid per frame.
       * `screen.write` is unconditional but async/buffered, so the onData handler schedules a single
       * non-blocking `void screen.flush().then(consumeSettledGrid)`; this reads the settled grid once
       * and runs every (independent) detector against it. Replaces the deleted linear `stripAnsiForDetect`
       * + per-detector rolling buffers — the grid is the sole extraction path.
       *
       * Async, so `settled` is re-checked HERE (post finish/abort no stray work). The per-modal
       * re-fire guard is now the `permissionPending` / `questionPending` flag (the old buffer-clear
       * consume is impossible on a *living* screen — the modal stays visible every frame until the
       * key is driven, so the flag, not an empty buffer, bounds it to one handling per modal).
       */
      const consumeSettledGrid = (): void => {
        if (settled) return; // async — re-check at read time (no stray emit/detect after finish/abort)
        const grid = screen.readGrid();
        const text = grid.join('\n'); // = readScreenText(): line-spanning existence detectors

        // (1) Generation progress (Story 32.7 / 37.2 token source / 37.3 elapsed). Gated on the
        // callback (queue path omits it). The grid overwrites the spinner cell in place → no fusion.
        if (onGenerationProgress) emitProgressFromGrid(grid);

        // (2) Usage-limit exhaustion (POST-INJECTION ONLY — this runs only because consumeSettledGrid
        // is scheduled after injection). The "You've hit your weekly limit · resets …" notice lives
        // ONLY on screen, never in the JSONL, so without detection the turn hangs waiting for an
        // end_turn that never comes. Guards: the OAuth-usage corroboration (a real block sits at ~100%
        // on some window; if every window has headroom the on-screen text is content, not a notice →
        // ignore, log once), and the percentage-warning exclusion (inside detectUsageLimit). A refuted
        // scrape stays on the living screen but is simply ignored every frame (idempotent) — no buffer
        // to clear. Coded RATE_LIMIT_EXCEEDED so parseSDKError forwards the message verbatim and the
        // resume-retry path skips it (no pointless respawn into the same wall).
        //
        // ★ Story 37.4 settled-gate decision (deliberate, not accidental): folding this into the shared
        // post-flush block puts it behind the `if (settled) return` above — a usage limit is a signal to
        // END the turn fast, but if the turn is already settled (finish/abort) there is no turn left to
        // end, so detecting the limit then is meaningless. This implicit gate is adopted as harmless
        // HARDENING (it prevents a stray post-settle fail), NOT a behavior regression; corroboration,
        // POST-INJECTION scoping, and the once-log are all preserved.
        const limitMsg = detectUsageLimit(text);
        if (limitMsg) {
          if (rateLimitProbeService.isLimitCorroborated()) {
            fail(new SDKError(limitMsg, SDKErrorCode.RATE_LIMIT_EXCEEDED));
            return;
          }
          if (!limitFalsePositiveLogged) {
            limitFalsePositiveLogged = true;
            log.info(
              'CLI: ignoring scraped usage-limit notice — real usage shows headroom (false positive): %s',
              limitMsg,
            );
          }
        }

        // (3) Permission modal (Story 32.6). `permissionPending` is the per-modal re-fire guard: set
        // true on detection, cleared once handlePermission resolves (key driven). The dialog stays on
        // the living screen every frame until then, so the flag (not a buffer clear) bounds it to once.
        if (canUseTool && !permissionPending && detectPermissionDialog(text)) {
          permissionPending = true;
          const toolName = extractToolName(text);
          const sentence = extractPromptSentence(text);
          handlePermission(toolName, sentence, `cli-perm-${++permCounter}`);
          // Story 32.9: this tool's tool_use block (written only AFTER the decision — 32.6 Task 1;
          // allow AND deny both record one block — verified) must NOT be live-emitted, or its real-id
          // card would split from the standalone permission card above. Mark one block for suppression;
          // the dialog always precedes the block (claude blocks on the prompt), so the counter is set
          // before the drain sees it.
          permissionGatedToolsPending++;
        }

        // (4) AskUserQuestion modal (Story 32.8). Mutually exclusive with the permission path above
        // (checked first; the two detectors require disjoint signatures, so they never cross-fire).
        // `questionPending` is the per-modal re-fire guard, held across the settle timer + round-trip.
        if (canUseTool && !permissionPending && !questionPending && detectQuestionModal(text)) {
          questionPending = true;
          // Let the modal finish painting (the footer first appearing does not mean every option row is
          // drawn yet). When the timer FIRES, re-flush and re-read the grid: the modal is fully painted
          // *at fire time*, so parse the freshest settled grid — NOT a half-drawn snapshot captured at
          // detection. The re-read is async too, so re-check `settled` / `questionPending` once more (the
          // last line of defense against an abort landing during the settle window).
          questionSettleTimer = setTimeout(() => {
            questionSettleTimer = null;
            void screen.flush().then(() => {
              if (settled || !questionPending) return;
              const freshGrid = screen.readGrid();
              const parsed = parseQuestionModal(freshGrid);
              // Ordering fix: emit the prose rendered ABOVE the modal BEFORE the question card. The
              // JSONL copy of this prose is flushed only after the answer (too late), so the screen is
              // the only pre-answer source. Lossy/best-effort; the matching JSONL block's live re-emit
              // is deduped in handleAssistantLine, and the turn-end reload is authoritative.
              const pre = parsePrecedingText(freshGrid);
              if (pre && !settled) {
                callbacks.onTextChunk?.({
                  sessionId: resolvedSessionId ?? '',
                  messageId: `cli-pre-${questionCounter}`,
                  content: pre,
                  done: false,
                });
                scrapedPrecedingFingerprint = normalizeForFp(pre).slice(0, 24) || null;
              }
              handleQuestion(parsed, `cli-q-${++questionCounter}`);
            });
          }, CLI_QUESTION_SETTLE_MS);
        }
      };

      // S-1 heartbeat: during generation the session JSONL is silent until a block
      // completes (§4.5), so onTextChunk/onThinking can't keep the caller's
      // inactivity timer alive. The ONLY real-time signal is PTY data (spinner /
      // "↓ N tokens" frames, §4.7) — forward each frame through onRawMessage so the
      // timer is reset *while generating*. This timer-reset channel is wired **only on
      // the browser path** (the `onRawMessage` argument of websocket.ts's
      // `sendMessageWithCallbacks` call, which owns the activity-based inactivity
      // timeout); the queue path passes no `onRawMessage` and has no inactivity timeout
      // (only the inter-prompt `delayMs`), so a permission `await` there simply blocks
      // naturally.
      //
      // Story 35.1: the browser path now *pauses* that inactivity timer for the whole
      // input-wait (permission / AskUserQuestion), so onRawMessage no longer has any role
      // in keeping an input-wait alive — it is purely a generation-activity signal. The
      // browser-vs-queue asymmetry above is moot during the wait (both now block
      // indefinitely); it still describes generation-time behavior.
      //
      // The same data stream drives injection readiness (pre-injection: accumulate
      // boot output, inject once the `❯` box marker renders and output goes quiet —
      // CLI_PROMPT_MARKER) and, post-injection, permission-dialog (32.6) and
      // AskUserQuestion-modal (32.8) detection (below). (Trusted-folder happy-path — a
      // new/untrusted folder's trust dialog is deferred, §7.3.)
      pty.onData((data: string) => {
        onRawMessage?.('cli-pty-activity');
        // Story 37.1: feed the headless screen model UNCONDITIONALLY (no gate), before the
        // mirror/scrape branches so it sees the exact same raw frame. This is the code form
        // of "reconstruct always / display-only toggle": the screen model is always supplied
        // while the mirror below is toggled. Pure observer — does not alter the frame or any
        // downstream scrape. Foundation only: nothing reads this grid in this story (37.2~).
        screen.write(data);
        // Story 37.1 (Task 4): mirror the raw frame to the opt-in fixture dump (no-op
        // unless HAMMOC_CLI_PTY_DUMP is set). Best-effort — never break a turn.
        if (ptyDumpStream) {
          try {
            ptyDumpStream.write(data);
          } catch {
            /* ignore — dump best-effort */
          }
        }
        // Live mirror passthrough (onPtyRaw) — a pure observer of the UNMODIFIED frame
        // (raw, ANSI intact). It never alters the grid-based state detection (progress /
        // limit / dialog / question) below; gated upstream by the cliPtyMirror preference.
        onPtyRaw?.(data);
        // Pre-injection (boot/resume): accumulate output until the ❯ readiness marker, then classify
        // the SETTLED grid before injecting (Story 37.6). The `❯` marker is a cheap, NECESSARY-but-
        // insufficient trigger (it is shared by the input box, selection menus, and the permission
        // dialog) — so it only arms the settle timer; the actual decision (`input-box`/`selection`/
        // `unknown`) is made by attemptInjectFromGrid on the flushed grid. The POST-injection grid
        // detectors (consumeSettledGrid) still run only after injection.
        if (!injected) {
          // While the card is driving a confirm menu (choiceMenuHandled), suppress the boot settle
          // timer — re-entering attemptInjectFromGrid would re-classify the still-open menu and
          // (pre-2026-06-12) Esc it out from under the card. driveBootChoiceMenu owns the screen
          // until injection.
          if (choiceMenuHandled) return;
          bootBuffer += data;
          if (bootBuffer.includes(CLI_PROMPT_MARKER)) {
            bootMarkerSeen = true;
            if (bootSettleTimer) clearTimeout(bootSettleTimer);
            bootSettleTimer = setTimeout(() => attemptInjectFromGrid(false), CLI_BOOT_SETTLE_MS);
          }
          return;
        }
        // Story 37.4: one settled grid read per frame feeds EVERY post-injection consumer (progress /
        // usage limit / permission / question). `screen.write` above is unconditional but async/buffered,
        // so the grid is only definitive after `flush()` resolves — schedule it non-blocking (`void …then`)
        // to keep the hot path clear. The deleted linear `stripAnsiForDetect` + rolling buffers are gone;
        // the grid is the sole extraction path.
        void screen.flush().then(consumeSettledGrid);
      });

      pty.onExit(({ exitCode }) => {
        // Interactive claude is a REPL — it should not exit before end_turn. An early
        // exit means spawn/auth/onboarding failure. (Our own kill after finish sets
        // settled=true first, so this is a no-op on the normal path.)
        if (settled) return;
        fail(new Error(`claude CLI exited (code ${exitCode}) before completing the turn`));
      });

      // Fallback for when the ❯ marker never settles. CRITICAL: never inject before the box marker
      // has rendered — injecting before the input box exists loses the prompt and hangs the turn in
      // "waiting" forever (reproduced on an MCP-heavy project whose box took ~6s, past the 4s
      // checkpoint; the snippet-chain's near-instant next turn hit it cold). The `bootMarkerSeen`
      // gate + ceiling timing skeleton are preserved; Story 37.6 changes only the FINAL decision:
      // the firing of this fallback is the DECISIVE checkpoint, so it routes through
      // attemptInjectFromGrid(isFinal=true) — `input-box` injects (rescues a normal box whose settle
      // merely lagged behind noise, AC5 hang prevention); `selection`/`unknown` no longer blind-inject
      // but end the turn with an explicit error (AC3) instead.
      const armBootFallback = (delay: number, isFinal: boolean) => {
        bootFallbackTimer = setTimeout(() => {
          if (injected || settled || choiceMenuHandled) return;
          if (bootMarkerSeen || isFinal) {
            attemptInjectFromGrid(true); // decisive: grid-verified inject or explicit-error fail
          } else {
            armBootFallback(CLI_MAX_BOOT_WAIT_NO_MARKER_MS - CLI_MAX_BOOT_WAIT_MS, true);
          }
        }, delay);
      };
      armBootFallback(CLI_MAX_BOOT_WAIT_MS, false);

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
        // Story 36.2 (AC1): the first assistant block means generation has started — end the
        // phase indicator here too, so a response that emits no spinner counter (no "↓ N tokens"
        // frame) still leaves the waiting phase. Idempotent with emitProgressFromGrid, which fires
        // first when a spinner counter appears; whichever comes first wins, the other is a no-op.
        clearPhase();
        lastAssistantUuid = raw.uuid;

        const envelope = raw.message as AssistantEnvelope | undefined;
        emitSessionInitOnce(envelope?.model);

        const blockContent = envelope?.content;
        if (Array.isArray(blockContent)) {
          let textIdx = 0;
          for (const block of blockContent) {
            if (block.type === 'thinking') {
              // Thinking display: thinking blocks flow through the SAME onThinking →
              // thinking:chunk path as SDK mode (renders live + on reload). The
              // empty-thinking guard below matters because Opus 4.7+ OMIT thinking
              // summaries by default, so the block often arrives EMPTY (signature only)
              // unless summaries are explicitly requested. `cliShowThinkingSummaries`
              // (default ON) requests them — the arg build above injects
              // `--settings '{"showThinkingSummaries":true}'` into the interactive spawn
              // (session-scoped; the global ~/.claude/settings.json is never touched).
              // Evidence this works in CLI mode: a real entrypoint:cli session on this
              // host (claude v2.1.162, opus-4-8) surfaced POPULATED thinking. (#52376
              // reports subscription sessions get redacted thinking, but a real CLI
              // session here contradicted that — so we wire it and let a live CLI chat
              // confirm. Note: `-p`/print runs as entrypoint:sdk-ts, a DIFFERENT path,
              // so a `-p` test does NOT represent interactive CLI mode.)
              const thinking = (block as ThinkingContentBlock).thinking;
              if (thinking && thinking.trim()) callbacks.onThinking?.(thinking);
            } else if (block.type === 'text') {
              const text = (block as TextContentBlock).text;
              if (text && text.trim() && text.trim() !== '(no content)') {
                accumulatedText += text;
                // Ordering-fix dedup: if this block was already shown live via the pre-question
                // PTY scrape, suppress the (now redundant) live re-emit — the reload is
                // authoritative either way. Match on a normalized prefix (the scrape is spacing-
                // lossy but its START is intact); consume the fingerprint so only the first
                // matching block is suppressed. accumulatedText still includes it once.
                const fp = scrapedPrecedingFingerprint;
                if (fp && normalizeForFp(text).startsWith(fp)) {
                  scrapedPrecedingFingerprint = null;
                } else {
                  callbacks.onTextChunk?.({
                    sessionId: resolvedSessionId ?? '',
                    messageId: `${raw.uuid}-t${textIdx++}`,
                    content: text,
                    done: false,
                  });
                }
              }
            } else if (block.type === 'tool_use') {
              // Story 32.9: live tool-card emission. The envelope is identical to SDK mode
              // (verified against real CLI sessions — `{type:'tool_use', id:'toolu_…', name,
              // input}`), so reuse the SDK mapping (`streamHandler.handleToolUseBlock`) and
              // the existing onToolUse → `tool:call` wire verbatim. The block also renders on
              // reload (the authoritative `stream:complete-messages` replaces the live cards
              // at turn end), so this only adds the *live* view — no double render.
              const toolBlock = block as ToolUseContentBlock;
              if (permissionGatedToolsPending > 0) {
                // Approval-gated tool (AC4): a 32.6 standalone permission card already stands
                // in for it (synthetic `cli-perm-N` id) and it renders on reload — so suppress
                // the live emit (a real-id card here would split from that permission card).
                // This is the honest reload fallback for the permission path (Task 1 decision).
                permissionGatedToolsPending--;
              } else {
                // Auto-approved / safe tool (AC2): no dialog, no standalone card → a live card
                // is clean. Track the id so the matching tool_result is mirrored live (AC3).
                const toolCall: TrackedToolCall = {
                  id: toolBlock.id,
                  name: toolBlock.name,
                  input: toolBlock.input,
                  status: 'pending',
                };
                liveEmittedToolIds.add(toolBlock.id);
                callbacks.onToolUse?.(toolCall);
              }
            }
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
          // Context-window size — the ring's *denominator*. The session JSONL carries
          // per-request token counts but NOT the model's window, so derive it from the
          // model: an explicit `[1m]` opt-in or an Opus auto-1M runs at 1M, else the 200K
          // default. SDK mode pulls this from `modelUsage`; CLI mode has no such field, so
          // it previously hard-coded `contextWindow:0` — which made the ring treat the data
          // as missing and stay hidden the entire CLI session.
          const contextWindowSize =
            effectiveModelIs1M(options.model) || isAutoNative1MModel(envelope.model) ? 1_000_000 : 200_000;
          lastUsage = {
            inputTokens: envelope.usage.input_tokens ?? 0,
            outputTokens: envelope.usage.output_tokens ?? 0,
            cacheReadInputTokens: envelope.usage.cache_read_input_tokens ?? 0,
            cacheCreationInputTokens: envelope.usage.cache_creation_input_tokens ?? 0,
            totalCostUSD: 0,
            contextWindow: contextWindowSize,
            model: envelope.model,
          };
          // Live context — the ring's *numerator*. Every completed response writes a JSONL
          // line carrying its exact input-context usage; forward it through the SAME
          // `onContextEstimate` channel SDK mode uses (→ `context:estimate` → ring update) so
          // the ring fills block-by-block *during* a turn instead of only at end_turn. The
          // total is the real reported context (uncached input + both cache buckets), not an
          // estimate; the client keeps the max (context only grows between compactions). Same
          // value repeats across a response's block lines — the client's >current guard dedups.
          const totalContextTokens =
            (envelope.usage.input_tokens ?? 0) +
            (envelope.usage.cache_read_input_tokens ?? 0) +
            (envelope.usage.cache_creation_input_tokens ?? 0);
          callbacks.onContextEstimate?.(totalContextTokens, contextWindowSize);
        }

        return envelope?.stop_reason === 'end_turn';
      };

      /**
       * Story 32.9 (AC3, AC5): mirror a user line's tool_result blocks through onToolResult,
       * but only for tools that were live-emitted this turn (`liveEmittedToolIds`). A
       * permission-gated tool was suppressed (no live card), so its result is left to reload
       * too — a `tool:result` for a card that does not exist live would orphan it. Deduped per
       * tool_use_id (`resultEmittedToolIds`) because the drain re-parses the whole file as it
       * grows. The success/output/error + XML-strip mapping mirrors
       * `streamHandler.handleToolResultBlock` / `historyParser` exactly (envelope-compatible),
       * so the live result matches what reload would render.
       */
      const emitToolResults = (raw: RawJSONLMessage): void => {
        const content = raw.message?.content;
        if (!Array.isArray(content)) return;
        for (const block of content) {
          if (block.type !== 'tool_result') continue;
          const trb = block as ToolResultContentBlock & { is_error?: boolean };
          const id = trb.tool_use_id;
          if (!liveEmittedToolIds.has(id) || resultEmittedToolIds.has(id)) continue;
          resultEmittedToolIds.add(id);
          const rawContent = typeof trb.content === 'string' ? trb.content : '';
          const cleanContent = sanitizeToolResultContent(rawContent);
          const isError = trb.is_error ?? false;
          const result: ToolResult = {
            success: !isError,
            output: isError ? undefined : cleanContent,
            error: isError ? cleanContent : undefined,
          };
          callbacks.onToolResult?.(id, result);
        }
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
            if (raw.isMeta) continue;
            // Filter (§6.3): assistant lines are the render targets; user lines are mined for
            // tool_result blocks (Story 32.9 — live result mirroring); every other type
            // (summary/system/queue-operation/command sentinels) is bookkeeping and excluded.
            if (raw.type === 'assistant') {
              if (emittedUuids.has(raw.uuid)) continue;
              if (handleAssistantLine(raw)) {
                finishTurn();
                return;
              }
            } else if (raw.type === 'user') {
              emitToolResults(raw);
            } else if (raw.type === 'system' && raw.subtype === 'compact_boundary') {
              // Turn-completion signal for a compaction. claude itself writes this when it
              // self-compacts on resume — confirmed 2026-06-10 from packages/server/logs: NO
              // [AUTO-COMPACT] marker for the observed cases, so this is NOT a Hammoc/websocket
              // `/compact` injection; the interactive claude binary decides to compact on some
              // long-idle resumes (root cause still under investigation). It can also come from a
              // user clicking the context ring (/compact). Unlike a normal turn, a compaction
              // writes NO end_turn assistant line — only this system boundary plus a "Compacted"
              // stdout — so without treating the boundary as completion the turn waits forever for
              // an end_turn that never comes (the CLI compact-hang root cause). Guarded by
              // emittedUuids so a prior compaction replayed on resume (seeded above) is ignored.
              if (emittedUuids.has(raw.uuid)) continue;
              emittedUuids.add(raw.uuid);
              const cm = (raw as { compactMetadata?: { trigger?: string; preTokens?: number; postTokens?: number } }).compactMetadata;
              log.info(`[CLI-DEBUG] compact_boundary detected: trigger=${cm?.trigger} preTokens=${cm?.preTokens} postTokens=${cm?.postTokens}`);
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
