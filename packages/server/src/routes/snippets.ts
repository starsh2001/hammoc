/**
 * Story 29.2: Snippet management routes.
 *
 * Mounted at `/api/snippets`. Intentionally distinct from `/api/harness/*`
 * because snippets are Hammoc-native (`%name%` chat-input expansion via
 * `snippetResolver`), not a Claude Code harness primitive — keeping the
 * namespaces separate makes the system-of-record obvious at the URL boundary.
 *
 * Route ordering: literal segments (`/copy`) live above the dynamic
 * `/:scope/:name` so Express prefers them.
 */

import { Router } from 'express';
import express from 'express';
import { snippetController } from '../controllers/snippetController.js';

const router = Router();

const largeBodyParser = express.json({ limit: '5mb' });
const smallBodyParser = express.json({ limit: '64kb' });

router.get('/', snippetController.list);

// Literal-segment endpoints first.
router.post('/copy', smallBodyParser, snippetController.copy);

// Dynamic `:scope/:name` endpoints.
router.get('/:scope/:name', snippetController.read);
router.post('/:scope/:name', largeBodyParser, snippetController.create);
router.put('/:scope/:name', largeBodyParser, snippetController.update);
router.delete('/:scope/:name', smallBodyParser, snippetController.delete);

export default router;
