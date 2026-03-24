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
  mockReadSessionNamesBySlug,
  mockGetActiveStreamSessionIds,
  mockGetSessionMessages,
  mockGetStreamStartedAt,
  mockGetRunningStreamStartedAt,
  mockGetCompletedBuffer,
  mockTransformBufferToHistoryMessages,
} = vi.hoisted(() => ({
  mockListSessionsBySlug: vi.fn(),
  mockIsValidPathParam: vi.fn(() => true),
  mockReadSessionNamesBySlug: vi.fn(),
  mockGetActiveStreamSessionIds: vi.fn(),
  mockGetSessionMessages: vi.fn(),
  mockGetStreamStartedAt: vi.fn(),
  mockGetRunningStreamStartedAt: vi.fn(),
  mockGetCompletedBuffer: vi.fn(),
  mockTransformBufferToHistoryMessages: vi.fn(),
}));

// Mock sessionService
vi.mock('../../services/sessionService', () => ({
  sessionService: {
    listSessionsBySlug: mockListSessionsBySlug,
    isValidPathParam: mockIsValidPathParam,
    getSessionMessages: mockGetSessionMessages,
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
  getStreamStartedAt: mockGetStreamStartedAt,
  getRunningStreamStartedAt: mockGetRunningStreamStartedAt,
  getCompletedBuffer: mockGetCompletedBuffer,
}));

// Mock historyParser
vi.mock('../../services/historyParser', () => ({
  transformBufferToHistoryMessages: mockTransformBufferToHistoryMessages,
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
    mockGetActiveStreamSessionIds.mockReturnValue([]);
    mockReadSessionNamesBySlug.mockResolvedValue({});
    mockGetStreamStartedAt.mockReturnValue(undefined);
    mockGetRunningStreamStartedAt.mockReturnValue(undefined);
    mockGetCompletedBuffer.mockReturnValue(undefined);
    mockTransformBufferToHistoryMessages.mockReturnValue([]);
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
  });

  describe('getMessages - buffer merge pagination', () => {
    // Helper to create a mock message
    const makeMsg = (id: string, ts: string) => ({
      id,
      type: 'assistant' as const,
      content: `msg-${id}`,
      timestamp: ts,
    });

    beforeEach(() => {
      mockReq.params = { projectSlug: 'test-project', sessionId: 'sess-1' };
      mockReq.query = { limit: '5' };
    });

    it('should keep hasMore false when buffer merge stays under limit', async () => {
      // Service returns 3 messages (under limit=5), no more pages
      mockGetSessionMessages.mockResolvedValue({
        messages: [
          makeMsg('1', '2026-01-01T00:01:00Z'),
          makeMsg('2', '2026-01-01T00:02:00Z'),
          makeMsg('3', '2026-01-01T00:03:00Z'),
        ],
        pagination: { total: 3, limit: 5, offset: 0, hasMore: false },
        lastAgentCommand: null,
      });

      // Buffer adds 1 unique message → total=4, still under limit
      mockGetCompletedBuffer.mockReturnValue([{ event: 'done', data: {}, ts: 0 }]);
      mockTransformBufferToHistoryMessages.mockReturnValue([
        makeMsg('4', '2026-01-01T00:04:00Z'),
      ]);

      await sessionController.getMessages(mockReq as Request, mockRes as Response);

      const result = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.pagination.total).toBe(4);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.messages).toHaveLength(4);
    });

    it('should set hasMore true and trim messages when buffer merge exceeds limit', async () => {
      // Service returns 4 messages (under limit=5)
      mockGetSessionMessages.mockResolvedValue({
        messages: [
          makeMsg('1', '2026-01-01T00:01:00Z'),
          makeMsg('2', '2026-01-01T00:02:00Z'),
          makeMsg('3', '2026-01-01T00:03:00Z'),
          makeMsg('4', '2026-01-01T00:04:00Z'),
        ],
        pagination: { total: 4, limit: 5, offset: 0, hasMore: false },
        lastAgentCommand: null,
      });

      // Buffer adds 3 unique messages → total=7, exceeds limit=5
      mockGetCompletedBuffer.mockReturnValue([{ event: 'done', data: {}, ts: 0 }]);
      mockTransformBufferToHistoryMessages.mockReturnValue([
        makeMsg('5', '2026-01-01T00:05:00Z'),
        makeMsg('6', '2026-01-01T00:06:00Z'),
        makeMsg('7', '2026-01-01T00:07:00Z'),
      ]);

      await sessionController.getMessages(mockReq as Request, mockRes as Response);

      const result = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.pagination.total).toBe(7);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.messages).toHaveLength(5); // trimmed to limit
      // Should keep the latest 5 messages (ids 3-7)
      expect(result.messages[0].id).toBe('3');
      expect(result.messages[4].id).toBe('7');
    });

    it('should not count duplicate buffer messages in total', async () => {
      // Service returns 3 messages
      mockGetSessionMessages.mockResolvedValue({
        messages: [
          makeMsg('1', '2026-01-01T00:01:00Z'),
          makeMsg('2', '2026-01-01T00:02:00Z'),
          makeMsg('3', '2026-01-01T00:03:00Z'),
        ],
        pagination: { total: 3, limit: 5, offset: 0, hasMore: false },
        lastAgentCommand: null,
      });

      // Buffer contains 2 messages but 1 is a duplicate (id=3)
      mockGetCompletedBuffer.mockReturnValue([{ event: 'done', data: {}, ts: 0 }]);
      mockTransformBufferToHistoryMessages.mockReturnValue([
        makeMsg('3', '2026-01-01T00:03:00Z'), // duplicate
        makeMsg('4', '2026-01-01T00:04:00Z'), // unique
      ]);

      await sessionController.getMessages(mockReq as Request, mockRes as Response);

      const result = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.pagination.total).toBe(4); // only 1 unique added
      expect(result.pagination.hasMore).toBe(false);
      expect(result.messages).toHaveLength(4);
    });

    it('should not merge buffer when offset is non-zero', async () => {
      mockReq.query = { limit: '5', offset: '5' };

      mockGetSessionMessages.mockResolvedValue({
        messages: [
          makeMsg('1', '2026-01-01T00:01:00Z'),
          makeMsg('2', '2026-01-01T00:02:00Z'),
        ],
        pagination: { total: 10, limit: 5, offset: 5, hasMore: false },
        lastAgentCommand: null,
      });

      // Buffer exists but should NOT be merged for offset > 0
      mockGetCompletedBuffer.mockReturnValue([{ event: 'done', data: {}, ts: 0 }]);
      mockTransformBufferToHistoryMessages.mockReturnValue([
        makeMsg('99', '2026-01-01T00:99:00Z'),
      ]);

      await sessionController.getMessages(mockReq as Request, mockRes as Response);

      const result = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(result.messages).toHaveLength(2); // no merge
      expect(result.pagination.total).toBe(10); // unchanged
    });
  });
});
