/**
 * Claude Login Service (Story BS-7)
 *
 * Orchestrates the interactive `claude` `/login` OAuth flow from inside Hammoc so a user —
 * including on mobile, with no host terminal — can authenticate without leaving the UI.
 *
 * It reuses the SAME PTY lifecycle the CLI chat engine uses (`cliSessionPool.spawnClaude`)
 * and the SAME headless screen model (`cliScreenModel`) for prompt detection, but it is a
 * SEPARATE, disposable login session: it is spawned in `os.tmpdir()` (not a project), it
 * never injects a chat prompt, and it is torn down the moment login completes or times out.
 * Isolation by construction — the chat session count (websocket `activeStreams`) and the web
 * terminal pool (`ptyService`) are never touched.
 *
 * Browser auto-open is suppressed via `extraEnv: { BROWSER: 'none' }` (Story BS-7 added the
 * `extraEnv` merge to `cliSessionPool.buildEnv`), so the CLI prints the OAuth URL on screen
 * instead of shelling out to a desktop browser the mobile/remote client doesn't have.
 *
 * ── Detection sources (empirically verified against the bundled binary, claude v2.1.181, via
 *    a non-destructive node-pty probe — code never submitted, so auth state was untouched) ──
 *   - Trust prompt / login-method menu / "Paste code" prompt: read from the SETTLED screen grid
 *     (the box-chrome modal text the existing CLI detectors also read).
 *   - OAuth URL: read from the RAW PTY stream, de-wrapped — NOT the grid. The URL is ~450 chars
 *     and the live grid CORRUPTS it: claude hard-wraps the URL into ~118-char lines and the
 *     concurrent "✶ Opening browser…" spinner repaints overwrite the box edges (verified: the
 *     grid showed `tps://…` with the leading `ht` clipped and ~2 chars lost per row boundary).
 *     The raw stream carries the URL once, intact, so we extract + de-wrap from there.
 *
 * Version-fragile by nature (a future TUI revision can reword the prompts / restyle the menu);
 * the four detection patterns are exported named constants so the tests assert against the same
 * source the runtime uses, and a failure degrades to the manual "run /login in a terminal" path
 * (the onboarding fallback the story's rollback note describes).
 */

import os from 'os';
import path from 'path';
import { watch, existsSync, readFileSync, unlinkSync, type FSWatcher } from 'fs';
import type { AccountInfo } from '@hammoc/shared';
import { cliSessionPool } from './cliSessionPool.js';
import { createCliScreenModel, CLI_SCREEN_COLS, CLI_SCREEN_ROWS } from './cliScreenModel.js';
import { accountInfoService } from './accountInfoService.js';
import { rateLimitProbeService } from './rateLimitProbeService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('claudeLoginService');

/** `~/.claude/.credentials.json` — the OAuth credentials file the CLI writes on success and that
 *  `rateLimitProbeService` reads. Auth completion is detected by this file gaining a token. */
const CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');
const CREDENTIALS_DIR = path.dirname(CREDENTIALS_PATH);

// ── Detection patterns (verified against claude v2.1.181 — see file header) ──

/** Trust prompt shown for an untrusted cwd. Defensive: a fresh `os.tmpdir()` spawn did NOT show
 *  it in the probe (Temp was already trusted), but other environments may, so it is auto-accepted
 *  when present before `/login` is injected. */
export const LOGIN_TRUST_PROMPT_RE = /Is this a project you created or one you trust\?/i;

/** The login-method selection menu anchor ("Select login method:" above the 3 numbered options). */
export const LOGIN_METHOD_PROMPT_RE = /Select login method:/i;

/** The OAuth authorize URL start anchor (the full URL is de-wrapped from the raw stream). */
export const OAUTH_URL_RE = /https:\/\/claude\.com\/cai\/oauth\/authorize\?/;

/** The code-entry prompt the CLI shows once the OAuth URL is displayed. */
export const LOGIN_CODE_PROMPT_RE = /Paste code here if prompted/i;

/** The idle input-box prompt glyph — boot readiness marker (shared with the CLI engine). */
const LOGIN_INPUT_MARKER = '❯';

/** A selection-menu footer ("Esc to cancel") — the AND-gate partner so a half-drawn menu can't
 *  match (same conservative spirit as the CLI permission/question detectors). */
const LOGIN_ESC_CANCEL_RE = /Esc\b[^\n]{0,16}\bcancel\b/i;

const ESC = '\x1b';
/** Strip ANSI CSI/OSC sequences and control bytes from a raw PTY chunk so the URL reads cleanly. */
function stripAnsi(s: string): string {
  return s
    .replace(new RegExp(ESC + '\\[[0-9;?]*[A-Za-z]', 'g'), '')
    .replace(new RegExp(ESC + '\\][^\\x07]*\\x07', 'g'), '')
    .replace(new RegExp(ESC + '[=>]', 'g'), '')
    // eslint-disable-next-line no-control-regex -- intentionally stripping raw PTY control bytes
    .replace(/[\x00-\x09\x0b-\x1f]/g, '');
}

/** True when the settled grid shows the untrusted-cwd trust prompt. */
export function detectTrustPrompt(gridText: string): boolean {
  return LOGIN_TRUST_PROMPT_RE.test(gridText);
}

/** True when the settled grid shows the login-method selection menu (anchor + cancel footer). */
export function detectLoginMethodPrompt(gridText: string): boolean {
  return LOGIN_METHOD_PROMPT_RE.test(gridText) && LOGIN_ESC_CANCEL_RE.test(gridText);
}

/** True when the settled grid shows the "Paste code here" prompt (anchor + cancel footer). */
export function detectCodePrompt(gridText: string): boolean {
  return LOGIN_CODE_PROMPT_RE.test(gridText) && LOGIN_ESC_CANCEL_RE.test(gridText);
}

/**
 * Extract the full OAuth authorize URL from the RAW (ANSI-stripped) PTY stream, de-wrapping
 * claude's hard line breaks. claude prints the long URL split onto ~118-char lines with NO
 * indent; each break is a real `\n` whose next char is a URL char (so we skip it), and the URL
 * ends at the first real whitespace or a blank/indented line (next char is `\n`/space). Returns
 * the first occurrence (the clean initial paint) or null when no URL is on screen yet.
 */
export function extractOAuthUrl(rawText: string): string | null {
  const flat = stripAnsi(rawText).replace(/\r/g, '');
  const start = flat.search(OAUTH_URL_RE);
  if (start < 0) return null;
  let url = '';
  for (let j = start; j < flat.length; j++) {
    const c = flat[j];
    if (c === '\n') {
      const next = flat[j + 1];
      // Hard-wrap continuation: the next line starts with another URL char → skip the break.
      if (next && next !== '\n' && next !== ' ' && next !== '\t') continue;
      break; // blank / indented line → the URL ended on the previous char
    }
    if (c === ' ' || c === '\t') break;
    url += c;
  }
  return url.length > 0 ? url : null;
}

/** Read the OAuth access token from the credentials file, or null if absent/unreadable. */
function readCredentialsToken(): string | null {
  try {
    if (!existsSync(CREDENTIALS_PATH)) return null;
    const data = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
    const token = data?.claudeAiOauth?.accessToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Delete the OAuth credentials file (logout). Returns true when the file is gone afterward
 * (deleted now or already absent). Best-effort — a delete failure is reported as false so the
 * caller surfaces an error rather than a false "logged out".
 */
export function deleteCredentials(): boolean {
  try {
    if (existsSync(CREDENTIALS_PATH)) unlinkSync(CREDENTIALS_PATH);
    return !existsSync(CREDENTIALS_PATH);
  } catch (err) {
    log.warn(`logout: failed to delete credentials: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** Login-method options the menu presents (1-based, matching the CLI's numbering). */
export type LoginMethod = 1 | 2 | 3;

/** Callbacks the WebSocket handler wires to `auth:*` client emits. */
export interface ClaudeLoginCallbacks {
  /** The login-method menu is on screen — the client should present the 3 options. */
  onMethodPrompt: () => void;
  /** The OAuth URL was captured — relay it for the user to open. */
  onUrl: (url: string) => void;
  /** The "Paste code here" prompt is ready — the client should show the code input. */
  onCodePrompt: () => void;
  /** Auth completed — credentials written; fresh account info (or null if the fetch failed). */
  onComplete: (account: AccountInfo | null) => void;
  /** Login failed or timed out — `message` is a short reason for the client toast. */
  onError: (message: string) => void;
}

const BOOT_SETTLE_MS = 400;
const SUBMIT_GAP_MS = 1000; // bracketed-paste-safe gap before the Enter that submits typed text
const KEY_GAP_MS = 350; // discrete keypress spacing (digit then Enter)
const CREDENTIALS_POLL_MS = 500;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

type LoginPhase =
  | 'idle'
  | 'booting'
  | 'method-select'
  | 'awaiting-url'
  | 'code-input'
  | 'completing'
  | 'done'
  | 'error';

/**
 * One disposable interactive login session. Created per `auth:start`, driven by the client's
 * `auth:select-method` / `auth:submit-code`, and disposed on completion / timeout / disconnect.
 */
export class ClaudeLoginSession {
  private readonly cb: ClaudeLoginCallbacks;
  private readonly screen = createCliScreenModel();
  private handle: string | null = null;
  private pty: import('node-pty').IPty | null = null;
  private phase: LoginPhase = 'idle';
  private rawAccum = '';
  private bootBuffer = '';
  private injectedLogin = false;
  private trustAccepted = false;
  private methodPrompted = false;
  private urlEmitted = false;
  private codePrompted = false;
  private settled = false;
  private bootSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private credPollTimer: ReturnType<typeof setInterval> | null = null;
  private credWatcher: FSWatcher | null = null;
  private readonly timeoutMs: number;

  constructor(cb: ClaudeLoginCallbacks, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.cb = cb;
    this.timeoutMs = timeoutMs;
  }

  /** Spawn the disposable login PTY and begin the boot → /login sequence. */
  start(binaryPathOverride?: string): void {
    if (this.phase !== 'idle') return;
    this.phase = 'booting';
    try {
      const spawned = cliSessionPool.spawnClaude({
        cwd: os.tmpdir(),
        args: [],
        cols: CLI_SCREEN_COLS,
        rows: CLI_SCREEN_ROWS,
        extraEnv: { BROWSER: 'none' },
        binaryPathOverride,
      });
      this.handle = spawned.handle;
      this.pty = spawned.pty;
    } catch (err) {
      this.fail(`Failed to start login session: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    cliSessionPool.registerDisposer(this.handle, () => this.teardown());

    this.pty.onData((data: string) => this.onData(data));
    this.pty.onExit(({ exitCode }) => {
      // The interactive REPL should not exit before login completes. An early exit means a
      // spawn/auth failure — but if we're already completing/done, this is our own kill.
      if (this.phase === 'completing' || this.phase === 'done' || this.settled) return;
      this.fail(`claude CLI exited (code ${exitCode}) before login completed`);
    });

    this.timeoutTimer = setTimeout(() => this.fail('Login timed out'), this.timeoutMs);
  }

  /** Inject the chosen login method (1/2/3) into the menu (digit + Enter). */
  selectMethod(method: LoginMethod): void {
    if (this.phase !== 'method-select' || !this.pty) return;
    this.phase = 'awaiting-url';
    try {
      this.pty.write(String(method));
      setTimeout(() => {
        if (this.settled || !this.pty) return;
        this.pty.write('\r');
      }, KEY_GAP_MS);
    } catch (err) {
      this.fail(`Failed to select login method: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Write the user-supplied auth code to the PTY and begin watching for credentials. */
  submitCode(code: string): void {
    if (this.phase !== 'code-input' || !this.pty) return;
    // eslint-disable-next-line no-control-regex -- strip CR/LF/ESC so the code can't premature-submit or inject keys
    const clean = code.replace(/[\r\n\x1b\x00-\x1f]/g, '').trim();
    if (!clean) {
      this.cb.onError('Empty auth code');
      return;
    }
    this.phase = 'completing';
    try {
      this.pty.write(clean);
      setTimeout(() => {
        if (this.settled || !this.pty) return;
        this.pty.write('\r');
        this.watchCredentials();
      }, SUBMIT_GAP_MS);
    } catch (err) {
      this.fail(`Failed to submit auth code: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Tear down the login PTY + screen model + timers/watchers. Idempotent. */
  dispose(): void {
    // Mark settled BEFORE killing the PTY. dispose() is always an INTENTIONAL teardown — the
    // session was replaced by a new `auth:start` (the user re-picked a method / went back), or
    // its socket went away, or it already completed/failed. Killing the PTY fires `onExit`, and
    // without this flag that handler would mistake the intentional kill for a crash and emit a
    // spurious `claude CLI exited (code 129)` failure into the (now unrelated) UI. Setting
    // `settled` first makes onExit a no-op. Harmless when complete()/fail() already set it.
    this.settled = true;
    if (this.handle) {
      cliSessionPool.dispose(this.handle); // runs teardown() via the registered disposer
    } else {
      this.teardown();
    }
  }

  // ── internals ──

  private onData(data: string): void {
    if (this.settled) return;
    this.screen.write(data);
    this.rawAccum += data;
    // Bound memory on a pathological run; the URL block is far smaller than this window.
    if (this.rawAccum.length > 512 * 1024) this.rawAccum = this.rawAccum.slice(-256 * 1024);

    if (!this.injectedLogin) {
      this.bootBuffer += data;
      if (this.bootBuffer.includes(LOGIN_INPUT_MARKER) || detectTrustPrompt(this.bootBuffer)) {
        if (this.bootSettleTimer) clearTimeout(this.bootSettleTimer);
        this.bootSettleTimer = setTimeout(() => this.afterBootSettle(), BOOT_SETTLE_MS);
      }
      return;
    }
    void this.screen.flush().then(() => this.consumeGrid());
  }

  private afterBootSettle(): void {
    if (this.injectedLogin || this.settled || !this.pty) return;
    void this.screen.flush().then(() => {
      if (this.injectedLogin || this.settled || !this.pty) return;
      const text = this.screen.readScreenText();
      // Auto-accept the trust prompt (if present) and re-wait for the input box (AC2).
      if (!this.trustAccepted && detectTrustPrompt(text)) {
        this.trustAccepted = true;
        try {
          this.pty.write('\r');
        } catch {
          /* PTY may be gone */
        }
        return; // the next box-marker frame re-arms the settle timer
      }
      // Input box ready → inject `/login` (typed, Enter as a separate bracketed-paste-safe write).
      this.injectedLogin = true;
      this.phase = 'method-select';
      this.bootBuffer = '';
      try {
        this.pty.write('/login');
        setTimeout(() => {
          if (this.settled || !this.pty) return;
          this.pty.write('\r');
        }, SUBMIT_GAP_MS);
      } catch (err) {
        this.fail(`Failed to inject /login: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  private consumeGrid(): void {
    if (this.settled) return;
    const text = this.screen.readScreenText();

    // Login-method menu → signal the client to present the 3 options (once).
    if (!this.methodPrompted && this.phase === 'method-select' && detectLoginMethodPrompt(text)) {
      this.methodPrompted = true;
      this.cb.onMethodPrompt();
      return;
    }

    // OAuth URL — extracted from the RAW stream (the grid corrupts the long URL). Emit once.
    if (!this.urlEmitted && (this.phase === 'awaiting-url' || this.phase === 'code-input')) {
      const url = extractOAuthUrl(this.rawAccum);
      if (url) {
        this.urlEmitted = true;
        this.cb.onUrl(url);
      }
    }

    // "Paste code here" prompt → signal the client to show the code input (once).
    if (!this.codePrompted && (this.phase === 'awaiting-url' || this.phase === 'code-input') && detectCodePrompt(text)) {
      this.codePrompted = true;
      this.phase = 'code-input';
      this.cb.onCodePrompt();
    }
  }

  /**
   * Watch the credentials file for a token (fs.watch as the low-latency trigger + a poll loop as
   * the deterministic fallback — the file may not exist yet, and fs.watch reliability varies by
   * platform). On a token appearing, refresh account info and complete.
   */
  private watchCredentials(): void {
    if (this.settled) return;
    const check = () => {
      if (this.settled) return;
      if (readCredentialsToken()) this.complete();
    };
    try {
      this.credWatcher = watch(CREDENTIALS_DIR, () => check());
    } catch {
      // Directory may not exist yet — the poll loop covers it.
    }
    this.credPollTimer = setInterval(check, CREDENTIALS_POLL_MS);
    check();
  }

  private complete(): void {
    if (this.settled) return;
    this.settled = true;
    this.phase = 'done';
    // Invalidate the rate-limit probe's cached (logged-out) token so it re-reads the new file.
    rateLimitProbeService.invalidateTokenCache();
    accountInfoService
      .refresh()
      .then((account) => this.cb.onComplete(account))
      .catch(() => this.cb.onComplete(null))
      .finally(() => this.dispose());
  }

  private fail(message: string): void {
    if (this.settled) return;
    this.settled = true;
    this.phase = 'error';
    log.warn(`login failed: ${message}`);
    this.cb.onError(message);
    this.dispose();
  }

  private teardown(): void {
    this.handle = null;
    this.pty = null;
    if (this.bootSettleTimer) {
      clearTimeout(this.bootSettleTimer);
      this.bootSettleTimer = null;
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (this.credPollTimer) {
      clearInterval(this.credPollTimer);
      this.credPollTimer = null;
    }
    try {
      this.credWatcher?.close();
    } catch {
      /* ignore */
    }
    this.credWatcher = null;
    try {
      this.screen.dispose();
    } catch {
      /* ignore */
    }
  }
}
