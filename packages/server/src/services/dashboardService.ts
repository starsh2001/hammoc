/**
 * Dashboard Service
 * Aggregates per-project status for the dashboard overview.
 * [Source: Story 20.1 - Task 2]
 */

import type {
  DashboardProjectStatus,
  DashboardStatusResponse,
} from '@bmad-studio/shared';
import { sessionService } from './sessionService.js';
import { ptyService } from './ptyService.js';
import { projectService } from './projectService.js';
import { getQueueInstances } from '../controllers/queueController.js';
import { getActiveStreamSessionIds } from '../handlers/websocket.js';
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
  /**
   * Aggregate status across all registered projects.
   */
  async getStatus(): Promise<DashboardStatusResponse> {
    const projects = await projectService.scanProjects();
    const activeIds = new Set(getActiveStreamSessionIds());
    const queueMap = getQueueInstances();

    const statuses: DashboardProjectStatus[] = await Promise.all(
      projects.map(async (project) => {
        const slug = project.projectSlug;

        const result = await sessionService.listSessionsBySlug(slug);
        const activeCount = (result?.sessions ?? []).filter((s) => activeIds.has(s.sessionId)).length;

        const queueStatus = mapQueueStatus(queueMap.get(slug)?.getState());
        const terminalCount = ptyService.getSessionsByProject(slug).length;

        return {
          projectSlug: slug,
          activeSessionCount: activeCount,
          totalSessionCount: project.sessionCount,
          queueStatus,
          terminalCount,
        };
      })
    );

    return { projects: statuses };
  }

  /**
   * Get status for a single project (used for status change events).
   */
  async getProjectStatus(projectSlug: string): Promise<DashboardProjectStatus> {
    // resolveOriginalPath throws PROJECT_NOT_FOUND for invalid slugs
    try {
      await projectService.resolveOriginalPath(projectSlug);
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === 'PROJECT_NOT_FOUND') {
        log.warn(`Project not found: ${projectSlug}`);
      }
      throw error;
    }

    const activeIds = new Set(getActiveStreamSessionIds());
    const result = await sessionService.listSessionsBySlug(projectSlug);
    const activeCount = (result?.sessions ?? []).filter((s) => activeIds.has(s.sessionId)).length;

    const queueStatus = mapQueueStatus(getQueueInstances().get(projectSlug)?.getState());
    const terminalCount = ptyService.getSessionsByProject(projectSlug).length;

    const projects = await projectService.scanProjects();
    const project = projects.find((p) => p.projectSlug === projectSlug);
    const totalSessionCount = project?.sessionCount ?? 0;

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
