/**
 * Git Routes
 * Endpoints for Git repository read operations within projects.
 * [Source: Story 16.1 - Task 5]
 */

import { Router } from 'express';
import { gitController } from '../controllers/gitController.js';

const router = Router();

// Git Read API (Story 16.1)
router.get('/:projectSlug/git/status', gitController.getStatus);
router.get('/:projectSlug/git/log', gitController.getLog);
router.get('/:projectSlug/git/branches', gitController.getBranches);
router.get('/:projectSlug/git/diff', gitController.getDiff);

export default router;
