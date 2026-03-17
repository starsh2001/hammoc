/**
 * Queue Routes — REST API endpoints for queue execution
 * Story 15.2: Queue Runner Engine
 */

import { Router } from 'express';
import { getQueueStatus } from '../controllers/queueController.js';
import {
  listTemplates, createTemplate, updateTemplate, deleteTemplate, extractStories,
  listGlobalTemplates, createGlobalTemplate, updateGlobalTemplate, deleteGlobalTemplate,
} from '../controllers/queueTemplateController.js';

const router = Router();

// Queue status route (execution control is handled via WebSocket)
router.get('/:projectSlug/queue/status', getQueueStatus);

// Project-level template routes (Story 15.5)
router.get('/:projectSlug/queue/stories', extractStories);
router.get('/:projectSlug/queue/templates', listTemplates);
router.post('/:projectSlug/queue/templates', createTemplate);
router.put('/:projectSlug/queue/templates/:id', updateTemplate);
router.delete('/:projectSlug/queue/templates/:id', deleteTemplate);

// Global template routes
router.get('/:projectSlug/queue/global-templates', listGlobalTemplates);
router.post('/:projectSlug/queue/global-templates', createGlobalTemplate);
router.put('/:projectSlug/queue/global-templates/:id', updateGlobalTemplate);
router.delete('/:projectSlug/queue/global-templates/:id', deleteGlobalTemplate);

export default router;
