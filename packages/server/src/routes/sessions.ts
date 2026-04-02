/**
 * Sessions Routes
 * Project session list and history endpoints
 * [Source: Story 3.3 - Task 4, Story 3.5 - Task 3]
 */

import { Router, Request, Response } from 'express';
import { sessionController } from '../controllers/sessionController.js';
import { projectService } from '../services/projectService.js';

const router = Router();

// GET /api/projects/:projectSlug/sessions - List sessions for a project
router.get('/:projectSlug/sessions', sessionController.list);

// POST /api/projects/:projectSlug/sessions/delete-batch - Batch delete sessions
router.post('/:projectSlug/sessions/delete-batch', sessionController.deleteBatch);

// POST /api/projects/:projectSlug/sessions/cleanup-phantom - Delete phantom sessions
router.post('/:projectSlug/sessions/cleanup-phantom', sessionController.cleanupPhantom);

// DELETE /api/projects/:projectSlug/sessions/:sessionId - Delete a session
router.delete('/:projectSlug/sessions/:sessionId', sessionController.delete);

// PATCH /api/projects/:projectSlug/sessions/:sessionId/name - Update session name
router.patch('/:projectSlug/sessions/:sessionId/name', sessionController.updateName);

// GET /api/projects/:projectSlug/sessions/:sessionId/prompt-history
router.get('/:projectSlug/sessions/:sessionId/prompt-history', async (req: Request, res: Response) => {
  try {
    const data = await projectService.readPromptHistoryBySlug(req.params.projectSlug, req.params.sessionId);
    res.json(data);
  } catch {
    res.status(500).json({ error: { code: 'PROMPT_HISTORY_READ_ERROR', message: 'Failed to read prompt history' } });
  }
});

// PUT /api/projects/:projectSlug/sessions/:sessionId/prompt-history
router.put('/:projectSlug/sessions/:sessionId/prompt-history', async (req: Request, res: Response) => {
  try {
    await projectService.writePromptHistoryBySlug(req.params.projectSlug, req.params.sessionId, req.body);
    res.json({ ok: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'PROJECT_NOT_FOUND') {
      res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' } });
      return;
    }
    res.status(500).json({ error: { code: 'PROMPT_HISTORY_WRITE_ERROR', message: 'Failed to write prompt history' } });
  }
});

export default router;
