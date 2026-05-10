/**
 * Story 30.2 (Task 2.2): static harness lint controller.
 *
 * `GET /api/harness/lint?scope=user` and `?scope=project&projectSlug=<slug>`
 * return the precomputed `LintIssue[]` plus the effective rule preferences
 * (defaults merged on top of `~/.hammoc/preferences.json`).
 *
 * Mirrors `harnessShareScopeController` exactly: Zod refine validation,
 * inline `HARNESS_*` error mapping, common `{ error: { code, message } }`
 * envelope. No global Express error middleware in this codebase — see
 * `harnessController.ts` for the reference pattern.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { harnessLintService, resolveRulePreferences } from '../services/harnessLintService.js';
import { preferencesService } from '../services/preferencesService.js';

const querySchema = z
  .object({
    scope: z.enum(['user', 'project']),
    projectSlug: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (v) => v.scope !== 'project' || (v.projectSlug !== undefined && v.projectSlug.length > 0),
    { message: 'projectSlug is required when scope is "project"', path: ['projectSlug'] },
  );

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

export const harnessLintController = {
  /** GET /api/harness/lint?scope=user|project&projectSlug=<slug> */
  async evaluate(req: Request, res: Response): Promise<void> {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'invalid query';
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: msg } });
      return;
    }

    try {
      const prefs = await preferencesService.readPreferences();
      const rulePreferences = resolveRulePreferences(prefs.harnessLintRules);
      const result = await harnessLintService.evaluate({
        scope: parsed.data.scope,
        projectSlug: parsed.data.projectSlug,
        rulePreferences,
      });
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
