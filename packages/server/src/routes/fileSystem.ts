/**
 * File System Routes
 * Endpoints for file reading and directory listing within projects.
 * [Source: Story 11.1 - Task 6]
 */

import { Router } from 'express';
import { fileSystemController } from '../controllers/fileSystemController.js';

const router = Router();

router.get('/:projectSlug/fs/read', fileSystemController.readFile);
router.get('/:projectSlug/fs/list', fileSystemController.listDirectory);

export default router;
