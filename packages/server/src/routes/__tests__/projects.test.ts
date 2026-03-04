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
const {
  mockScanProjects,
  mockCreateProject,
  mockValidatePath,
  mockSetupBmadForProject,
  mockGetBmadVersions,
} = vi.hoisted(() => ({
  mockScanProjects: vi.fn(),
  mockCreateProject: vi.fn(),
  mockValidatePath: vi.fn(),
  mockSetupBmadForProject: vi.fn(),
  mockGetBmadVersions: vi.fn(),
}));

// Mock projectService
vi.mock('../../services/projectService', () => ({
  projectService: {
    scanProjects: mockScanProjects,
    createProject: mockCreateProject,
    validatePath: mockValidatePath,
    setupBmadForProject: mockSetupBmadForProject,
    getBmadVersions: mockGetBmadVersions,
  },
}));

import projectsRoutes from '../projects';

describe('Projects Routes', () => {
  let app: express.Express;
  // Increment Date.now per test to reset the in-memory rate limiter window (shared Map, 60s window)
  let fakeTime = Date.now();

  beforeEach(() => {
    vi.clearAllMocks();
    fakeTime += 120_000; // 2-minute gap ensures a fresh rate limit window
    vi.spyOn(Date, 'now').mockReturnValue(fakeTime);
    app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => { req.t = (key: string) => key; req.language = 'en'; next(); });
    app.use('/api/projects', projectsRoutes);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
          message: 'project.error.permissionDenied',
        },
      });
    });

    it('should return 500 on scan error', async () => {
      mockScanProjects.mockRejectedValue(new Error('Unknown error'));

      const response = await request(app).get('/api/projects').expect(500);

      expect(response.body).toEqual({
        error: {
          code: 'PROJECT_SCAN_ERROR',
          message: 'project.error.scanError',
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

    // Story 9.2 - Task 5: BMad setup graceful handling tests
    it('should return 201 with bmadSetupError when BMad setup fails', async () => {
      const mockProject: ProjectInfo = {
        originalPath: '/Users/test/new-project',
        projectSlug: 'new-hash',
        sessionCount: 0,
        lastModified: '2026-02-10T10:00:00Z',
        isBmadProject: false,
      };
      mockCreateProject.mockResolvedValue({
        project: mockProject,
        isExisting: false,
        bmadSetupError: 'BMad 버전 4.44.3을 찾을 수 없습니다.',
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ path: '/Users/test/new-project', setupBmad: true, bmadVersion: '4.44.3' })
        .expect(201);

      expect(response.body.project).toEqual(mockProject);
      expect(response.body.isExisting).toBe(false);
      expect(response.body.bmadSetupError).toBe('BMad 버전 4.44.3을 찾을 수 없습니다.');
    });

    it('should return 201 without bmadSetupError when BMad setup succeeds', async () => {
      const mockProject: ProjectInfo = {
        originalPath: '/Users/test/new-project',
        projectSlug: 'new-hash',
        sessionCount: 0,
        lastModified: '2026-02-10T10:00:00Z',
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
      expect(response.body.bmadSetupError).toBeUndefined();
    });

    it('should return 201 without bmadSetupError when setupBmad is false', async () => {
      const mockProject: ProjectInfo = {
        originalPath: '/Users/test/new-project',
        projectSlug: 'new-hash',
        sessionCount: 0,
        lastModified: '2026-02-10T10:00:00Z',
        isBmadProject: false,
      };
      mockCreateProject.mockResolvedValue({
        project: mockProject,
        isExisting: false,
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ path: '/Users/test/new-project', setupBmad: false })
        .expect(201);

      expect(response.body.project).toEqual(mockProject);
      expect(response.body.isExisting).toBe(false);
      expect(response.body.bmadSetupError).toBeUndefined();
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
      expect(response.body.error).toBe('project.validation.invalidPathFormat');
    });

    it('should return 400 for missing path', async () => {
      const response = await request(app).post('/api/projects/validate-path').send({}).expect(400);

      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });
  });

  // Story 9.1 - Task 4: setup-bmad endpoint tests
  describe('POST /api/projects/:projectSlug/setup-bmad', () => {
    const mockProject: ProjectInfo = {
      originalPath: '/Users/test/my-project',
      projectSlug: 'my-project-hash',
      sessionCount: 3,
      lastModified: '2026-02-10T10:00:00Z',
      isBmadProject: true,
    };

    it('should return 200 with project and installedVersion for non-BMad project', async () => {
      mockSetupBmadForProject.mockResolvedValue({
        project: mockProject,
        installedVersion: '4.44.3',
      });

      const response = await request(app)
        .post('/api/projects/my-project-hash/setup-bmad')
        .send({})
        .expect(200);

      expect(response.body.project).toEqual(mockProject);
      expect(response.body.project.isBmadProject).toBe(true);
      expect(response.body.installedVersion).toBe('4.44.3');
      expect(mockSetupBmadForProject).toHaveBeenCalledWith('my-project-hash', undefined, false);
    });

    it('should return 409 ALREADY_BMAD for already BMad project without force', async () => {
      const error = new Error('이미 BMad가 설정된 프로젝트입니다.') as NodeJS.ErrnoException;
      error.code = 'ALREADY_BMAD';
      mockSetupBmadForProject.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/projects/my-project-hash/setup-bmad')
        .send({})
        .expect(409);

      expect(response.body.error.code).toBe('ALREADY_BMAD');
    });

    it('should return 200 for already BMad project with force: true', async () => {
      mockSetupBmadForProject.mockResolvedValue({
        project: mockProject,
        installedVersion: '4.44.3',
      });

      const response = await request(app)
        .post('/api/projects/my-project-hash/setup-bmad')
        .send({ force: true })
        .expect(200);

      expect(response.body.project).toEqual(mockProject);
      expect(response.body.installedVersion).toBe('4.44.3');
      expect(mockSetupBmadForProject).toHaveBeenCalledWith('my-project-hash', undefined, true);
    });

    it('should return 404 for non-existent projectSlug', async () => {
      const error = new Error('프로젝트를 찾을 수 없습니다.') as NodeJS.ErrnoException;
      error.code = 'PROJECT_NOT_FOUND';
      mockSetupBmadForProject.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/projects/nonexistent-slug/setup-bmad')
        .send({})
        .expect(404);

      expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('should pass bmadVersion to service when specified', async () => {
      mockSetupBmadForProject.mockResolvedValue({
        project: mockProject,
        installedVersion: '4.44.3',
      });

      await request(app)
        .post('/api/projects/my-project-hash/setup-bmad')
        .send({ bmadVersion: '4.44.3' })
        .expect(200);

      expect(mockSetupBmadForProject).toHaveBeenCalledWith('my-project-hash', '4.44.3', false);
    });

    it('should use latest version when bmadVersion is not specified', async () => {
      mockSetupBmadForProject.mockResolvedValue({
        project: mockProject,
        installedVersion: '4.44.3',
      });

      await request(app)
        .post('/api/projects/my-project-hash/setup-bmad')
        .send({})
        .expect(200);

      expect(mockSetupBmadForProject).toHaveBeenCalledWith('my-project-hash', undefined, false);
    });

    it('should return 500 when no BMad version available', async () => {
      const error = new Error('사용 가능한 BMad 버전이 없습니다.') as NodeJS.ErrnoException;
      error.code = 'NO_BMAD_VERSION';
      mockSetupBmadForProject.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/projects/my-project-hash/setup-bmad')
        .send({})
        .expect(500);

      expect(response.body.error.code).toBe('NO_BMAD_VERSION');
    });
  });

  // Story 9.1 - Task 4: bmad-versions endpoint tests
  describe('GET /api/projects/bmad-versions', () => {
    it('should return versions array', async () => {
      mockGetBmadVersions.mockResolvedValue(['4.44.3', '4.43.0', '4.42.1']);

      const response = await request(app)
        .get('/api/projects/bmad-versions')
        .expect(200);

      expect(response.body.versions).toEqual(['4.44.3', '4.43.0', '4.42.1']);
    });

    it('should return versions sorted descending (latest first)', async () => {
      mockGetBmadVersions.mockResolvedValue(['4.44.3', '4.43.0']);

      const response = await request(app)
        .get('/api/projects/bmad-versions')
        .expect(200);

      const versions = response.body.versions;
      expect(versions[0]).toBe('4.44.3');
      expect(versions[1]).toBe('4.43.0');
    });
  });
});
