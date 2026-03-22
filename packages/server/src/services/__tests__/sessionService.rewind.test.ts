/**
 * SessionService Rewind Tests
 * [Source: Story 25.2 - Task 10]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionService } from '../sessionService.js';
import fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises');
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  }),
}));

// Mock historyParser — keep real sort/transform for getRewindInfo
vi.mock('../historyParser.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../historyParser.js')>();
  return {
    ...original,
    parseJSONLFile: vi.fn().mockResolvedValue([]),
    parseJSONLSessionMeta: vi.fn().mockResolvedValue({ firstPrompt: 'test', messageCount: 2 }),
    sortMessagesByParentUuid: original.sortMessagesByParentUuid,
    transformToHistoryMessages: original.transformToHistoryMessages,
    cleanCommandTags: original.cleanCommandTags,
  };
});

const mockFs = vi.mocked(fs);

// JSONL test data
const testJSONL = [
  '{"uuid":"msg-1","type":"user","message":{"role":"user","content":"Hello"},"timestamp":"2026-01-15T10:00:00Z"}',
  '{"uuid":"msg-2","type":"assistant","parentUuid":"msg-1","message":{"role":"assistant","content":"Hi!"},"timestamp":"2026-01-15T10:00:05Z"}',
  '{"uuid":"msg-3","type":"user","parentUuid":"msg-2","message":{"role":"user","content":"Help me"},"timestamp":"2026-01-15T10:00:10Z"}',
  '{"uuid":"msg-4","type":"assistant","parentUuid":"msg-3","message":{"role":"assistant","content":"Sure!"},"timestamp":"2026-01-15T10:00:15Z"}',
].join('\n');

describe('SessionService - Rewind', () => {
  let service: SessionService;

  beforeEach(async () => {
    service = new SessionService();
    vi.clearAllMocks();
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('truncateSessionHistory', () => {
    // 10.2: Correctly rewrites JSONL with messages before target
    it('truncates JSONL at the target message', async () => {
      mockFs.readFile.mockResolvedValue(testJSONL);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ birthtime: new Date(), mtime: new Date() } as any);

      const result = await service.truncateSessionHistory('test-project', 'session-1', 'msg-3');

      expect(result.success).toBe(true);

      // Verify writeFile was called with truncated content
      const writeCall = mockFs.writeFile.mock.calls[0];
      expect(writeCall).toBeDefined();
      const writtenContent = writeCall[1] as string;

      // Should contain msg-1 and msg-2 but NOT msg-3 and msg-4
      expect(writtenContent).toContain('msg-1');
      expect(writtenContent).toContain('msg-2');
      expect(writtenContent).not.toContain('msg-3');
      expect(writtenContent).not.toContain('msg-4');
    });

    // 10.3: Updates sessions-index.json messageCount
    it('calls updateSessionIndex after truncation', async () => {
      mockFs.readFile.mockResolvedValue(testJSONL);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ birthtime: new Date(), mtime: new Date() } as any);

      const spy = vi.spyOn(service, 'updateSessionIndex').mockResolvedValue(undefined);

      await service.truncateSessionHistory('test-project', 'session-1', 'msg-3');

      expect(spy).toHaveBeenCalledWith('test-project', 'session-1');
    });

    // 10.4: Returns error when messageId not found
    it('returns error when messageId not found', async () => {
      mockFs.readFile.mockResolvedValue(testJSONL);

      const result = await service.truncateSessionHistory('test-project', 'session-1', 'nonexistent-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Message not found');
    });

    // 10.5: Atomic write — uses temp file then rename
    it('writes to temp file then renames for atomicity', async () => {
      mockFs.readFile.mockResolvedValue(testJSONL);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ birthtime: new Date(), mtime: new Date() } as any);

      await service.truncateSessionHistory('test-project', 'session-1', 'msg-3');

      // Verify writeFile uses a tmp path
      const writePath = mockFs.writeFile.mock.calls[0][0] as string;
      expect(writePath).toContain('.tmp.');

      // Verify rename is called
      expect(mockFs.rename).toHaveBeenCalled();
      const renameArgs = mockFs.rename.mock.calls[0];
      expect(renameArgs[0]).toContain('.tmp.');
      expect(String(renameArgs[1])).toContain('.jsonl');
    });

    // Returns error when session file not found
    it('returns error when session file does not exist', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await service.truncateSessionHistory('test-project', 'session-1', 'msg-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Session file not found');
    });

    // ERR-002: Index update failure does not cause success:false
    it('returns success even when updateSessionIndex fails (best-effort)', async () => {
      mockFs.readFile.mockResolvedValue(testJSONL);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ birthtime: new Date(), mtime: new Date() } as any);

      const spy = vi.spyOn(service, 'updateSessionIndex').mockRejectedValue(new Error('Index write failed'));

      const result = await service.truncateSessionHistory('test-project', 'session-1', 'msg-3');

      expect(result.success).toBe(true);
      expect(spy).toHaveBeenCalledWith('test-project', 'session-1');
    });

    // Handles truncation at the first message (results in empty file)
    it('handles truncation at the first message', async () => {
      mockFs.readFile.mockResolvedValue(testJSONL);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ birthtime: new Date(), mtime: new Date() } as any);

      const result = await service.truncateSessionHistory('test-project', 'session-1', 'msg-1');

      expect(result.success).toBe(true);

      // Written content should be empty
      const writtenContent = mockFs.writeFile.mock.calls[0][1] as string;
      expect(writtenContent).toBe('');
    });
  });

  describe('getRewindInfo', () => {
    it('returns userMessageId and resumeAtId for a valid target', async () => {
      const { parseJSONLFile } = await import('../historyParser.js');
      vi.mocked(parseJSONLFile).mockResolvedValue([
        { uuid: 'msg-1', type: 'user', message: { role: 'user', content: 'Hello' }, timestamp: '2026-01-15T10:00:00Z' },
        { uuid: 'msg-2', type: 'assistant', parentUuid: 'msg-1', message: { role: 'assistant', content: 'Hi!' }, timestamp: '2026-01-15T10:00:05Z' },
        { uuid: 'msg-3', type: 'user', parentUuid: 'msg-2', message: { role: 'user', content: 'Help me' }, timestamp: '2026-01-15T10:00:10Z' },
        { uuid: 'msg-4', type: 'assistant', parentUuid: 'msg-3', message: { role: 'assistant', content: 'Sure!' }, timestamp: '2026-01-15T10:00:15Z' },
      ] as any);

      const result = await service.getRewindInfo('test-project', 'session-1', 'msg-4');

      expect(result).not.toBeNull();
      // resumeAtId: the message just before msg-4 in sorted order
      expect(result!.resumeAtId).toBe('msg-3');
      // userMessageId: the last human message before msg-4
      expect(result!.userMessageId).toBe('msg-3');
    });

    it('returns null when target message not found', async () => {
      const { parseJSONLFile } = await import('../historyParser.js');
      vi.mocked(parseJSONLFile).mockResolvedValue([
        { uuid: 'msg-1', type: 'user', message: { role: 'user', content: 'Hello' }, timestamp: '2026-01-15T10:00:00Z' },
      ] as any);

      const result = await service.getRewindInfo('test-project', 'session-1', 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns null userMessageId when no human message precedes target', async () => {
      const { parseJSONLFile } = await import('../historyParser.js');
      vi.mocked(parseJSONLFile).mockResolvedValue([
        { uuid: 'msg-1', type: 'assistant', message: { role: 'assistant', content: 'Hi!' }, timestamp: '2026-01-15T10:00:00Z' },
      ] as any);

      const result = await service.getRewindInfo('test-project', 'session-1', 'msg-1');

      expect(result).not.toBeNull();
      expect(result!.resumeAtId).toBeNull(); // first message, nothing before
      expect(result!.userMessageId).toBeNull();
    });

    it('returns null when session file does not exist', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await service.getRewindInfo('test-project', 'session-1', 'msg-1');
      expect(result).toBeNull();
    });
  });
});
