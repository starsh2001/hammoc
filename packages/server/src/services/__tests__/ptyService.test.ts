/**
 * PTY Service Tests
 * [Source: Story 17.1 - Task 7]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TERMINAL_ERRORS } from '@bmad-studio/shared';

// Mock node-pty
const mockWrite = vi.fn();
const mockResize = vi.fn();
const mockKill = vi.fn();
const mockOnData = vi.fn();
const mockOnExit = vi.fn();

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    write: mockWrite,
    resize: mockResize,
    kill: mockKill,
    onData: mockOnData,
    onExit: mockOnExit,
    pid: 12345,
  })),
}));

// Mock config
vi.mock('../../config/index.js', () => ({
  config: {
    terminal: {
      enabled: true,
      shellTimeout: 30000,
      maxSessions: 3,
    },
  },
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import { ptyService } from '../ptyService.js';
import * as nodePty from 'node-pty';

describe('PtyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Clean up any existing sessions
    ptyService.destroyAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    ptyService.destroyAll();
  });

  describe('createSession', () => {
    it('creates a new PTY session and returns terminalId and shell', () => {
      const result = ptyService.createSession('/test/path', 'test-project');

      expect(result.terminalId).toBeDefined();
      expect(typeof result.terminalId).toBe('string');
      expect(result.shell).toBeDefined();
      expect(nodePty.spawn).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.objectContaining({
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: '/test/path',
        }),
      );
    });

    it('uses correct shell for the current platform', () => {
      const result = ptyService.createSession('/test/path', 'test-project');

      if (process.platform === 'win32') {
        expect(result.shell).toBe('powershell.exe');
      } else {
        expect(result.shell).toBeTruthy();
      }
    });

    it('registers onData and onExit listeners', () => {
      ptyService.createSession('/test/path', 'test-project');

      expect(mockOnData).toHaveBeenCalledWith(expect.any(Function));
      expect(mockOnExit).toHaveBeenCalledWith(expect.any(Function));
    });

    it('throws MAX_SESSIONS_REACHED when max sessions exceeded', () => {
      // maxSessions is 3 in mock config
      ptyService.createSession('/test/path', 'p1');
      ptyService.createSession('/test/path', 'p2');
      ptyService.createSession('/test/path', 'p3');

      expect(() => ptyService.createSession('/test/path', 'p4')).toThrow(
        TERMINAL_ERRORS.MAX_SESSIONS_REACHED.message,
      );

      try {
        ptyService.createSession('/test/path', 'p4');
      } catch (err) {
        expect((err as Error & { code: string }).code).toBe(TERMINAL_ERRORS.MAX_SESSIONS_REACHED.code);
      }
    });

    it('throws PTY_SPAWN_ERROR when pty.spawn fails', () => {
      vi.mocked(nodePty.spawn).mockImplementationOnce(() => {
        throw new Error('spawn failed');
      });

      expect(() => ptyService.createSession('/test/path', 'test-project')).toThrow(
        TERMINAL_ERRORS.PTY_SPAWN_ERROR.message,
      );
    });
  });

  describe('getSession / getSessionsByProject', () => {
    it('returns session data by terminalId', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');
      const session = ptyService.getSession(terminalId);

      expect(session).toBeDefined();
      expect(session!.terminalId).toBe(terminalId);
      expect(session!.projectSlug).toBe('proj');
    });

    it('returns undefined for non-existent session', () => {
      expect(ptyService.getSession('non-existent')).toBeUndefined();
    });

    it('returns sessions by project slug', () => {
      ptyService.createSession('/test/path', 'proj-a');
      ptyService.createSession('/test/path', 'proj-a');
      ptyService.createSession('/test/path', 'proj-b');

      const sessionsA = ptyService.getSessionsByProject('proj-a');
      const sessionsB = ptyService.getSessionsByProject('proj-b');

      expect(sessionsA).toHaveLength(2);
      expect(sessionsB).toHaveLength(1);
    });
  });

  describe('writeInput', () => {
    it('writes data to PTY', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');
      ptyService.writeInput(terminalId, 'hello');

      expect(mockWrite).toHaveBeenCalledWith('hello');
    });

    it('throws TERMINAL_NOT_FOUND for non-existent session', () => {
      expect(() => ptyService.writeInput('non-existent', 'data')).toThrow(
        TERMINAL_ERRORS.TERMINAL_NOT_FOUND.message,
      );
    });
  });

  describe('resize', () => {
    it('resizes PTY with valid dimensions', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');
      ptyService.resize(terminalId, 120, 40);

      expect(mockResize).toHaveBeenCalledWith(120, 40);
    });

    it('throws TERMINAL_NOT_FOUND for non-existent session', () => {
      expect(() => ptyService.resize('non-existent', 80, 24)).toThrow(
        TERMINAL_ERRORS.TERMINAL_NOT_FOUND.message,
      );
    });

    it('throws INVALID_DIMENSIONS for zero cols', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');

      expect(() => ptyService.resize(terminalId, 0, 24)).toThrow(
        TERMINAL_ERRORS.INVALID_DIMENSIONS.message,
      );
    });

    it('throws INVALID_DIMENSIONS for negative rows', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');

      expect(() => ptyService.resize(terminalId, 80, -1)).toThrow(
        TERMINAL_ERRORS.INVALID_DIMENSIONS.message,
      );
    });

    it('throws INVALID_DIMENSIONS for non-integer values', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');

      expect(() => ptyService.resize(terminalId, 80.5, 24)).toThrow(
        TERMINAL_ERRORS.INVALID_DIMENSIONS.message,
      );
    });
  });

  describe('closeSession', () => {
    it('kills PTY and removes session from map', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');
      ptyService.closeSession(terminalId);

      expect(mockKill).toHaveBeenCalled();
      expect(ptyService.getSession(terminalId)).toBeUndefined();
    });

    it('does nothing for non-existent session', () => {
      expect(() => ptyService.closeSession('non-existent')).not.toThrow();
    });
  });

  describe('scheduleCleanup / cancelCleanup', () => {
    it('removes session after timeout', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');
      ptyService.scheduleCleanup(terminalId);

      expect(ptyService.getSession(terminalId)).toBeDefined();

      vi.advanceTimersByTime(30000); // default shellTimeout

      expect(ptyService.getSession(terminalId)).toBeUndefined();
      expect(mockKill).toHaveBeenCalled();
    });

    it('does not remove session before timeout', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');
      ptyService.scheduleCleanup(terminalId);

      vi.advanceTimersByTime(15000); // half of timeout

      expect(ptyService.getSession(terminalId)).toBeDefined();
    });

    it('cancels cleanup and keeps session', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');
      ptyService.scheduleCleanup(terminalId);
      ptyService.cancelCleanup(terminalId);

      vi.advanceTimersByTime(60000); // well past timeout

      expect(ptyService.getSession(terminalId)).toBeDefined();
    });

    it('uses custom delay when provided', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');
      ptyService.scheduleCleanup(terminalId, 5000);

      vi.advanceTimersByTime(4999);
      expect(ptyService.getSession(terminalId)).toBeDefined();

      vi.advanceTimersByTime(1);
      expect(ptyService.getSession(terminalId)).toBeUndefined();
    });
  });

  describe('onData / onExit callbacks', () => {
    it('registers and invokes onData callback', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');
      const callback = vi.fn();
      ptyService.onData(terminalId, callback);

      // Simulate PTY data by calling the registered onData handler
      const onDataHandler = mockOnData.mock.calls[0][0];
      onDataHandler('test output');

      expect(callback).toHaveBeenCalledWith('test output');
    });

    it('registers and invokes onExit callback', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');
      const callback = vi.fn();
      ptyService.onExit(terminalId, callback);

      // Simulate PTY exit
      const onExitHandler = mockOnExit.mock.calls[0][0];
      onExitHandler({ exitCode: 0 });

      expect(callback).toHaveBeenCalledWith(0);
    });

    it('removes session from map when PTY exits', () => {
      const { terminalId } = ptyService.createSession('/test/path', 'proj');
      expect(ptyService.getSession(terminalId)).toBeDefined();

      // Simulate PTY exit — should auto-remove session
      const onExitHandler = mockOnExit.mock.calls[0][0];
      onExitHandler({ exitCode: 0 });

      expect(ptyService.getSession(terminalId)).toBeUndefined();
    });
  });

  describe('destroyAll', () => {
    it('destroys all sessions', () => {
      ptyService.createSession('/test/path', 'p1');
      ptyService.createSession('/test/path', 'p2');
      ptyService.createSession('/test/path', 'p3');

      expect(ptyService.getSessionsByProject('p1')).toHaveLength(1);

      ptyService.destroyAll();

      expect(ptyService.getSessionsByProject('p1')).toHaveLength(0);
      expect(ptyService.getSessionsByProject('p2')).toHaveLength(0);
      expect(ptyService.getSessionsByProject('p3')).toHaveLength(0);
      expect(mockKill).toHaveBeenCalledTimes(3);
    });

    it('handles empty sessions gracefully', () => {
      expect(() => ptyService.destroyAll()).not.toThrow();
    });
  });

  describe('OS-specific shell selection', () => {
    it('selects powershell.exe on win32', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      const { shell } = ptyService.createSession('/test/path', 'proj');
      expect(shell).toBe('powershell.exe');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('selects SHELL env or /bin/zsh on darwin', () => {
      const originalPlatform = process.platform;
      const originalShell = process.env.SHELL;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      delete process.env.SHELL;

      const { shell } = ptyService.createSession('/test/path', 'proj');
      expect(shell).toBe('/bin/zsh');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      if (originalShell) process.env.SHELL = originalShell;
    });

    it('selects SHELL env or /bin/bash on linux', () => {
      const originalPlatform = process.platform;
      const originalShell = process.env.SHELL;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      delete process.env.SHELL;

      const { shell } = ptyService.createSession('/test/path', 'proj');
      expect(shell).toBe('/bin/bash');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      if (originalShell) process.env.SHELL = originalShell;
    });

    it('uses SHELL env variable when set on non-windows', () => {
      const originalPlatform = process.platform;
      const originalShell = process.env.SHELL;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      process.env.SHELL = '/usr/bin/fish';

      const { shell } = ptyService.createSession('/test/path', 'proj');
      expect(shell).toBe('/usr/bin/fish');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      if (originalShell) {
        process.env.SHELL = originalShell;
      } else {
        delete process.env.SHELL;
      }
    });
  });
});
