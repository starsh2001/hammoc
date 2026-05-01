/**
 * Story 28.1: Harness plugin list / toggle controller.
 *
 * Thin Express handlers on top of `harnessPluginService`. Follows the inline
 * error-mapping pattern established by `harnessController` — there is no
 * global Express error middleware, so each handler catches and iterates the
 * shared `HARNESS_ERRORS` table to emit the common envelope
 * `{ error: { code, message, details? } }`.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { harnessPluginService } from '../services/harnessPluginService.js';

const projectSlugQuery = z.object({
  projectSlug: z.string().min(1).optional(),
});

const toggleBodySchema = z.object({
  key: z.string().min(1),
  enabled: z.boolean(),
  expectedMtime: z.string().optional(),
});

/**
 * Codes the client explicitly handles. `HARNESS_WRITE_ERROR` is handled as
 * the catch-all below so it is intentionally NOT listed here.
 */
const MAPPED_CODES = [
  'HARNESS_PATH_DENIED',
  'HARNESS_FORBIDDEN',
  'HARNESS_PLUGIN_SCOPE_DENIED',
  'HARNESS_FILE_NOT_FOUND',
  'HARNESS_NOT_A_FILE',
  'HARNESS_ROOT_MISSING',
  'HARNESS_PARENT_NOT_FOUND',
  'HARNESS_PLUGIN_NOT_FOUND',
  'HARNESS_STALE_WRITE',
  'HARNESS_PARSE_ERROR',
] as const;

const MESSAGE_KEY: Record<typeof MAPPED_CODES[number], string> = {
  HARNESS_PATH_DENIED: 'harness.error.pathDenied',
  HARNESS_FORBIDDEN: 'harness.error.forbidden',
  HARNESS_PLUGIN_SCOPE_DENIED: 'harness.error.pluginScopeDenied',
  HARNESS_FILE_NOT_FOUND: 'harness.error.fileNotFound',
  HARNESS_NOT_A_FILE: 'harness.error.notAFile',
  HARNESS_ROOT_MISSING: 'harness.error.rootMissing',
  HARNESS_PARENT_NOT_FOUND: 'harness.error.parentNotFound',
  HARNESS_PLUGIN_NOT_FOUND: 'harness.error.pluginNotFound',
  HARNESS_STALE_WRITE: 'harness.error.staleWrite',
  HARNESS_PARSE_ERROR: 'harness.error.parseError',
};

function handleError(req: Request, res: Response, error: unknown): void {
  const nodeError = error as NodeJS.ErrnoException & { currentMtime?: string };
  for (const key of MAPPED_CODES) {
    const entry = HARNESS_ERRORS[key];
    if (nodeError.code === entry.code) {
      const body: { code: string; message: string; details?: Record<string, unknown> } = {
        code: entry.code,
        message: req.t ? req.t(MESSAGE_KEY[key]) : entry.code,
      };
      if (key === 'HARNESS_STALE_WRITE') {
        body.details = { currentMtime: nodeError.currentMtime ?? '' };
      }
      res.status(entry.httpStatus).json({ error: body });
      return;
    }
  }
  res.status(HARNESS_ERRORS.HARNESS_WRITE_ERROR.httpStatus).json({
    error: {
      code: HARNESS_ERRORS.HARNESS_WRITE_ERROR.code,
      message: req.t ? req.t('harness.error.writeError') : HARNESS_ERRORS.HARNESS_WRITE_ERROR.code,
    },
  });
}

export const harnessPluginController = {
  /** GET /api/harness/plugins */
  async list(req: Request, res: Response): Promise<void> {
    const parsed = projectSlugQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    try {
      const result = await harnessPluginService.listCards(parsed.data.projectSlug);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** POST /api/harness/plugins/toggle */
  async toggle(req: Request, res: Response): Promise<void> {
    const query = projectSlugQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: query.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    const body = toggleBodySchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: body.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await harnessPluginService.toggleEnabled(body.data, query.data.projectSlug);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
