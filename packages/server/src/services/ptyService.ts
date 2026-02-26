/**
 * PTY Service
 * Manages PTY (pseudo-terminal) sessions for web-based terminal access.
 * [Source: Story 17.1 - Task 4]
 */

import * as pty from 'node-pty';
import { randomUUID } from 'crypto';
import { TERMINAL_ERRORS } from '@bmad-studio/shared';
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

  /**
   * Detect the default shell for the current OS
   */
  private getDefaultShell(): string {
    if (process.platform === 'win32') {
      return 'powershell.exe';
    }
    return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
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
      });
    } catch {
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
