import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import boardRoutes from '../board.js';

const TEST_PROJECT_ROOT = path.join(os.tmpdir(), `board-route-test-${Date.now()}`);

// Mock projectService
vi.mock('../../services/projectService.js', () => ({
  projectService: {
    resolveOriginalPath: vi.fn(),
    readProjectSettings: vi.fn().mockResolvedValue({}),
  },
}));

// Mock bmadStatusService
vi.mock('../../services/bmadStatusService.js', () => ({
  bmadStatusService: {
    scanProject: vi.fn(),
  },
}));

import { projectService } from '../../services/projectService.js';
import { bmadStatusService } from '../../services/bmadStatusService.js';

const mockResolveOriginalPath = vi.mocked(projectService.resolveOriginalPath);
const mockReadProjectSettings = vi.mocked(projectService.readProjectSettings);
const mockScanProject = vi.mocked(bmadStatusService.scanProject);

describe('Board Routes', () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use((req: any, _res: any, next: any) => { req.t = (key: string) => key; req.language = 'en'; next(); });
    app.use('/api/projects', boardRoutes);

    // Setup test project directory with issues dir
    const issuesDir = path.join(TEST_PROJECT_ROOT, 'docs', 'issues');
    await fs.mkdir(issuesDir, { recursive: true });
    const bmadDir = path.join(TEST_PROJECT_ROOT, '.bmad-core');
    await fs.mkdir(bmadDir, { recursive: true });
    await fs.writeFile(
      path.join(bmadDir, 'core-config.yaml'),
      'prd:\n  prdFile: docs/prd.md\n'
    );

    mockResolveOriginalPath.mockResolvedValue(TEST_PROJECT_ROOT);
    mockReadProjectSettings.mockResolvedValue({} as never);
    mockScanProject.mockResolvedValue({
      config: {} as never,
      documents: {} as never,
      auxiliaryDocuments: [],
      epics: [],
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await fs.rm(TEST_PROJECT_ROOT, { recursive: true });
    } catch {
      // ignore
    }
  });

  describe('POST /api/projects/:projectSlug/board/issues', () => {
    it('should create an issue and return 201', async () => {
      const response = await request(app)
        .post('/api/projects/test-project/board/issues')
        .send({ title: 'New bug', description: 'Something broken', severity: 'high', issueType: 'bug' });

      expect(response.status).toBe(201);
      expect(response.body.type).toBe('issue');
      expect(response.body.title).toBe('New bug');
      expect(response.body.status).toBe('Open');
      expect(response.body.description).toBe('Something broken');
      expect(response.body.severity).toBe('high');
      expect(response.body.issueType).toBe('bug');
      expect(response.body.id).toMatch(/^ISSUE-\d+$/);
    });

    it('should return 400 when title is missing', async () => {
      const response = await request(app)
        .post('/api/projects/test-project/board/issues')
        .send({ description: 'No title' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toBe('board.validation.titleRequired');
    });

    it('should return 400 when title is empty string', async () => {
      const response = await request(app)
        .post('/api/projects/test-project/board/issues')
        .send({ title: '  ' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/projects/:projectSlug/board/issues', () => {
    it('should return issue list', async () => {
      // Create an issue first
      await request(app)
        .post('/api/projects/test-project/board/issues')
        .send({ title: 'Test issue' });

      const response = await request(app)
        .get('/api/projects/test-project/board/issues');

      expect(response.status).toBe(200);
      expect(response.body.issues).toHaveLength(1);
      expect(response.body.issues[0].title).toBe('Test issue');
    });

    it('should return empty issues list when none exist', async () => {
      const response = await request(app)
        .get('/api/projects/test-project/board/issues');

      expect(response.status).toBe(200);
      expect(response.body.issues).toEqual([]);
    });
  });

  describe('PATCH /api/projects/:projectSlug/board/issues/:issueId', () => {
    it('should update an issue', async () => {
      const createRes = await request(app)
        .post('/api/projects/test-project/board/issues')
        .send({ title: 'Original title' });

      const issueId = createRes.body.id;

      const response = await request(app)
        .patch(`/api/projects/test-project/board/issues/${issueId}`)
        .send({ title: 'Updated title', status: 'In Progress' });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Updated title');
      expect(response.body.status).toBe('In Progress');
    });

    it('should return 404 for non-existent issue', async () => {
      const response = await request(app)
        .patch('/api/projects/test-project/board/issues/non-existent')
        .send({ title: 'X' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('ISSUE_NOT_FOUND');
    });
  });

  describe('DELETE /api/projects/:projectSlug/board/issues/:issueId', () => {
    it('should delete an issue', async () => {
      const createRes = await request(app)
        .post('/api/projects/test-project/board/issues')
        .send({ title: 'To delete' });

      const issueId = createRes.body.id;

      const response = await request(app)
        .delete(`/api/projects/test-project/board/issues/${issueId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('board.success.issueDeleted');

      // Verify it's gone
      const listRes = await request(app)
        .get('/api/projects/test-project/board/issues');
      expect(listRes.body.issues).toHaveLength(0);
    });

    it('should return 404 for non-existent issue', async () => {
      const response = await request(app)
        .delete('/api/projects/test-project/board/issues/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('ISSUE_NOT_FOUND');
    });
  });

  describe('GET /api/projects/:projectSlug/board', () => {
    it('should return unified board with issues, stories, and epics', async () => {
      // Create an issue
      await request(app)
        .post('/api/projects/test-project/board/issues')
        .send({ title: 'Board bug', severity: 'medium', issueType: 'bug' });

      // Mock epic/story data
      mockScanProject.mockResolvedValueOnce({
        config: {} as never,
        documents: {} as never,
        auxiliaryDocuments: [],
        epics: [
          {
            number: 1,
            name: 'Core',
            stories: [
              { file: '1.1.story.md', status: 'Done', title: 'Setup' },
            ],
          },
        ],
      });

      const response = await request(app)
        .get('/api/projects/test-project/board');

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();

      const types = response.body.items.map((i: { type: string }) => i.type);
      expect(types).toContain('issue');
      expect(types).toContain('story');
      expect(types).toContain('epic');
    });
  });

  describe('Error handling', () => {
    it('should return 404 for non-existent project', async () => {
      const err = new Error('Project not found: bad-project');
      (err as NodeJS.ErrnoException).code = 'PROJECT_NOT_FOUND';
      mockResolveOriginalPath.mockRejectedValueOnce(err);

      const response = await request(app)
        .get('/api/projects/bad-project/board/issues');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('should return 400 for path traversal in issueId', async () => {
      const response = await request(app)
        .patch('/api/projects/test-project/board/issues/..%2Fetc%2Fpasswd')
        .send({ title: 'hack' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_ISSUE_ID');
    });
  });
});
