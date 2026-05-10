/**
 * Story 30.1 (Task 2.3): share-scope controller.
 *
 * Thin Express handler on top of `harnessShareScopeService`. Mirrors
 * `harnessController` conventions exactly: Zod refine validation, inline
 * `HARNESS_*` error mapping, common `{ error: { code, message, details? } }`
 * envelope. No global Express error middleware in this codebase — see
 * `harnessController.ts` for the reference pattern.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { harnessShareScopeService } from '../services/harnessShareScopeService.js';

/**
 * `paths` is a comma-separated list because GET query strings cannot reliably
 * carry arbitrary arrays. Each item is a project-relative POSIX path.
 */
const querySchema = z
  .object({
    scope: z.literal('project'),
    projectSlug: z.string().min(1, 'projectSlug is required when scope is "project"'),
    paths: z.string().optional().default(''),
  })
  .strict();

const MAPPED_CODES = ['HARNESS_ROOT_MISSING', 'HARNESS_FORBIDDEN', 'HARNESS_PATH_DENIED'] as const;

const MESSAGE_KEY: Record<typeof MAPPED_CODES[number], string> = {
  HARNESS_ROOT_MISSING: 'harness.error.rootMissing',
  HARNESS_FORBIDDEN: 'harness.error.forbidden',
  HARNESS_PATH_DENIED: 'harness.error.pathDenied',
};

function handleError(req: Request, res: Response, error: unknown): void {
  const nodeError = error as NodeJS.ErrnoException;
  for (const key of MAPPED_CODES) {
    const entry = HARNESS_ERRORS[key];
    if (nodeError.code === entry.code) {
      res.status(entry.httpStatus).json({
        error: { code: entry.code, message: req.t!(MESSAGE_KEY[key]) },
      });
      return;
    }
  }
  res.status(HARNESS_ERRORS.HARNESS_WRITE_ERROR.httpStatus).json({
    error: {
      code: HARNESS_ERRORS.HARNESS_WRITE_ERROR.code,
      message: req.t!('harness.error.writeError'),
    },
  });
}

export const harnessShareScopeController = {
  /** GET /api/harness/share-scope?scope=project&projectSlug=<slug>&paths=<comma> */
  async evaluate(req: Request, res: Response): Promise<void> {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'invalid query';
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: msg } });
      return;
    }

    const relativePaths = parsed.data.paths
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    try {
      const result = await harnessShareScopeService.evaluate({
        projectSlug: parsed.data.projectSlug,
        relativePaths,
      });
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
