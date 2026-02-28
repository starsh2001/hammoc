import { Router } from 'express';
import { dashboardController } from '../controllers/dashboardController.js';

const router = Router();

// Dashboard status aggregation (Story 20.1)
router.get('/status', dashboardController.getStatus);

export default router;
