/**
 * Project Store Tests
 * [Source: Story 3.2 - Task 2]
 * [Extended: Story 3.6 - Task 5: Project creation tests]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useProjectStore } from '../projectStore';
import { ApiError } from '../../services/api/client';

// Mock the projects API
vi.mock('../../services/api/projects', () => ({
  projectsApi: {
    list: vi.fn(),
    create: vi.fn(),
    validatePath: vi.fn(),
  },
}));

import { projectsApi } from '../../services/api/projects';

describe('useProjectStore', () => {
  beforeEach(() => {
    // Reset store state
    useProjectStore.setState({
      projects: [],
      isLoading: false,
      error: null,
      // Story 3.6 - Project creation state
      isCreating: false,
      createError: null,
      pathValidation: null,
      isValidating: false,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useProjectStore.getState();
      expect(state.projects).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('fetchProjects', () => {
    it('should fetch projects successfully', async () => {
      const mockProjects = [
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
      ];

      vi.mocked(projectsApi.list).mockResolvedValue({ projects: mockProjects });

      await useProjectStore.getState().fetchProjects();

      expect(useProjectStore.getState().projects).toEqual(mockProjects);
      expect(useProjectStore.getState().isLoading).toBe(false);
      expect(useProjectStore.getState().error).toBeNull();
    });

    it('should handle empty projects list', async () => {
      vi.mocked(projectsApi.list).mockResolvedValue({ projects: [] });

      await useProjectStore.getState().fetchProjects();

      expect(useProjectStore.getState().projects).toEqual([]);
      expect(useProjectStore.getState().isLoading).toBe(false);
      expect(useProjectStore.getState().error).toBeNull();
    });

    it('should set isLoading during fetch', async () => {
      let resolvePromise: (value: { projects: [] }) => void;
      vi.mocked(projectsApi.list).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve;
          })
      );

      // Start fetch
      const fetchPromise = useProjectStore.getState().fetchProjects();

      // Check loading state
      expect(useProjectStore.getState().isLoading).toBe(true);
      expect(useProjectStore.getState().error).toBeNull();

      // Resolve promise
      resolvePromise!({ projects: [] });
      await fetchPromise;

      // Check state after completion
      expect(useProjectStore.getState().isLoading).toBe(false);
    });

    it('should handle ApiError', async () => {
      vi.mocked(projectsApi.list).mockRejectedValue(
        new ApiError(500, 'PROJECT_SCAN_ERROR', '프로젝트 스캔 중 오류 발생')
      );

      await useProjectStore.getState().fetchProjects();

      expect(useProjectStore.getState().projects).toEqual([]);
      expect(useProjectStore.getState().isLoading).toBe(false);
      expect(useProjectStore.getState().error).toBe('프로젝트 스캔 중 오류 발생');
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(projectsApi.list).mockRejectedValue(new Error('Network error'));

      await useProjectStore.getState().fetchProjects();

      expect(useProjectStore.getState().projects).toEqual([]);
      expect(useProjectStore.getState().isLoading).toBe(false);
      expect(useProjectStore.getState().error).toBe('프로젝트 목록을 불러오는 중 오류가 발생했습니다.');
    });

    it('should clear previous error on new fetch', async () => {
      // Set error state
      useProjectStore.setState({ error: 'Previous error' });

      vi.mocked(projectsApi.list).mockResolvedValue({ projects: [] });

      await useProjectStore.getState().fetchProjects();

      expect(useProjectStore.getState().error).toBeNull();
    });
  });

  describe('clearError', () => {
    it('should clear error', () => {
      useProjectStore.setState({ error: 'Some error' });

      useProjectStore.getState().clearError();

      expect(useProjectStore.getState().error).toBeNull();
    });
  });

  // Story 3.6 - Task 5: Project Creation Tests
  describe('createProject', () => {
    it('should create project successfully', async () => {
      const mockResult = {
        project: {
          originalPath: '/Users/test/new-project',
          projectSlug: 'new-hash',
          sessionCount: 0,
          lastModified: '2026-02-02T10:00:00Z',
          isBmadProject: true,
        },
        isExisting: false,
      };

      vi.mocked(projectsApi.create).mockResolvedValue(mockResult);
      vi.mocked(projectsApi.list).mockResolvedValue({ projects: [mockResult.project] });

      const result = await useProjectStore.getState().createProject('/Users/test/new-project', true);

      expect(result).toEqual(mockResult);
      expect(useProjectStore.getState().isCreating).toBe(false);
      expect(useProjectStore.getState().createError).toBeNull();
      // Should refresh projects
      expect(projectsApi.list).toHaveBeenCalled();
    });

    it('should set isCreating during creation', async () => {
      let resolvePromise: (
        value: import('@bmad-studio/shared').CreateProjectResponse
      ) => void;
      vi.mocked(projectsApi.create).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve;
          })
      );

      const createPromise = useProjectStore.getState().createProject('/test', false);

      expect(useProjectStore.getState().isCreating).toBe(true);

      resolvePromise!({
        project: {
          originalPath: '/test',
          projectSlug: 'test',
          sessionCount: 0,
          lastModified: '2026-01-01',
          isBmadProject: false,
        },
        isExisting: false,
      });
      vi.mocked(projectsApi.list).mockResolvedValue({ projects: [] });
      await createPromise;

      expect(useProjectStore.getState().isCreating).toBe(false);
    });

    it('should handle ApiError', async () => {
      vi.mocked(projectsApi.create).mockRejectedValue(
        new ApiError(400, 'INVALID_PATH', '경로가 유효하지 않습니다.')
      );

      const result = await useProjectStore.getState().createProject('../invalid', false);

      expect(result).toBeNull();
      expect(useProjectStore.getState().createError).toBe('경로가 유효하지 않습니다.');
      expect(useProjectStore.getState().isCreating).toBe(false);
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(projectsApi.create).mockRejectedValue(new Error('Network error'));

      const result = await useProjectStore.getState().createProject('/test', true);

      expect(result).toBeNull();
      expect(useProjectStore.getState().createError).toBe('프로젝트 생성 중 오류가 발생했습니다.');
    });
  });

  describe('validatePath', () => {
    it('should validate path successfully', async () => {
      const mockResult = {
        valid: true,
        exists: true,
        isProject: false,
      };

      vi.mocked(projectsApi.validatePath).mockResolvedValue(mockResult);

      const result = await useProjectStore.getState().validatePath('/Users/test/project');

      expect(result).toEqual(mockResult);
      expect(useProjectStore.getState().pathValidation).toEqual(mockResult);
      expect(useProjectStore.getState().isValidating).toBe(false);
    });

    it('should set isValidating during validation', async () => {
      let resolvePromise: (
        value: import('@bmad-studio/shared').ValidatePathResponse
      ) => void;
      vi.mocked(projectsApi.validatePath).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve;
          })
      );

      const validatePromise = useProjectStore.getState().validatePath('/test');

      expect(useProjectStore.getState().isValidating).toBe(true);

      resolvePromise!({ valid: true, exists: true, isProject: false });
      await validatePromise;

      expect(useProjectStore.getState().isValidating).toBe(false);
    });

    it('should return error for existing project', async () => {
      const mockResult = {
        valid: true,
        exists: true,
        isProject: true,
        projectSlug: 'existing-hash',
      };

      vi.mocked(projectsApi.validatePath).mockResolvedValue(mockResult);

      const result = await useProjectStore.getState().validatePath('/existing');

      expect(result.isProject).toBe(true);
      expect(result.projectSlug).toBe('existing-hash');
    });

    it('should handle validation errors', async () => {
      vi.mocked(projectsApi.validatePath).mockRejectedValue(new Error('Network error'));

      const result = await useProjectStore.getState().validatePath('/test');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('경로 검증 중 오류가 발생했습니다.');
    });
  });

  describe('clearCreateError', () => {
    it('should clear create error', () => {
      useProjectStore.setState({ createError: 'Some error' });

      useProjectStore.getState().clearCreateError();

      expect(useProjectStore.getState().createError).toBeNull();
    });
  });

  describe('clearPathValidation', () => {
    it('should clear path validation', () => {
      useProjectStore.setState({ pathValidation: { valid: true, exists: true, isProject: false } });

      useProjectStore.getState().clearPathValidation();

      expect(useProjectStore.getState().pathValidation).toBeNull();
    });
  });

  describe('abortCreation', () => {
    it('should do nothing when no creation in progress', () => {
      // When no AbortController is set (no creation in progress)
      useProjectStore.setState({ isCreating: false, createError: null });

      useProjectStore.getState().abortCreation();

      // State should remain unchanged
      expect(useProjectStore.getState().isCreating).toBe(false);
      expect(useProjectStore.getState().createError).toBeNull();
    });

    it('should abort ongoing creation request', async () => {
      // Start a creation that never resolves
      let rejectPromise: (reason?: unknown) => void;
      vi.mocked(projectsApi.create).mockImplementation(
        () =>
          new Promise((_, reject) => {
            rejectPromise = reject;
          })
      );

      // Start creation
      const createPromise = useProjectStore.getState().createProject('/test', false);

      // Verify isCreating is true
      expect(useProjectStore.getState().isCreating).toBe(true);

      // Abort the creation
      useProjectStore.getState().abortCreation();

      // Simulate abort error from the API
      rejectPromise!(new DOMException('Aborted', 'AbortError'));

      await createPromise;

      // After abort, isCreating should be false and error message should be set
      expect(useProjectStore.getState().isCreating).toBe(false);
    });
  });
});
