/**
 * Story 28.5: Harness slash-command list / read / create / update / copy / delete controller.
 *
 * Mirrors the inline error-mapping pattern from harnessHookController — each
 * handler walks the shared HARNESS_ERRORS table to emit
 * `{ error: { code, message, details? } }` envelopes. New mapped codes for
 * this story: HARNESS_COMMAND_NOT_FOUND and HARNESS_COMMAND_NAME_CONFLICT.
 *
 * Route surface (mounted at /api/harness from routes/harness.ts):
 *   GET    /commands?projectSlug=<slug>?
 *   GET    /commands/* (path-as-glob)
 *   POST   /commands
 *   PUT    /commands/* (path-as-glob)
 *   POST   /commands/copy
 *   POST   /commands/copy-directory
 *   DELETE /commands/* (path-as-glob)
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  HARNESS_ERRORS,
  type HarnessCommandCopyRequest,
  type HarnessCommandCreateRequest,
  type HarnessCommandDeleteRequest,
  type HarnessCommandDirectoryCopyRequest,
} from '@hammoc/shared';
import {
  harnessCommandService,
  resolveCommandSourceLocation,
} from '../services/harnessCommandService.js';

const commandScopeSchema = z.enum(['project', 'user', 'plugin']);
const editableScopeSchema = z.enum(['project', 'user']);
const modelSchema = z.enum(['inherit', 'sonnet', 'opus', 'haiku']);

const frontmatterSchema = z
  .object({
    description: z.string().max(2048).optional(),
    'argument-hint': z.string().max(256).optional(),
    'allowed-tools': z.string().max(2048).optional(),
    model: modelSchema.optional(),
  })
  .strict();

const relativePathSchema = z
  .string()
  .min(3)
  .max(512)
  .refine((v) => v.endsWith('.md'), { message: 'must end in .md' })
  .refine((v) => !v.includes('..'), { message: 'path traversal denied' })
  .refine(
    (v) =>
      v
        .replace(/\\/g, '/')
        .split('/')
        .every(
          (seg) =>
            seg.length > 0 &&
            // eslint-disable-next-line no-control-regex
            !/[\\<>:"|?*\x00-\x1F]/.test(seg) &&
            !/[. ]$/.test(seg),
        ),
    { message: 'OS-reserved characters or empty/trailing-dot segments not allowed' },
  );

const directoryPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((v) => !v.includes('..'), { message: 'path traversal denied' })
  .refine(
    (v) =>
      v
        .replace(/\\/g, '/')
        .replace(/\/+$/, '')
        .split('/')
        .every(
          (seg) =>
            seg.length > 0 &&
            // eslint-disable-next-line no-control-regex
            !/[\\<>:"|?*\x00-\x1F]/.test(seg) &&
            !/[. ]$/.test(seg),
        ),
    { message: 'OS-reserved characters or empty/trailing-dot segments not allowed' },
  );

const listQuery = z.object({
  projectSlug: z.string().min(1).optional(),
});

const readQuery = z.object({
  scope: commandScopeSchema,
  projectSlug: z.string().min(1).optional(),
  pluginKey: z.string().min(1).optional(),
});

const updateQuery = z.object({
  scope: editableScopeSchema,
  projectSlug: z.string().min(1).optional(),
});

const deleteQuery = z.object({
  scope: editableScopeSchema,
  projectSlug: z.string().min(1).optional(),
});

const updateBody = z
  .object({
    frontmatter: frontmatterSchema.optional(),
    body: z.string().optional(),
    raw: z.string().optional(),
    expectedMtime: z.string().optional(),
  })
  .refine(
    (v) => [v.frontmatter, v.body, v.raw].filter((x) => x !== undefined).length === 1,
    { message: 'exactly one of frontmatter / body / raw is required' },
  );

const createBody = z
  .object({
    scope: editableScopeSchema,
    projectSlug: z.string().min(1).optional(),
    relativePath: relativePathSchema,
    frontmatter: frontmatterSchema.optional(),
    body: z.string().optional(),
  })
  .refine((v) => v.scope !== 'project' || !!v.projectSlug, {
    message: 'projectSlug is required when scope is project',
  });

const copyBody = z
  .object({
    sourceScope: commandScopeSchema,
    sourceProjectSlug: z.string().min(1).optional(),
    sourcePluginKey: z.string().min(1).optional(),
    sourceRelativePath: relativePathSchema,
    targetScope: editableScopeSchema,
    targetProjectSlug: z.string().min(1).optional(),
    targetRelativePath: relativePathSchema.optional(),
    onConflict: z.enum(['overwrite', 'skip', 'rename']),
    acknowledgedSecret: z.boolean().optional(),
  })
  .refine((v) => v.sourceScope !== 'project' || !!v.sourceProjectSlug, {
    message: 'sourceProjectSlug is required when sourceScope is project',
  })
  .refine((v) => v.sourceScope !== 'plugin' || !!v.sourcePluginKey, {
    message: 'sourcePluginKey is required when sourceScope is plugin',
  })
  .refine((v) => v.targetScope !== 'project' || !!v.targetProjectSlug, {
    message: 'targetProjectSlug is required when targetScope is project',
  });

const directoryCopyBody = z
  .object({
    sourceScope: commandScopeSchema,
    sourceProjectSlug: z.string().min(1).optional(),
    sourcePluginKey: z.string().min(1).optional(),
    sourceDirectoryPath: directoryPathSchema,
    targetScope: editableScopeSchema,
    targetProjectSlug: z.string().min(1).optional(),
    targetDirectoryPath: directoryPathSchema.optional(),
    onConflict: z.enum(['overwrite-all', 'skip-all', 'per-file']),
    perFileChoices: z.record(z.string(), z.enum(['overwrite', 'skip', 'rename'])).optional(),
    perFileRenames: z.record(z.string(), relativePathSchema).optional(),
    acknowledgedSecret: z.boolean().optional(),
  })
  .refine((v) => v.sourceScope !== 'project' || !!v.sourceProjectSlug, {
    message: 'sourceProjectSlug is required when sourceScope is project',
  })
  .refine((v) => v.sourceScope !== 'plugin' || !!v.sourcePluginKey, {
    message: 'sourcePluginKey is required when sourceScope is plugin',
  })
  .refine((v) => v.targetScope !== 'project' || !!v.targetProjectSlug, {
    message: 'targetProjectSlug is required when targetScope is project',
  });

const deleteBody = z
  .object({
    expectedMtime: z.string().optional(),
  })
  .optional();

const MAPPED_CODES = [
  'HARNESS_PATH_DENIED',
  'HARNESS_FORBIDDEN',
  'HARNESS_PLUGIN_SCOPE_DENIED',
  'HARNESS_FILE_NOT_FOUND',
  'HARNESS_NOT_A_FILE',
  'HARNESS_ROOT_MISSING',
  'HARNESS_PARENT_NOT_FOUND',
  'HARNESS_PLUGIN_NOT_FOUND',
  'HARNESS_SKILL_NOT_FOUND',
  'HARNESS_MCP_NOT_FOUND',
  'HARNESS_HOOK_NOT_FOUND',
  'HARNESS_HOOK_INVALID_EVENT',
  'HARNESS_COMMAND_NOT_FOUND',
  'HARNESS_STALE_WRITE',
  'HARNESS_SKILL_NAME_CONFLICT',
  'HARNESS_MCP_NAME_CONFLICT',
  'HARNESS_COMMAND_NAME_CONFLICT',
  'HARNESS_PARSE_ERROR',
  'HARNESS_SECRET_ON_SHARED',
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
  HARNESS_SKILL_NOT_FOUND: 'harness.error.skillNotFound',
  HARNESS_MCP_NOT_FOUND: 'harness.error.mcpNotFound',
  HARNESS_HOOK_NOT_FOUND: 'harness.error.hookNotFound',
  HARNESS_HOOK_INVALID_EVENT: 'harness.error.hookInvalidEvent',
  HARNESS_COMMAND_NOT_FOUND: 'harness.error.commandNotFound',
  HARNESS_STALE_WRITE: 'harness.error.staleWrite',
  HARNESS_SKILL_NAME_CONFLICT: 'harness.error.skillNameConflict',
  HARNESS_MCP_NAME_CONFLICT: 'harness.error.mcpNameConflict',
  HARNESS_COMMAND_NAME_CONFLICT: 'harness.error.commandNameConflict',
  HARNESS_PARSE_ERROR: 'harness.error.parseError',
  HARNESS_SECRET_ON_SHARED: 'harness.error.secretOnShared',
};

function handleError(req: Request, res: Response, error: unknown): void {
  const nodeError = error as NodeJS.ErrnoException & {
    currentMtime?: string;
    cause?: string;
    details?: Record<string, unknown>;
    relativePath?: string;
    lines?: number[];
    paths?: string[];
  };
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
      if (key === 'HARNESS_FORBIDDEN' && typeof nodeError.cause === 'string') {
        body.details = { cause: nodeError.cause, ...(nodeError.details ?? {}) };
      }
      if (key === 'HARNESS_COMMAND_NAME_CONFLICT' && nodeError.details) {
        body.details = { ...nodeError.details };
      }
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
  const body: { code: string; message: string; details?: Record<string, unknown> } = {
    code: HARNESS_ERRORS.HARNESS_WRITE_ERROR.code,
    message: req.t ? req.t('harness.error.writeError') : HARNESS_ERRORS.HARNESS_WRITE_ERROR.code,
  };
  if (typeof nodeError.cause === 'string') {
    body.details = { cause: nodeError.cause };
  }
  res.status(HARNESS_ERRORS.HARNESS_WRITE_ERROR.httpStatus).json({ error: body });
}

/** Pull the path-as-glob suffix from `req.params[0]`. */
function readSplatPath(req: Request): string {
  // Express types `req.params` as Record<string,string>, but splat actually
  // exposes the captured tail under params[0].
  const params = req.params as unknown as Record<string, string> & { 0?: string };
  const splat = params[0] ?? '';
  if (!splat) {
    const err = new Error('relativePath is required') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_PARSE_ERROR.code;
    throw err;
  }
  return splat;
}

export const harnessCommandController = {
  async list(req: Request, res: Response): Promise<void> {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    try {
      const result = await harnessCommandService.listCards(parsed.data.projectSlug);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  async read(req: Request, res: Response): Promise<void> {
    const query = readQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: query.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    try {
      const relPath = readSplatPath(req);
      const source = await resolveCommandSourceLocation({
        scope: query.data.scope,
        relativePath: relPath,
        projectSlug: query.data.projectSlug,
        pluginKey: query.data.pluginKey,
      });
      const result = await harnessCommandService.readCommand(source);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = createBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: body.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await harnessCommandService.createCommand(body.data as HarnessCommandCreateRequest);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  async update(req: Request, res: Response): Promise<void> {
    const query = updateQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: query.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    const body = updateBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: body.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const relPath = readSplatPath(req);
      const source = await resolveCommandSourceLocation({
        scope: query.data.scope,
        relativePath: relPath,
        projectSlug: query.data.projectSlug,
      });
      const result = await harnessCommandService.updateCommand(source, body.data);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  async copy(req: Request, res: Response): Promise<void> {
    const body = copyBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: body.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await harnessCommandService.copyCommand(body.data as HarnessCommandCopyRequest);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  async copyDirectory(req: Request, res: Response): Promise<void> {
    const body = directoryCopyBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: body.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await harnessCommandService.copyDirectory(
        body.data as HarnessCommandDirectoryCopyRequest,
      );
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  async delete(req: Request, res: Response): Promise<void> {
    const query = deleteQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: query.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    const body = deleteBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: body.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const relPath = readSplatPath(req);
      const result = await harnessCommandService.deleteCommand({
        scope: query.data.scope,
        projectSlug: query.data.projectSlug,
        relativePath: relPath,
        expectedMtime: body.data?.expectedMtime,
      } as HarnessCommandDeleteRequest);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
