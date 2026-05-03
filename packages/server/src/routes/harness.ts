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
import { harnessMcpController } from '../controllers/harnessMcpController.js';
import { harnessHookController } from '../controllers/harnessHookController.js';

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

// Story 28.3 — MCP list / read / update / copy / delete.
// `copy` lives above `/mcps/:name` so Express prefers the literal segment.
router.post('/mcps/copy', largeBodyParser, harnessMcpController.copy);
router.get('/mcps', harnessMcpController.list);
router.get('/mcps/:name', harnessMcpController.read);
router.put('/mcps/:name', largeBodyParser, harnessMcpController.update);
router.delete('/mcps/:name', largeBodyParser, harnessMcpController.delete);

// Story 28.4 — Hook list / read / create / update / copy / delete.
// `copy` and the splat-free POST live above `/hooks/:event/...` so Express
// prefers the literal segments.
router.post('/hooks/copy', largeBodyParser, harnessHookController.copy);
router.post('/hooks', largeBodyParser, harnessHookController.create);
router.get('/hooks', harnessHookController.list);
router.get('/hooks/:event/:groupIndex/:hookIndex', harnessHookController.read);
router.put('/hooks/:event/:groupIndex/:hookIndex', largeBodyParser, harnessHookController.update);
router.delete('/hooks/:event/:groupIndex/:hookIndex', largeBodyParser, harnessHookController.delete);

export default router;
