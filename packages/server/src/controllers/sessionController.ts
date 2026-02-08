/**
 * Session Controller
 * Handles session list and history endpoints
 * [Source: Story 3.3 - Task 3, Story 3.5 - Task 3]
 */

import { Request, Response } from 'express';
import { SESSION_ERRORS, SessionListResponse, HistoryMessagesResponse } from '@bmad-studio/shared';
import { sessionService } from '../services/sessionService.js';
import { getActiveStreamSessionIds } from '../handlers/websocket.js';

export const sessionController = {
  /**
   * GET /api/projects/:projectSlug/sessions
   * List all sessions for a project
   */
  async list(req: Request, res: Response): Promise<void> {
    const { projectSlug } = req.params;

    try {
      const sessions = await sessionService.listSessionsBySlug(projectSlug);

      // AC 6: Return 404 for non-existent project
      if (sessions === null) {
        res.status(SESSION_ERRORS.PROJECT_NOT_FOUND.httpStatus).json({
          error: {
            code: SESSION_ERRORS.PROJECT_NOT_FOUND.code,
            message: SESSION_ERRORS.PROJECT_NOT_FOUND.message,
          },
        });
        return;
      }

      // Note: Empty array is a valid response (project exists but no sessions)
      // Mark sessions that have an active background stream
      const activeIds = new Set(getActiveStreamSessionIds());
      const response: SessionListResponse = {
        sessions: sessions.map(s => ({
          ...s,
          ...(activeIds.has(s.sessionId) && { isStreaming: true }),
        })),
      };
      res.json(response);
    } catch {
      res.status(SESSION_ERRORS.SESSION_LIST_ERROR.httpStatus).json({
        error: {
          code: SESSION_ERRORS.SESSION_LIST_ERROR.code,
          message: SESSION_ERRORS.SESSION_LIST_ERROR.message,
        },
      });
    }
  },

  /**
   * GET /api/projects/:projectSlug/sessions/:sessionId/messages
   * Get session history messages with pagination
   * [Source: Story 3.5 - Task 3]
   *
   * Query params:
   * - limit: number (default: 50, max: 100)
   * - offset: number (default: 0)
   */
  async getMessages(req: Request, res: Response): Promise<void> {
    const { projectSlug, sessionId } = req.params;

    // Security validation: prevent path traversal
    if (!sessionService.isValidPathParam(projectSlug) || !sessionService.isValidPathParam(sessionId)) {
      res.status(SESSION_ERRORS.INVALID_PATH.httpStatus).json({
        error: {
          code: SESSION_ERRORS.INVALID_PATH.code,
          message: SESSION_ERRORS.INVALID_PATH.message,
        },
      });
      return;
    }

    try {
      // Parse and validate query params
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const result = await sessionService.getSessionMessages(projectSlug, sessionId, {
        limit,
        offset,
      });

      if (!result) {
        res.status(SESSION_ERRORS.SESSION_NOT_FOUND.httpStatus).json({
          error: {
            code: SESSION_ERRORS.SESSION_NOT_FOUND.code,
            message: SESSION_ERRORS.SESSION_NOT_FOUND.message,
          },
        });
        return;
      }

      const response: HistoryMessagesResponse = result;
      res.json(response);
    } catch {
      res.status(SESSION_ERRORS.SESSION_PARSE_ERROR.httpStatus).json({
        error: {
          code: SESSION_ERRORS.SESSION_PARSE_ERROR.code,
          message: SESSION_ERRORS.SESSION_PARSE_ERROR.message,
        },
      });
    }
  },
};
