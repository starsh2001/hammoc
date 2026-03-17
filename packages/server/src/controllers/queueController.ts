/**
 * Queue Controller — REST API handlers for queue execution
 * Story 15.2: Queue Runner Engine
 */

import type { Request, Response } from 'express';
import { QueueService } from '../services/queueService.js';
import { projectService } from '../services/projectService.js';
import { notificationService } from '../services/notificationService.js';
import { preferencesService } from '../services/preferencesService.js';
import { getIO } from '../handlers/websocket.js';

// Per-project QueueService registry — only one queue per project
const queueInstances = new Map<string, QueueService>();

/** Expose read-only iterator for server-side lock checks (e.g., chat:send guard) */
export function getQueueInstances(): ReadonlyMap<string, QueueService> {
  return queueInstances;
}

export function getOrCreateQueueService(projectSlug: string): QueueService {
  let instance = queueInstances.get(projectSlug);
  if (!instance) {
    instance = new QueueService(
      projectService, notificationService, preferencesService, getIO()
    );
    queueInstances.set(projectSlug, instance);
  }
  return instance;
}

export async function getQueueStatus(req: Request, res: Response): Promise<void> {
  const projectSlug = req.params.projectSlug;
  if (!projectSlug) {
    res.status(400).json({ error: req.t!('queue.validation.slugRequired') });
    return;
  }

  const queueService = queueInstances.get(projectSlug);
  if (!queueService) {
    res.status(200).json({
      isRunning: false,
      isPaused: false,
      currentIndex: 0,
      totalItems: 0,
      lockedSessionId: null,
    });
    return;
  }

  res.status(200).json(queueService.getState());
}
