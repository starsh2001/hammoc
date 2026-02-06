/**
 * Command Controller
 * Handles slash command list endpoint
 * [Source: Story 5.1 - Task 1]
 */

import { Request, Response } from 'express';
import type { CommandListResponse } from '@bmad-studio/shared';
import { commandService } from '../services/commandService.js';

export const commandController = {
  /**
   * GET /api/projects/:projectSlug/commands
   * List available slash commands for a project
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const commands = await commandService.getCommands(projectSlug);

      const response: CommandListResponse = { commands };
      res.json(response);
    } catch (error) {
      console.error('[commandController] Error listing commands:', error);
      res.status(500).json({
        error: {
          code: 'COMMAND_LIST_ERROR',
          message: 'Failed to list commands',
        },
      });
    }
  },
};
