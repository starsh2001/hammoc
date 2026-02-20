/**
 * File System Routes
 * Endpoints for file reading, writing, and management within projects.
 * [Source: Story 11.1 - Task 6, Story 11.2 - Task 5]
 */

import { Router } from 'express';
import express from 'express';
import { fileSystemController } from '../controllers/fileSystemController.js';

const router = Router();

// Write body size limit: 5MB (default 100KB is too small for file editing)
const largeBodyParser = express.json({ limit: '5mb' });

// Read routes (Story 11.1)
router.get('/:projectSlug/fs/read', fileSystemController.readFile);
router.get('/:projectSlug/fs/list', fileSystemController.listDirectory);

// Write routes (Story 11.2)
router.put('/:projectSlug/fs/write', largeBodyParser, fileSystemController.writeFile);
router.post('/:projectSlug/fs/create', largeBodyParser, fileSystemController.createEntry);
router.delete('/:projectSlug/fs/delete', fileSystemController.deleteEntry);
router.patch('/:projectSlug/fs/rename', fileSystemController.renameEntry);

export default router;
