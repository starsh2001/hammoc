import { Request, Response } from 'express';
import { cliService } from '../services/cliService.js';

/**
 * Get CLI status including installation, authentication, and API key status
 * GET /api/cli-status
 */
export async function getCliStatus(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const status = await cliService.getStatus();

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
        message: 'CLI 실행 중 오류가 발생했습니다.',
        ...(process.env.NODE_ENV === 'development' && { details: message }),
      },
    });
  }
}
