import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionService, sessionService } from '../sessionService.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock fs/promises
vi.mock('fs/promises');
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
}));

// Mock historyParser for content search tests
vi.mock('../historyParser.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../historyParser.js')>();
  return {
    ...original,
    parseJSONLFile: vi.fn().mockResolvedValue([]),
  };
});

const mockFs = vi.mocked(fs);

// Mock data
const mockSessionsIndex = {
  version: 1,
  entries: [
    {
      sessionId: 'session-123',
      firstPrompt: 'Create a React component',
      messageCount: 15,
      created: '2026-01-30T10:00:00Z',
      modified: '2026-01-30T11:30:00Z',
    },
    {
      sessionId: 'session-456',
      firstPrompt: 'Fix the bug in auth',
      messageCount: 8,
      created: '2026-01-29T14:00:00Z',
      modified: '2026-01-29T15:00:00Z',
    },
  ],
};

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('encodeProjectPath', () => {
    it('should encode Unix-style paths correctly', () => {
      const result = service.encodeProjectPath('/Users/username/myproject');
      expect(result).toBe('Users-username-myproject');
    });

    it('should encode Windows-style paths correctly', () => {
      const result = service.encodeProjectPath('C:\\Users\\username\\myproject');
      // Both : and \ are replaced with -, resulting in C--
      expect(result).toBe('C--Users-username-myproject');
    });

    it('should handle paths with multiple separators', () => {
      const result = service.encodeProjectPath('/path/to/deep/project');
      expect(result).toBe('path-to-deep-project');
    });
  });

  describe('getSessionsDir', () => {
    it('should return correct sessions directory path', () => {
      const projectPath = '/Users/test/project';
      const result = service.getSessionsDir(projectPath);

      const expected = path.join(os.homedir(), '.claude', 'projects', 'Users-test-project');
      expect(result).toBe(expected);
    });
  });

  describe('getSessionsIndexPath', () => {
    it('should return correct sessions-index.json path', () => {
      const projectPath = '/Users/test/project';
      const result = service.getSessionsIndexPath(projectPath);

      const expected = path.join(
        os.homedir(),
        '.claude',
        'projects',
        'Users-test-project',
        'sessions-index.json'
      );
      expect(result).toBe(expected);
    });
  });

  describe('saveSessionId', () => {
    it('should save session ID to tracking file', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await service.saveSessionId('/project/path', 'test-session-id');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.bmad-current-session'),
        'test-session-id',
        'utf-8'
      );
    });

    it('should create directory if it does not exist', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await service.saveSessionId('/project/path', 'test-session-id');

      expect(mockFs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });
  });

  describe('getSessionId', () => {
    it('should return saved session ID', async () => {
      mockFs.readFile.mockResolvedValue('saved-session-id');

      const result = await service.getSessionId('/project/path');

      expect(result).toBe('saved-session-id');
    });

    it('should return null if file does not exist', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await service.getSessionId('/project/path');

      expect(result).toBeNull();
    });

    it('should return null for empty session ID', async () => {
      mockFs.readFile.mockResolvedValue('   ');

      const result = await service.getSessionId('/project/path');

      expect(result).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('should return parsed sessions from sessions-index.json', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSessionsIndex));

      const result = await service.listSessions('/project/path');

      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe('session-123');
      expect(result[0].firstPrompt).toBe('Create a React component');
      expect(result[0].messageCount).toBe(15);
      expect(result[0].created).toBeInstanceOf(Date);
      expect(result[0].modified).toBeInstanceOf(Date);
    });

    it('should return empty array if file does not exist', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await service.listSessions('/project/path');

      expect(result).toEqual([]);
    });

    it('should return empty array for invalid JSON', async () => {
      mockFs.readFile.mockResolvedValue('invalid json');

      const result = await service.listSessions('/project/path');

      expect(result).toEqual([]);
    });

    it('should return empty array if entries is not an array', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ version: 1 }));

      const result = await service.listSessions('/project/path');

      expect(result).toEqual([]);
    });

    it('should include projectSlug in returned sessions', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSessionsIndex));

      const result = await service.listSessions('/project/path');

      expect(result[0].projectSlug).toBe('project-path');
    });
  });

  describe('sessionExists', () => {
    it('should return true if session exists', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSessionsIndex));

      const result = await service.sessionExists('/project/path', 'session-123');

      expect(result).toBe(true);
    });

    it('should return false if session does not exist', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSessionsIndex));

      const result = await service.sessionExists('/project/path', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getSession', () => {
    it('should return session by ID', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSessionsIndex));

      const result = await service.getSession('/project/path', 'session-456');

      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe('session-456');
      expect(result?.firstPrompt).toBe('Fix the bug in auth');
    });

    it('should return null if session not found', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSessionsIndex));

      const result = await service.getSession('/project/path', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('isValidSessionId', () => {
    it('should return true for valid alphanumeric session ID', () => {
      expect(service.isValidSessionId('session-123')).toBe(true);
      expect(service.isValidSessionId('abc_def_123')).toBe(true);
      expect(service.isValidSessionId('ValidSessionId')).toBe(true);
    });

    it('should return false for invalid session IDs', () => {
      expect(service.isValidSessionId('')).toBe(false);
      expect(service.isValidSessionId(null as unknown as string)).toBe(false);
      expect(service.isValidSessionId(undefined as unknown as string)).toBe(false);
      expect(service.isValidSessionId('session with spaces')).toBe(false);
      expect(service.isValidSessionId('session/path')).toBe(false);
      expect(service.isValidSessionId('../malicious')).toBe(false);
    });
  });

  // Story 3.3: Session List API tests
  describe('sessionService singleton', () => {
    it('should export a singleton instance', () => {
      expect(sessionService).toBeInstanceOf(SessionService);
    });
  });

  describe('getProjectPathBySlug', () => {
    it('should return originalPath when projectSlug exists', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          originalPath: '/Users/test/my-project',
          entries: [],
        })
      );

      const result = await service.getProjectPathBySlug('project-hash');

      expect(result).toBe('/Users/test/my-project');
    });

    it('should return null when projectSlug does not exist', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await service.getProjectPathBySlug('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when originalPath is missing', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          entries: [],
        })
      );

      const result = await service.getProjectPathBySlug('project-hash');

      expect(result).toBeNull();
    });
  });

  describe('truncateFirstPrompt', () => {
    it('should not truncate text under 100 chars', () => {
      const text = 'Short text';
      expect(service.truncateFirstPrompt(text)).toBe(text);
    });

    it('should not truncate text exactly 100 chars', () => {
      const text = 'A'.repeat(100);
      expect(service.truncateFirstPrompt(text)).toBe(text);
    });

    it('should truncate text over 100 chars with ellipsis', () => {
      const text = 'A'.repeat(150);
      const result = service.truncateFirstPrompt(text);

      expect(result.length).toBe(100);
      expect(result.endsWith('...')).toBe(true);
      expect(result).toBe('A'.repeat(97) + '...');
    });

    it('should handle empty string', () => {
      expect(service.truncateFirstPrompt('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(service.truncateFirstPrompt(null as unknown as string)).toBe('');
      expect(service.truncateFirstPrompt(undefined as unknown as string)).toBe('');
    });

    it('should respect custom maxLength', () => {
      const text = 'Hello World!';
      const result = service.truncateFirstPrompt(text, 8);

      expect(result).toBe('Hello...');
      expect(result.length).toBe(8);
    });
  });

  describe('parseDate (private method)', () => {
    it('should parse valid ISO date string', () => {
      const result = (service as unknown as { parseDate: (s: string) => number }).parseDate(
        '2026-01-31T00:00:00Z'
      );
      expect(result).toBe(new Date('2026-01-31T00:00:00Z').getTime());
    });

    it('should return 0 for invalid date string', () => {
      const result = (service as unknown as { parseDate: (s: string) => number }).parseDate(
        'invalid-date'
      );
      expect(result).toBe(0);
    });

    it('should return 0 for empty string', () => {
      const result = (service as unknown as { parseDate: (s: string) => number }).parseDate('');
      expect(result).toBe(0);
    });
  });

  describe('listSessionsBySlug', () => {
    it('should return null for non-existent project', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValueOnce(false);

      const result = await service.listSessionsBySlug('nonexistent');

      expect(result).toBeNull();
    });

    it('should return empty array for project with no sessions', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          originalPath: '/test/project',
          entries: [],
        })
      );

      const result = await service.listSessionsBySlug('project-hash');

      expect(result).toEqual({ sessions: [], total: 0 });
    });

    it('should return sessions sorted by modified descending', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          originalPath: '/test/project',
          entries: [
            {
              sessionId: 'old',
              modified: '2026-01-01T00:00:00Z',
              created: '2026-01-01T00:00:00Z',
              firstPrompt: 'Old session',
              messageCount: 1,
            },
            {
              sessionId: 'new',
              modified: '2026-01-31T00:00:00Z',
              created: '2026-01-31T00:00:00Z',
              firstPrompt: 'New session',
              messageCount: 2,
            },
            {
              sessionId: 'middle',
              modified: '2026-01-15T00:00:00Z',
              created: '2026-01-15T00:00:00Z',
              firstPrompt: 'Middle session',
              messageCount: 3,
            },
          ],
        })
      );

      const result = await service.listSessionsBySlug('project-hash');

      expect(result).not.toBeNull();
      expect(result!.sessions[0].sessionId).toBe('new');
      expect(result!.sessions[1].sessionId).toBe('middle');
      expect(result!.sessions[2].sessionId).toBe('old');
    });

    it('should truncate firstPrompt to 100 chars', async () => {
      const longPrompt = 'A'.repeat(150);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          originalPath: '/test/project',
          entries: [
            {
              sessionId: 's1',
              modified: '2026-01-01T00:00:00Z',
              created: '2026-01-01T00:00:00Z',
              firstPrompt: longPrompt,
              messageCount: 1,
            },
          ],
        })
      );

      const result = await service.listSessionsBySlug('project-hash');

      expect(result).not.toBeNull();
      expect(result!.sessions[0].firstPrompt.length).toBe(100);
      expect(result!.sessions[0].firstPrompt.endsWith('...')).toBe(true);
    });

    it('should preserve ISO 8601 date format in response', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          originalPath: '/test/project',
          entries: [
            {
              sessionId: 's1',
              modified: '2026-01-31T14:22:00Z',
              created: '2026-01-15T09:30:00Z',
              firstPrompt: 'Test prompt',
              messageCount: 5,
            },
          ],
        })
      );

      const result = await service.listSessionsBySlug('project-hash');

      expect(result).not.toBeNull();
      expect(result!.sessions[0].created).toBe('2026-01-15T09:30:00Z');
      expect(result!.sessions[0].modified).toBe('2026-01-31T14:22:00Z');
    });

    it('should handle missing entries array', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          originalPath: '/test/project',
        })
      );

      const result = await service.listSessionsBySlug('project-hash');

      expect(result).toEqual({ sessions: [], total: 0 });
    });
  });

  // Story 23.1: Session search tests
  describe('listSessionsBySlug - metadata search', () => {
    const mockIndexWithSearch = {
      originalPath: '/test/project',
      entries: [
        {
          sessionId: 'session-abc',
          firstPrompt: 'Create a React component for dashboard',
          messageCount: 10,
          created: '2026-01-01T00:00:00Z',
          modified: '2026-01-03T00:00:00Z',
        },
        {
          sessionId: 'session-def',
          firstPrompt: 'Fix authentication bug',
          messageCount: 5,
          created: '2026-01-02T00:00:00Z',
          modified: '2026-01-02T00:00:00Z',
        },
        {
          sessionId: 'session-ghi',
          firstPrompt: 'Refactor API endpoints',
          messageCount: 8,
          created: '2026-01-03T00:00:00Z',
          modified: '2026-01-01T00:00:00Z',
        },
      ],
    };

    it('should return all sessions when query is empty (backward compatible)', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockIndexWithSearch));

      const result = await service.listSessionsBySlug('project-hash', {});

      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(3);
    });

    it('should return all sessions when query is undefined', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockIndexWithSearch));

      const result = await service.listSessionsBySlug('project-hash', { query: undefined });

      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(3);
    });

    it('should filter by firstPrompt match (case-insensitive)', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockIndexWithSearch));

      const result = await service.listSessionsBySlug('project-hash', { query: 'react' });

      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(1);
      expect(result!.sessions[0].sessionId).toBe('session-abc');
      expect(result!.total).toBe(1);
    });

    it('should filter by sessionId match', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockIndexWithSearch));

      const result = await service.listSessionsBySlug('project-hash', { query: 'def' });

      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(1);
      expect(result!.sessions[0].sessionId).toBe('session-def');
    });

    it('should filter by session name match', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockIndexWithSearch));

      const result = await service.listSessionsBySlug('project-hash', {
        query: 'dashboard work',
        sessionNames: {
          'session-ghi': 'Dashboard Work Session',
        },
      });

      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(1);
      expect(result!.sessions[0].sessionId).toBe('session-ghi');
    });

    it('should return empty list when no matches', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockIndexWithSearch));

      const result = await service.listSessionsBySlug('project-hash', { query: 'nonexistent-xyz' });

      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(0);
      expect(result!.total).toBe(0);
    });

    it('should be case-insensitive for all metadata fields', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockIndexWithSearch));

      const result = await service.listSessionsBySlug('project-hash', { query: 'FIX AUTHENTICATION' });

      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(1);
      expect(result!.sessions[0].sessionId).toBe('session-def');
    });

    it('should return multiple matches', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockIndexWithSearch));

      // 'session-' appears in all session IDs
      const result = await service.listSessionsBySlug('project-hash', { query: 'session-' });

      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(3);
      expect(result!.total).toBe(3);
    });
  });

  describe('listSessionsBySlug - search with pagination (fast path)', () => {
    it('should filter before pagination and return correct total', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);

      const indexData = {
        entries: [
          { sessionId: 's1', firstPrompt: 'React component', messageCount: 1, created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z' },
          { sessionId: 's2', firstPrompt: 'Vue component', messageCount: 2, created: '2026-01-02T00:00:00Z', modified: '2026-01-02T00:00:00Z' },
          { sessionId: 's3', firstPrompt: 'React hooks', messageCount: 3, created: '2026-01-03T00:00:00Z', modified: '2026-01-03T00:00:00Z' },
        ],
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(indexData));
      mockFs.readdir.mockResolvedValue(['s1.jsonl', 's2.jsonl', 's3.jsonl'] as any);

      const mockStat = (mtime: Date) => ({
        mtimeMs: mtime.getTime(),
        mtime,
        birthtime: mtime,
      });

      mockFs.stat
        .mockResolvedValueOnce(mockStat(new Date('2026-01-01')) as any)
        .mockResolvedValueOnce(mockStat(new Date('2026-01-02')) as any)
        .mockResolvedValueOnce(mockStat(new Date('2026-01-03')) as any);

      const result = await service.listSessionsBySlug('project-hash', {
        query: 'react',
        limit: 1,
        offset: 0,
      });

      expect(result).not.toBeNull();
      // 2 matches for 'react' (s1 and s3), but limit=1 so only 1 returned
      expect(result!.sessions).toHaveLength(1);
      expect(result!.total).toBe(2);
    });
  });

  describe('listSessionsBySlug - content search (fast path)', () => {
    it('should search JSONL content in fast path (limit>0, searchContent=true)', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);

      const indexData = {
        entries: [
          { sessionId: 's1', firstPrompt: 'No match here', messageCount: 1, created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z' },
          { sessionId: 's2', firstPrompt: 'Also no match', messageCount: 2, created: '2026-01-02T00:00:00Z', modified: '2026-01-02T00:00:00Z' },
        ],
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(indexData));
      mockFs.readdir.mockResolvedValue(['s1.jsonl', 's2.jsonl'] as any);

      const mockStat = (mtime: Date) => ({
        mtimeMs: mtime.getTime(),
        mtime,
        birthtime: mtime,
      });

      mockFs.stat
        .mockResolvedValueOnce(mockStat(new Date('2026-01-01')) as any)
        .mockResolvedValueOnce(mockStat(new Date('2026-01-02')) as any);

      const { parseJSONLFile: mockParseJSONL } = await import('../historyParser.js');
      vi.mocked(mockParseJSONL).mockImplementation(async (filePath: string) => {
        if (filePath.includes('s1')) {
          return [
            { type: 'user', message: { content: 'Tell me about GraphQL' }, uuid: '1', timestamp: '2026-01-01T00:00:00Z' },
          ] as any;
        }
        return [
          { type: 'user', message: { content: 'Hello world' }, uuid: '2', timestamp: '2026-01-02T00:00:00Z' },
        ] as any;
      });

      const result = await service.listSessionsBySlug('project-hash', {
        query: 'graphql',
        searchContent: true,
        limit: 10,
        offset: 0,
      });

      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(1);
      expect(result!.sessions[0].sessionId).toBe('s1');
      expect(result!.total).toBe(1);
    });

    it('should cap content search at 100 unmatched sessions', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);

      // Create 120 sessions, none matching by metadata
      const entries = Array.from({ length: 120 }, (_, i) => ({
        sessionId: `s${i}`,
        firstPrompt: 'No match',
        messageCount: 1,
        created: '2026-01-01T00:00:00Z',
        modified: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
      }));

      mockFs.readFile.mockResolvedValue(JSON.stringify({ entries }));
      mockFs.readdir.mockResolvedValue(entries.map(e => `${e.sessionId}.jsonl`) as any);

      const mockStat = (i: number) => ({
        mtimeMs: i,
        mtime: new Date(i),
        birthtime: new Date(i),
      });

      for (let i = 0; i < 120; i++) {
        mockFs.stat.mockResolvedValueOnce(mockStat(i) as any);
      }

      const { parseJSONLFile: mockParseJSONL } = await import('../historyParser.js');
      vi.mocked(mockParseJSONL).mockResolvedValue([
        { type: 'user', message: { content: 'target keyword found' }, uuid: '1', timestamp: '2026-01-01T00:00:00Z' },
      ] as any);

      const result = await service.listSessionsBySlug('project-hash', {
        query: 'target',
        searchContent: true,
        limit: 200,
        offset: 0,
      });

      expect(result).not.toBeNull();
      // Only 100 sessions should be content-searched (cap), even though 120 exist
      expect(mockParseJSONL).toHaveBeenCalledTimes(100);
      // All 100 searched sessions match, so total should be 100
      expect(result!.total).toBe(100);
    });
  });

  describe('listSessionsBySlug - content search', () => {
    it('should search JSONL content when searchContent=true', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          entries: [
            {
              sessionId: 'no-meta-match',
              firstPrompt: 'Hello world',
              messageCount: 2,
              created: '2026-01-01T00:00:00Z',
              modified: '2026-01-01T00:00:00Z',
            },
          ],
        })
      );

      // Mock parseJSONLFile for content search
      const { parseJSONLFile: mockParseJSONL } = await import('../historyParser.js');
      vi.mocked(mockParseJSONL).mockResolvedValue([
        {
          type: 'user',
          message: { content: 'How do I implement Redux in my app?' },
          uuid: '1',
          timestamp: '2026-01-01T00:00:00Z',
        },
        {
          type: 'assistant',
          message: { content: 'Here is how to set up Redux...' },
          uuid: '2',
          timestamp: '2026-01-01T00:01:00Z',
        },
      ] as any);

      const result = await service.listSessionsBySlug('project-hash', {
        query: 'redux',
        searchContent: true,
      });

      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(1);
      expect(result!.sessions[0].sessionId).toBe('no-meta-match');
    });

    it('should not re-search sessions already matched by metadata', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          entries: [
            {
              sessionId: 'meta-match',
              firstPrompt: 'Redux setup guide',
              messageCount: 2,
              created: '2026-01-01T00:00:00Z',
              modified: '2026-01-01T00:00:00Z',
            },
          ],
        })
      );

      const { parseJSONLFile: mockParseJSONL } = await import('../historyParser.js');
      vi.mocked(mockParseJSONL).mockClear();

      const result = await service.listSessionsBySlug('project-hash', {
        query: 'redux',
        searchContent: true,
      });

      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(1);
      // parseJSONLFile should NOT be called for content search since metadata already matched
      expect(mockParseJSONL).not.toHaveBeenCalled();
    });

    it('should handle content with array of content blocks', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          entries: [
            {
              sessionId: 'block-session',
              firstPrompt: 'Simple prompt',
              messageCount: 1,
              created: '2026-01-01T00:00:00Z',
              modified: '2026-01-01T00:00:00Z',
            },
          ],
        })
      );

      const { parseJSONLFile: mockParseJSONL } = await import('../historyParser.js');
      vi.mocked(mockParseJSONL).mockResolvedValue([
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Here is the Kubernetes deployment config' },
              { type: 'text', text: 'And here is the service config' },
            ],
          },
          uuid: '1',
          timestamp: '2026-01-01T00:00:00Z',
        },
      ] as any);

      const result = await service.listSessionsBySlug('project-hash', {
        query: 'kubernetes',
        searchContent: true,
      });

      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(1);
    });

    it('should skip unparseable files during content search', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          entries: [
            {
              sessionId: 'bad-file',
              firstPrompt: 'No match here',
              messageCount: 1,
              created: '2026-01-01T00:00:00Z',
              modified: '2026-01-01T00:00:00Z',
            },
          ],
        })
      );

      const { parseJSONLFile: mockParseJSONL } = await import('../historyParser.js');
      vi.mocked(mockParseJSONL).mockRejectedValue(new Error('Parse error'));

      const result = await service.listSessionsBySlug('project-hash', {
        query: 'anything',
        searchContent: true,
      });

      expect(result).not.toBeNull();
      expect(result!.sessions).toHaveLength(0);
    });
  });
});
