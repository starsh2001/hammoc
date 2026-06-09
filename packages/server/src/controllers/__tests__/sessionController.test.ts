/**
 * Session Controller Tests
 * [Source: Story 3.3 - Task 3]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import { SESSION_ERRORS } from '@hammoc/shared';

// Create hoisted mocks
const {
  mockListSessionsBySlug,
  mockIsValidPathParam,
  mockSessionFileExists,
  mockReadSessionNamesBySlug,
  mockGetActiveStreamSessionIds,
  mockGetJoinedSessionIdsByProject,
  mockGetActiveStreamMetaByProject,
  mockTruncateFirstPrompt,
} = vi.hoisted(() => ({
  mockListSessionsBySlug: vi.fn(),
  mockIsValidPathParam: vi.fn(() => true),
  mockSessionFileExists: vi.fn(() => false),
  mockReadSessionNamesBySlug: vi.fn(),
  mockGetActiveStreamSessionIds: vi.fn(),
  mockGetJoinedSessionIdsByProject: vi.fn(),
  mockGetActiveStreamMetaByProject: vi.fn(),
  mockTruncateFirstPrompt: vi.fn((s: string) => s),
}));

// Mock sessionService
vi.mock('../../services/sessionService', () => ({
  sessionService: {
    listSessionsBySlug: mockListSessionsBySlug,
    isValidPathParam: mockIsValidPathParam,
    sessionFileExists: mockSessionFileExists,
    truncateFirstPrompt: mockTruncateFirstPrompt,
  },
}));

// Mock projectService
vi.mock('../../services/projectService', () => ({
  projectService: {
    readSessionNamesBySlug: mockReadSessionNamesBySlug,
  },
}));

// Mock websocket handler
vi.mock('../../handlers/websocket', () => ({
  getActiveStreamSessionIds: mockGetActiveStreamSessionIds,
  getJoinedSessionIdsByProject: mockGetJoinedSessionIdsByProject,
  getActiveStreamMetaByProject: mockGetActiveStreamMetaByProject,
}));

import { sessionController } from '../sessionController';

describe('sessionController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      params: { projectSlug: 'test-project' },
      query: {},
      t: vi.fn((key: string) => key),
      language: 'en',
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    // Default mocks for supporting services (after clearAllMocks)
    mockIsValidPathParam.mockReturnValue(true);
    mockSessionFileExists.mockReturnValue(false);
    mockGetActiveStreamSessionIds.mockReturnValue([]);
    mockGetJoinedSessionIdsByProject.mockReturnValue(new Set<string>());
    mockGetActiveStreamMetaByProject.mockReturnValue([]);
    mockTruncateFirstPrompt.mockImplementation((s: string) => s);
    mockReadSessionNamesBySlug.mockResolvedValue({});
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('list', () => {
    it('should return 200 with session list on success', async () => {
      const mockSessions = [
        {
          sessionId: 's1',
          firstPrompt: 'Test prompt',
          messageCount: 5,
          created: '2026-01-15T09:30:00Z',
          modified: '2026-01-31T14:22:00Z',
        },
      ];
      mockListSessionsBySlug.mockResolvedValue({ sessions: mockSessions, total: 1 });
      mockGetActiveStreamSessionIds.mockReturnValue([]);
      mockReadSessionNamesBySlug.mockResolvedValue({});

      await sessionController.list(mockReq as Request, mockRes as Response);

      expect(mockListSessionsBySlug).toHaveBeenCalledWith('test-project', expect.objectContaining({
        includeEmpty: false,
        limit: 0,
        offset: 0,
      }));
      expect(mockRes.json).toHaveBeenCalledWith({
        sessions: mockSessions,
        total: 1,
        hasMore: false,
      });
    });

    it('should return 200 with empty session list', async () => {
      mockListSessionsBySlug.mockResolvedValue({ sessions: [], total: 0 });
      mockGetActiveStreamSessionIds.mockReturnValue([]);
      mockReadSessionNamesBySlug.mockResolvedValue({});

      await sessionController.list(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        sessions: [],
        total: 0,
        hasMore: false,
      });
    });

    it('should return 404 for non-existent project', async () => {
      mockListSessionsBySlug.mockResolvedValue(null);

      await sessionController.list(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(SESSION_ERRORS.PROJECT_NOT_FOUND.httpStatus);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: SESSION_ERRORS.PROJECT_NOT_FOUND.code,
          message: 'session.error.projectNotFound',
        },
      });
    });

    it('should return 500 on service error', async () => {
      mockListSessionsBySlug.mockRejectedValue(new Error('Database error'));

      await sessionController.list(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(SESSION_ERRORS.SESSION_LIST_ERROR.httpStatus);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: SESSION_ERRORS.SESSION_LIST_ERROR.code,
          message: 'session.error.listError',
        },
      });
    });

    it('should use projectSlug from request params', async () => {
      mockReq.params = { projectSlug: 'my-custom-project-slug' };
      mockListSessionsBySlug.mockResolvedValue({ sessions: [], total: 0 });
      mockGetActiveStreamSessionIds.mockReturnValue([]);
      mockReadSessionNamesBySlug.mockResolvedValue({});

      await sessionController.list(mockReq as Request, mockRes as Response);

      expect(mockListSessionsBySlug).toHaveBeenCalledWith('my-custom-project-slug', expect.objectContaining({
        includeEmpty: false,
      }));
    });

    it('should pass query and searchContent to service', async () => {
      mockReq.query = { query: '  hello  ', searchContent: 'true' };
      mockListSessionsBySlug.mockResolvedValue({ sessions: [], total: 0 });
      mockGetActiveStreamSessionIds.mockReturnValue([]);
      mockReadSessionNamesBySlug.mockResolvedValue({ s1: 'My Session' });

      await sessionController.list(mockReq as Request, mockRes as Response);

      expect(mockListSessionsBySlug).toHaveBeenCalledWith('test-project', expect.objectContaining({
        query: 'hello',
        searchContent: true,
        sessionNames: { s1: 'My Session' },
      }));
    });

    it('should truncate query to 200 chars', async () => {
      mockReq.query = { query: 'A'.repeat(250) };
      mockListSessionsBySlug.mockResolvedValue({ sessions: [], total: 0 });
      mockGetActiveStreamSessionIds.mockReturnValue([]);
      mockReadSessionNamesBySlug.mockResolvedValue({});

      await sessionController.list(mockReq as Request, mockRes as Response);

      expect(mockListSessionsBySlug).toHaveBeenCalledWith('test-project', expect.objectContaining({
        query: 'A'.repeat(200),
      }));
    });

    it('should treat empty query as undefined', async () => {
      mockReq.query = { query: '   ' };
      mockListSessionsBySlug.mockResolvedValue({ sessions: [], total: 0 });
      mockGetActiveStreamSessionIds.mockReturnValue([]);
      mockReadSessionNamesBySlug.mockResolvedValue({});

      await sessionController.list(mockReq as Request, mockRes as Response);

      expect(mockListSessionsBySlug).toHaveBeenCalledWith('test-project', expect.objectContaining({
        query: undefined,
      }));
    });

    it('should reject invalid projectSlug with INVALID_PATH', async () => {
      mockReq.params = { projectSlug: '../malicious' };
      mockIsValidPathParam.mockReturnValueOnce(false);

      await sessionController.list(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(SESSION_ERRORS.INVALID_PATH.httpStatus);
      expect(mockListSessionsBySlug).not.toHaveBeenCalled();
    });

    // Waiting-session merge (CLI boot window): a running background stream whose JSONL
    // file does not exist yet must appear in the list even after the client left the
    // session view (so it is NOT in joinedIds). Regression guard for the disappearing
    // just-started CLI session.
    it('should merge a file-less running stream as a waiting session even when not joined', async () => {
      mockListSessionsBySlug.mockResolvedValue({ sessions: [], total: 0 });
      mockGetJoinedSessionIdsByProject.mockReturnValue(new Set<string>()); // client navigated away
      mockGetActiveStreamSessionIds.mockReturnValue(['cli-1']);
      mockGetActiveStreamMetaByProject.mockReturnValue([{ sessionId: 'cli-1', firstPrompt: 'review story 1.7' }]);
      mockSessionFileExists.mockReturnValue(false); // JSONL not written yet

      await sessionController.list(mockReq as Request, mockRes as Response);

      const arg = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(arg.sessions).toHaveLength(1);
      expect(arg.sessions[0]).toMatchObject({
        sessionId: 'cli-1',
        firstPrompt: 'review story 1.7',
        isWaiting: true,
        isStreaming: true,
      });
      // Waiting rows are excluded from pagination totals
      expect(arg.total).toBe(0);
      expect(arg.hasMore).toBe(false);
    });

    it('should not duplicate a session that is both joined and an active stream', async () => {
      mockListSessionsBySlug.mockResolvedValue({ sessions: [], total: 0 });
      mockGetJoinedSessionIdsByProject.mockReturnValue(new Set<string>(['cli-1']));
      mockGetActiveStreamSessionIds.mockReturnValue(['cli-1']);
      mockGetActiveStreamMetaByProject.mockReturnValue([{ sessionId: 'cli-1', firstPrompt: 'hello' }]);
      mockSessionFileExists.mockReturnValue(false);

      await sessionController.list(mockReq as Request, mockRes as Response);

      const arg = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(arg.sessions.filter((s: { sessionId: string }) => s.sessionId === 'cli-1')).toHaveLength(1);
      expect(arg.sessions[0].firstPrompt).toBe('hello');
    });

    it('should not merge an active stream once its JSONL file exists', async () => {
      mockListSessionsBySlug.mockResolvedValue({ sessions: [], total: 0 });
      mockGetActiveStreamSessionIds.mockReturnValue(['cli-1']);
      mockGetActiveStreamMetaByProject.mockReturnValue([{ sessionId: 'cli-1', firstPrompt: 'hi' }]);
      mockSessionFileExists.mockReturnValue(true); // file now on disk → real list owns it

      await sessionController.list(mockReq as Request, mockRes as Response);

      const arg = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(arg.sessions).toHaveLength(0);
    });

    it('should not merge waiting sessions on later pages (offset>0)', async () => {
      mockReq.query = { limit: '20', offset: '20' };
      mockListSessionsBySlug.mockResolvedValue({ sessions: [], total: 50 });
      mockGetActiveStreamSessionIds.mockReturnValue(['cli-1']);
      mockGetActiveStreamMetaByProject.mockReturnValue([{ sessionId: 'cli-1', firstPrompt: 'hi' }]);
      mockSessionFileExists.mockReturnValue(false);

      await sessionController.list(mockReq as Request, mockRes as Response);

      const arg = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(arg.sessions).toHaveLength(0); // waiting merge only on first page
    });
  });

});
