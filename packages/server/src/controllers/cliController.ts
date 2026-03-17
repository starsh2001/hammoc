import { Request, Response } from 'express';
import { cliService } from '../services/cliService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('cliController');

/**
 * Get CLI status including installation, authentication, and API key status
 * GET /api/cli-status
 */
export async function getCliStatus(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const status = await cliService.getStatus();
    log.info('CLI status check result:', {
      cliInstalled: status.cliInstalled,
      authenticated: status.authenticated,
      apiKeySet: status.apiKeySet,
      error: status.error,
    });

    if (status.error) {
      // Return status with error info (still 200, as this is informational)
      res.json(status);
      return;
    }

    res.json(status);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';

    res.status(500).json({
      error: {
        code: 'CLI_EXECUTION_ERROR',
        message: req.t!('cli.error.executionFailed'),
        ...(process.env.NODE_ENV === 'development' && { details: message }),
      },
    });
  }
}
