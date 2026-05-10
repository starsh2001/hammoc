/**
 * Story 28.0.5: Harness workbench controller.
 *
 * Thin Express handlers on top of `harnessService`. Error mapping is inline
 * because this codebase has no global Express error middleware — see the
 * pattern in `fileSystemController.ts:297-328`. All responses use the common
 * envelope `{ error: { code, message, details? } }` so integration test B5
 * can assert body shape.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import {
  HARNESS_ERRORS,
  type HarnessPathRef,
  type HarnessScope,
  type HarnessStructuredPatchOp,
} from '@hammoc/shared';
import { harnessService } from '../services/harnessService.js';

const pathRefQuerySchema = z.object({
  scope: z.enum(['user', 'project']),
  projectSlug: z.string().optional(),
  path: z.string().optional().default(''),
}).refine(
  (v) => v.scope !== 'project' || (v.projectSlug && v.projectSlug.length > 0),
  { message: 'projectSlug is required when scope is "project"', path: ['projectSlug'] },
);

const writeBodySchema = z.object({
  content: z.string(),
  expectedMtime: z.string().optional(),
});

const patchBodySchema = z.object({
  format: z.enum(['yaml', 'jsonc']),
  ops: z.array(z.object({
    path: z.array(z.union([z.string(), z.number()])).min(1),
    value: z.unknown().optional(),
  })),
  expectedMtime: z.string().optional(),
});

function parseQuery(req: Request, res: Response): HarnessPathRef | null {
  const parsed = pathRefQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'invalid query';
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: msg } });
    return null;
  }
  return {
    scope: parsed.data.scope as HarnessScope,
    projectSlug: parsed.data.projectSlug,
    relativePath: parsed.data.path,
  };
}

/**
 * Iterate the HARNESS_ERRORS table and send the matching response. Only
 * client-facing codes are listed here — unmatched exceptions fall through to
 * the 500 catch-all in the caller. `HARNESS_WRITE_ERROR` is intentionally
 * excluded from this loop: it is the catch-all for unmatched exceptions.
 */
const MAPPED_CODES = [
  'HARNESS_PATH_DENIED',
  'HARNESS_FORBIDDEN',
  'HARNESS_FILE_NOT_FOUND',
  'HARNESS_NOT_A_FILE',
  'HARNESS_ROOT_MISSING',
  'HARNESS_PARENT_NOT_FOUND',
  'HARNESS_STALE_WRITE',
  'HARNESS_PARSE_ERROR',
  'HARNESS_SECRET_ON_SHARED',
] as const;

const MESSAGE_KEY: Record<typeof MAPPED_CODES[number], string> = {
  HARNESS_PATH_DENIED: 'harness.error.pathDenied',
  HARNESS_FORBIDDEN: 'harness.error.forbidden',
  HARNESS_FILE_NOT_FOUND: 'harness.error.fileNotFound',
  HARNESS_NOT_A_FILE: 'harness.error.notAFile',
  HARNESS_ROOT_MISSING: 'harness.error.rootMissing',
  HARNESS_PARENT_NOT_FOUND: 'harness.error.parentNotFound',
  HARNESS_STALE_WRITE: 'harness.error.staleWrite',
  HARNESS_PARSE_ERROR: 'harness.error.parseError',
  HARNESS_SECRET_ON_SHARED: 'harness.error.secretOnShared',
};

function handleError(req: Request, res: Response, error: unknown): void {
  const nodeError = error as NodeJS.ErrnoException & {
    currentMtime?: string;
    relativePath?: string;
    lines?: number[];
    paths?: string[];
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
      // Story 30.1 (AC4.c): surface the secret locations + the offending path
      // so the client dialog can list them and compute the `*.local.<ext>`
      // sibling without a second round trip.
      if (key === 'HARNESS_SECRET_ON_SHARED') {
        body.details = {
          relativePath: nodeError.relativePath ?? '',
          ...(nodeError.lines ? { lines: nodeError.lines } : {}),
          ...(nodeError.paths ? { paths: nodeError.paths } : {}),
        };
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

export const harnessController = {
  /** GET /api/harness/list */
  async list(req: Request, res: Response): Promise<void> {
    const ref = parseQuery(req, res);
    if (!ref) return;
    try {
      const result = await harnessService.list(ref);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** GET /api/harness/read */
  async read(req: Request, res: Response): Promise<void> {
    const ref = parseQuery(req, res);
    if (!ref) return;
    try {
      const result = await harnessService.read(ref);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** PUT /api/harness/write */
  async write(req: Request, res: Response): Promise<void> {
    const ref = parseQuery(req, res);
    if (!ref) return;
    const body = writeBodySchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: body.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await harnessService.write(ref, body.data);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** POST /api/harness/patch-structured */
  async patchStructured(req: Request, res: Response): Promise<void> {
    const ref = parseQuery(req, res);
    if (!ref) return;
    const body = patchBodySchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: body.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await harnessService.patchStructured(ref, {
        format: body.data.format,
        ops: body.data.ops as HarnessStructuredPatchOp[],
        expectedMtime: body.data.expectedMtime,
      });
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
