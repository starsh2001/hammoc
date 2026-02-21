import { Router } from 'express';
import { bmadStatusController } from '../controllers/bmadStatusController.js';

const router = Router();

// BMad Dashboard Status (Story 12.1)
router.get('/:projectSlug/bmad-status', bmadStatusController.getBmadStatus);

export default router;
