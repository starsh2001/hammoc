/**
 * Queue Routes — REST API endpoints for queue execution
 * Story 15.2: Queue Runner Engine
 */

import { Router } from 'express';
import { startQueue, pauseQueue, resumeQueue, abortQueue, getQueueStatus } from '../controllers/queueController.js';
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, extractStories } from '../controllers/queueTemplateController.js';

const router = Router();

// Queue execution routes (Story 15.2)
router.post('/:projectSlug/queue/start', startQueue);
router.post('/:projectSlug/queue/pause', pauseQueue);
router.post('/:projectSlug/queue/resume', resumeQueue);
router.post('/:projectSlug/queue/abort', abortQueue);
router.get('/:projectSlug/queue/status', getQueueStatus);

// Queue template routes (Story 15.5)
router.get('/:projectSlug/queue/stories', extractStories);
router.get('/:projectSlug/queue/templates', listTemplates);
router.post('/:projectSlug/queue/templates', createTemplate);
router.put('/:projectSlug/queue/templates/:id', updateTemplate);
router.delete('/:projectSlug/queue/templates/:id', deleteTemplate);

export default router;
