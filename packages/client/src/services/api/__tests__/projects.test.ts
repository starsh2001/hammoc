/**
 * Projects API Tests
 * [Source: Story 3.2 - Task 1]
 * [Extended: Story 3.6 - Task 4: Project creation API tests]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { projectsApi } from '../projects';
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

describe('projectsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('list', () => {
    it('should call GET /projects and return project list', async () => {
      const mockResponse = {
        projects: [
          {
            originalPath: '/Users/user/my-project',
            projectSlug: 'abc123',
            sessionCount: 5,
            lastModified: '2026-02-01T10:00:00Z',
            isBmadProject: true,
          },
          {
            originalPath: '/Users/user/another-project',
            projectSlug: 'def456',
            sessionCount: 2,
            lastModified: '2026-01-31T15:00:00Z',
            isBmadProject: false,
          },
        ],
      };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await projectsApi.list();

      expect(api.get).toHaveBeenCalledWith('/projects');
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
      expect(result.projects).toHaveLength(2);
    });

    it('should return empty projects array when no projects exist', async () => {
      const mockResponse = { projects: [] };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await projectsApi.list();

      expect(api.get).toHaveBeenCalledWith('/projects');
      expect(result.projects).toHaveLength(0);
    });

    it('should propagate ApiError from server', async () => {
      const apiError = new ApiError(
        500,
        'PROJECT_SCAN_ERROR',
        '프로젝트 목록을 가져오는 중 오류가 발생했습니다.'
      );

      vi.mocked(api.get).mockRejectedValue(apiError);

      await expect(projectsApi.list()).rejects.toThrow(ApiError);
      await expect(projectsApi.list()).rejects.toMatchObject({
        status: 500,
        code: 'PROJECT_SCAN_ERROR',
      });
    });

    it('should propagate network errors', async () => {
      const networkError = new Error('Network error');

      vi.mocked(api.get).mockRejectedValue(networkError);

      await expect(projectsApi.list()).rejects.toThrow('Network error');
    });
  });

  // Story 3.6 - Task 4: Project creation tests
  describe('create', () => {
    it('should call POST /projects with request data', async () => {
      const mockResponse = {
        project: {
          originalPath: '/Users/test/new-project',
          projectSlug: 'new-hash',
          sessionCount: 0,
          lastModified: '2026-02-02T10:00:00Z',
          isBmadProject: true,
        },
        isExisting: false,
      };

      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await projectsApi.create({
        path: '/Users/test/new-project',
        setupBmad: true,
      });

      expect(api.post).toHaveBeenCalledWith(
        '/projects',
        { path: '/Users/test/new-project', setupBmad: true },
        undefined
      );
      expect(result).toEqual(mockResponse);
      expect(result.isExisting).toBe(false);
    });

    it('should support AbortSignal option', async () => {
      const mockResponse = {
        project: {
          originalPath: '/Users/test/project',
          projectSlug: 'hash',
          sessionCount: 0,
          lastModified: '2026-02-02T10:00:00Z',
          isBmadProject: false,
        },
        isExisting: false,
      };

      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const controller = new AbortController();
      await projectsApi.create({ path: '/Users/test/project' }, { signal: controller.signal });

      expect(api.post).toHaveBeenCalledWith(
        '/projects',
        { path: '/Users/test/project' },
        { signal: controller.signal }
      );
    });

    it('should return isExisting=true for existing project', async () => {
      const mockResponse = {
        project: {
          originalPath: '/Users/test/existing',
          projectSlug: 'existing-hash',
          sessionCount: 5,
          lastModified: '2026-01-30T10:00:00Z',
          isBmadProject: true,
        },
        isExisting: true,
      };

      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await projectsApi.create({ path: '/Users/test/existing' });

      expect(result.isExisting).toBe(true);
    });

    it('should propagate ApiError for invalid path', async () => {
      const apiError = new ApiError(400, 'INVALID_PATH_FORMAT', '경로 형식이 올바르지 않습니다.');

      vi.mocked(api.post).mockRejectedValue(apiError);

      await expect(projectsApi.create({ path: '../invalid' })).rejects.toThrow(ApiError);
      await expect(projectsApi.create({ path: '../invalid' })).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_PATH_FORMAT',
      });
    });
  });

  describe('validatePath', () => {
    it('should call POST /projects/validate-path with path', async () => {
      const mockResponse = {
        valid: true,
        exists: true,
        isProject: false,
      };

      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await projectsApi.validatePath('/Users/test/project');

      expect(api.post).toHaveBeenCalledWith(
        '/projects/validate-path',
        { path: '/Users/test/project' },
        undefined
      );
      expect(result).toEqual(mockResponse);
    });

    it('should return isProject=true with slug for existing project', async () => {
      const mockResponse = {
        valid: true,
        exists: true,
        isProject: true,
        projectSlug: 'existing-hash',
      };

      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await projectsApi.validatePath('/Users/test/existing');

      expect(result.isProject).toBe(true);
      expect(result.projectSlug).toBe('existing-hash');
    });

    it('should return validation error for non-existent path', async () => {
      const mockResponse = {
        valid: false,
        exists: false,
        isProject: false,
        error: '지정한 경로가 존재하지 않습니다.',
      };

      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await projectsApi.validatePath('/non/existent');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('존재하지 않습니다');
    });

    it('should support AbortSignal option', async () => {
      vi.mocked(api.post).mockResolvedValue({ valid: true, exists: true, isProject: false });

      const controller = new AbortController();
      await projectsApi.validatePath('/test', { signal: controller.signal });

      expect(api.post).toHaveBeenCalledWith(
        '/projects/validate-path',
        { path: '/test' },
        { signal: controller.signal }
      );
    });
  });
});
