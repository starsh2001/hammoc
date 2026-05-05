/**
 * Story 29.1: Claude Code free-edit memory layer controller.
 *
 * Mounts at GET/PUT/POST `/api/harness/claude-md` to expose the two CLAUDE.md
 * files (project root + global) the harness workbench manages. Mirrors the
 * error-mapping pattern in `harnessController.ts` (Story 28.0.5) — the same
 * envelope `{ error: { code, message, details? } }` and `req.t!()` i18n
 * resolution apply, so client-side error handling is uniform across all
 * harness endpoints.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { claudeMdService, type ClaudeMdRef } from '../services/claudeMdService.js';

const refQuerySchema = z
  .object({
    scope: z.enum(['user', 'project']),
    projectSlug: z.string().optional(),
  })
  .refine(
    (v) => v.scope !== 'project' || (v.projectSlug && v.projectSlug.length > 0),
    { message: 'projectSlug is required when scope is "project"', path: ['projectSlug'] },
  );

const writeBodySchema = z
  .object({
    scope: z.enum(['user', 'project']),
    projectSlug: z.string().optional(),
    content: z.string(),
    expectedMtime: z.string().optional(),
  })
  .refine(
    (v) => v.scope !== 'project' || (v.projectSlug && v.projectSlug.length > 0),
    { message: 'projectSlug is required when scope is "project"', path: ['projectSlug'] },
  );

const createBodySchema = z
  .object({
    scope: z.enum(['user', 'project']),
    projectSlug: z.string().optional(),
  })
  .refine(
    (v) => v.scope !== 'project' || (v.projectSlug && v.projectSlug.length > 0),
    { message: 'projectSlug is required when scope is "project"', path: ['projectSlug'] },
  );

const MAPPED_CODES = [
  'HARNESS_PATH_DENIED',
  'HARNESS_FORBIDDEN',
  'HARNESS_FILE_NOT_FOUND',
  'HARNESS_NOT_A_FILE',
  'HARNESS_ROOT_MISSING',
  'HARNESS_PARENT_NOT_FOUND',
  'HARNESS_STALE_WRITE',
  'HARNESS_FILE_EXISTS',
  'HARNESS_PARSE_ERROR',
] as const;

const MESSAGE_KEY: Record<typeof MAPPED_CODES[number], string> = {
  HARNESS_PATH_DENIED: 'harness.error.pathDenied',
  HARNESS_FORBIDDEN: 'harness.error.forbidden',
  HARNESS_FILE_NOT_FOUND: 'harness.error.fileNotFound',
  HARNESS_NOT_A_FILE: 'harness.error.notAFile',
  HARNESS_ROOT_MISSING: 'harness.error.rootMissing',
  HARNESS_PARENT_NOT_FOUND: 'harness.error.parentNotFound',
  HARNESS_STALE_WRITE: 'harness.error.staleWrite',
  HARNESS_FILE_EXISTS: 'harness.claudeMd.error.fileExists',
  HARNESS_PARSE_ERROR: 'harness.error.parseError',
};

function handleError(req: Request, res: Response, error: unknown): void {
  const nodeError = error as NodeJS.ErrnoException & {
    currentMtime?: string;
    absolutePath?: string;
  };
  for (const key of MAPPED_CODES) {
    const entry = HARNESS_ERRORS[key];
    if (nodeError.code === entry.code) {
      const body: { code: string; message: string; details?: Record<string, unknown> } = {
        code: entry.code,
        message: req.t!(MESSAGE_KEY[key]),
      };
      if (key === 'HARNESS_STALE_WRITE') {
        body.details = { currentMtime: nodeError.currentMtime ?? '' };
      }
      // Story 29.1 (AC4.c): surface the resolved absolute path in 404 details
      // so the client can render the empty-state "Create CLAUDE.md?" confirm
      // dialog with the canonical location string.
      if (key === 'HARNESS_FILE_NOT_FOUND' && nodeError.absolutePath) {
        body.details = { absolutePath: nodeError.absolutePath };
      }
      res.status(entry.httpStatus).json({ error: body });
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

function parseQueryRef(req: Request, res: Response): ClaudeMdRef | null {
  const parsed = refQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'invalid query';
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: msg } });
    return null;
  }
  return { scope: parsed.data.scope, projectSlug: parsed.data.projectSlug };
}

export const claudeMdController = {
  /** GET /api/harness/claude-md?scope=user | scope=project&projectSlug=<slug> */
  async read(req: Request, res: Response): Promise<void> {
    const ref = parseQueryRef(req, res);
    if (!ref) return;
    try {
      const result = await claudeMdService.read(ref);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** PUT /api/harness/claude-md  body: { scope, projectSlug?, content, expectedMtime? } */
  async write(req: Request, res: Response): Promise<void> {
    const parsed = writeBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: parsed.error.issues[0]?.message ?? 'invalid body',
        },
      });
      return;
    }
    try {
      const result = await claudeMdService.write(
        { scope: parsed.data.scope, projectSlug: parsed.data.projectSlug },
        { content: parsed.data.content, expectedMtime: parsed.data.expectedMtime },
      );
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /**
   * POST /api/harness/claude-md  body: { scope, projectSlug? }
   *
   * AC4: creates an empty file. Distinct from PUT-with-empty-content so client
   * intent ("create new") is preserved at the controller boundary. Pre-existing
   * file → 409 HARNESS_FILE_EXISTS (no overwrite).
   */
  async create(req: Request, res: Response): Promise<void> {
    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: parsed.error.issues[0]?.message ?? 'invalid body',
        },
      });
      return;
    }
    try {
      const result = await claudeMdService.create({
        scope: parsed.data.scope,
        projectSlug: parsed.data.projectSlug,
      });
      res.status(201).json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
