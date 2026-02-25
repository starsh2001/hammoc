/**
 * Git Routes
 * Endpoints for Git repository read and write operations within projects.
 * [Source: Story 16.1 - Task 5, Story 16.2 - Task 4]
 */

import { Router } from 'express';
import { gitController } from '../controllers/gitController.js';

const router = Router();

// Git Read API (Story 16.1)
router.get('/:projectSlug/git/status', gitController.getStatus);
router.get('/:projectSlug/git/log', gitController.getLog);
router.get('/:projectSlug/git/branches', gitController.getBranches);
router.get('/:projectSlug/git/diff', gitController.getDiff);

// Git Operations API (Story 16.2)
router.post('/:projectSlug/git/init', gitController.init);
router.post('/:projectSlug/git/stage', gitController.stage);
router.post('/:projectSlug/git/unstage', gitController.unstage);
router.post('/:projectSlug/git/commit', gitController.commit);
router.post('/:projectSlug/git/push', gitController.push);
router.post('/:projectSlug/git/pull', gitController.pull);
router.post('/:projectSlug/git/checkout', gitController.checkout);
router.post('/:projectSlug/git/branch', gitController.createBranch);

export default router;
