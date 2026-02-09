/**
 * Sessions Routes
 * Project session list and history endpoints
 * [Source: Story 3.3 - Task 4, Story 3.5 - Task 3]
 */

import { Router } from 'express';
import { sessionController } from '../controllers/sessionController.js';

const router = Router();

// GET /api/projects/:projectSlug/sessions - List sessions for a project
router.get('/:projectSlug/sessions', sessionController.list);

// POST /api/projects/:projectSlug/sessions/delete-batch - Batch delete sessions
router.post('/:projectSlug/sessions/delete-batch', sessionController.deleteBatch);

// GET /api/projects/:projectSlug/sessions/:sessionId/messages - Get session history
// [Source: Story 3.5 - Task 3]
router.get('/:projectSlug/sessions/:sessionId/messages', sessionController.getMessages);

// DELETE /api/projects/:projectSlug/sessions/:sessionId - Delete a session
router.delete('/:projectSlug/sessions/:sessionId', sessionController.delete);

// PATCH /api/projects/:projectSlug/sessions/:sessionId/name - Update session name
router.patch('/:projectSlug/sessions/:sessionId/name', sessionController.updateName);

export default router;
