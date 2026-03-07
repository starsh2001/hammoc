/**
 * DashboardService Tests
 * Story 20.1: Server Dashboard Status Aggregation API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
const mockGetSessionsByProject = vi.fn();
vi.mock('../ptyService.js', () => ({
  ptyService: {
    getSessionsByProject: (...args: unknown[]) => mockGetSessionsByProject(...args),
  },
}));

const mockScanProjects = vi.fn();
const mockResolveOriginalPath = vi.fn();
const mockGetProjectSessionCount = vi.fn();
vi.mock('../projectService.js', () => ({
  projectService: {
    scanProjects: (...args: unknown[]) => mockScanProjects(...args),
    resolveOriginalPath: (...args: unknown[]) => mockResolveOriginalPath(...args),
    getProjectSessionCount: (...args: unknown[]) => mockGetProjectSessionCount(...args),
  },
}));

const mockGetQueueInstances = vi.fn();
vi.mock('../../controllers/queueController.js', () => ({
  getQueueInstances: () => mockGetQueueInstances(),
}));

const mockGetActiveSessionCountsByProject = vi.fn();
vi.mock('../../handlers/websocket.js', () => ({
  getActiveSessionCountsByProject: () => mockGetActiveSessionCountsByProject(),
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
    mockGetActiveSessionCountsByProject.mockReturnValue(new Map());
    mockGetQueueInstances.mockReturnValue(new Map());
    // Clear internal cache between tests
    // @ts-expect-error accessing private field for test reset
    dashboardService.statusCache = null;
  });

  describe('getStatus()', () => {
    it('returns correct aggregated data for multiple projects', async () => {
      mockScanProjects.mockResolvedValue([
        { projectSlug: 'project-a', sessionCount: 5 },
        { projectSlug: 'project-b', sessionCount: 3 },
      ]);

      const activeCounts = new Map([
        ['project-a', 1],
        ['project-b', 1],
      ]);
      mockGetActiveSessionCountsByProject.mockReturnValue(activeCounts);

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
      mockGetActiveSessionCountsByProject.mockReturnValue(new Map());
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

    it('maps queue status: running', async () => {
      mockScanProjects.mockResolvedValue([{ projectSlug: 'p1', sessionCount: 0 }]);
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
      mockGetSessionsByProject.mockReturnValue([]);
      mockGetQueueInstances.mockReturnValue(new Map());

      const result = await dashboardService.getStatus();
      expect(result.projects[0].queueStatus).toBe('idle');
    });

    it('maps queue status: idle (completed state)', async () => {
      mockScanProjects.mockResolvedValue([{ projectSlug: 'p1', sessionCount: 0 }]);
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
      mockGetSessionsByProject.mockReturnValue([]);

      const start = performance.now();
      await dashboardService.getStatus();
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it('uses cache for repeated calls within TTL', async () => {
      mockScanProjects.mockResolvedValue([{ projectSlug: 'p1', sessionCount: 1 }]);
      mockGetSessionsByProject.mockReturnValue([]);

      await dashboardService.getStatus();
      await dashboardService.getStatus();

      expect(mockScanProjects).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProjectStatus()', () => {
    it('returns correct single project status', async () => {
      mockResolveOriginalPath.mockResolvedValue('/path/to/project');
      mockGetProjectSessionCount.mockResolvedValue(10);
      const activeCounts = new Map([['my-project', 1]]);
      mockGetActiveSessionCountsByProject.mockReturnValue(activeCounts);
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

    it('returns zero active count when no active sessions for project', async () => {
      mockResolveOriginalPath.mockResolvedValue('/path');
      mockGetProjectSessionCount.mockResolvedValue(5);
      mockGetActiveSessionCountsByProject.mockReturnValue(new Map());
      mockGetSessionsByProject.mockReturnValue([]);

      const result = await dashboardService.getProjectStatus('proj');
      expect(result.activeSessionCount).toBe(0);
    });

    it('defaults totalSessionCount to 0 when project has no sessions', async () => {
      mockResolveOriginalPath.mockResolvedValue('/path');
      mockGetProjectSessionCount.mockResolvedValue(0);
      mockGetActiveSessionCountsByProject.mockReturnValue(new Map());
      mockGetSessionsByProject.mockReturnValue([]);

      const result = await dashboardService.getProjectStatus('empty-project');
      expect(result.totalSessionCount).toBe(0);
    });
  });
});
