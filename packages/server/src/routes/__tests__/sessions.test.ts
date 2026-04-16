/**
 * Sessions Routes Unit Tests
 * [Source: Story 3.3 - Task 4, Story 3.5 - Task 3]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { SessionListItem } from '@hammoc/shared';

// Create hoisted mocks for sessionService
const { mockListSessionsBySlug, mockIsValidPathParam, mockSessionFileExists, mockReadSessionNamesBySlug, mockGetActiveStreamSessionIds, mockGetJoinedSessionIdsByProject } = vi.hoisted(() => ({
  mockListSessionsBySlug: vi.fn(),
  mockIsValidPathParam: vi.fn(),
  mockSessionFileExists: vi.fn().mockReturnValue(false),
  mockReadSessionNamesBySlug: vi.fn().mockResolvedValue({}),
  mockGetActiveStreamSessionIds: vi.fn().mockReturnValue([]),
  mockGetJoinedSessionIdsByProject: vi.fn().mockReturnValue(new Set<string>()),
}));

// Mock sessionService
vi.mock('../../services/sessionService', () => ({
  sessionService: {
    listSessionsBySlug: mockListSessionsBySlug,
    isValidPathParam: mockIsValidPathParam,
    sessionFileExists: mockSessionFileExists,
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
  getJoinedSessionIdsByProject: mockGetJoinedSessionIdsByProject,
}));

import sessionsRoutes from '../sessions';

describe('Sessions Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use((req: any, _res: any, next: any) => { req.t = (key: string) => key; req.language = 'en'; next(); });
    app.use('/api/projects', sessionsRoutes);
    vi.clearAllMocks();
    // Default: path params are valid
    mockIsValidPathParam.mockReturnValue(true);
    mockSessionFileExists.mockReturnValue(false);
    mockReadSessionNamesBySlug.mockResolvedValue({});
    mockGetActiveStreamSessionIds.mockReturnValue([]);
    mockGetJoinedSessionIdsByProject.mockReturnValue(new Set<string>());
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

});
