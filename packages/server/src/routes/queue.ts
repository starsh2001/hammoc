/**
 * Queue Routes — REST API endpoints for queue execution
 * Story 15.2: Queue Runner Engine
 */

import { Router } from 'express';
import { startQueue, pauseQueue, resumeQueue, abortQueue, getQueueStatus } from '../controllers/queueController.js';

const router = Router();

router.post('/:projectSlug/queue/start', startQueue);
router.post('/:projectSlug/queue/pause', pauseQueue);
router.post('/:projectSlug/queue/resume', resumeQueue);
router.post('/:projectSlug/queue/abort', abortQueue);
router.get('/:projectSlug/queue/status', getQueueStatus);

export default router;
