/**
 * Story 31.2: SessionStart context-builder controller (Epic 31).
 *
 * Mounts at:
 *   GET    /api/harness/context-builder/:projectSlug            → read manifest + artifact state
 *   PUT    /api/harness/context-builder/:projectSlug            → save manifest + (re)generate
 *   POST   /api/harness/context-builder/:projectSlug/disable    → disable + cleanup
 *
 * Mirrors `bmadCoreConfigController` (Story 31.1): success responses are the raw
 * result object; failures are `{ error: { code, message, details? } }` with the
 * message resolved through `req.t!()` for i18n. There is no global Express error
 * middleware — `HARNESS_ERRORS` codes are mapped to HTTP statuses inline,
 * reusing the existing `harness.error.*` i18n keys.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { contextBuilderService } from '../services/contextBuilderService.js';

const projectSlugSchema = z.string().min(1, 'projectSlug is required');

const manifestSchema = z.object({
  version: z.literal(1).optional(),
  enabled: z.boolean(),
  files: z.array(z.string()),
  variables: z.record(z.string(), z.boolean()),
  recentCommitsCount: z.number().optional(),
  customCommands: z.array(
    z.object({ command: z.string(), acknowledged: z.boolean() }),
  ),
});

const putBodySchema = z.object({
  manifest: manifestSchema,
  expectedMtime: z.string().optional(),
});

const disableBodySchema = z.object({
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
  const nodeError = error as NodeJS.ErrnoException & { currentMtime?: string };
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

export const contextBuilderController = {
  /**
   * GET /api/harness/context-builder/:projectSlug
   *
   * Returns the manifest + derived artifact state (script exists, entry
   * registered). A missing manifest yields a default (disabled, empty) manifest
   * with `mtime: ''` so the panel opens in an empty-state.
   */
  async read(req: Request, res: Response): Promise<void> {
    const projectSlug = parseSlug(req, res);
    if (!projectSlug) return;
    try {
      const result = await contextBuilderService.readManifest(projectSlug);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /**
   * PUT /api/harness/context-builder/:projectSlug
   * body: { manifest: ContextBuilderManifest; expectedMtime? }
   *
   * Persists the manifest then (re)generates the script + settings entry when
   * enabled (or removes them when disabled). Returns the new manifest mtime +
   * artifact locations + non-blocking secret warnings (AC5.c).
   */
  async write(req: Request, res: Response): Promise<void> {
    const projectSlug = parseSlug(req, res);
    if (!projectSlug) return;
    const parsed = putBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await contextBuilderService.writeManifest(
        projectSlug,
        parsed.data.manifest,
        parsed.data.expectedMtime,
      );
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /**
   * POST /api/harness/context-builder/:projectSlug/disable
   * body: { expectedMtime? }
   *
   * Retains the declaration (`enabled: false`) but removes the generated script
   * and the Hammoc-managed SessionStart entry (foreign entries preserved).
   */
  async disable(req: Request, res: Response): Promise<void> {
    const projectSlug = parseSlug(req, res);
    if (!projectSlug) return;
    const parsed = disableBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      await contextBuilderService.disable(projectSlug, parsed.data.expectedMtime);
      res.json({ success: true });
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
