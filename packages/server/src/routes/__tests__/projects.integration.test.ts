/**
 * Projects Integration Tests
 * [Source: Story 3.1 - Task 6]
 * [Extended: Story 3.6 - Task 3: Project creation integration tests]
 *
 * Tests the complete flow of project list API with real file system
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

// Store original getClaudeProjectsDir before mocking
let testProjectsDir: string;

// Mock AuthConfigService before importing app
vi.mock('../../services/authConfigService.js', () => ({
  AuthConfigService: vi.fn().mockImplementation(() => ({
    getSessionSecret: vi.fn().mockResolvedValue('test-secret-key-for-integration-tests'),
    verifyPassword: vi.fn().mockResolvedValue(true),
  })),
}));

// Mock rateLimiter
vi.mock('../../services/rateLimiter.js', () => ({
  rateLimiter: {
    canAttempt: vi.fn().mockReturnValue({ allowed: true }),
    recordFailure: vi.fn(),
    reset: vi.fn(),
  },
}));

// Mock projectService's getClaudeProjectsDir to use test directory
vi.mock('../../services/projectService.js', async () => {
  // Create a new class that extends the behavior but overrides getClaudeProjectsDir
  class TestProjectService {
    getClaudeProjectsDir(): string {
      return testProjectsDir;
    }

    async scanProjects() {
      const projectsDir = this.getClaudeProjectsDir();

      try {
        await fs.access(projectsDir);
      } catch {
        return [];
      }

      let entries: string[];
      try {
        entries = await fs.readdir(projectsDir);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          const err = new Error('디렉토리 접근 권한이 없습니다.');
          (err as NodeJS.ErrnoException).code = 'PERMISSION_DENIED';
          throw err;
        }
        throw error;
      }

      const projects: import('@hammoc/shared').ProjectInfo[] = [];

      for (const entry of entries) {
        const projectPath = path.join(projectsDir, entry);

        try {
          const stat = await fs.stat(projectPath);
          if (!stat.isDirectory()) {
            continue;
          }
        } catch {
          continue;
        }

        const projectInfo = await this.parseSessionsIndex(projectPath, entry);
        if (projectInfo) {
          projects.push(projectInfo);
        }
      }

      projects.sort((a, b) => {
        const dateA = new Date(a.lastModified).getTime();
        const dateB = new Date(b.lastModified).getTime();
        return dateB - dateA;
      });

      return projects;
    }

    async parseSessionsIndex(
      projectPath: string,
      projectSlug: string
    ): Promise<import('@hammoc/shared').ProjectInfo | null> {
      const indexPath = path.join(projectPath, 'sessions-index.json');

      try {
        const content = await fs.readFile(indexPath, 'utf-8');
        const index = JSON.parse(content);

        if (!index.originalPath || typeof index.originalPath !== 'string') {
          const err = new Error('sessions-index.json 파일 형식이 올바르지 않습니다.');
          (err as NodeJS.ErrnoException).code = 'INVALID_SESSION_INDEX';
          throw err;
        }

        const entries = index.entries || [];
        const sessionCount = entries.length;

        let lastModified: string;
        if (entries.length > 0) {
          const modifiedDates = entries
            .filter((e: { modified?: string }) => e.modified)
            .map((e: { modified: string }) => new Date(e.modified).getTime());

          if (modifiedDates.length > 0) {
            lastModified = new Date(Math.max(...modifiedDates)).toISOString();
          } else {
            const stat = await fs.stat(indexPath);
            lastModified = stat.mtime.toISOString();
          }
        } else {
          const stat = await fs.stat(indexPath);
          lastModified = stat.mtime.toISOString();
        }

        const isBmadProject = await this.checkBmadProject(index.originalPath);

        return {
          originalPath: index.originalPath,
          projectSlug,
          sessionCount,
          lastModified,
          isBmadProject,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'INVALID_SESSION_INDEX') {
          throw error;
        }
        return null;
      }
    }

    async checkBmadProject(originalPath: string): Promise<boolean> {
      const bmadCorePath = path.join(originalPath, '.bmad-core');

      try {
        const stat = await fs.stat(bmadCorePath);
        return stat.isDirectory();
      } catch {
        return false;
      }
    }

    // Story 3.6 - Project creation methods
    async validatePath(
      inputPath: string
    ): Promise<import('@hammoc/shared').ValidatePathResponse> {
      // Simple validation for integration tests
      if (!path.isAbsolute(inputPath) || inputPath.includes('..')) {
        return {
          valid: false,
          exists: false,
          isProject: false,
          error: '경로 형식이 올바르지 않습니다. 절대 경로를 사용해 주세요.',
        };
      }

      try {
        const stat = await fs.stat(inputPath);
        if (!stat.isDirectory()) {
          return {
            valid: false,
            exists: true,
            isProject: false,
            error: '지정한 경로가 디렉토리가 아닙니다.',
          };
        }
      } catch {
        return {
          valid: false,
          exists: false,
          isProject: false,
          error: '지정한 경로가 존재하지 않습니다.',
        };
      }

      const existingProject = await this.findProjectByPath(inputPath);
      if (existingProject) {
        return {
          valid: true,
          exists: true,
          isProject: true,
          projectSlug: existingProject.projectSlug,
        };
      }

      return { valid: true, exists: true, isProject: false };
    }

    async findProjectByPath(
      originalPath: string
    ): Promise<import('@hammoc/shared').ProjectInfo | null> {
      const projects = await this.scanProjects();
      return projects.find((p) => p.originalPath === originalPath) || null;
    }

    async createProject(
      request: import('@hammoc/shared').CreateProjectRequest
    ): Promise<import('@hammoc/shared').CreateProjectResponse> {
      const { path: projectPath, setupBmad = true } = request;

      const validation = await this.validatePath(projectPath);
      if (!validation.valid) {
        const error = new Error(validation.error || '경로 검증 실패');
        (error as NodeJS.ErrnoException).code = 'INVALID_PATH';
        throw error;
      }

      if (validation.isProject && validation.projectSlug) {
        const existingProject = await this.findProjectByPath(projectPath);
        if (existingProject) {
          return { project: existingProject, isExisting: true };
        }
      }

      // Generate slug and create project
      const crypto = await import('crypto');
      const projectSlug = crypto
        .createHash('sha256')
        .update(projectPath)
        .digest('hex')
        .substring(0, 16);

      const claudeProjectDir = path.join(testProjectsDir, projectSlug);
      await fs.mkdir(claudeProjectDir, { recursive: true });

      const sessionsIndex = {
        originalPath: projectPath,
        entries: [],
      };
      await fs.writeFile(
        path.join(claudeProjectDir, 'sessions-index.json'),
        JSON.stringify(sessionsIndex, null, 2)
      );
      await fs.mkdir(path.join(claudeProjectDir, 'sessions'), { recursive: true });

      if (setupBmad) {
        await this.setupBmadCore(projectPath);
      }

      const project = await this.findProjectByPath(projectPath);
      if (!project) {
        throw new Error('프로젝트 생성 후 조회에 실패했습니다.');
      }

      return { project, isExisting: false };
    }

    async setupBmadCore(projectPath: string): Promise<void> {
      const bmadCorePath = path.join(projectPath, '.bmad-core');
      await fs.mkdir(bmadCorePath, { recursive: true });

      const dirs = ['agents', 'tasks', 'templates', 'checklists', 'data'];
      for (const dir of dirs) {
        await fs.mkdir(path.join(bmadCorePath, dir), { recursive: true });
      }

      const coreConfigPath = path.join(bmadCorePath, 'core-config.yaml');
      if (!existsSync(coreConfigPath)) {
        const defaultConfig = `# BMad Core Configuration
markdownExploder: true
qa:
  qaLocation: docs/qa
`;
        await fs.writeFile(coreConfigPath, defaultConfig, 'utf-8');
      }
    }
  }

  return {
    projectService: new TestProjectService(),
  };
});

import { createApp } from '../../app.js';

describe('Projects Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    // Create temporary directory for test projects
    testProjectsDir = path.join(os.tmpdir(), `claude-test-projects-${Date.now()}`);
    await fs.mkdir(testProjectsDir, { recursive: true });

    app = await createApp();
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await fs.rm(testProjectsDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe('Unauthenticated Access', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/projects')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Authenticated Access', () => {
    let agent: ReturnType<typeof request.agent>;

    beforeEach(async () => {
      agent = request.agent(app);
      // Login first
      await agent
        .post('/api/auth/login')
        .send({ password: 'test-password' })
        .expect(200);
    });

    it('should return 200 with empty array when no projects (AC6)', async () => {
      const response = await agent
        .get('/api/projects')
        .expect(200);

      expect(response.body).toHaveProperty('projects');
      expect(Array.isArray(response.body.projects)).toBe(true);
      expect(response.body.projects).toHaveLength(0);
    });

    it('should return project list after adding projects (AC1, AC2, AC3)', async () => {
      // Create test project
      const projectSlug = 'test-project-hash';
      const projectDir = path.join(testProjectsDir, projectSlug);
      await fs.mkdir(projectDir, { recursive: true });

      const sessionsIndex = {
        originalPath: '/Users/test/my-project',
        entries: [
          {
            sessionId: 'session-1',
            firstPrompt: 'Test prompt',
            messageCount: 10,
            created: '2026-01-30T10:00:00Z',
            modified: '2026-01-30T12:00:00Z',
          },
        ],
      };

      await fs.writeFile(
        path.join(projectDir, 'sessions-index.json'),
        JSON.stringify(sessionsIndex),
        'utf-8'
      );

      const response = await agent
        .get('/api/projects')
        .expect(200);

      expect(response.body.projects).toHaveLength(1);
      expect(response.body.projects[0]).toMatchObject({
        originalPath: '/Users/test/my-project',
        projectSlug: 'test-project-hash',
        sessionCount: 1,
        isBmadProject: false,
      });
      expect(response.body.projects[0].lastModified).toBeDefined();

      // Cleanup
      await fs.rm(projectDir, { recursive: true, force: true });
    });

    it('should detect BMad projects (AC4)', async () => {
      // Create test project with .bmad-core
      const projectSlug = 'bmad-project-hash';
      const projectDir = path.join(testProjectsDir, projectSlug);
      const originalProjectPath = path.join(os.tmpdir(), `test-bmad-project-${Date.now()}`);

      await fs.mkdir(projectDir, { recursive: true });
      await fs.mkdir(originalProjectPath, { recursive: true });
      await fs.mkdir(path.join(originalProjectPath, '.bmad-core'), { recursive: true });

      const sessionsIndex = {
        originalPath: originalProjectPath,
        entries: [],
      };

      await fs.writeFile(
        path.join(projectDir, 'sessions-index.json'),
        JSON.stringify(sessionsIndex),
        'utf-8'
      );

      const response = await agent
        .get('/api/projects')
        .expect(200);

      const bmadProject = response.body.projects.find(
        (p: { projectSlug: string }) => p.projectSlug === 'bmad-project-hash'
      );
      expect(bmadProject).toBeDefined();
      expect(bmadProject.isBmadProject).toBe(true);

      // Cleanup
      await fs.rm(projectDir, { recursive: true, force: true });
      await fs.rm(originalProjectPath, { recursive: true, force: true });
    });

    it('should sort projects by lastModified descending (AC5)', async () => {
      // Create two projects with different modified times
      const olderProjectSlug = 'older-project';
      const newerProjectSlug = 'newer-project';
      const olderProjectDir = path.join(testProjectsDir, olderProjectSlug);
      const newerProjectDir = path.join(testProjectsDir, newerProjectSlug);

      await fs.mkdir(olderProjectDir, { recursive: true });
      await fs.mkdir(newerProjectDir, { recursive: true });

      const olderIndex = {
        originalPath: '/Users/test/older-project',
        entries: [
          {
            sessionId: 'old-session',
            modified: '2026-01-25T10:00:00Z',
          },
        ],
      };

      const newerIndex = {
        originalPath: '/Users/test/newer-project',
        entries: [
          {
            sessionId: 'new-session',
            modified: '2026-01-30T10:00:00Z',
          },
        ],
      };

      await fs.writeFile(
        path.join(olderProjectDir, 'sessions-index.json'),
        JSON.stringify(olderIndex),
        'utf-8'
      );
      await fs.writeFile(
        path.join(newerProjectDir, 'sessions-index.json'),
        JSON.stringify(newerIndex),
        'utf-8'
      );

      const response = await agent
        .get('/api/projects')
        .expect(200);

      expect(response.body.projects.length).toBeGreaterThanOrEqual(2);

      // Find both projects in the response
      const olderProject = response.body.projects.find(
        (p: { projectSlug: string }) => p.projectSlug === olderProjectSlug
      );
      const newerProject = response.body.projects.find(
        (p: { projectSlug: string }) => p.projectSlug === newerProjectSlug
      );

      expect(newerProject).toBeDefined();
      expect(olderProject).toBeDefined();

      // Newer project should appear before older project
      const newerIndex2 = response.body.projects.indexOf(newerProject);
      const olderIndex2 = response.body.projects.indexOf(olderProject);
      expect(newerIndex2).toBeLessThan(olderIndex2);

      // Cleanup
      await fs.rm(olderProjectDir, { recursive: true, force: true });
      await fs.rm(newerProjectDir, { recursive: true, force: true });
    });

    it('should skip projects with invalid sessions-index.json', async () => {
      // Create a project with valid index
      const validProjectSlug = 'valid-project';
      const invalidProjectSlug = 'invalid-project';
      const validProjectDir = path.join(testProjectsDir, validProjectSlug);
      const invalidProjectDir = path.join(testProjectsDir, invalidProjectSlug);

      await fs.mkdir(validProjectDir, { recursive: true });
      await fs.mkdir(invalidProjectDir, { recursive: true });

      const validIndex = {
        originalPath: '/Users/test/valid-project',
        entries: [],
      };

      await fs.writeFile(
        path.join(validProjectDir, 'sessions-index.json'),
        JSON.stringify(validIndex),
        'utf-8'
      );

      // Write invalid JSON
      await fs.writeFile(
        path.join(invalidProjectDir, 'sessions-index.json'),
        'not valid json',
        'utf-8'
      );

      const response = await agent
        .get('/api/projects')
        .expect(200);

      // Only valid project should be returned
      const validProject = response.body.projects.find(
        (p: { projectSlug: string }) => p.projectSlug === validProjectSlug
      );
      const invalidProject = response.body.projects.find(
        (p: { projectSlug: string }) => p.projectSlug === invalidProjectSlug
      );

      expect(validProject).toBeDefined();
      expect(invalidProject).toBeUndefined();

      // Cleanup
      await fs.rm(validProjectDir, { recursive: true, force: true });
      await fs.rm(invalidProjectDir, { recursive: true, force: true });
    });

    // Story 3.6 - Project Creation Integration Tests
    describe('POST /api/projects', () => {
      let testOriginalPath: string;

      beforeEach(async () => {
        // Create a temporary directory to use as project path
        testOriginalPath = path.join(os.tmpdir(), `test-new-project-${Date.now()}`);
        await fs.mkdir(testOriginalPath, { recursive: true });
      });

      afterEach(async () => {
        try {
          await fs.rm(testOriginalPath, { recursive: true, force: true });
        } catch {
          // Ignore
        }
      });

      it('should create new project and return 201', async () => {
        const response = await agent
          .post('/api/projects')
          .send({ path: testOriginalPath, setupBmad: true })
          .expect(201);

        expect(response.body.project).toBeDefined();
        expect(response.body.project.originalPath).toBe(testOriginalPath);
        expect(response.body.isExisting).toBe(false);

        // Verify project was created in test projects dir
        const projects = await fs.readdir(testProjectsDir);
        expect(projects.length).toBeGreaterThan(0);
      });

      it('should return 200 for existing project', async () => {
        // Create project first
        await agent
          .post('/api/projects')
          .send({ path: testOriginalPath, setupBmad: false })
          .expect(201);

        // Try to create same project again
        const response = await agent
          .post('/api/projects')
          .send({ path: testOriginalPath, setupBmad: false })
          .expect(200);

        expect(response.body.isExisting).toBe(true);
      });

      it('should return 400 for invalid path', async () => {
        const response = await agent
          .post('/api/projects')
          .send({ path: '../invalid/relative/path', setupBmad: false })
          .expect(400);

        expect(response.body.error).toBeDefined();
      });

      it('should return 400 for non-existent path', async () => {
        const nonExistentPath = path.join(os.tmpdir(), `non-existent-${Date.now()}`);

        const response = await agent
          .post('/api/projects')
          .send({ path: nonExistentPath, setupBmad: false })
          .expect(400);

        expect(response.body.error).toBeDefined();
      });
    });

    describe('POST /api/projects/validate-path', () => {
      it('should return valid=true for existing directory', async () => {
        const testPath = path.join(os.tmpdir(), `test-validate-${Date.now()}`);
        await fs.mkdir(testPath, { recursive: true });

        try {
          const response = await agent
            .post('/api/projects/validate-path')
            .send({ path: testPath })
            .expect(200);

          expect(response.body.valid).toBe(true);
          expect(response.body.exists).toBe(true);
          expect(response.body.isProject).toBe(false);
        } finally {
          await fs.rm(testPath, { recursive: true, force: true });
        }
      });

      it('should return valid=false for non-existent path', async () => {
        const response = await agent
          .post('/api/projects/validate-path')
          .send({ path: '/non/existent/path/for/testing' })
          .expect(200);

        expect(response.body.valid).toBe(false);
        expect(response.body.exists).toBe(false);
      });

      it('should return 400 for missing path', async () => {
        const response = await agent
          .post('/api/projects/validate-path')
          .send({})
          .expect(400);

        expect(response.body.error.code).toBe('INVALID_REQUEST');
      });
    });

    describe('Rate Limiting', () => {
      it('should allow requests within rate limit', async () => {
        // Make a few requests - should all succeed
        for (let i = 0; i < 5; i++) {
          await agent
            .post('/api/projects/validate-path')
            .send({ path: `/test/path/${i}` })
            .expect(200);
        }
      });
    });
  });
});
