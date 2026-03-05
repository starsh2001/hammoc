import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionService, createSessionService, sessionService } from '../sessionService.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock fs/promises
vi.mock('fs/promises');
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
}));

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

  describe('createSessionService', () => {
    it('should create a new SessionService instance', () => {
      const instance = createSessionService();
      expect(instance).toBeInstanceOf(SessionService);
    });
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
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

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
});
