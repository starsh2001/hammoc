/**
 * Story 30.5 (Task B): Harness Export/Import bundle controller.
 *
 * Four endpoints in `routes/harness.ts` mount onto this controller:
 *   - POST /api/harness/bundle/export
 *   - POST /api/harness/bundle/import/preview   (multipart/form-data)
 *   - POST /api/harness/bundle/import/apply
 *   - GET  /api/harness/bundle/plugin-deps
 *
 * Validation:
 *   - Request bodies / query strings flow through the Zod schemas in
 *     `harnessBundleSchema.ts` (Task 4 prerequisite). The schemas reject
 *     `included-explicit` without `acknowledgedSecretInclusion: true` via
 *     refine (AC2.d-2).
 *   - The import preview path refuses non-multipart requests with 415 so the
 *     client clearly distinguishes "you sent JSON instead of a file".
 *   - Apply against a non-compatible bundle (future / invalid / malformed)
 *     surfaces 422 with the original compatibility detail (AC5).
 *   - ZIP-slip / path-traversal entries surface as 400 carrying
 *     `HARNESS_BUNDLE_UNSAFE_PATH` (AC9).
 *
 * Response envelopes match the existing harness controllers — error path
 * uses `{ error: { code, message, details? } }`.
 */

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  exportBundleRequestSchema,
  importApplyRequestSchema,
  pluginDepsQuerySchema,
} from '../utils/harnessBundleSchema.js';
import {
  harnessBundleService,
  type ImportInput,
} from '../services/harnessBundleService.js';
import { UnsafeBundlePathError } from '../utils/assertSafeBundlePath.js';
import type { ImportItemAction } from '@hammoc/shared';

// ----- multer middleware (memory storage; ZIP small enough to keep in RAM) -

const MAX_BUNDLE_BYTES = 50 * 1024 * 1024; // 50MB hard ceiling

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BUNDLE_BYTES, files: 1 },
});

export function handleBundleUpload(req: Request, res: Response, next: NextFunction): void {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    res.status(415).json({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Expected multipart/form-data with a ZIP file in the "file" field.',
      },
    });
    return;
  }
  upload.single('file')(req, res, (err: unknown) => {
    if (err && err instanceof Error && 'code' in err) {
      const code = (err as Error & { code: string }).code;
      if (code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: { code: 'UPLOAD_TOO_LARGE', message: 'Bundle exceeds 50MB upload limit.' },
        });
        return;
      }
      if (code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({
          error: { code: 'UPLOAD_UNEXPECTED_FIELD', message: 'Use the "file" field for the ZIP upload.' },
        });
        return;
      }
    }
    if (err) {
      res.status(500).json({
        error: { code: 'UPLOAD_ERROR', message: 'Failed to receive the uploaded bundle.' },
      });
      return;
    }
    next();
  });
}

// ----- Zod request schemas (server-side refine for the export endpoint) ----

const exportBodySchema = exportBundleRequestSchema
  .extend({
    acknowledgedSecretInclusion: z.boolean().optional(),
  })
  .refine(
    (v) => v.secretsPolicy !== 'included-explicit' || v.acknowledgedSecretInclusion === true,
    {
      message: 'acknowledgedSecretInclusion must be true when secretsPolicy === "included-explicit"',
      path: ['acknowledgedSecretInclusion'],
    },
  );

const applyBodySchema = importApplyRequestSchema.extend({
  projectSlug: z.string().min(1),
});

const previewMultipartSchema = z.object({
  projectSlug: z.string().min(1),
});

// ----- Controller surface ---------------------------------------------------

export const harnessBundleController = {
  /** POST /api/harness/bundle/export */
  async export(req: Request, res: Response): Promise<void> {
    const parsed = exportBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: parsed.error.issues[0]?.message ?? 'invalid body',
          details: { issues: parsed.error.issues },
        },
      });
      return;
    }
    try {
      const result = await harnessBundleService.export({
        projectSlug: parsed.data.projectSlug,
        includes: parsed.data.includes,
        secretsPolicy: parsed.data.secretsPolicy,
        acknowledgedSecretInclusion: parsed.data.acknowledgedSecretInclusion,
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`,
      );
      res.setHeader('X-Hammoc-Secrets-Removed', String(result.secretsRemovedCount));
      res.setHeader('X-Hammoc-Secrets-Replaced', String(result.secretsReplacedCount));
      res.setHeader('X-Hammoc-Has-Plaintext-Secrets', String(result.hadPlaintextSecrets));
      res.status(200).send(result.zipBuffer);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'HARNESS_SECRET_ACK_MISSING') {
        res.status(400).json({
          error: {
            code: 'HARNESS_SECRET_ACK_MISSING',
            message: 'acknowledgedSecretInclusion must be true to export plaintext secrets.',
          },
        });
        return;
      }
      if (code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({
          error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' },
        });
        return;
      }
      res.status(500).json({
        error: {
          code: 'HARNESS_BUNDLE_EXPORT_ERROR',
          message: `Failed to export bundle: ${(error as Error).message}`,
        },
      });
    }
  },

  /** POST /api/harness/bundle/import/preview (multipart/form-data) */
  async importPreview(req: Request, res: Response): Promise<void> {
    const file = (req as Request & { file?: { buffer: Buffer; size: number } }).file;
    if (!file || !file.buffer) {
      res.status(400).json({
        error: { code: 'MISSING_FILE', message: 'A ZIP file is required in the "file" field.' },
      });
      return;
    }
    const parsed = previewMultipartSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: parsed.error.issues[0]?.message ?? 'invalid form fields',
        },
      });
      return;
    }
    try {
      const result = await harnessBundleService.import({
        projectSlug: parsed.data.projectSlug,
        zipBuffer: file.buffer,
        dryRun: true,
      });

      // Stash the bundle behind a one-time token so a follow-up apply call can
      // re-resolve the exact same bytes.
      const bundleToken = harnessBundleService.storeBundle(
        parsed.data.projectSlug,
        file.buffer,
        result.manifest,
      );

      res.status(200).json({
        bundleToken,
        manifest: result.manifest,
        preview: result.preview,
        compatibility: result.compatibility,
        compatibilityDetail: result.compatibilityDetail,
      });
    } catch (error) {
      if (error instanceof UnsafeBundlePathError) {
        res.status(400).json({
          error: {
            code: error.code,
            message: error.message,
            details: { relativePath: error.relativePath },
          },
        });
        return;
      }
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({
          error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' },
        });
        return;
      }
      res.status(500).json({
        error: {
          code: 'HARNESS_BUNDLE_PREVIEW_ERROR',
          message: `Failed to preview bundle: ${(error as Error).message}`,
        },
      });
    }
  },

  /** POST /api/harness/bundle/import/apply */
  async importApply(req: Request, res: Response): Promise<void> {
    const parsed = applyBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: parsed.error.issues[0]?.message ?? 'invalid body',
          details: { issues: parsed.error.issues },
        },
      });
      return;
    }

    const entry = harnessBundleService.consumeBundle(parsed.data.bundleToken);
    if (!entry) {
      res.status(404).json({
        error: {
          code: 'HARNESS_BUNDLE_TOKEN_NOT_FOUND',
          message: 'Bundle token expired or unknown — request a new import preview.',
        },
      });
      return;
    }
    if (entry.projectSlug !== parsed.data.projectSlug) {
      res.status(400).json({
        error: {
          code: 'HARNESS_BUNDLE_TOKEN_MISMATCH',
          message: 'Bundle token belongs to a different project.',
        },
      });
      return;
    }

    try {
      const input: ImportInput = {
        projectSlug: parsed.data.projectSlug,
        zipBuffer: entry.zipBuffer,
        dryRun: false,
        itemActions: parsed.data.itemActions as Record<string, ImportItemAction>,
      };
      const result = await harnessBundleService.import(input);
      if (result.compatibility !== 'compatible') {
        res.status(422).json({
          error: {
            code: 'HARNESS_BUNDLE_INCOMPATIBLE',
            message: `Bundle is ${result.compatibility}; apply refused.`,
            details: {
              compatibility: result.compatibility,
              compatibilityDetail: result.compatibilityDetail,
            },
          },
        });
        return;
      }
      // Token consumed — release.
      harnessBundleService.releaseBundle(parsed.data.bundleToken);
      res.status(200).json({ appliedSummary: result.appliedSummary });
    } catch (error) {
      if (error instanceof UnsafeBundlePathError) {
        res.status(400).json({
          error: {
            code: error.code,
            message: error.message,
            details: { relativePath: error.relativePath },
          },
        });
        return;
      }
      res.status(500).json({
        error: {
          code: 'HARNESS_BUNDLE_APPLY_ERROR',
          message: `Failed to apply bundle: ${(error as Error).message}`,
        },
      });
    }
  },

  /** GET /api/harness/bundle/plugin-deps?projectSlug=<slug> */
  async pluginDeps(req: Request, res: Response): Promise<void> {
    const parsed = pluginDepsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: parsed.error.issues[0]?.message ?? 'invalid query',
        },
      });
      return;
    }
    try {
      const pluginDependencies = await harnessBundleService.collectPluginDependencies(
        parsed.data.projectSlug,
      );
      res.status(200).json({ pluginDependencies });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({
          error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' },
        });
        return;
      }
      res.status(500).json({
        error: {
          code: 'HARNESS_BUNDLE_PLUGIN_DEPS_ERROR',
          message: `Failed to load plugin dependencies: ${(error as Error).message}`,
        },
      });
    }
  },
};
