/**
 * Sessions Routes Unit Tests
 * [Source: Story 3.3 - Task 4, Story 3.5 - Task 3]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { SessionListItem, HistoryMessage, PaginationInfo } from '@bmad-studio/shared';

// Create hoisted mocks for sessionService
const { mockListSessionsBySlug, mockGetSessionMessages, mockIsValidPathParam, mockReadSessionNamesBySlug, mockGetActiveStreamSessionIds } = vi.hoisted(() => ({
  mockListSessionsBySlug: vi.fn(),
  mockGetSessionMessages: vi.fn(),
  mockIsValidPathParam: vi.fn(),
  mockReadSessionNamesBySlug: vi.fn().mockResolvedValue({}),
  mockGetActiveStreamSessionIds: vi.fn().mockReturnValue([]),
}));

// Mock sessionService
vi.mock('../../services/sessionService', () => ({
  sessionService: {
    listSessionsBySlug: mockListSessionsBySlug,
    getSessionMessages: mockGetSessionMessages,
    isValidPathParam: mockIsValidPathParam,
  },
}));

// Mock projectService (needed by sessionController for search params)
vi.mock('../../services/projectService', () => ({
  projectService: {
    readSessionNamesBySlug: mockReadSessionNamesBySlug,
    readPromptHistoryBySlug: vi.fn().mockResolvedValue({ entries: [] }),
    writePromptHistoryBySlug: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock websocket handler
vi.mock('../../handlers/websocket', () => ({
  getActiveStreamSessionIds: mockGetActiveStreamSessionIds,
}));

import sessionsRoutes from '../sessions';

describe('Sessions Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => { req.t = (key: string) => key; req.language = 'en'; next(); });
    app.use('/api/projects', sessionsRoutes);
    vi.clearAllMocks();
    // Default: path params are valid
    mockIsValidPathParam.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/projects/:projectSlug/sessions', () => {
    it('should return 200 with sessions array', async () => {
      const mockSessions: SessionListItem[] = [
        {
          sessionId: 's1',
          firstPrompt: 'Test prompt',
          messageCount: 5,
          created: '2026-01-15T09:30:00Z',
          modified: '2026-01-31T14:22:00Z',
        },
      ];
      mockListSessionsBySlug.mockResolvedValue({ sessions: mockSessions, total: 1 });

      const response = await request(app)
        .get('/api/projects/test-project/sessions')
        .expect(200);

      expect(response.body.sessions).toEqual(mockSessions);
      expect(mockListSessionsBySlug).toHaveBeenCalledWith('test-project', expect.objectContaining({
        includeEmpty: false,
        limit: 0,
        offset: 0,
      }));
    });

    it('should return 200 with empty array when no sessions', async () => {
      mockListSessionsBySlug.mockResolvedValue({ sessions: [], total: 0 });

      const response = await request(app)
        .get('/api/projects/empty-project/sessions')
        .expect(200);

      expect(response.body.sessions).toEqual([]);
    });

    it('should return 404 for non-existent project', async () => {
      mockListSessionsBySlug.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/projects/nonexistent/sessions')
        .expect(404);

      expect(response.body).toEqual({
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'session.error.projectNotFound',
        },
      });
    });

    it('should return 500 on service error', async () => {
      mockListSessionsBySlug.mockRejectedValue(new Error('Unknown error'));

      const response = await request(app)
        .get('/api/projects/error-project/sessions')
        .expect(500);

      expect(response.body).toEqual({
        error: {
          code: 'SESSION_LIST_ERROR',
          message: 'session.error.listError',
        },
      });
    });

    it('should handle projectSlug with special characters', async () => {
      mockListSessionsBySlug.mockResolvedValue({ sessions: [], total: 0 });

      await request(app)
        .get('/api/projects/D--repo-my-project/sessions')
        .expect(200);

      expect(mockListSessionsBySlug).toHaveBeenCalledWith('D--repo-my-project', expect.objectContaining({
        includeEmpty: false,
      }));
    });
  });

  // Story 3.5: Session History Loading tests
  describe('GET /api/projects/:projectSlug/sessions/:sessionId/messages', () => {
    const mockMessages: HistoryMessage[] = [
      {
        id: 'msg-1',
        type: 'user',
        content: 'Hello',
        timestamp: '2026-01-15T10:00:00Z',
      },
      {
        id: 'msg-2',
        type: 'assistant',
        content: 'Hi! How can I help?',
        timestamp: '2026-01-15T10:00:05Z',
      },
    ];

    const mockPagination: PaginationInfo = {
      total: 2,
      limit: 50,
      offset: 0,
      hasMore: false,
    };

    it('should return 200 with messages array', async () => {
      mockGetSessionMessages.mockResolvedValue({
        messages: mockMessages,
        pagination: mockPagination,
      });

      const response = await request(app)
        .get('/api/projects/test-project/sessions/session-123/messages')
        .expect(200);

      expect(response.body).toEqual({
        messages: mockMessages,
        pagination: mockPagination,
      });
      expect(mockGetSessionMessages).toHaveBeenCalledWith('test-project', 'session-123', {
        limit: 50,
        offset: 0,
      });
    });

    it('should handle custom limit and offset', async () => {
      mockGetSessionMessages.mockResolvedValue({
        messages: mockMessages,
        pagination: { ...mockPagination, limit: 10, offset: 20 },
      });

      const response = await request(app)
        .get('/api/projects/test-project/sessions/session-123/messages?limit=10&offset=20')
        .expect(200);

      expect(mockGetSessionMessages).toHaveBeenCalledWith('test-project', 'session-123', {
        limit: 10,
        offset: 20,
      });
      expect(response.body.pagination.limit).toBe(10);
      expect(response.body.pagination.offset).toBe(20);
    });

    it('should cap limit at 100', async () => {
      mockGetSessionMessages.mockResolvedValue({
        messages: mockMessages,
        pagination: { ...mockPagination, limit: 100 },
      });

      await request(app)
        .get('/api/projects/test-project/sessions/session-123/messages?limit=200')
        .expect(200);

      expect(mockGetSessionMessages).toHaveBeenCalledWith('test-project', 'session-123', {
        limit: 100,
        offset: 0,
      });
    });

    it('should handle negative offset as 0', async () => {
      mockGetSessionMessages.mockResolvedValue({
        messages: mockMessages,
        pagination: mockPagination,
      });

      await request(app)
        .get('/api/projects/test-project/sessions/session-123/messages?offset=-10')
        .expect(200);

      expect(mockGetSessionMessages).toHaveBeenCalledWith('test-project', 'session-123', {
        limit: 50,
        offset: 0,
      });
    });

    it('should return 200 with empty messages for non-existent session', async () => {
      mockGetSessionMessages.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/projects/test-project/sessions/nonexistent/messages')
        .expect(200);

      expect(response.body.messages).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return 400 for invalid path param in projectSlug', async () => {
      // Using a valid URL format but mock returns invalid
      mockIsValidPathParam.mockReturnValueOnce(false);

      const response = await request(app)
        .get('/api/projects/invalid..slug/sessions/session-123/messages')
        .expect(400);

      expect(response.body).toEqual({
        error: {
          code: 'INVALID_PATH',
          message: 'session.error.invalidPath',
        },
      });
    });

    it('should return 400 for invalid path param in sessionId', async () => {
      mockIsValidPathParam
        .mockReturnValueOnce(true) // projectSlug is valid
        .mockReturnValueOnce(false); // sessionId is invalid

      const response = await request(app)
        .get('/api/projects/test-project/sessions/invalid..session/messages')
        .expect(400);

      expect(response.body).toEqual({
        error: {
          code: 'INVALID_PATH',
          message: 'session.error.invalidPath',
        },
      });
    });

    it('should return 500 on service error', async () => {
      mockGetSessionMessages.mockRejectedValue(new Error('Parse error'));

      const response = await request(app)
        .get('/api/projects/test-project/sessions/session-123/messages')
        .expect(500);

      expect(response.body).toEqual({
        error: {
          code: 'SESSION_PARSE_ERROR',
          message: 'session.error.parseError',
        },
      });
    });

    it('should return messages with tool_use and tool_result', async () => {
      const messagesWithTools: HistoryMessage[] = [
        {
          id: 'msg-1',
          type: 'user',
          content: 'Read a file',
          timestamp: '2026-01-15T10:00:00Z',
        },
        {
          id: 'msg-2',
          type: 'tool_use',
          content: 'Calling Read',
          timestamp: '2026-01-15T10:00:05Z',
          toolName: 'Read',
          toolInput: { file_path: '/index.ts' },
        },
        {
          id: 'msg-3',
          type: 'tool_result',
          content: 'file content',
          timestamp: '2026-01-15T10:00:06Z',
          toolResult: {
            success: true,
            output: 'file content',
          },
        },
      ];

      mockGetSessionMessages.mockResolvedValue({
        messages: messagesWithTools,
        pagination: { total: 3, limit: 50, offset: 0, hasMore: false },
      });

      const response = await request(app)
        .get('/api/projects/test-project/sessions/session-123/messages')
        .expect(200);

      expect(response.body.messages).toHaveLength(3);
      expect(response.body.messages[1].toolName).toBe('Read');
      expect(response.body.messages[2].toolResult.success).toBe(true);
    });
  });
});
