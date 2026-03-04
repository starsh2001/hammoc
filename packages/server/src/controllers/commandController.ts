/**
 * Command Controller
 * Handles slash command list endpoint
 * [Source: Story 5.1 - Task 1]
 */

import { Request, Response } from 'express';
import type { CommandsResponse } from '@bmad-studio/shared';
import { commandService } from '../services/commandService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('commandController');

export const commandController = {
  /**
   * GET /api/projects/:projectSlug/commands
   * List available slash commands for a project
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const response: CommandsResponse = await commandService.getCommandsWithStarCommands(projectSlug);
      res.json(response);
    } catch (error) {
      log.error('Error listing commands:', error);
      res.status(500).json({
        error: {
          code: 'COMMAND_LIST_ERROR',
          message: req.t!('command.error.listFailed'),
        },
      });
    }
  },
};
