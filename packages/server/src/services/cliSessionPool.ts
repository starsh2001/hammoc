/**
 * CLI Session Pool (Epic 32 — Story 32.4)
 *
 * Owns the PTY processes for the CLI conversation engine (`CliChatEngine`), one
 * per in-flight turn. This pool is **deliberately a separate module singleton
 * from `ptyService`** (the web terminal pool): the dashboard's "active terminals"
 * count is derived from `ptyService`'s session map, so routing CLI-engine PTYs
 * through `ptyService` would pollute that count (Sprint Change Proposal §9.2 #3,
 * spike §9-3). Keeping a distinct instance guarantees the CLI engine's PTYs never
 * leak into the terminal count — isolation by construction.
 *
 * The Windows PATH normalization and binary-discovery patterns are *borrowed*
 * from `ptyService` (which stays unmodified). They are duplicated here on purpose
 * for file independence and isolation — the same convention `chatService.ts` and
 * `streamHandler.ts` already use for `extractContextWindow`.
 */

import * as pty from 'node-pty';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { existsSync, statSync, accessSync, constants as fsConstants } from 'fs';
import { createLogger } from '../utils/logger.js';
import { resolveBundledBinaryPath } from '../utils/bundledBinaryModelSupport.js';

const log = createLogger('cliSessionPool');

/**
 * "I am running inside claude" environment signals. Stripped before spawning a
 * fresh interactive claude so it starts a clean session rather than trying to
 * attach to the host Hammoc process (spike §2).
 */
const CLAUDE_ENV_SIGNALS = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT'] as const;

/** Handle returned to the engine for a spawned CLI PTY. */
export interface CliPtyHandle {
  /** Opaque key used to address this PTY in the pool (not the claude session id). */
  handle: string;
  pty: pty.IPty;
}

interface CliPtyEntry {
  pty: pty.IPty;
  handle: string;
  createdAt: number;
  /** Teardown for the JSONL watcher the engine attaches (1 PTY : 1 watcher, §9-3). */
  dispose?: () => void;
}

interface SpawnClaudeOptions {
  /** Working directory for the claude session (the project root). */
  cwd?: string;
  /** Arguments passed to claude (interactive — no `--print`/`--output-format`). */
  args: string[];
  cols?: number;
  rows?: number;
  /**
   * Epic 33 (Story 33.3): user-configured `claude` binary path. When set and valid it
   * takes precedence over auto-detection; an invalid value falls back gracefully (see
   * `resolveClaudeBinary`). Empty / undefined = auto-detect.
   */
  binaryPathOverride?: string;
}

class CliSessionPool {
  private sessions = new Map<string, CliPtyEntry>();

  // On Windows the server may be started from bash/MINGW with an incomplete PATH.
  // Read the real Windows system PATH once via PowerShell+registry so spawned
  // claude sessions inherit a complete environment regardless of launch shell.
  // (Pattern borrowed from ptyService — kept private here for isolation.)
  private readonly windowsSystemPath: string | null = (() => {
    if (process.platform !== 'win32') return null;
    try {
      const sysRoot = process.env.SystemRoot || 'C:\\Windows';
      const ps = `${sysRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
      const cmd = `[System.Environment]::GetEnvironmentVariable('Path','Machine')+';'+[System.Environment]::GetEnvironmentVariable('Path','User')`;
      return execSync(`"${ps}" -NoProfile -Command "${cmd}"`, { encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
  })();

  /**
   * Convert MINGW64 Unix-style PATH entries to Windows format and merge in the
   * real Windows system PATH. (Borrowed verbatim in spirit from ptyService.)
   */
  private normalizePathForWindows(env: Record<string, string>): Record<string, string> {
    if (process.platform !== 'win32') return env;

    const pathKeys = Object.keys(env).filter((k) => k.toUpperCase() === 'PATH');
    const parts = pathKeys.map((k) => env[k]).filter(Boolean);
    if (this.windowsSystemPath) parts.push(this.windowsSystemPath);
    if (parts.length === 0) return env;

    const merged = parts.join(';');
    if (!merged) return env;

    const normalized = { ...env };
    for (const k of pathKeys) {
      delete normalized[k];
    }

    const entries: string[] = [];
    for (const rawSegment of merged.split(';')) {
      const segment = rawSegment.trim().replace(/^"|"$/g, '');
      if (!segment) continue;
      const segParts = segment.split(':');
      let i = 0;
      while (i < segParts.length) {
        const part = segParts[i];
        if (part.length === 1 && /^[a-zA-Z]$/.test(part) && i + 1 < segParts.length && /^[/\\]/.test(segParts[i + 1])) {
          entries.push(`${part}:${segParts[i + 1]}`);
          i += 2;
        } else if (part) {
          entries.push(part);
          i++;
        } else {
          i++;
        }
      }
    }

    const windowsEntries = entries.map((p) => {
      const match = p.match(/^\/([a-zA-Z])\/(.*)/);
      if (match) {
        return `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, '\\')}`;
      }
      return p;
    });

    normalized['Path'] = windowsEntries.join(';');
    return normalized;
  }

  /**
   * Build the spawn environment: process.env minus undefined values and minus
   * the "inside claude" signal vars, with Windows PATH normalized.
   */
  private buildEnv(): Record<string, string> {
    const base = Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] != null),
    );
    for (const signal of CLAUDE_ENV_SIGNALS) {
      delete base[signal];
    }
    return this.normalizePathForWindows(base);
  }

  /**
   * Best-effort sanity check for a user-supplied binary override (Story 33.3): exists,
   * is a regular file, and (POSIX only) is executable by this process. Windows has no
   * comparable execute bit, so `.exe`/file existence is sufficient there. Intentionally
   * shallow — no signature / "is this really claude" inspection (out of scope).
   */
  private isValidBinaryOverride(candidate: string): boolean {
    try {
      if (!statSync(candidate).isFile()) return false;
      if (process.platform !== 'win32') {
        accessSync(candidate, fsConstants.X_OK);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve an executable path for `claude`. PATH lookup can fail in the server's
   * child process (spike §9-5: `where claude` failed; the fallback resolved it),
   * so known install locations are tried first, then a PATH probe with the
   * corrected env, then a bare name as a last resort (pty resolves via env PATH).
   *
   * Story 33.3: when a non-empty `override` is supplied it is checked first and used
   * if valid. An *invalid* override never hard-fails the turn — it logs a warning and
   * falls through to the normal chain (auto-detect is the better UX than blocking CLI
   * mode over a bad path). Empty / undefined skips the override entirely.
   */
  private resolveClaudeBinary(env: Record<string, string>, override?: string): string {
    const trimmedOverride = override?.trim();
    if (trimmedOverride) {
      if (this.isValidBinaryOverride(trimmedOverride)) return trimmedOverride;
      log.warn(`Configured claude binary path is invalid (missing / not a file / not executable): "${trimmedOverride}" — falling back to auto-detect.`);
    }
    // Prefer the bundled engine binary shipped inside @anthropic-ai/claude-agent-sdk: it is the
    // SAME Claude Code CLI as a system install (interactive by default) but version-pinned by
    // Hammoc's package.json, so CLI mode and SDK mode run the identical engine — both recognize
    // newly-released models (e.g. Fable 5). Auth/session are unaffected: the spawn inherits the
    // same env, hence the same ~/.claude. A valid user override above still takes precedence.
    const bundled = resolveBundledBinaryPath();
    if (bundled && existsSync(bundled)) return bundled;
    const home = os.homedir();
    const isWin = process.platform === 'win32';
    const candidates = isWin
      ? [path.join(home, '.local', 'bin', 'claude.exe'), path.join(home, '.local', 'bin', 'claude')]
      : [path.join(home, '.local', 'bin', 'claude')];
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    try {
      const probe = isWin ? 'where claude' : 'command -v claude';
      const resolved = execSync(probe, { env, encoding: 'utf8' })
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s && existsSync(s));
      if (resolved) return resolved;
    } catch {
      // Not resolvable via PATH — fall through to bare name.
    }
    return isWin ? 'claude.exe' : 'claude';
  }

  /**
   * Spawn an interactive claude TUI in a PTY and register it in the pool.
   * The caller drives stdin (prompt injection), wires `pty.onData`, and attaches
   * a watcher disposer via `registerDisposer`.
   */
  spawnClaude(opts: SpawnClaudeOptions): CliPtyHandle {
    const env = this.buildEnv();
    const bin = this.resolveClaudeBinary(env, opts.binaryPathOverride);
    const handle = randomUUID();

    const ptyProcess = pty.spawn(bin, opts.args, {
      name: 'xterm-256color',
      cols: opts.cols ?? 120,
      rows: opts.rows ?? 40,
      cwd: opts.cwd,
      env,
    });

    this.sessions.set(handle, { pty: ptyProcess, handle, createdAt: Date.now() });
    log.info(`CLI PTY spawned: handle=${handle} bin=${bin} args=[${opts.args.join(' ')}] cwd=${opts.cwd ?? '(inherit)'}`);
    return { handle, pty: ptyProcess };
  }

  /** Attach the watcher teardown so dispose() tears down PTY + watcher together. */
  registerDisposer(handle: string, dispose: () => void): void {
    const entry = this.sessions.get(handle);
    if (entry) entry.dispose = dispose;
  }

  /** Send Ctrl+C (interrupt) to the PTY without killing it. */
  interrupt(handle: string): void {
    const entry = this.sessions.get(handle);
    if (!entry) return;
    try {
      entry.pty.write('\x03');
    } catch {
      // PTY may already be gone.
    }
  }

  /**
   * Tear down a CLI PTY: run the watcher disposer, kill the process, remove from
   * the pool. Removal happens first so any onExit listener's dispose is a no-op.
   * The kill is wrapped in try/catch to absorb Windows ConPTY shutdown noise
   * (`AttachConsole failed`, spike §9-6 — `ptyService.killSession` pattern).
   */
  dispose(handle: string): void {
    const entry = this.sessions.get(handle);
    if (!entry) return;
    this.sessions.delete(handle);
    try {
      entry.dispose?.();
    } catch {
      // Watcher teardown best-effort.
    }
    try {
      entry.pty.kill();
    } catch {
      // PTY may already be dead / ConPTY shutdown noise — ignore.
    }
    log.debug(`CLI PTY disposed: handle=${handle}`);
  }

  /** Destroy every CLI PTY (server shutdown). Symmetric with ptyService.destroyAll. */
  destroyAll(): void {
    if (this.sessions.size > 0) {
      log.info(`Destroying all CLI PTYs (${this.sessions.size} active)`);
    }
    for (const handle of [...this.sessions.keys()]) {
      this.dispose(handle);
    }
  }

  /** Number of live CLI PTYs (for tests / introspection). */
  get size(): number {
    return this.sessions.size;
  }

  /** Whether a handle is still live in the pool. */
  has(handle: string): boolean {
    return this.sessions.has(handle);
  }
}

/** Module singleton — isolated from the web terminal pool (`ptyService`). */
export const cliSessionPool = new CliSessionPool();
