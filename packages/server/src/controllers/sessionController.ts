/**
 * Session Controller
 * Handles session list and history endpoints
 * [Source: Story 3.3 - Task 3, Story 3.5 - Task 3]
 */

import { Request, Response } from 'express';
import { SESSION_ERRORS, SessionListResponse, HistoryMessagesResponse, DeleteSessionsBatchRequest, UpdateSessionNameRequest } from '@hammoc/shared';
import { sessionService } from '../services/sessionService.js';
import { projectService } from '../services/projectService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('sessionController');
import { getActiveStreamSessionIds, getRunningStreamStartedAt, getCompletedBuffer } from '../handlers/websocket.js';
import { transformBufferToHistoryMessages } from '../services/historyParser.js';

export const sessionController = {
  /**
   * GET /api/projects/:projectSlug/sessions
   * List all sessions for a project
   */
  async list(req: Request, res: Response): Promise<void> {
    const { projectSlug } = req.params;

    // Security validation: prevent path traversal
    if (!sessionService.isValidPathParam(projectSlug)) {
      res.status(SESSION_ERRORS.INVALID_PATH.httpStatus).json({
        error: {
          code: SESSION_ERRORS.INVALID_PATH.code,
          message: req.t!('session.error.invalidPath'),
        },
      });
      return;
    }

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

      // Parse branchSelections from query parameter (JSON string, URL-encoded)
      let branchSelections: Record<string, number> | undefined;
      if (req.query.branchSelections) {
        try {
          const parsed = JSON.parse(req.query.branchSelections as string);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const validated: Record<string, number> = {};
            for (const [key, value] of Object.entries(parsed)) {
              if (typeof value === 'number' && Number.isFinite(value)) {
                validated[key] = value;
              }
              // Non-numeric values are silently discarded — fallback to default for that branch point
            }
            branchSelections = Object.keys(validated).length > 0 ? validated : undefined;
          }
        } catch {
          // Invalid JSON — silently ignore, use default branch
        }
      }

      // Snapshot stream state atomically BEFORE the async JSONL read.
      // completedBuffer has a 5s TTL — if we read it after the await, it may
      // have expired while streamStartedAt (captured here) still includes its
      // startedAt, causing the JSONL filter to exclude messages that the merge
      // can no longer provide.
      const runningStreamStartedAt = getRunningStreamStartedAt(sessionId);
      const completedBuffer = getCompletedBuffer(sessionId);

      // Only pass the running stream's startedAt for JSONL filtering.
      // Completed buffer filtering is handled below INSIDE the merge block
      // so the filter and merge are always paired — if merge is skipped
      // (e.g. branch navigation), the filter is also skipped.
      const result = await sessionService.getSessionMessages(projectSlug, sessionId, {
        limit,
        offset,
        streamStartedAt: runningStreamStartedAt,
        runningStreamStartedAt,
        branchSelections,
      });

      // Return empty messages for non-existent sessions (e.g., pre-allocated UUID with no messages yet)
      const response: HistoryMessagesResponse = result ?? {
        messages: [],
        pagination: { total: 0, limit, offset, hasMore: false },
        lastAgentCommand: null,
      };

      // Merge completed buffer messages when available (stream finished but
      // JSONL may not yet be flushed). Only for the latest page (offset 0).
      // Only merge on default branch — non-default branches skip buffer merge
      // because buffer messages always belong to the latest branch tip.
      const isDefaultBranch = !branchSelections || Object.keys(branchSelections).length === 0;

      if (completedBuffer && offset === 0 && isDefaultBranch) {
        const bufferMessages = transformBufferToHistoryMessages(completedBuffer.events);

        if (bufferMessages.length > 0) {
          // Filter out JSONL messages from the completed buffer's period to
          // prevent duplication — then add them back from the buffer.
          // This filter is intentionally inside the merge block: if merge is
          // skipped (branch navigation), filtering is also skipped so the JSONL
          // tree output is returned intact.
          const bufferStart = completedBuffer.startedAt;
          response.messages = response.messages.filter(
            (m) => new Date(m.timestamp).getTime() < bufferStart,
          );

          response.messages = [...response.messages, ...bufferMessages];

          response.messages.sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          const total = response.messages.length;
          response.pagination.total = total;
          if (total > limit) {
            response.messages = response.messages.slice(-limit);
          }
          response.pagination.hasMore = total > response.messages.length;
        }
      }

      // Fill missing parentId on buffer-originated messages.
      // JSONL messages already have parentId from historyParser, but buffer messages
      // (from transformBufferToHistoryMessages) lack it. Walk the merged list and
      // set parentId to the last seen assistant's base UUID for any user message missing it.
      {
        let lastAssistantBaseId: string | undefined;
        for (const msg of response.messages) {
          if (msg.type === 'assistant') {
            // Extract base UUID: "uuid-text-0" → "uuid", plain "uuid" → "uuid"
            const dash = msg.id.indexOf('-', 36); // UUID is 36 chars
            lastAssistantBaseId = dash > 0 ? msg.id.slice(0, 36) : msg.id;
          } else if (msg.type === 'user' && !msg.parentId && lastAssistantBaseId) {
            msg.parentId = lastAssistantBaseId;
          }
        }
      }

      // Attach branchInfo to the final message list in a single pass.
      // Handles both JSONL branchPoints and buffer-synthesized branch points.
      const branchInfoAttached = new Set<string>();

      // Helper: attach branchInfo to the first user message after a given assistant
      const attachBranchInfo = (selKey: string, info: { total: number; current: number; selectionKey: string }) => {
        if (branchInfoAttached.has(selKey)) return;
        const aIdx = response.messages.findIndex(
          (m) => m.id === selKey || m.id.startsWith(selKey),
        );
        if (aIdx >= 0) {
          const nextUser = response.messages.slice(aIdx + 1).find((m) => m.type === 'user');
          if (nextUser) {
            nextUser.branchInfo = info;
            branchInfoAttached.add(selKey);
          }
        }
      };

      // 1. From JSONL branchPoints
      if (response.branchPoints) {
        for (const [key, bp] of Object.entries(response.branchPoints)) {
          const selKey = bp.selectionKey ?? key;
          // Use client-provided expectedBranchTotal when this is the buffer's branch point
          const isBufBranch = completedBuffer?.resumeSessionAt === selKey && completedBuffer?.expectedBranchTotal;
          const total = isBufBranch ? completedBuffer!.expectedBranchTotal! : bp.total;
          const current = (isBufBranch && isDefaultBranch) ? total - 1 : bp.current;
          attachBranchInfo(selKey, { total, current, selectionKey: selKey });
        }
      }

      // 2. Buffer created a branch at a point with no existing JSONL branchPoints
      //    (first edit). Use expectedBranchTotal from client, or fallback to 2.
      if (completedBuffer?.resumeSessionAt) {
        const selKey = completedBuffer.resumeSessionAt;
        if (!branchInfoAttached.has(selKey)) {
          const total = completedBuffer.expectedBranchTotal ?? 2;
          attachBranchInfo(selKey, {
            total,
            current: isDefaultBranch ? total - 1 : 0,
            selectionKey: selKey,
          });
        }
      }

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
