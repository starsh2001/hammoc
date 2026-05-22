/**
 * Projects Routes
 * Project list endpoints
 * [Source: Story 3.1 - Task 4]
 * [Extended: Story 3.6 - Task 3: Project creation routes]
 */

import { Router } from 'express';
import { projectController } from '../controllers/projectController.js';

const router = Router();

// GET /api/projects - List all projects
router.get('/', projectController.list);

// POST /api/projects - Create new project
router.post('/', projectController.create);

// GET /api/projects/bmad-versions - List available BMad method versions
router.get('/bmad-versions', projectController.bmadVersions);

// POST /api/projects/:projectSlug/setup-bmad - Setup BMad for existing project
router.post('/:projectSlug/setup-bmad', projectController.setupBmad);

// DELETE /api/projects/:projectSlug - Delete a project
router.delete('/:projectSlug', projectController.delete);

// GET /api/projects/:projectSlug/settings - Get project settings with effective values
router.get('/:projectSlug/settings', projectController.getSettings);

// PATCH /api/projects/:projectSlug/settings - Update project settings
router.patch('/:projectSlug/settings', projectController.updateSettings);

// GET /api/projects/:projectSlug/system-prompt - Get default system prompt
router.get('/:projectSlug/system-prompt', projectController.getSystemPrompt);

// POST /api/projects/:projectSlug/open-explorer - Open project in system file explorer (localhost only)
router.post('/:projectSlug/open-explorer', projectController.openExplorer);

// POST /api/projects/validate-path - Validate directory path
router.post('/validate-path', projectController.validatePath);

export default router;
