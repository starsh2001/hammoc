/**
 * Story 31.1: BMad core-config editor controller (Epic 31).
 *
 * Mounts at GET/PATCH `/api/harness/bmad-config/:projectSlug` and
 * PUT `/api/harness/bmad-config/:projectSlug/raw`. Mirrors the error-mapping
 * envelope of `claudeMdController` (Story 29.1) / `harnessController`
 * (Story 28.0.5): success responses are the raw result object and failures are
 * `{ error: { code, message, details? } }` with the message resolved through
 * `req.t!()` for i18n. There is no global Express error middleware — this
 * controller maps `HARNESS_ERRORS` codes to HTTP statuses inline.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import {
  HARNESS_ERRORS,
  type BmadCoreConfigReadResponse,
  type HarnessStructuredPatchOp,
} from '@hammoc/shared';
import { bmadCoreConfigService } from '../services/bmadCoreConfigService.js';

const projectSlugSchema = z.string().min(1, 'projectSlug is required');

const patchOpSchema = z.object({
  // `value` is intentionally `z.unknown()` so an omitted key parses to
  // `undefined` (= delete per HarnessStructuredPatchOp), while an explicit
  // `null` stays a real YAML-null set (e.g. customTechnicalDocuments: null).
  path: z.array(z.union([z.string(), z.number()])).min(1, 'patch op requires a non-empty path'),
  value: z.unknown(),
});

const patchBodySchema = z.object({
  ops: z.array(patchOpSchema).min(1, 'at least one patch op is required'),
  expectedMtime: z.string().optional(),
});

const rawBodySchema = z.object({
  content: z.string(),
  expectedMtime: z.string().optional(),
});

const MAPPED_CODES = [
  'HARNESS_PATH_DENIED',
  'HARNESS_FORBIDDEN',
  'HARNESS_FILE_NOT_FOUND',
  'HARNESS_NOT_A_FILE',
  'HARNESS_ROOT_MISSING',
  'HARNESS_STALE_WRITE',
  'HARNESS_PARSE_ERROR',
] as const;

const MESSAGE_KEY: Record<typeof MAPPED_CODES[number], string> = {
  HARNESS_PATH_DENIED: 'harness.error.pathDenied',
  HARNESS_FORBIDDEN: 'harness.error.forbidden',
  HARNESS_FILE_NOT_FOUND: 'harness.error.fileNotFound',
  HARNESS_NOT_A_FILE: 'harness.error.notAFile',
  HARNESS_ROOT_MISSING: 'harness.error.rootMissing',
  HARNESS_STALE_WRITE: 'harness.error.staleWrite',
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

function parseSlug(req: Request, res: Response): string | null {
  const parsed = projectSlugSchema.safeParse(req.params.projectSlug);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid projectSlug' },
    });
    return null;
  }
  return parsed.data;
}

export const bmadCoreConfigController = {
  /**
   * GET /api/harness/bmad-config/:projectSlug
   *
   * Returns content + mtime + the known/unknown key partition. A malformed
   * on-disk YAML does NOT 422 here (the API contract limits GET errors to
   * FILE_NOT_FOUND / FORBIDDEN): the raw content is still returned with empty
   * partitions so the client can open in Raw mode and repair the file.
   */
  async read(req: Request, res: Response): Promise<void> {
    const projectSlug = parseSlug(req, res);
    if (!projectSlug) return;
    try {
      const { content, mtime } = await bmadCoreConfigService.read(projectSlug);
      let knownKeys: BmadCoreConfigReadResponse['knownKeys'] = {};
      let unknownKeys: BmadCoreConfigReadResponse['unknownKeys'] = {};
      try {
        const partition = bmadCoreConfigService.parseUnknownKeys(content);
        knownKeys = partition.knownKeys;
        unknownKeys = partition.unknownKeys;
      } catch {
        // Malformed YAML on disk — return raw content with empty partitions so
        // the panel can still open and the user can fix it in Raw mode.
      }
      const response: BmadCoreConfigReadResponse = { content, mtime, knownKeys, unknownKeys };
      res.json(response);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /**
   * PATCH /api/harness/bmad-config/:projectSlug
   * body: { ops: HarnessStructuredPatchOp[]; expectedMtime? }
   *
   * AST patch preserving comments/order/quoting; unknown keys round-trip
   * untouched. A malformed on-disk YAML surfaces as HARNESS_PARSE_ERROR (422)
   * so the client switches to Raw mode.
   */
  async patch(req: Request, res: Response): Promise<void> {
    const projectSlug = parseSlug(req, res);
    if (!projectSlug) return;
    const parsed = patchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await bmadCoreConfigService.patchKey(
        projectSlug,
        parsed.data.ops as HarnessStructuredPatchOp[],
        parsed.data.expectedMtime,
      );
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /**
   * PUT /api/harness/bmad-config/:projectSlug/raw
   * body: { content: string; expectedMtime? }
   *
   * Raw-mode overwrite (bypasses the AST patch). STALE_WRITE guard still
   * applies so a raw save cannot clobber an external edit silently.
   */
  async writeRaw(req: Request, res: Response): Promise<void> {
    const projectSlug = parseSlug(req, res);
    if (!projectSlug) return;
    const parsed = rawBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await bmadCoreConfigService.writeRaw(
        projectSlug,
        parsed.data.content,
        parsed.data.expectedMtime,
      );
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
