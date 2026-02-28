/**
 * DashboardService Tests
 * Story 20.1: Server Dashboard Status Aggregation API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
const mockListSessionsBySlug = vi.fn();
vi.mock('../sessionService.js', () => ({
  sessionService: {
    listSessionsBySlug: (...args: unknown[]) => mockListSessionsBySlug(...args),
  },
}));

const mockGetSessionsByProject = vi.fn();
vi.mock('../ptyService.js', () => ({
  ptyService: {
    getSessionsByProject: (...args: unknown[]) => mockGetSessionsByProject(...args),
  },
}));

const mockScanProjects = vi.fn();
const mockResolveOriginalPath = vi.fn();
vi.mock('../projectService.js', () => ({
  projectService: {
    scanProjects: (...args: unknown[]) => mockScanProjects(...args),
    resolveOriginalPath: (...args: unknown[]) => mockResolveOriginalPath(...args),
  },
}));

const mockGetQueueInstances = vi.fn();
vi.mock('../../controllers/queueController.js', () => ({
  getQueueInstances: () => mockGetQueueInstances(),
}));

const mockGetActiveStreamSessionIds = vi.fn();
vi.mock('../../handlers/websocket.js', () => ({
  getActiveStreamSessionIds: () => mockGetActiveStreamSessionIds(),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { dashboardService } from '../dashboardService.js';

describe('DashboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveStreamSessionIds.mockReturnValue([]);
    mockGetQueueInstances.mockReturnValue(new Map());
  });

  describe('getStatus()', () => {
    it('returns correct aggregated data for multiple projects', async () => {
      mockScanProjects.mockResolvedValue([
        { projectSlug: 'project-a', sessionCount: 5 },
        { projectSlug: 'project-b', sessionCount: 3 },
      ]);

      mockGetActiveStreamSessionIds.mockReturnValue(['session-1', 'session-3']);

      // project-a has sessions, one is active
      mockListSessionsBySlug.mockImplementation((slug: string) => {
        if (slug === 'project-a') {
          return Promise.resolve([
            { sessionId: 'session-1' },
            { sessionId: 'session-2' },
          ]);
        }
        if (slug === 'project-b') {
          return Promise.resolve([
            { sessionId: 'session-3' },
          ]);
        }
        return Promise.resolve([]);
      });

      // project-a has a running queue
      const queueMap = new Map();
      queueMap.set('project-a', {
        getState: () => ({ isRunning: true, isPaused: false, isErrored: false }),
      });
      mockGetQueueInstances.mockReturnValue(queueMap);

      // project-a has 2 terminals, project-b has 0
      mockGetSessionsByProject.mockImplementation((slug: string) => {
        if (slug === 'project-a') return [{ terminalId: 't1' }, { terminalId: 't2' }];
        return [];
      });

      const result = await dashboardService.getStatus();

      expect(result.projects).toHaveLength(2);

      const projectA = result.projects.find((p) => p.projectSlug === 'project-a');
      expect(projectA).toEqual({
        projectSlug: 'project-a',
        activeSessionCount: 1,
        totalSessionCount: 5,
        queueStatus: 'running',
        terminalCount: 2,
      });

      const projectB = result.projects.find((p) => p.projectSlug === 'project-b');
      expect(projectB).toEqual({
        projectSlug: 'project-b',
        activeSessionCount: 1,
        totalSessionCount: 3,
        queueStatus: 'idle',
        terminalCount: 0,
      });
    });

    it('returns zero counts when no active sessions/terminals', async () => {
      mockScanProjects.mockResolvedValue([
        { projectSlug: 'project-a', sessionCount: 2 },
      ]);
      mockListSessionsBySlug.mockResolvedValue([
        { sessionId: 'session-1' },
      ]);
      mockGetActiveStreamSessionIds.mockReturnValue([]);
      mockGetSessionsByProject.mockReturnValue([]);

      const result = await dashboardService.getStatus();

      expect(result.projects[0]).toEqual({
        projectSlug: 'project-a',
        activeSessionCount: 0,
        totalSessionCount: 2,
        queueStatus: 'idle',
        terminalCount: 0,
      });
    });

    it('handles listSessionsBySlug returning null', async () => {
      mockScanProjects.mockResolvedValue([
        { projectSlug: 'nonexistent-project', sessionCount: 0 },
      ]);
      mockListSessionsBySlug.mockResolvedValue(null);
      mockGetSessionsByProject.mockReturnValue([]);

      const result = await dashboardService.getStatus();

      expect(result.projects[0].activeSessionCount).toBe(0);
      expect(result.projects[0].totalSessionCount).toBe(0);
    });

    it('maps queue status: running', async () => {
      mockScanProjects.mockResolvedValue([{ projectSlug: 'p1', sessionCount: 0 }]);
      mockListSessionsBySlug.mockResolvedValue([]);
      mockGetSessionsByProject.mockReturnValue([]);
      const queueMap = new Map();
      queueMap.set('p1', {
        getState: () => ({ isRunning: true, isPaused: false, isErrored: false }),
      });
      mockGetQueueInstances.mockReturnValue(queueMap);

      const result = await dashboardService.getStatus();
      expect(result.projects[0].queueStatus).toBe('running');
    });

    it('maps queue status: paused', async () => {
      mockScanProjects.mockResolvedValue([{ projectSlug: 'p1', sessionCount: 0 }]);
      mockListSessionsBySlug.mockResolvedValue([]);
      mockGetSessionsByProject.mockReturnValue([]);
      const queueMap = new Map();
      queueMap.set('p1', {
        getState: () => ({ isRunning: true, isPaused: true, isErrored: false }),
      });
      mockGetQueueInstances.mockReturnValue(queueMap);

      const result = await dashboardService.getStatus();
      expect(result.projects[0].queueStatus).toBe('paused');
    });

    it('maps queue status: error', async () => {
      mockScanProjects.mockResolvedValue([{ projectSlug: 'p1', sessionCount: 0 }]);
      mockListSessionsBySlug.mockResolvedValue([]);
      mockGetSessionsByProject.mockReturnValue([]);
      const queueMap = new Map();
      queueMap.set('p1', {
        getState: () => ({ isRunning: false, isPaused: false, isErrored: true }),
      });
      mockGetQueueInstances.mockReturnValue(queueMap);

      const result = await dashboardService.getStatus();
      expect(result.projects[0].queueStatus).toBe('error');
    });

    it('maps queue status: idle (no instance)', async () => {
      mockScanProjects.mockResolvedValue([{ projectSlug: 'p1', sessionCount: 0 }]);
      mockListSessionsBySlug.mockResolvedValue([]);
      mockGetSessionsByProject.mockReturnValue([]);
      mockGetQueueInstances.mockReturnValue(new Map());

      const result = await dashboardService.getStatus();
      expect(result.projects[0].queueStatus).toBe('idle');
    });

    it('maps queue status: idle (completed state)', async () => {
      mockScanProjects.mockResolvedValue([{ projectSlug: 'p1', sessionCount: 0 }]);
      mockListSessionsBySlug.mockResolvedValue([]);
      mockGetSessionsByProject.mockReturnValue([]);
      const queueMap = new Map();
      queueMap.set('p1', {
        getState: () => ({ isRunning: false, isPaused: false, isErrored: false }),
      });
      mockGetQueueInstances.mockReturnValue(queueMap);

      const result = await dashboardService.getStatus();
      expect(result.projects[0].queueStatus).toBe('idle');
    });

    it('performance: aggregation completes within 100ms for 10+ projects', async () => {
      const projects = Array.from({ length: 15 }, (_, i) => ({
        projectSlug: `project-${i}`,
        sessionCount: i,
      }));
      mockScanProjects.mockResolvedValue(projects);
      mockListSessionsBySlug.mockResolvedValue([]);
      mockGetSessionsByProject.mockReturnValue([]);

      const start = performance.now();
      await dashboardService.getStatus();
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('getProjectStatus()', () => {
    it('returns correct single project status', async () => {
      mockResolveOriginalPath.mockResolvedValue('/path/to/project');
      mockScanProjects.mockResolvedValue([
        { projectSlug: 'my-project', sessionCount: 10 },
      ]);
      mockGetActiveStreamSessionIds.mockReturnValue(['s1']);
      mockListSessionsBySlug.mockResolvedValue([
        { sessionId: 's1' },
        { sessionId: 's2' },
      ]);
      mockGetSessionsByProject.mockReturnValue([{ terminalId: 't1' }]);

      const result = await dashboardService.getProjectStatus('my-project');

      expect(result).toEqual({
        projectSlug: 'my-project',
        activeSessionCount: 1,
        totalSessionCount: 10,
        queueStatus: 'idle',
        terminalCount: 1,
      });
    });

    it('handles invalid projectSlug gracefully (PROJECT_NOT_FOUND)', async () => {
      const error = new Error('Project not found') as Error & { code?: string };
      error.code = 'PROJECT_NOT_FOUND';
      mockResolveOriginalPath.mockRejectedValue(error);

      await expect(dashboardService.getProjectStatus('invalid-slug')).rejects.toThrow(
        'Project not found'
      );
    });

    it('handles listSessionsBySlug returning null for single project', async () => {
      mockResolveOriginalPath.mockResolvedValue('/path');
      mockScanProjects.mockResolvedValue([
        { projectSlug: 'proj', sessionCount: 0 },
      ]);
      mockListSessionsBySlug.mockResolvedValue(null);
      mockGetSessionsByProject.mockReturnValue([]);

      const result = await dashboardService.getProjectStatus('proj');
      expect(result.activeSessionCount).toBe(0);
    });

    it('defaults totalSessionCount to 0 when project not in scan results', async () => {
      mockResolveOriginalPath.mockResolvedValue('/path');
      mockScanProjects.mockResolvedValue([]); // project not in results
      mockListSessionsBySlug.mockResolvedValue([]);
      mockGetSessionsByProject.mockReturnValue([]);

      const result = await dashboardService.getProjectStatus('orphan-slug');
      expect(result.totalSessionCount).toBe(0);
    });
  });
});
