/**
 * Commands Routes
 * Slash command list endpoint
 * [Source: Story 5.1 - Task 1]
 */

import { Router } from 'express';
import { commandController } from '../controllers/commandController.js';

const router = Router();

// GET /api/projects/:projectSlug/commands - List available slash commands
router.get('/:projectSlug/commands', commandController.list);

export default router;
