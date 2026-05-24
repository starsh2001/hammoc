/**
 * Story 28.4: Harness Hook list / read / create / update / copy / delete controller.
 *
 * Mirrors the inline error-mapping pattern from harnessMcpController — each
 * handler walks the shared HARNESS_ERRORS table to emit
 * `{ error: { code, message, details? } }` envelopes. Two new mapped codes for
 * this story: HARNESS_HOOK_NOT_FOUND and HARNESS_HOOK_INVALID_EVENT.
 *
 * Route surface (mounted at /api/harness from routes/harness.ts):
 *   GET    /hooks?projectSlug=<slug>?
 *   GET    /hooks/:event/:groupIndex/:hookIndex?scope=<project|user|plugin>&projectSlug?&pluginKey?&disabledByBackup?
 *   POST   /hooks
 *   PUT    /hooks/:event/:groupIndex/:hookIndex?scope=<project|user>&projectSlug?&disabledByBackup?
 *   POST   /hooks/copy
 *   DELETE /hooks/:event/:groupIndex/:hookIndex?scope=<project|user>&projectSlug?
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import {
  HARNESS_ERRORS,
  HARNESS_HOOK_EVENTS,
  type HarnessHookCopyRequest,
  type HarnessHookCreateRequest,
  type HarnessHookEvent,
} from '@hammoc/shared';
import {
  harnessHookService,
  resolveSourceLocation,
} from '../services/harnessHookService.js';

const hookScopeSchema = z.enum(['project', 'user', 'plugin']);
const editableHookScopeSchema = z.enum(['project', 'user']);
const hookEventSchema = z.enum(
  HARNESS_HOOK_EVENTS as unknown as readonly [HarnessHookEvent, ...HarnessHookEvent[]],
);
const hookTypeSchema = z.enum(['command', 'prompt']);

const listQuery = z.object({
  projectSlug: z.string().min(1).optional(),
});

const readQuery = z.object({
  scope: hookScopeSchema,
  projectSlug: z.string().min(1).optional(),
  pluginKey: z.string().min(1).optional(),
  disabledByBackup: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

const updateQuery = z.object({
  scope: editableHookScopeSchema,
  projectSlug: z.string().min(1).optional(),
  disabledByBackup: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

const deleteQuery = z.object({
  scope: editableHookScopeSchema,
  projectSlug: z.string().min(1).optional(),
});

const hookConfigSchema = z
  .object({
    type: hookTypeSchema,
    command: z.string().optional(),
    prompt: z.string().optional(),
    timeout: z.number().int().min(0).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'command' && !v.command) {
      ctx.addIssue({ code: 'custom', message: 'command is required for type=command', path: ['command'] });
    }
    if (v.type === 'prompt' && !v.prompt) {
      ctx.addIssue({ code: 'custom', message: 'prompt is required for type=prompt', path: ['prompt'] });
    }
    if (v.type === 'command' && v.prompt) {
      ctx.addIssue({ code: 'custom', message: 'prompt forbidden for type=command', path: ['prompt'] });
    }
    if (v.type === 'prompt' && v.command) {
      ctx.addIssue({ code: 'custom', message: 'command forbidden for type=prompt', path: ['command'] });
    }
  });

const matcherSchema = z.string().refine(
  (v) => {
    if (v === '') return true;
    try {
      // eslint-disable-next-line no-new
      new RegExp(v);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'matcher must be a valid regex (pipes and wildcards allowed)' },
);

const updateBody = z
  .object({
    config: hookConfigSchema.optional(),
    matcher: z.union([matcherSchema, z.null()]).optional(),
    raw: z.string().optional(),
    enabled: z.boolean().optional(),
    expectedMtime: z.string().optional(),
    expectedBackupMtime: z.string().optional(),
    splitFromGroup: z.boolean().optional(),
    /**
     * Story 30.7 (Task A.3): when present and equal to `'local'`, the
     * controller routes the save to `.claude/settings.local.json` via
     * `harnessHookService.writeLocalSibling()` instead of touching the
     * shared `settings.json`. Only valid alongside `config` — sibling save
     * is append-only (new event/group), so matcher/raw/enabled paths are
     * not honored. The route still requires the existing path params so
     * the editor's resave maintains a stable URL.
     */
    scope: z.literal('local').optional(),
  })
  .refine(
    (v) =>
      v.scope === 'local'
        ? v.config !== undefined
        : [v.config, v.matcher !== undefined ? 1 : undefined, v.raw, v.enabled].filter(
            (x) => x !== undefined,
          ).length === 1,
    { message: "exactly one of config / matcher / raw / enabled is required (scope='local' requires config)" },
  )
  .refine(
    (v) => v.splitFromGroup === undefined || v.matcher !== undefined,
    { message: 'splitFromGroup may only be set together with matcher', path: ['splitFromGroup'] },
  );

const copyBody = z
  .object({
    sourceScope: hookScopeSchema,
    sourceProjectSlug: z.string().min(1).optional(),
    sourcePluginKey: z.string().min(1).optional(),
    sourceEvent: hookEventSchema,
    sourceGroupIndex: z.number().int().min(0),
    sourceHookIndex: z.number().int().min(0),
    targetScope: editableHookScopeSchema,
    targetProjectSlug: z.string().min(1).optional(),
    onConflict: z.enum(['overwrite', 'skip', 'duplicate']),
    acknowledgedWarning: z.boolean(),
  })
  .refine(
    (v) => v.sourceScope !== 'project' || !!v.sourceProjectSlug,
    { message: 'sourceProjectSlug is required when sourceScope is project' },
  )
  .refine(
    (v) => v.sourceScope !== 'plugin' || !!v.sourcePluginKey,
    { message: 'sourcePluginKey is required when sourceScope is plugin' },
  )
  .refine(
    (v) => v.targetScope !== 'project' || !!v.targetProjectSlug,
    { message: 'targetProjectSlug is required when targetScope is project' },
  );

const createBody = z
  .object({
    scope: editableHookScopeSchema,
    projectSlug: z.string().min(1).optional(),
    event: hookEventSchema,
    matcher: matcherSchema.optional(),
    config: hookConfigSchema,
    expectedMtime: z.string().optional(),
  })
  .refine(
    (v) => v.scope !== 'project' || !!v.projectSlug,
    { message: 'projectSlug is required when scope is project' },
  );

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
  'HARNESS_STALE_WRITE',
  'HARNESS_SKILL_NAME_CONFLICT',
  'HARNESS_MCP_NAME_CONFLICT',
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
  HARNESS_STALE_WRITE: 'harness.error.staleWrite',
  HARNESS_SKILL_NAME_CONFLICT: 'harness.error.skillNameConflict',
  HARNESS_MCP_NAME_CONFLICT: 'harness.error.mcpNameConflict',
  HARNESS_PARSE_ERROR: 'harness.error.parseError',
  HARNESS_SECRET_ON_SHARED: 'harness.error.secretOnShared',
};

function handleError(req: Request, res: Response, error: unknown): void {
  const nodeError = error as NodeJS.ErrnoException & {
    currentMtime?: string;
    cause?: string;
    staleFile?: 'main' | 'backup';
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
        body.details = {
          currentMtime: nodeError.currentMtime ?? '',
          ...(nodeError.staleFile ? { staleFile: nodeError.staleFile } : {}),
        };
      }
      if (key === 'HARNESS_FORBIDDEN' && typeof nodeError.cause === 'string') {
        body.details = { cause: nodeError.cause, ...(nodeError.details ?? {}) };
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
  // Fall-through: surface as HARNESS_WRITE_ERROR but preserve `cause` so the
  // client can route to specific toasts.
  const body: { code: string; message: string; details?: Record<string, unknown> } = {
    code: HARNESS_ERRORS.HARNESS_WRITE_ERROR.code,
    message: req.t ? req.t('harness.error.writeError') : HARNESS_ERRORS.HARNESS_WRITE_ERROR.code,
  };
  if (typeof nodeError.cause === 'string') {
    body.details = { cause: nodeError.cause };
  }
  res.status(HARNESS_ERRORS.HARNESS_WRITE_ERROR.httpStatus).json({ error: body });
}

function parsePathParams(req: Request): {
  event: HarnessHookEvent;
  groupIndex: number;
  hookIndex: number;
} {
  const event = (req.params.event ?? '') as HarnessHookEvent;
  if (!HARNESS_HOOK_EVENTS.includes(event)) {
    const err = new Error(`unknown event: ${event}`) as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_HOOK_INVALID_EVENT.code;
    throw err;
  }
  const groupIndex = Number.parseInt(req.params.groupIndex ?? '', 10);
  const hookIndex = Number.parseInt(req.params.hookIndex ?? '', 10);
  if (!Number.isFinite(groupIndex) || groupIndex < 0 || !Number.isFinite(hookIndex) || hookIndex < 0) {
    const err = new Error('groupIndex / hookIndex must be non-negative integers') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_HOOK_INVALID_EVENT.code;
    throw err;
  }
  return { event, groupIndex, hookIndex };
}

export const harnessHookController = {
  /** GET /hooks */
  async list(req: Request, res: Response): Promise<void> {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    try {
      const result = await harnessHookService.listCards(parsed.data.projectSlug);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** GET /hooks/:event/:groupIndex/:hookIndex */
  async read(req: Request, res: Response): Promise<void> {
    const query = readQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: query.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    try {
      const { event, groupIndex, hookIndex } = parsePathParams(req);
      const source = await resolveSourceLocation({
        scope: query.data.scope,
        event,
        groupIndex,
        hookIndex,
        projectSlug: query.data.projectSlug,
        pluginKey: query.data.pluginKey,
        disabledByBackup: query.data.disabledByBackup,
      });
      const result = await harnessHookService.readHook(source);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** POST /hooks */
  async create(req: Request, res: Response): Promise<void> {
    const body = createBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: body.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await harnessHookService.createHook(body.data as HarnessHookCreateRequest);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** PUT /hooks/:event/:groupIndex/:hookIndex */
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
      const { event, groupIndex, hookIndex } = parsePathParams(req);
      // Story 30.7 (Task A.3): { scope: 'local' } reroutes to the
      // `.claude/settings.local.json` sibling. The path params are still
      // required (the editor's stable URL) but the sibling save appends a
      // new event/group rather than overwriting `groupIndex/hookIndex` in
      // the shared file.
      if (body.data.scope === 'local') {
        if (query.data.scope !== 'project' || !query.data.projectSlug) {
          res.status(400).json({
            error: { code: 'INVALID_REQUEST', message: "scope='local' requires project scope with projectSlug" },
          });
          return;
        }
        if (!body.data.config) {
          res.status(400).json({
            error: { code: 'INVALID_REQUEST', message: "scope='local' requires config payload" },
          });
          return;
        }
        const local = await harnessHookService.writeLocalSibling({
          projectSlug: query.data.projectSlug,
          event,
          matcher: body.data.matcher === null ? undefined : body.data.matcher,
          config: body.data.config,
        });
        // hookIndex is dropped — sibling save always appends. The response
        // surfaces the new location so the editor can reseat its cursor.
        void hookIndex;
        void groupIndex;
        res.json(local);
        return;
      }
      const source = await resolveSourceLocation({
        scope: query.data.scope,
        event,
        groupIndex,
        hookIndex,
        projectSlug: query.data.projectSlug,
        disabledByBackup: query.data.disabledByBackup,
      });
      const result = await harnessHookService.updateHook(source, body.data);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** POST /hooks/copy */
  async copy(req: Request, res: Response): Promise<void> {
    const body = copyBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: body.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await harnessHookService.copyHook(body.data as HarnessHookCopyRequest);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** DELETE /hooks/:event/:groupIndex/:hookIndex */
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
      const { event, groupIndex, hookIndex } = parsePathParams(req);
      const result = await harnessHookService.deleteHook({
        scope: query.data.scope,
        projectSlug: query.data.projectSlug,
        event,
        groupIndex,
        hookIndex,
        expectedMtime: body.data?.expectedMtime,
      });
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
