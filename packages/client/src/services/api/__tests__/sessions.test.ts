/**
 * Sessions API Tests
 * [Source: Story 3.4 - Task 1, Story 3.5 - Task 4]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sessionsApi } from '../sessions';
import { api, ApiError } from '../client';

// Mock the API client
vi.mock('../client', async () => {
  const actual = await vi.importActual('../client');
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

describe('sessionsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('list', () => {
    it('should call GET /projects/:projectSlug/sessions and return session list', async () => {
      const mockResponse = {
        sessions: [
          {
            sessionId: 'session-123',
            firstPrompt: '프로젝트 구조를 설명해줘',
            messageCount: 15,
            created: '2026-01-15T09:30:00Z',
            modified: '2026-01-31T14:22:00Z',
          },
          {
            sessionId: 'session-456',
            firstPrompt: 'React 컴포넌트를 작성해줘',
            messageCount: 8,
            created: '2026-01-20T10:00:00Z',
            modified: '2026-01-30T12:00:00Z',
          },
        ],
      };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await sessionsApi.list('my-project');

      expect(api.get).toHaveBeenCalledWith('/projects/my-project/sessions');
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
      expect(result.sessions).toHaveLength(2);
    });

    it('should return empty sessions array when no sessions exist', async () => {
      const mockResponse = { sessions: [] };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await sessionsApi.list('empty-project');

      expect(api.get).toHaveBeenCalledWith('/projects/empty-project/sessions');
      expect(result.sessions).toHaveLength(0);
    });

    it('should propagate 404 ApiError when project not found', async () => {
      const apiError = new ApiError(
        404,
        'PROJECT_NOT_FOUND',
        '프로젝트를 찾을 수 없습니다.'
      );

      vi.mocked(api.get).mockRejectedValue(apiError);

      await expect(sessionsApi.list('nonexistent')).rejects.toThrow(ApiError);
      await expect(sessionsApi.list('nonexistent')).rejects.toMatchObject({
        status: 404,
        code: 'PROJECT_NOT_FOUND',
      });
    });

    it('should propagate 500 ApiError from server', async () => {
      const apiError = new ApiError(
        500,
        'SESSION_LIST_ERROR',
        '세션 목록을 가져오는 중 오류가 발생했습니다.'
      );

      vi.mocked(api.get).mockRejectedValue(apiError);

      await expect(sessionsApi.list('my-project')).rejects.toThrow(ApiError);
      await expect(sessionsApi.list('my-project')).rejects.toMatchObject({
        status: 500,
        code: 'SESSION_LIST_ERROR',
      });
    });

    it('should propagate network errors', async () => {
      const networkError = new TypeError('Failed to fetch');

      vi.mocked(api.get).mockRejectedValue(networkError);

      await expect(sessionsApi.list('my-project')).rejects.toThrow(
        'Failed to fetch'
      );
    });

    it('should handle special characters in projectSlug', async () => {
      const mockResponse = { sessions: [] };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await sessionsApi.list('my-project-123');

      expect(api.get).toHaveBeenCalledWith('/projects/my-project-123/sessions');
    });
  });

  // Story 3.5: Session History Loading tests
  describe('getMessages', () => {
    const mockMessagesResponse = {
      messages: [
        {
          id: 'msg-1',
          type: 'user',
          content: 'Hello',
          timestamp: '2026-01-15T10:00:00Z',
        },
        {
          id: 'msg-2',
          type: 'assistant',
          content: 'Hi! How can I help you?',
          timestamp: '2026-01-15T10:00:05Z',
        },
      ],
      pagination: {
        total: 2,
        limit: 50,
        offset: 0,
        hasMore: false,
      },
    };

    it('should call GET /projects/:projectSlug/sessions/:sessionId/messages', async () => {
      vi.mocked(api.get).mockResolvedValue(mockMessagesResponse);

      const result = await sessionsApi.getMessages('my-project', 'session-123');

      expect(api.get).toHaveBeenCalledWith(
        '/projects/my-project/sessions/session-123/messages'
      );
      expect(result).toEqual(mockMessagesResponse);
      expect(result.messages).toHaveLength(2);
    });

    it('should include limit and offset query params when provided', async () => {
      vi.mocked(api.get).mockResolvedValue(mockMessagesResponse);

      await sessionsApi.getMessages('my-project', 'session-123', {
        limit: 10,
        offset: 20,
      });

      expect(api.get).toHaveBeenCalledWith(
        '/projects/my-project/sessions/session-123/messages?limit=10&offset=20'
      );
    });

    it('should include only limit when offset is not provided', async () => {
      vi.mocked(api.get).mockResolvedValue(mockMessagesResponse);

      await sessionsApi.getMessages('my-project', 'session-123', { limit: 25 });

      expect(api.get).toHaveBeenCalledWith(
        '/projects/my-project/sessions/session-123/messages?limit=25'
      );
    });

    it('should include only offset when limit is not provided', async () => {
      vi.mocked(api.get).mockResolvedValue(mockMessagesResponse);

      await sessionsApi.getMessages('my-project', 'session-123', { offset: 50 });

      expect(api.get).toHaveBeenCalledWith(
        '/projects/my-project/sessions/session-123/messages?offset=50'
      );
    });

    it('should propagate 404 ApiError when session not found', async () => {
      const apiError = new ApiError(
        404,
        'SESSION_NOT_FOUND',
        '세션을 찾을 수 없습니다.'
      );

      vi.mocked(api.get).mockRejectedValue(apiError);

      await expect(
        sessionsApi.getMessages('my-project', 'nonexistent')
      ).rejects.toThrow(ApiError);
      await expect(
        sessionsApi.getMessages('my-project', 'nonexistent')
      ).rejects.toMatchObject({
        status: 404,
        code: 'SESSION_NOT_FOUND',
      });
    });

    it('should propagate 400 ApiError for invalid path', async () => {
      const apiError = new ApiError(
        400,
        'INVALID_PATH',
        '잘못된 경로 파라미터입니다.'
      );

      vi.mocked(api.get).mockRejectedValue(apiError);

      await expect(
        sessionsApi.getMessages('invalid..slug', 'session-123')
      ).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_PATH',
      });
    });

    it('should return messages with tool_use and tool_result', async () => {
      const messagesWithTools = {
        messages: [
          {
            id: 'msg-1',
            type: 'tool_use',
            content: 'Calling Read',
            timestamp: '2026-01-15T10:00:00Z',
            toolName: 'Read',
            toolInput: { file_path: '/index.ts' },
          },
          {
            id: 'msg-2',
            type: 'tool_result',
            content: 'file content',
            timestamp: '2026-01-15T10:00:01Z',
            toolResult: {
              success: true,
              output: 'file content',
            },
          },
        ],
        pagination: { total: 2, limit: 50, offset: 0, hasMore: false },
      };

      vi.mocked(api.get).mockResolvedValue(messagesWithTools);

      const result = await sessionsApi.getMessages('my-project', 'session-123');

      expect(result.messages[0].toolName).toBe('Read');
      expect(result.messages[1].toolResult?.success).toBe(true);
    });
  });
});
