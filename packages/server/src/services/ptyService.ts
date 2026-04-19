/**
 * PTY Service
 * Manages PTY (pseudo-terminal) sessions for web-based terminal access.
 * [Source: Story 17.1 - Task 4]
 */

import * as pty from 'node-pty';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { TERMINAL_ERRORS } from '@hammoc/shared';
import { config } from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ptyService');

export interface PtySessionData {
  pty: pty.IPty;
  terminalId: string;
  projectSlug: string;
  shell: string;
  timeout?: ReturnType<typeof setTimeout>;
  createdAt: number;
  lastActivityAt: number;
  onDataCallback?: (data: string) => void;
  onExitCallback?: (exitCode: number) => void;
}

class PtyService {
  private sessions: Map<string, PtySessionData> = new Map();
  // On Windows the server may be started from bash/MINGW with an incomplete PATH.
  // Read the real Windows system PATH once at startup via cmd.exe so PTY sessions
  // inherit a complete environment regardless of how the server was launched.
  private readonly windowsSystemPath: string | null = (() => {
    if (process.platform !== 'win32') return null;
    try {
      // Read Machine + User PATH from registry so we get the real Windows PATH
      // regardless of how the server was started (cmd, bash, MINGW, etc.).
      // cmd.exe /c echo %PATH% only echoes the inherited PATH, so we use PowerShell
      // with an absolute path to call GetEnvironmentVariable from the registry.
      const sysRoot = process.env.SystemRoot || 'C:\\Windows';
      const ps = `${sysRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
      const cmd = `[System.Environment]::GetEnvironmentVariable('Path','Machine')+';'+[System.Environment]::GetEnvironmentVariable('Path','User')`;
      return execSync(`"${ps}" -NoProfile -Command "${cmd}"`, { encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
  })();

  /**
   * Detect the default shell for the current OS
   */
  private getDefaultShell(): string {
    if (process.platform === 'win32') {
      // Use absolute paths so spawn succeeds regardless of the server's PATH (e.g. when started from bash/MINGW)
      const sysRoot = process.env.SystemRoot || 'C:\\Windows';
      const psPath = `${sysRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
      return psPath;
    }
    return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  }

  /**
   * Convert MINGW64 Unix-style PATH entries to Windows format.
   * Handles mixed PATH values (e.g. "/c/Program Files/nodejs:C:\Windows\System32").
   * Splits on colons that are NOT preceded by a drive letter (to preserve "C:\...").
   */
  private normalizePathForWindows(env: Record<string, string>): Record<string, string> {
    if (process.platform !== 'win32') return env;

    // Collect all PATH-like keys and merge into one canonical 'Path' key.
    // Also merge in the real Windows system PATH (read from cmd.exe at startup)
    // so PTY sessions have a complete environment even when the server was started
    // from bash/MINGW with an incomplete PATH.
    const pathKeys = Object.keys(env).filter((k) => k.toUpperCase() === 'PATH');
    const parts = pathKeys.map((k) => env[k]).filter(Boolean);
    if (this.windowsSystemPath) parts.push(this.windowsSystemPath);
    if (parts.length === 0) return env;

    const merged = parts.join(';');
    if (!merged) return env;

    const normalized = { ...env };
    // Remove all PATH variants, then set canonical 'Path'
    for (const k of pathKeys) {
      delete normalized[k];
    }

    // Split on : that is NOT a drive-letter colon (e.g. not "C:")
    // Strategy: split on ; first (Windows separator), then split remaining on : (MINGW separator)
    // but preserve drive-letter colons
    const entries: string[] = [];
    for (const rawSegment of merged.split(';')) {
      const segment = rawSegment.trim().replace(/^"|"$/g, '');
      if (!segment) continue;
      // Split on : but rejoin drive-letter colons (X: followed by \ or /)
      const parts = segment.split(':');
      let i = 0;
      while (i < parts.length) {
        const part = parts[i];
        // Check if this is a single drive letter followed by a path
        if (part.length === 1 && /^[a-zA-Z]$/.test(part) && i + 1 < parts.length && /^[/\\]/.test(parts[i + 1])) {
          entries.push(`${part}:${parts[i + 1]}`);
          i += 2;
        } else if (part) {
          entries.push(part);
          i++;
        } else {
          i++;
        }
      }
    }

    // Convert MINGW paths (/c/...) to Windows format (C:\...)
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
   * Create a new PTY session for a project
   */
  createSession(
    projectPath: string,
    projectSlug: string,
  ): { terminalId: string; shell: string } {
    if (this.sessions.size >= config.terminal.maxSessions) {
      const err = new Error(TERMINAL_ERRORS.MAX_SESSIONS_REACHED.message);
      (err as Error & { code: string }).code = TERMINAL_ERRORS.MAX_SESSIONS_REACHED.code;
      throw err;
    }

    const shell = this.getDefaultShell();
    const terminalId = randomUUID();

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: projectPath,
        env: this.normalizePathForWindows(
          Object.fromEntries(
            Object.entries(process.env).filter((e): e is [string, string] => e[1] != null),
          ),
        ),
      });
    } catch (spawnErr) {
      log.error('pty.spawn failed — shell=%s cwd=%s error=%s', shell, projectPath, (spawnErr as Error).message);
      const err = new Error(TERMINAL_ERRORS.PTY_SPAWN_ERROR.message);
      (err as Error & { code: string }).code = TERMINAL_ERRORS.PTY_SPAWN_ERROR.code;
      throw err;
    }

    const sessionData: PtySessionData = {
      pty: ptyProcess,
      terminalId,
      projectSlug,
      shell,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.sessions.set(terminalId, sessionData);

    // Register PTY event listeners
    ptyProcess.onData((data: string) => {
      sessionData.lastActivityAt = Date.now();
      if (sessionData.onDataCallback) {
        sessionData.onDataCallback(data);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (sessionData.onExitCallback) {
        sessionData.onExitCallback(exitCode);
      }
      // Clean up session on PTY exit
      this.removeSession(terminalId);
    });

    log.info(`PTY session created: ${terminalId} (shell: ${shell}, project: ${projectSlug})`);
    return { terminalId, shell };
  }

  /**
   * Write stdin data to a PTY session
   */
  writeInput(terminalId: string, data: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      const err = new Error(TERMINAL_ERRORS.TERMINAL_NOT_FOUND.message);
      (err as Error & { code: string }).code = TERMINAL_ERRORS.TERMINAL_NOT_FOUND.code;
      throw err;
    }
    session.lastActivityAt = Date.now();
    session.pty.write(data);
  }

  /**
   * Resize a PTY session
   */
  resize(terminalId: string, cols: number, rows: number): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      const err = new Error(TERMINAL_ERRORS.TERMINAL_NOT_FOUND.message);
      (err as Error & { code: string }).code = TERMINAL_ERRORS.TERMINAL_NOT_FOUND.code;
      throw err;
    }

    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
      const err = new Error(TERMINAL_ERRORS.INVALID_DIMENSIONS.message);
      (err as Error & { code: string }).code = TERMINAL_ERRORS.INVALID_DIMENSIONS.code;
      throw err;
    }

    session.pty.resize(cols, rows);
  }

  /**
   * Close and destroy a PTY session.
   * Removes from map first so the onExit listener's removeSession call is a no-op.
   */
  closeSession(terminalId: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) return;

    this.removeSession(terminalId);
    this.killSession(session);
    log.info(`PTY session closed: ${terminalId}`);
  }

  /**
   * Schedule cleanup of a PTY session after a delay (for disconnect grace period)
   */
  scheduleCleanup(terminalId: string, delayMs?: number): void {
    const session = this.sessions.get(terminalId);
    if (!session) return;

    const delay = delayMs ?? config.terminal.shellTimeout;

    // Clear any existing cleanup timeout
    if (session.timeout) {
      clearTimeout(session.timeout);
    }

    session.timeout = setTimeout(() => {
      log.info(`PTY session cleanup timeout reached: ${terminalId}`);
      this.closeSession(terminalId);
    }, delay);
  }

  /**
   * Cancel a scheduled cleanup (for reconnection)
   */
  cancelCleanup(terminalId: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) return;

    if (session.timeout) {
      clearTimeout(session.timeout);
      session.timeout = undefined;
      log.debug(`PTY session cleanup cancelled: ${terminalId}`);
    }
  }

  /**
   * Get a session by terminal ID
   */
  getSession(terminalId: string): PtySessionData | undefined {
    return this.sessions.get(terminalId);
  }

  /**
   * Get all sessions for a project
   */
  getSessionsByProject(projectSlug: string): PtySessionData[] {
    return [...this.sessions.values()].filter((s) => s.projectSlug === projectSlug);
  }

  /**
   * Register onData callback for a session
   */
  onData(terminalId: string, callback: (data: string) => void): void {
    const session = this.sessions.get(terminalId);
    if (session) {
      session.onDataCallback = callback;
    }
  }

  /**
   * Register onExit callback for a session
   */
  onExit(terminalId: string, callback: (exitCode: number) => void): void {
    const session = this.sessions.get(terminalId);
    if (session) {
      session.onExitCallback = callback;
    }
  }

  /**
   * Destroy all PTY sessions (for server shutdown)
   */
  destroyAll(): void {
    log.info(`Destroying all PTY sessions (${this.sessions.size} active)`);
    for (const [terminalId, session] of this.sessions) {
      this.killSession(session);
      log.debug(`PTY session destroyed: ${terminalId}`);
    }
    this.sessions.clear();
  }

  /**
   * Kill a PTY process and clear its timeout
   */
  private killSession(session: PtySessionData): void {
    if (session.timeout) {
      clearTimeout(session.timeout);
      session.timeout = undefined;
    }
    try {
      session.pty.kill();
    } catch {
      // PTY may already be dead
    }
  }

  /**
   * Remove a session from the map without killing (PTY already exited or killed)
   */
  private removeSession(terminalId: string): void {
    const session = this.sessions.get(terminalId);
    if (session?.timeout) {
      clearTimeout(session.timeout);
    }
    this.sessions.delete(terminalId);
  }
}

export const ptyService = new PtyService();
