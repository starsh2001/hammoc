/**
 * Queue Controller — REST API handlers for queue execution
 * Story 15.2: Queue Runner Engine
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { QueueService } from '../services/queueService.js';
import { projectService } from '../services/projectService.js';
import { notificationService } from '../services/notificationService.js';
import { preferencesService } from '../services/preferencesService.js';
import { getIO } from '../handlers/websocket.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('queueController');

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

// Zod validation schemas
const startQueueSchema = z.object({
  items: z.array(z.object({
    prompt: z.string(),
    isNewSession: z.boolean(),
    isBreakpoint: z.boolean().optional(),
    saveSessionName: z.string().optional(),
    loadSessionName: z.string().optional(),
    isMultiline: z.boolean().optional(),
    modelName: z.string().optional(),
    delayMs: z.number().optional(),
  })).min(1),
  sessionId: z.string().optional(),
});

export async function startQueue(req: Request, res: Response): Promise<void> {
  const projectSlug = req.params.projectSlug;
  if (!projectSlug) {
    res.status(400).json({ error: req.t!('queue.validation.slugRequired') });
    return;
  }

  const parseResult = startQueueSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: req.t!('queue.validation.itemsRequired') });
    return;
  }

  const queueService = getOrCreateQueueService(projectSlug);
  if (queueService.isRunning) {
    res.status(409).json({ error: req.t!('queue.error.alreadyRunning') });
    return;
  }

  const { items, sessionId } = parseResult.data;
  // Start async, don't await — execution is long-running
  queueService.start(items, projectSlug, sessionId).catch((err) => {
    log.error('Queue execution error:', err);
  });

  res.status(200).json({ status: 'started', totalItems: items.length });
}

export async function pauseQueue(req: Request, res: Response): Promise<void> {
  const projectSlug = req.params.projectSlug;
  if (!projectSlug) {
    res.status(400).json({ error: req.t!('queue.validation.slugRequired') });
    return;
  }

  const queueService = queueInstances.get(projectSlug);
  if (!queueService || !queueService.isRunning) {
    res.status(404).json({ error: req.t!('queue.error.noRunningQueue') });
    return;
  }

  await queueService.pause();
  res.status(200).json({ status: 'paused' });
}

export async function resumeQueue(req: Request, res: Response): Promise<void> {
  const projectSlug = req.params.projectSlug;
  if (!projectSlug) {
    res.status(400).json({ error: req.t!('queue.validation.slugRequired') });
    return;
  }

  const queueService = queueInstances.get(projectSlug);
  if (!queueService || !queueService.isRunning) {
    res.status(404).json({ error: req.t!('queue.error.noRunningQueue') });
    return;
  }

  // Resume async — execution continues in background
  queueService.resume().catch((err) => {
    log.error('Queue resume error:', err);
  });

  res.status(200).json({ status: 'resumed' });
}

export async function abortQueue(req: Request, res: Response): Promise<void> {
  const projectSlug = req.params.projectSlug;
  if (!projectSlug) {
    res.status(400).json({ error: req.t!('queue.validation.slugRequired') });
    return;
  }

  const queueService = queueInstances.get(projectSlug);
  if (!queueService || !queueService.isRunning) {
    res.status(404).json({ error: req.t!('queue.error.noRunningQueue') });
    return;
  }

  await queueService.abort();
  res.status(200).json({ status: 'aborted' });
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
