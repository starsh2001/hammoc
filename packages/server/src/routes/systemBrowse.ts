/**
 * System Browse Routes
 * Directory-only system browse endpoints (Epic 34, Story 34.1).
 *
 * GET  /browse         — list child directories (or drive roots)
 * POST /browse/mkdir   — create a folder
 * POST /browse/rename  — rename an entry within its parent
 *
 * There is intentionally NO delete route (AC7 — destructive actions are removed
 * from the surface). Request bodies are tiny, so the global express.json() parser
 * (app.ts) suffices — no per-route large-body parser like fileSystem.ts needs.
 * Auth is automatic: this mounts under /api and is not in PUBLIC_ROUTES.
 * [Source: docs/prd/epic-34-directory-browser.md#Story 34.1; packages/server/src/app.ts:97, 105]
 */

import { Router } from 'express';
import { systemBrowseController } from '../controllers/systemBrowseController.js';

const router = Router();

router.get('/browse', systemBrowseController.browse);
router.post('/browse/mkdir', systemBrowseController.mkdir);
router.post('/browse/rename', systemBrowseController.rename);

export default router;
