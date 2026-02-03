/**
 * Auth Routes
 * Authentication-related endpoints
 * [Source: Story 2.2 - Task 3]
 */

import { Router } from 'express';
import { authController } from '../controllers/authController.js';

const router = Router();

// POST /api/auth/login - Authenticate user
router.post('/login', authController.login);

// GET /api/auth/status - Check authentication status
router.get('/status', authController.status);

// POST /api/auth/logout - Logout user (Story 2.4 준비용)
router.post('/logout', authController.logout);

export default router;
