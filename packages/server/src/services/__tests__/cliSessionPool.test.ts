/**
 * CLI Session Pool Tests (Epic 32 — Story 32.4)
 *
 * Verifies the isolated PTY pool that backs the CLI conversation engine:
 * spawn argument forwarding, env scrub, lifecycle (register/dispose/destroyAll),
 * kill-exception absorption, and — critically — that CLI PTYs never touch the
 * web terminal pool (`ptyService`) so the dashboard's active-terminal count is
 * unaffected (Sprint §9.2 #3, spike §9-3).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-pty (shared by both ptyService and cliSessionPool).
const mockWrite = vi.fn();
const mockKill = vi.fn();
const mockOnData = vi.fn();
const mockOnExit = vi.fn();

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    write: mockWrite,
    resize: vi.fn(),
    kill: mockKill,
    onData: mockOnData,
    onExit: mockOnExit,
    pid: 4242,
  })),
}));

// Mock child_process so the windowsSystemPath IIFE and `where claude` probe never
// shell out for real (deterministic across machines / CI).
vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}));

// Mock config for ptyService (terminal pool) — needed to create a control session.
vi.mock('../../config/index.js', () => ({
  config: {
    terminal: { enabled: true, shellTimeout: 30000, maxSessions: 5 },
  },
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn() }),
}));

// Import after mocks.
import { cliSessionPool } from '../cliSessionPool.js';
import { ptyService } from '../ptyService.js';
import * as nodePty from 'node-pty';

describe('cliSessionPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cliSessionPool.destroyAll();
    ptyService.destroyAll();
  });

  afterEach(() => {
    cliSessionPool.destroyAll();
    ptyService.destroyAll();
  });

  describe('spawnClaude', () => {
    it('spawns with the given interactive args, cwd, and xterm env (no transformation)', () => {
      const args = ['--permission-mode', 'default', '--model', 'opus'];
      const { handle, pty } = cliSessionPool.spawnClaude({ cwd: '/proj', args });

      expect(handle).toBeTruthy();
      expect(pty).toBeDefined();
      expect(nodePty.spawn).toHaveBeenCalledWith(
        expect.any(String),
        args,
        expect.objectContaining({ name: 'xterm-256color', cwd: '/proj' }),
      );
      // No headless flags are introduced by the pool — it forwards args verbatim.
      const forwardedArgs = vi.mocked(nodePty.spawn).mock.calls[0][1] as string[];
      expect(forwardedArgs).not.toContain('--print');
      expect(forwardedArgs).not.toContain('-p');
      expect(forwardedArgs).not.toContain('--output-format');
    });

    it('strips the "inside claude" env signals before spawning', () => {
      process.env.CLAUDECODE = '1';
      process.env.CLAUDE_CODE_ENTRYPOINT = 'cli';
      process.env.CLAUDE_CODE_SSE_PORT = '5599';

      cliSessionPool.spawnClaude({ cwd: '/proj', args: [] });

      const spawnEnv = (vi.mocked(nodePty.spawn).mock.calls[0][2] as { env: Record<string, string> }).env;
      expect(spawnEnv.CLAUDECODE).toBeUndefined();
      expect(spawnEnv.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
      expect(spawnEnv.CLAUDE_CODE_SSE_PORT).toBeUndefined();

      delete process.env.CLAUDECODE;
      delete process.env.CLAUDE_CODE_ENTRYPOINT;
      delete process.env.CLAUDE_CODE_SSE_PORT;
    });

    it('registers each spawned PTY in the pool', () => {
      expect(cliSessionPool.size).toBe(0);
      const { handle } = cliSessionPool.spawnClaude({ cwd: '/proj', args: [] });
      expect(cliSessionPool.size).toBe(1);
      expect(cliSessionPool.has(handle)).toBe(true);
    });
  });

  describe('interrupt', () => {
    it('writes Ctrl+C to the PTY without removing it', () => {
      const { handle } = cliSessionPool.spawnClaude({ cwd: '/proj', args: [] });
      cliSessionPool.interrupt(handle);
      expect(mockWrite).toHaveBeenCalledWith('\x03');
      expect(cliSessionPool.has(handle)).toBe(true);
    });
  });

  describe('dispose', () => {
    it('runs the registered disposer, kills the PTY, and removes it from the pool', () => {
      const { handle } = cliSessionPool.spawnClaude({ cwd: '/proj', args: [] });
      const disposer = vi.fn();
      cliSessionPool.registerDisposer(handle, disposer);

      cliSessionPool.dispose(handle);

      expect(disposer).toHaveBeenCalledTimes(1);
      expect(mockKill).toHaveBeenCalledTimes(1);
      expect(cliSessionPool.has(handle)).toBe(false);
      expect(cliSessionPool.size).toBe(0);
    });

    it('absorbs a kill() exception (Windows ConPTY shutdown noise)', () => {
      mockKill.mockImplementationOnce(() => {
        throw new Error('AttachConsole failed');
      });
      const { handle } = cliSessionPool.spawnClaude({ cwd: '/proj', args: [] });

      expect(() => cliSessionPool.dispose(handle)).not.toThrow();
      expect(cliSessionPool.has(handle)).toBe(false);
    });

    it('is a no-op for an unknown handle', () => {
      expect(() => cliSessionPool.dispose('does-not-exist')).not.toThrow();
    });
  });

  describe('destroyAll', () => {
    it('disposes every CLI PTY', () => {
      cliSessionPool.spawnClaude({ cwd: '/a', args: [] });
      cliSessionPool.spawnClaude({ cwd: '/b', args: [] });
      expect(cliSessionPool.size).toBe(2);

      cliSessionPool.destroyAll();

      expect(cliSessionPool.size).toBe(0);
      expect(mockKill).toHaveBeenCalledTimes(2);
    });
  });

  describe('isolation from ptyService (dashboard active-terminal count)', () => {
    it('spawning CLI PTYs does not register any terminal-pool session', () => {
      ptyService.createSession('/proj', 'proj-slug'); // one real terminal

      cliSessionPool.spawnClaude({ cwd: '/proj', args: [] });
      cliSessionPool.spawnClaude({ cwd: '/proj', args: [] });

      // CLI pool grew; terminal pool is untouched (still exactly the one terminal).
      expect(cliSessionPool.size).toBe(2);
      expect(ptyService.getSessionsByProject('proj-slug')).toHaveLength(1);
    });

    it('destroying the CLI pool leaves terminal-pool sessions intact', () => {
      ptyService.createSession('/proj', 'proj-slug');
      cliSessionPool.spawnClaude({ cwd: '/proj', args: [] });

      cliSessionPool.destroyAll();

      expect(cliSessionPool.size).toBe(0);
      expect(ptyService.getSessionsByProject('proj-slug')).toHaveLength(1);
    });
  });
});
