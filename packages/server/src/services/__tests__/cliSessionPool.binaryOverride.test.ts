/**
 * CLI Session Pool — claude binary path override (Story 33.3)
 *
 * Verifies `resolveClaudeBinary`'s override precedence + graceful fallback through the
 * public `spawnClaude` path (asserting the binary handed to node-pty):
 *   - a valid override (exists + is a file + executable) is used verbatim
 *   - an invalid override (missing / directory) warns and falls back to auto-detect —
 *     it must never hard-fail the turn
 *   - empty / undefined skips the override entirely (auto-detect, no validation)
 *
 * `fs` is mocked so the override-validity check is deterministic across platforms / CI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockKill = vi.fn();
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    write: vi.fn(),
    resize: vi.fn(),
    kill: mockKill,
    onData: vi.fn(),
    onExit: vi.fn(),
    pid: 4242,
  })),
}));

// PATH probe finds nothing → auto-detect falls through to the bare name (deterministic).
vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}));

// Controllable fs so override validity is platform-independent.
const mockStatSync = vi.fn();
const mockAccessSync = vi.fn();
const mockExistsSync = vi.fn(() => false); // known install candidates never exist in the test
vi.mock('fs', () => ({
  existsSync: (p: string) => mockExistsSync(p),
  statSync: (p: string) => mockStatSync(p),
  accessSync: (p: string, mode?: number) => mockAccessSync(p, mode),
  constants: { X_OK: 1 },
}));

// Hoisted so the lazy logger mock can reference it — cliSessionPool calls createLogger
// at module load, which would hit the temporal dead zone with a plain const.
const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: mockWarn, error: vi.fn(), verbose: vi.fn() }),
}));

// Import after mocks.
import { cliSessionPool } from '../cliSessionPool.js';
import * as nodePty from 'node-pty';

/** The binary string handed to the most recent node-pty spawn. */
function resolvedBinary(): string {
  const calls = vi.mocked(nodePty.spawn).mock.calls;
  return calls[calls.length - 1][0] as string;
}

describe('cliSessionPool — claude binary override (Story 33.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    cliSessionPool.destroyAll();
  });

  afterEach(() => {
    cliSessionPool.destroyAll();
  });

  it('uses a valid override verbatim (exists + is a file + executable)', () => {
    mockStatSync.mockReturnValue({ isFile: () => true });
    mockAccessSync.mockReturnValue(undefined); // X_OK passes on POSIX; ignored on win32

    const override = process.platform === 'win32' ? 'C:\\tools\\claude.exe' : '/opt/claude/bin/claude';
    cliSessionPool.spawnClaude({ cwd: '/proj', args: [], binaryPathOverride: override });

    expect(resolvedBinary()).toBe(override);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('warns and falls back to auto-detect when the override does not exist', () => {
    mockStatSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const override = '/does/not/exist/claude';
    cliSessionPool.spawnClaude({ cwd: '/proj', args: [], binaryPathOverride: override });

    expect(resolvedBinary()).not.toBe(override);
    expect(resolvedBinary()).toMatch(/claude(\.exe)?$/);
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it('warns and falls back when the override is a directory, not a file', () => {
    mockStatSync.mockReturnValue({ isFile: () => false });

    const override = process.platform === 'win32' ? 'C:\\tools' : '/opt/claude';
    cliSessionPool.spawnClaude({ cwd: '/proj', args: [], binaryPathOverride: override });

    expect(resolvedBinary()).not.toBe(override);
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it('skips the override entirely when empty (auto-detect, no validation, no warning)', () => {
    cliSessionPool.spawnClaude({ cwd: '/proj', args: [], binaryPathOverride: '' });

    expect(resolvedBinary()).toMatch(/claude(\.exe)?$/);
    expect(mockStatSync).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });
});
