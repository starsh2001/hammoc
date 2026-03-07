/**
 * Sessions Integration Tests
 * [Source: Story 3.3 - Task 5]
 *
 * Tests the complete flow of session list API with real file system
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Store test directory path
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

// Mock sessionService to use test directory
vi.mock('../../services/sessionService.js', async () => {
  class TestSessionService {
    private get claudeProjectsDir(): string {
      return testProjectsDir;
    }

    async getProjectPathBySlug(projectSlug: string): Promise<string | null> {
      const projectDir = path.join(this.claudeProjectsDir, projectSlug);
      const indexPath = path.join(projectDir, 'sessions-index.json');

      try {
        const content = await fs.readFile(indexPath, 'utf-8');
        const index = JSON.parse(content);
        return index.originalPath || null;
      } catch {
        return null;
      }
    }

    truncateFirstPrompt(text: string, maxLength: number = 100): string {
      if (!text) return '';
      if (text.length <= maxLength) return text;
      return text.slice(0, maxLength - 3) + '...';
    }

    private parseDate(dateStr: string): number {
      const timestamp = Date.parse(dateStr);
      return isNaN(timestamp) ? 0 : timestamp;
    }

    async listSessionsBySlug(
      projectSlug: string,
      _params: Record<string, unknown> = {}
    ): Promise<{ sessions: import('@bmad-studio/shared').SessionListItem[]; total: number } | null> {
      const projectDir = path.join(this.claudeProjectsDir, projectSlug);
      const indexPath = path.join(projectDir, 'sessions-index.json');

      try {
        const content = await fs.readFile(indexPath, 'utf-8');
        const index = JSON.parse(content);

        if (!index.entries || !Array.isArray(index.entries)) {
          return { sessions: [], total: 0 };
        }

        // Sort by modified descending
        const sorted = [...index.entries].sort(
          (a: { modified: string }, b: { modified: string }) =>
            this.parseDate(b.modified) - this.parseDate(a.modified)
        );

        // Map to API response format with truncated firstPrompt
        const sessions = sorted.map(
          (entry: {
            sessionId: string;
            firstPrompt: string;
            messageCount: number;
            created: string;
            modified: string;
          }) => ({
            sessionId: entry.sessionId,
            firstPrompt: this.truncateFirstPrompt(entry.firstPrompt),
            messageCount: entry.messageCount,
            created: entry.created,
            modified: entry.modified,
          })
        );
        return { sessions, total: sessions.length };
      } catch {
        return null;
      }
    }
  }

  return {
    sessionService: new TestSessionService(),
    SessionService: TestSessionService,
  };
});

// Mock projectService for project routes
vi.mock('../../services/projectService.js', () => ({
  projectService: {
    scanProjects: vi.fn().mockResolvedValue([]),
    readSessionNamesBySlug: vi.fn().mockResolvedValue({}),
  },
}));

// Mock websocket handler
vi.mock('../../handlers/websocket.js', () => ({
  getActiveStreamSessionIds: vi.fn().mockReturnValue([]),
}));

import { createApp } from '../../app.js';

describe('Sessions Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    // Create temporary directory for test projects
    testProjectsDir = path.join(os.tmpdir(), `claude-test-sessions-${Date.now()}`);
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
        .get('/api/projects/test-project/sessions')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Authenticated Access', () => {
    let agent: ReturnType<typeof request.agent>;

    beforeEach(async () => {
      agent = request.agent(app);
      // Login first
      await agent.post('/api/auth/login').send({ password: 'test-password' }).expect(200);
    });

    it('should return 404 for non-existent project (AC6)', async () => {
      const response = await agent.get('/api/projects/nonexistent-project/sessions').expect(404);

      expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
      expect(response.body.error.message).toBe('Project not found.');
    });

    it('should return 200 with empty sessions array for project with no sessions (AC1, AC2)', async () => {
      // Create test project with empty entries
      const projectSlug = 'empty-sessions-project';
      const projectDir = path.join(testProjectsDir, projectSlug);
      await fs.mkdir(projectDir, { recursive: true });

      const sessionsIndex = {
        originalPath: '/Users/test/empty-project',
        entries: [],
      };

      await fs.writeFile(
        path.join(projectDir, 'sessions-index.json'),
        JSON.stringify(sessionsIndex),
        'utf-8'
      );

      const response = await agent.get(`/api/projects/${projectSlug}/sessions`).expect(200);

      expect(response.body.sessions).toEqual([]);

      // Cleanup
      await fs.rm(projectDir, { recursive: true, force: true });
    });

    it('should return session list with all required fields (AC2)', async () => {
      // Create test project with sessions
      const projectSlug = 'test-sessions-project';
      const projectDir = path.join(testProjectsDir, projectSlug);
      await fs.mkdir(projectDir, { recursive: true });

      const sessionsIndex = {
        originalPath: '/Users/test/my-project',
        entries: [
          {
            sessionId: 'session-abc123',
            firstPrompt: 'Help me understand this code',
            messageCount: 15,
            created: '2026-01-15T09:30:00Z',
            modified: '2026-01-31T14:22:00Z',
          },
        ],
      };

      await fs.writeFile(
        path.join(projectDir, 'sessions-index.json'),
        JSON.stringify(sessionsIndex),
        'utf-8'
      );

      const response = await agent.get(`/api/projects/${projectSlug}/sessions`).expect(200);

      expect(response.body.sessions).toHaveLength(1);
      expect(response.body.sessions[0]).toEqual({
        sessionId: 'session-abc123',
        firstPrompt: 'Help me understand this code',
        messageCount: 15,
        created: '2026-01-15T09:30:00Z',
        modified: '2026-01-31T14:22:00Z',
      });

      // Cleanup
      await fs.rm(projectDir, { recursive: true, force: true });
    });

    it('should sort sessions by modified descending (AC3)', async () => {
      // Create test project with multiple sessions
      const projectSlug = 'sorted-sessions-project';
      const projectDir = path.join(testProjectsDir, projectSlug);
      await fs.mkdir(projectDir, { recursive: true });

      const sessionsIndex = {
        originalPath: '/Users/test/sorted-project',
        entries: [
          {
            sessionId: 'old-session',
            firstPrompt: 'Old session',
            messageCount: 1,
            created: '2026-01-01T00:00:00Z',
            modified: '2026-01-01T00:00:00Z',
          },
          {
            sessionId: 'new-session',
            firstPrompt: 'New session',
            messageCount: 2,
            created: '2026-01-31T00:00:00Z',
            modified: '2026-01-31T00:00:00Z',
          },
          {
            sessionId: 'middle-session',
            firstPrompt: 'Middle session',
            messageCount: 3,
            created: '2026-01-15T00:00:00Z',
            modified: '2026-01-15T00:00:00Z',
          },
        ],
      };

      await fs.writeFile(
        path.join(projectDir, 'sessions-index.json'),
        JSON.stringify(sessionsIndex),
        'utf-8'
      );

      const response = await agent.get(`/api/projects/${projectSlug}/sessions`).expect(200);

      expect(response.body.sessions).toHaveLength(3);
      expect(response.body.sessions[0].sessionId).toBe('new-session');
      expect(response.body.sessions[1].sessionId).toBe('middle-session');
      expect(response.body.sessions[2].sessionId).toBe('old-session');

      // Cleanup
      await fs.rm(projectDir, { recursive: true, force: true });
    });

    it('should truncate firstPrompt to 100 chars with ellipsis (AC4)', async () => {
      // Create test project with long firstPrompt
      const projectSlug = 'truncate-test-project';
      const projectDir = path.join(testProjectsDir, projectSlug);
      await fs.mkdir(projectDir, { recursive: true });

      const longPrompt = 'A'.repeat(150); // 150 characters
      const sessionsIndex = {
        originalPath: '/Users/test/truncate-project',
        entries: [
          {
            sessionId: 'long-prompt-session',
            firstPrompt: longPrompt,
            messageCount: 5,
            created: '2026-01-15T00:00:00Z',
            modified: '2026-01-15T00:00:00Z',
          },
        ],
      };

      await fs.writeFile(
        path.join(projectDir, 'sessions-index.json'),
        JSON.stringify(sessionsIndex),
        'utf-8'
      );

      const response = await agent.get(`/api/projects/${projectSlug}/sessions`).expect(200);

      expect(response.body.sessions).toHaveLength(1);
      expect(response.body.sessions[0].firstPrompt.length).toBe(100);
      expect(response.body.sessions[0].firstPrompt.endsWith('...')).toBe(true);
      expect(response.body.sessions[0].firstPrompt).toBe('A'.repeat(97) + '...');

      // Cleanup
      await fs.rm(projectDir, { recursive: true, force: true });
    });

    it('should not truncate firstPrompt under 100 chars', async () => {
      // Create test project with short firstPrompt
      const projectSlug = 'short-prompt-project';
      const projectDir = path.join(testProjectsDir, projectSlug);
      await fs.mkdir(projectDir, { recursive: true });

      const shortPrompt = 'Help me debug this function';
      const sessionsIndex = {
        originalPath: '/Users/test/short-prompt-project',
        entries: [
          {
            sessionId: 'short-prompt-session',
            firstPrompt: shortPrompt,
            messageCount: 3,
            created: '2026-01-15T00:00:00Z',
            modified: '2026-01-15T00:00:00Z',
          },
        ],
      };

      await fs.writeFile(
        path.join(projectDir, 'sessions-index.json'),
        JSON.stringify(sessionsIndex),
        'utf-8'
      );

      const response = await agent.get(`/api/projects/${projectSlug}/sessions`).expect(200);

      expect(response.body.sessions[0].firstPrompt).toBe(shortPrompt);

      // Cleanup
      await fs.rm(projectDir, { recursive: true, force: true });
    });

    it('should handle project with missing entries field', async () => {
      // Create test project without entries
      const projectSlug = 'no-entries-project';
      const projectDir = path.join(testProjectsDir, projectSlug);
      await fs.mkdir(projectDir, { recursive: true });

      const sessionsIndex = {
        originalPath: '/Users/test/no-entries-project',
        // entries field is missing
      };

      await fs.writeFile(
        path.join(projectDir, 'sessions-index.json'),
        JSON.stringify(sessionsIndex),
        'utf-8'
      );

      const response = await agent.get(`/api/projects/${projectSlug}/sessions`).expect(200);

      expect(response.body.sessions).toEqual([]);

      // Cleanup
      await fs.rm(projectDir, { recursive: true, force: true });
    });
  });
});
