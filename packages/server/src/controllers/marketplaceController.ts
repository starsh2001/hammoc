/**
 * Story 31.4: Plugin marketplace catalog controller (read-only).
 *
 * Thin Express handler on top of `marketplaceService`. Mirrors the inline
 * `HARNESS_ERRORS` envelope mapping used by `harnessPluginController` — there
 * is no global Express error middleware, so the handler catches and maps to
 * the common `{ error: { code, message } }` envelope.
 *
 * Only a single GET endpoint exists: the catalog is read-only. Direct
 * install / marketplace-add automation was dropped after Story 31.4 spike #2
 * (negative) — installs are guided via copy-only command blocks, so there are
 * no POST routes here. (See sdk-upstream-issues.md §18.)
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { marketplaceService } from '../services/marketplaceService.js';

const projectSlugParam = z.object({
  projectSlug: z.string().min(1),
});

const MAPPED_CODES = [
  'HARNESS_PATH_DENIED',
  'HARNESS_FORBIDDEN',
  'HARNESS_FILE_NOT_FOUND',
  'HARNESS_ROOT_MISSING',
  'HARNESS_PARSE_ERROR',
] as const;

const MESSAGE_KEY: Record<typeof MAPPED_CODES[number], string> = {
  HARNESS_PATH_DENIED: 'harness.error.pathDenied',
  HARNESS_FORBIDDEN: 'harness.error.forbidden',
  HARNESS_FILE_NOT_FOUND: 'harness.error.fileNotFound',
  HARNESS_ROOT_MISSING: 'harness.error.rootMissing',
  HARNESS_PARSE_ERROR: 'harness.error.parseError',
};

function handleError(req: Request, res: Response, error: unknown): void {
  const nodeError = error as NodeJS.ErrnoException;
  for (const key of MAPPED_CODES) {
    const entry = HARNESS_ERRORS[key];
    if (nodeError.code === entry.code) {
      res.status(entry.httpStatus).json({
        error: {
          code: entry.code,
          message: req.t ? req.t(MESSAGE_KEY[key]) : entry.code,
        },
      });
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

export const marketplaceController = {
  /** GET /api/harness/marketplace/:projectSlug/catalog */
  async catalog(req: Request, res: Response): Promise<void> {
    const parsed = projectSlugParam.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid params' },
      });
      return;
    }
    try {
      const result = await marketplaceService.listCatalog(parsed.data.projectSlug);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
