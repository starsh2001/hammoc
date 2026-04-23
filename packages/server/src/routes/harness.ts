/**
 * Story 28.0.5: Harness workbench routes.
 * Mounted at /api/harness — independent of /api/projects because the user
 * scope (~/.claude) is not nested under any project.
 */

import { Router } from 'express';
import express from 'express';
import { harnessController } from '../controllers/harnessController.js';

const router = Router();

// Same body size as fileSystem routes (JSON envelopes can carry ~1MB source files).
const largeBodyParser = express.json({ limit: '5mb' });

router.get('/list', harnessController.list);
router.get('/read', harnessController.read);
router.put('/write', largeBodyParser, harnessController.write);
router.post('/patch-structured', largeBodyParser, harnessController.patchStructured);

export default router;
