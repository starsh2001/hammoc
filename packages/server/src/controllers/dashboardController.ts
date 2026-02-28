/**
 * Dashboard Controller
 * Handles dashboard status requests.
 * [Source: Story 20.1 - Task 3]
 */

import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboardService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('dashboardController');

export const dashboardController = {
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = await dashboardService.getStatus();
      res.json(status);
    } catch (error) {
      log.error('Failed to get dashboard status:', error);
      res.status(500).json({
        error: { code: 'DASHBOARD_ERROR', message: 'Failed to get dashboard status' },
      });
    }
  },
};
