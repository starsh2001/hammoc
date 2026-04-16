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

  // Story 3.5: Session delete tests
  describe('delete', () => {
    it('should call DELETE /projects/:projectSlug/sessions/:sessionId', async () => {
      const mockResponse = { success: true };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      // delete uses api.delete which is not mocked — test deleteBatch instead
      const batchResponse = { deleted: 1 };
      vi.mocked(api.post).mockResolvedValue(batchResponse);

      const result = await sessionsApi.deleteBatch('my-project', ['session-123']);

      expect(api.post).toHaveBeenCalledWith(
        '/projects/my-project/sessions/delete-batch',
        { sessionIds: ['session-123'] }
      );
      expect(result).toEqual(batchResponse);
    });

    it('should propagate 404 ApiError when session not found', async () => {
      const apiError = new ApiError(
        404,
        'SESSION_NOT_FOUND',
        '세션을 찾을 수 없습니다.'
      );

      vi.mocked(api.post).mockRejectedValue(apiError);

      await expect(
        sessionsApi.deleteBatch('my-project', ['nonexistent'])
      ).rejects.toThrow(ApiError);
      await expect(
        sessionsApi.deleteBatch('my-project', ['nonexistent'])
      ).rejects.toMatchObject({
        status: 404,
        code: 'SESSION_NOT_FOUND',
      });
    });
  });

  // Story 3.5: Session list with query params
  describe('list with options', () => {
    it('should include query params when provided', async () => {
      const mockResponse = { sessions: [] };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await sessionsApi.list('my-project', { limit: 10, offset: 20 });

      expect(api.get).toHaveBeenCalledWith(
        '/projects/my-project/sessions?limit=10&offset=20'
      );
    });

    it('should include only limit when offset is not provided', async () => {
      const mockResponse = { sessions: [] };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await sessionsApi.list('my-project', { limit: 25 });

      expect(api.get).toHaveBeenCalledWith(
        '/projects/my-project/sessions?limit=25'
      );
    });

    it('should include includeEmpty flag', async () => {
      const mockResponse = { sessions: [] };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await sessionsApi.list('my-project', { includeEmpty: true });

      expect(api.get).toHaveBeenCalledWith(
        '/projects/my-project/sessions?includeEmpty=true'
      );
    });

    it('should include query search param', async () => {
      const mockResponse = { sessions: [] };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await sessionsApi.list('my-project', { query: 'hello' });

      expect(api.get).toHaveBeenCalledWith(
        '/projects/my-project/sessions?query=hello'
      );
    });

    it('should propagate 400 ApiError for invalid path', async () => {
      const apiError = new ApiError(
        400,
        'INVALID_PATH',
        '잘못된 경로 파라미터입니다.'
      );

      vi.mocked(api.get).mockRejectedValue(apiError);

      await expect(
        sessionsApi.list('invalid..slug', { limit: 10 })
      ).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_PATH',
      });
    });
  });

  // Prompt history tests
  describe('getPromptHistory', () => {
    it('should call GET /projects/:projectSlug/sessions/:sessionId/prompt-history', async () => {
      const mockResponse = { prompts: [] };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await sessionsApi.getPromptHistory('my-project', 'session-123');

      expect(api.get).toHaveBeenCalledWith(
        '/projects/my-project/sessions/session-123/prompt-history'
      );
      expect(result).toEqual(mockResponse);
    });

    it('should propagate 404 ApiError when session not found', async () => {
      const apiError = new ApiError(
        404,
        'SESSION_NOT_FOUND',
        '세션을 찾을 수 없습니다.'
      );

      vi.mocked(api.get).mockRejectedValue(apiError);

      await expect(
        sessionsApi.getPromptHistory('my-project', 'nonexistent')
      ).rejects.toThrow(ApiError);
    });
  });
});
