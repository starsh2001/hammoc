/**
 * fileRewind Tests (Epic 32 — Story 32.5)
 *
 * Unit-tests the shared billing-neutral file-rewind helper directly against a
 * mocked SDK `query`. This is the mechanism BOTH engines delegate to, extracted
 * from Story 32.3's ChatService.rewindFiles. The 32.3 `chatService.test.ts >
 * rewindFiles (standalone)` suite stays as-is (it now exercises the delegation);
 * these add helper-level coverage incl. the `--session-id`+`--resume` footgun guard.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rewindSessionFiles } from '../fileRewind.js';
import { SessionService } from '../sessionService.js';

// Mock the SDK query function (only `query` is a runtime import; types erase).
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }));
// Quiet logger (matches the cliChatEngine test convention).
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn() }),
}));

describe('rewindSessionFiles (shared file-rewind helper)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spins up a throwaway resume query with checkpointing (no sessionId footgun) and delegates', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const mockClose = vi.fn();
    const mockRewindFiles = vi.fn().mockResolvedValue({
      canRewind: true,
      filesChanged: ['src/index.ts', 'src/utils.ts'],
      insertions: 10,
      deletions: 5,
    });
    vi.mocked(query).mockReturnValue(
      { rewindFiles: mockRewindFiles, close: mockClose } as unknown as ReturnType<typeof query>,
    );
    const markSpy = vi.spyOn(SessionService.prototype, 'markRewindDirty').mockImplementation(() => {});

    const result = await rewindSessionFiles(
      { sessionId: 'session-abc', messageUuid: 'msg-123', dryRun: true },
      '/test/path',
    );

    // Throwaway query: empty prompt + resume + project cwd + checkpointing, and
    // crucially NO `sessionId` option (CLI rejects --session-id with --resume).
    expect(query).toHaveBeenCalledWith({
      prompt: '',
      options: { resume: 'session-abc', cwd: '/test/path', enableFileCheckpointing: true },
    });
    const passedOptions = vi.mocked(query).mock.calls[0][0].options as Record<string, unknown>;
    expect(passedOptions).not.toHaveProperty('sessionId'); // footgun guard, explicit
    // Delegates to the SDK rewind with positional uuid + dryRun flag.
    expect(mockRewindFiles).toHaveBeenCalledWith('msg-123', { dryRun: true });
    // Returns the RewindFilesResult verbatim.
    expect(result).toEqual({
      canRewind: true,
      filesChanged: ['src/index.ts', 'src/utils.ts'],
      insertions: 10,
      deletions: 5,
    });
    // Side effects: markRewindDirty(cwd, sessionId) BEFORE close().
    expect(markSpy).toHaveBeenCalledWith('/test/path', 'session-abc');
    expect(mockClose).toHaveBeenCalled();
  });

  it('defaults dryRun to false and returns a canRewind:false result verbatim', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const mockClose = vi.fn();
    const mockRewindFiles = vi.fn().mockResolvedValue({
      canRewind: false,
      error: 'No checkpoint available for this message',
    });
    vi.mocked(query).mockReturnValue(
      { rewindFiles: mockRewindFiles, close: mockClose } as unknown as ReturnType<typeof query>,
    );
    const markSpy = vi.spyOn(SessionService.prototype, 'markRewindDirty').mockImplementation(() => {});

    const result = await rewindSessionFiles({ sessionId: 'session-abc', messageUuid: 'msg-123' }, '/test/path');

    expect(result.canRewind).toBe(false);
    expect(result.error).toBe('No checkpoint available for this message');
    // dryRun omitted → SDK called with { dryRun: false }.
    expect(mockRewindFiles).toHaveBeenCalledWith('msg-123', { dryRun: false });
    // Side effects still run on the cannot-rewind path.
    expect(markSpy).toHaveBeenCalledWith('/test/path', 'session-abc');
    expect(mockClose).toHaveBeenCalled();
  });

  it('still markRewindDirty + close when the SDK rewind rejects, then propagates', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const mockClose = vi.fn();
    const mockRewindFiles = vi.fn().mockRejectedValue(new Error('rewind boom'));
    vi.mocked(query).mockReturnValue(
      { rewindFiles: mockRewindFiles, close: mockClose } as unknown as ReturnType<typeof query>,
    );
    const markSpy = vi.spyOn(SessionService.prototype, 'markRewindDirty').mockImplementation(() => {});

    await expect(
      rewindSessionFiles({ sessionId: 'session-abc', messageUuid: 'msg-123', dryRun: false }, '/test/path'),
    ).rejects.toThrow('rewind boom');

    // finally ran despite the rejection.
    expect(markSpy).toHaveBeenCalledWith('/test/path', 'session-abc');
    expect(mockClose).toHaveBeenCalled();
  });

  it('skips markRewindDirty when cwd is undefined (cannot flag for cleanup), still closes', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const mockClose = vi.fn();
    const mockRewindFiles = vi.fn().mockResolvedValue({ canRewind: true });
    vi.mocked(query).mockReturnValue(
      { rewindFiles: mockRewindFiles, close: mockClose } as unknown as ReturnType<typeof query>,
    );
    const markSpy = vi.spyOn(SessionService.prototype, 'markRewindDirty').mockImplementation(() => {});

    const result = await rewindSessionFiles({ sessionId: 'session-abc', messageUuid: 'msg-123' }, undefined);

    expect(result.canRewind).toBe(true);
    expect(query).toHaveBeenCalledWith({
      prompt: '',
      options: { resume: 'session-abc', cwd: undefined, enableFileCheckpointing: true },
    });
    expect(markSpy).not.toHaveBeenCalled(); // `if (cwd)` guard
    expect(mockClose).toHaveBeenCalled();
  });
});
