/**
 * Session Controller
 * Handles session list and history endpoints
 * [Source: Story 3.3 - Task 3, Story 3.5 - Task 3]
 */

import { Request, Response } from 'express';
import { SESSION_ERRORS, SessionListResponse, HistoryMessagesResponse, DeleteSessionsBatchRequest, UpdateSessionNameRequest } from '@bmad-studio/shared';
import { sessionService } from '../services/sessionService.js';
import { projectService } from '../services/projectService.js';
import { getActiveStreamSessionIds } from '../handlers/websocket.js';

export const sessionController = {
  /**
   * GET /api/projects/:projectSlug/sessions
   * List all sessions for a project
   */
  async list(req: Request, res: Response): Promise<void> {
    const { projectSlug } = req.params;

    try {
      const includeEmpty = req.query.includeEmpty === 'true';
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 0;
      const offset = req.query.offset ? Math.max(parseInt(req.query.offset as string, 10), 0) : 0;

      // Story 23.1: Extract and sanitize search parameters
      let query = typeof req.query.query === 'string' ? req.query.query.trim() : undefined;
      if (query && query.length > 200) query = query.slice(0, 200);
      if (query === '') query = undefined;
      const searchContent = req.query.searchContent === 'true';

      // Load session names BEFORE calling service (needed for search)
      const sessionNames = await projectService.readSessionNamesBySlug(projectSlug);

      const result = await sessionService.listSessionsBySlug(projectSlug, {
        includeEmpty,
        limit: limit > 0 ? limit : 0,
        offset,
        query,
        searchContent,
        sessionNames,
      });

      // AC 6: Return 404 for non-existent project
      if (result === null) {
        res.status(SESSION_ERRORS.PROJECT_NOT_FOUND.httpStatus).json({
          error: {
            code: SESSION_ERRORS.PROJECT_NOT_FOUND.code,
            message: req.t!('session.error.projectNotFound'),
          },
        });
        return;
      }

      // Note: Empty array is a valid response (project exists but no sessions)
      // Mark sessions that have an active background stream + merge session names
      const activeIds = new Set(getActiveStreamSessionIds());
      const sessions = result.sessions;
      const total = result.total;
      const response: SessionListResponse = {
        sessions: sessions.map(s => ({
          ...s,
          ...(activeIds.has(s.sessionId) && { isStreaming: true }),
          ...(sessionNames[s.sessionId] && { name: sessionNames[s.sessionId] }),
        })),
        total,
        hasMore: limit > 0 ? (offset + sessions.length) < total : false,
      };
      res.json(response);
    } catch {
      res.status(SESSION_ERRORS.SESSION_LIST_ERROR.httpStatus).json({
        error: {
          code: SESSION_ERRORS.SESSION_LIST_ERROR.code,
          message: req.t!('session.error.listError'),
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
          message: req.t!('session.error.invalidPath'),
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

      // Return empty messages for non-existent sessions (e.g., pre-allocated UUID with no messages yet)
      const response: HistoryMessagesResponse = result ?? {
        messages: [],
        pagination: { total: 0, limit, offset, hasMore: false },
        lastAgentCommand: null,
      };
      res.json(response);
    } catch {
      res.status(SESSION_ERRORS.SESSION_PARSE_ERROR.httpStatus).json({
        error: {
          code: SESSION_ERRORS.SESSION_PARSE_ERROR.code,
          message: req.t!('session.error.parseError'),
        },
      });
    }
  },

  /**
   * DELETE /api/projects/:projectSlug/sessions/:sessionId
   * Delete a single session
   */
  async delete(req: Request, res: Response): Promise<void> {
    const { projectSlug, sessionId } = req.params;

    if (!sessionService.isValidPathParam(projectSlug) || !sessionService.isValidPathParam(sessionId)) {
      res.status(SESSION_ERRORS.INVALID_PATH.httpStatus).json({
        error: {
          code: SESSION_ERRORS.INVALID_PATH.code,
          message: req.t!('session.error.invalidPath'),
        },
      });
      return;
    }

    try {
      await sessionService.deleteSession(projectSlug, sessionId);
      res.json({ success: true });
    } catch {
      res.status(SESSION_ERRORS.SESSION_DELETE_ERROR.httpStatus).json({
        error: {
          code: SESSION_ERRORS.SESSION_DELETE_ERROR.code,
          message: req.t!('session.error.deleteError'),
        },
      });
    }
  },

  /**
   * POST /api/projects/:projectSlug/sessions/delete-batch
   * Delete multiple sessions at once
   */
  async deleteBatch(req: Request, res: Response): Promise<void> {
    const { projectSlug } = req.params;
    const { sessionIds } = req.body as DeleteSessionsBatchRequest;

    if (!sessionService.isValidPathParam(projectSlug)) {
      res.status(SESSION_ERRORS.INVALID_PATH.httpStatus).json({
        error: {
          code: SESSION_ERRORS.INVALID_PATH.code,
          message: req.t!('session.error.invalidPath'),
        },
      });
      return;
    }

    if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: req.t!('session.validation.deleteIdsRequired'),
        },
      });
      return;
    }

    try {
      const result = await sessionService.deleteSessions(projectSlug, sessionIds);
      res.json(result);
    } catch {
      res.status(SESSION_ERRORS.SESSION_DELETE_ERROR.httpStatus).json({
        error: {
          code: SESSION_ERRORS.SESSION_DELETE_ERROR.code,
          message: req.t!('session.error.deleteError'),
        },
      });
    }
  },

  /**
   * PATCH /api/projects/:projectSlug/sessions/:sessionId/name
   * Update or remove a session's custom name
   */
  async updateName(req: Request, res: Response): Promise<void> {
    const { projectSlug, sessionId } = req.params;

    if (!sessionService.isValidPathParam(projectSlug) || !sessionService.isValidPathParam(sessionId)) {
      res.status(SESSION_ERRORS.INVALID_PATH.httpStatus).json({
        error: {
          code: SESSION_ERRORS.INVALID_PATH.code,
          message: req.t!('session.error.invalidPath'),
        },
      });
      return;
    }

    try {
      const { name } = req.body as UpdateSessionNameRequest;
      const trimmedName = typeof name === 'string' ? name.trim() : null;
      const updatedName = await projectService.updateSessionName(
        projectSlug,
        sessionId,
        trimmedName || null,
      );
      res.json({ sessionId, name: updatedName });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({
          error: { code: 'PROJECT_NOT_FOUND', message: req.t!('session.error.projectNotFound') },
        });
        return;
      }
      res.status(500).json({
        error: { code: 'SESSION_NAME_UPDATE_ERROR', message: req.t!('session.error.saveNameFailed') },
      });
    }
  },
};
