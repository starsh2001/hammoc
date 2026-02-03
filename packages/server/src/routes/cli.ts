import { Router } from 'express';
import { getCliStatus } from '../controllers/cliController.js';

const router = Router();

/**
 * GET /api/cli-status
 * Returns CLI installation and authentication status
 */
router.get('/cli-status', getCliStatus);

export default router;
