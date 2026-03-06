/**
 * Session Controller Tests
 * [Source: Story 3.3 - Task 3]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import { SESSION_ERRORS } from '@bmad-studio/shared';

// Create hoisted mocks
const { mockListSessionsBySlug, mockIsValidPathParam, mockReadSessionNamesBySlug, mockGetActiveStreamSessionIds } = vi.hoisted(() => ({
  mockListSessionsBySlug: vi.fn(),
  mockIsValidPathParam: vi.fn(() => true),
  mockReadSessionNamesBySlug: vi.fn(),
  mockGetActiveStreamSessionIds: vi.fn(),
}));

// Mock sessionService
vi.mock('../../services/sessionService', () => ({
  sessionService: {
    listSessionsBySlug: mockListSessionsBySlug,
    isValidPathParam: mockIsValidPathParam,
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
}));

import { sessionController } from '../sessionController';

describe('sessionController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
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

    // Default mocks for supporting services
    mockGetActiveStreamSessionIds.mockReturnValue([]);
    mockReadSessionNamesBySlug.mockResolvedValue({});

    vi.clearAllMocks();
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
});
