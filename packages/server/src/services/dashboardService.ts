/**
 * Dashboard Service
 * Aggregates per-project status for the dashboard overview.
 * [Source: Story 20.1 - Task 2]
 */

import type {
  DashboardProjectStatus,
  DashboardStatusResponse,
} from '@hammoc/shared';
import { ptyService } from './ptyService.js';
import { projectService } from './projectService.js';
import { getQueueInstances } from '../controllers/queueController.js';
import { getActiveSessionCountsByProject } from '../handlers/websocket.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('dashboardService');

function mapQueueStatus(
  queueState: { isRunning: boolean; isPaused: boolean; isErrored: boolean } | undefined
): DashboardProjectStatus['queueStatus'] {
  if (!queueState) return 'idle';
  if (queueState.isPaused) return 'paused';
  if (queueState.isErrored) return 'error';
  if (queueState.isRunning) return 'running';
  return 'idle';
}

class DashboardService {
  private statusCache: { data: DashboardStatusResponse; timestamp: number } | null = null;
  private static readonly CACHE_TTL_MS = 5000;

  /**
   * Aggregate status across all registered projects (cached for 5s).
   * Uses in-memory active session counts — no per-project file I/O for session listing.
   */
  async getStatus(): Promise<DashboardStatusResponse> {
    const now = Date.now();
    if (this.statusCache && now - this.statusCache.timestamp < DashboardService.CACHE_TTL_MS) {
      return this.statusCache.data;
    }

    const projects = await projectService.scanProjects();
    const activeCounts = getActiveSessionCountsByProject();
    const queueMap = getQueueInstances();

    const statuses: DashboardProjectStatus[] = projects.map((project) => {
      const slug = project.projectSlug;
      return {
        projectSlug: slug,
        activeSessionCount: activeCounts.get(slug) ?? 0,
        totalSessionCount: project.sessionCount,
        queueStatus: mapQueueStatus(queueMap.get(slug)?.getState()),
        terminalCount: ptyService.getSessionsByProject(slug).length,
      };
    });

    const response = { projects: statuses };
    this.statusCache = { data: response, timestamp: now };
    return response;
  }

  /**
   * Get status for a single project (used for status change events).
   * Uses in-memory lookup — no listSessionsBySlug I/O.
   */
  async getProjectStatus(projectSlug: string): Promise<DashboardProjectStatus> {
    try {
      await projectService.resolveOriginalPath(projectSlug);
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === 'PROJECT_NOT_FOUND') {
        log.warn(`Project not found: ${projectSlug}`);
      }
      throw error;
    }

    const activeCount = getActiveSessionCountsByProject().get(projectSlug) ?? 0;
    const queueStatus = mapQueueStatus(getQueueInstances().get(projectSlug)?.getState());
    const terminalCount = ptyService.getSessionsByProject(projectSlug).length;
    const totalSessionCount = await projectService.getProjectSessionCount(projectSlug);

    return {
      projectSlug,
      activeSessionCount: activeCount,
      totalSessionCount,
      queueStatus,
      terminalCount,
    };
  }
}

export const dashboardService = new DashboardService();
