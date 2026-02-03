/**
 * Projects Routes Unit Tests
 * [Source: Story 3.1 - Task 4]
 * [Extended: Story 3.6 - Task 3: Project creation tests]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { ProjectInfo, ValidatePathResponse } from '@bmad-studio/shared';

// Create hoisted mocks for projectService
const { mockScanProjects, mockCreateProject, mockValidatePath } = vi.hoisted(() => ({
  mockScanProjects: vi.fn(),
  mockCreateProject: vi.fn(),
  mockValidatePath: vi.fn(),
}));

// Mock projectService
vi.mock('../../services/projectService', () => ({
  projectService: {
    scanProjects: mockScanProjects,
    createProject: mockCreateProject,
    validatePath: mockValidatePath,
  },
}));

import projectsRoutes from '../projects';

describe('Projects Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/projects', projectsRoutes);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/projects', () => {
    it('should return 200 with projects array', async () => {
      const mockProjects: ProjectInfo[] = [
        {
          originalPath: '/Users/test/project1',
          projectSlug: 'project-hash-1',
          sessionCount: 5,
          lastModified: '2026-01-30T10:00:00Z',
          isBmadProject: true,
        },
      ];
      mockScanProjects.mockResolvedValue(mockProjects);

      const response = await request(app).get('/api/projects').expect(200);

      expect(response.body).toEqual({ projects: mockProjects });
    });

    it('should return 200 with empty array when no projects', async () => {
      mockScanProjects.mockResolvedValue([]);

      const response = await request(app).get('/api/projects').expect(200);

      expect(response.body).toEqual({ projects: [] });
    });

    it('should return 500 on permission error', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'PERMISSION_DENIED';
      mockScanProjects.mockRejectedValue(error);

      const response = await request(app).get('/api/projects').expect(500);

      expect(response.body).toEqual({
        error: {
          code: 'PERMISSION_DENIED',
          message: '디렉토리 접근 권한이 없습니다.',
        },
      });
    });

    it('should return 500 on scan error', async () => {
      mockScanProjects.mockRejectedValue(new Error('Unknown error'));

      const response = await request(app).get('/api/projects').expect(500);

      expect(response.body).toEqual({
        error: {
          code: 'PROJECT_SCAN_ERROR',
          message: '프로젝트 목록을 가져오는 중 오류가 발생했습니다.',
        },
      });
    });
  });

  // Story 3.6 - Task 3: Project Creation Tests
  describe('POST /api/projects', () => {
    it('should return 201 with new project info', async () => {
      const mockProject: ProjectInfo = {
        originalPath: '/Users/test/new-project',
        projectSlug: 'new-hash',
        sessionCount: 0,
        lastModified: '2026-02-02T10:00:00Z',
        isBmadProject: true,
      };
      mockCreateProject.mockResolvedValue({
        project: mockProject,
        isExisting: false,
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ path: '/Users/test/new-project', setupBmad: true })
        .expect(201);

      expect(response.body.project).toEqual(mockProject);
      expect(response.body.isExisting).toBe(false);
    });

    it('should return 200 for existing project', async () => {
      const mockProject: ProjectInfo = {
        originalPath: '/Users/test/existing-project',
        projectSlug: 'existing-hash',
        sessionCount: 5,
        lastModified: '2026-01-30T10:00:00Z',
        isBmadProject: true,
      };
      mockCreateProject.mockResolvedValue({
        project: mockProject,
        isExisting: true,
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ path: '/Users/test/existing-project', setupBmad: false })
        .expect(200);

      expect(response.body.isExisting).toBe(true);
    });

    it('should return 400 for missing path', async () => {
      const response = await request(app).post('/api/projects').send({}).expect(400);

      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });

    it('should return 400 for invalid path', async () => {
      const error = new Error('경로 형식이 올바르지 않습니다.') as NodeJS.ErrnoException;
      error.code = 'INVALID_PATH';
      mockCreateProject.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/projects')
        .send({ path: '../invalid/path' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_PATH_FORMAT');
    });
  });

  describe('POST /api/projects/validate-path', () => {
    it('should return validation result for valid path', async () => {
      const mockValidation: ValidatePathResponse = {
        valid: true,
        exists: true,
        isProject: false,
      };
      mockValidatePath.mockResolvedValue(mockValidation);

      const response = await request(app)
        .post('/api/projects/validate-path')
        .send({ path: '/Users/test/project' })
        .expect(200);

      expect(response.body).toEqual(mockValidation);
    });

    it('should return validation result for existing project', async () => {
      const mockValidation: ValidatePathResponse = {
        valid: true,
        exists: true,
        isProject: true,
        projectSlug: 'existing-hash',
      };
      mockValidatePath.mockResolvedValue(mockValidation);

      const response = await request(app)
        .post('/api/projects/validate-path')
        .send({ path: '/Users/test/existing-project' })
        .expect(200);

      expect(response.body.isProject).toBe(true);
      expect(response.body.projectSlug).toBe('existing-hash');
    });

    it('should return validation error for invalid path', async () => {
      const mockValidation: ValidatePathResponse = {
        valid: false,
        exists: false,
        isProject: false,
        error: '지정한 경로가 존재하지 않습니다.',
      };
      mockValidatePath.mockResolvedValue(mockValidation);

      const response = await request(app)
        .post('/api/projects/validate-path')
        .send({ path: '/non/existent/path' })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.error).toContain('존재하지 않습니다');
    });

    it('should return 400 for missing path', async () => {
      const response = await request(app).post('/api/projects/validate-path').send({}).expect(400);

      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });
  });
});
