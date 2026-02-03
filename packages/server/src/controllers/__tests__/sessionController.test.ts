/**
 * Session Controller Tests
 * [Source: Story 3.3 - Task 3]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import { SESSION_ERRORS } from '@bmad-studio/shared';

// Create hoisted mock for sessionService
const { mockListSessionsBySlug } = vi.hoisted(() => ({
  mockListSessionsBySlug: vi.fn(),
}));

// Mock sessionService
vi.mock('../../services/sessionService', () => ({
  sessionService: {
    listSessionsBySlug: mockListSessionsBySlug,
  },
}));

import { sessionController } from '../sessionController';

describe('sessionController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      params: { projectSlug: 'test-project' },
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

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
      mockListSessionsBySlug.mockResolvedValue(mockSessions);

      await sessionController.list(mockReq as Request, mockRes as Response);

      expect(mockListSessionsBySlug).toHaveBeenCalledWith('test-project');
      expect(mockRes.json).toHaveBeenCalledWith({
        sessions: mockSessions,
      });
    });

    it('should return 200 with empty session list', async () => {
      mockListSessionsBySlug.mockResolvedValue([]);

      await sessionController.list(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        sessions: [],
      });
    });

    it('should return 404 for non-existent project', async () => {
      mockListSessionsBySlug.mockResolvedValue(null);

      await sessionController.list(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(SESSION_ERRORS.PROJECT_NOT_FOUND.httpStatus);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: SESSION_ERRORS.PROJECT_NOT_FOUND.code,
          message: SESSION_ERRORS.PROJECT_NOT_FOUND.message,
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
          message: SESSION_ERRORS.SESSION_LIST_ERROR.message,
        },
      });
    });

    it('should use projectSlug from request params', async () => {
      mockReq.params = { projectSlug: 'my-custom-project-slug' };
      mockListSessionsBySlug.mockResolvedValue([]);

      await sessionController.list(mockReq as Request, mockRes as Response);

      expect(mockListSessionsBySlug).toHaveBeenCalledWith('my-custom-project-slug');
    });
  });
});
