/**
 * Story 28.0.5: Harness workbench routes.
 * Mounted at /api/harness — independent of /api/projects because the user
 * scope (~/.claude) is not nested under any project.
 */

import { Router } from 'express';
import express from 'express';
import { harnessController } from '../controllers/harnessController.js';
import { harnessPluginController } from '../controllers/harnessPluginController.js';
import { harnessSkillController } from '../controllers/harnessSkillController.js';

const router = Router();

// Same body size as fileSystem routes (JSON envelopes can carry ~1MB source files).
const largeBodyParser = express.json({ limit: '5mb' });

router.get('/list', harnessController.list);
router.get('/read', harnessController.read);
router.put('/write', largeBodyParser, harnessController.write);
router.post('/patch-structured', largeBodyParser, harnessController.patchStructured);

// Story 28.1 — plugin list / toggle (user scope only)
router.get('/plugins', harnessPluginController.list);
router.post('/plugins/toggle', express.json({ limit: '32kb' }), harnessPluginController.toggle);

// Story 28.2 — skill list / read / update / copy + per-skill bundle file edit.
// The bundle routes are mounted *before* `/skills/:name` so the splat segment
// (`/bundle/*`) is matched first; otherwise Express would treat "bundle" as a
// `:name` value.
router.post('/skills/copy', largeBodyParser, harnessSkillController.copy);
router.get('/skills', harnessSkillController.list);
router.get('/skills/:name/bundle/*', harnessSkillController.readBundle);
router.put('/skills/:name/bundle/*', largeBodyParser, harnessSkillController.writeBundle);
router.get('/skills/:name', harnessSkillController.read);
router.put('/skills/:name', largeBodyParser, harnessSkillController.update);

export default router;
