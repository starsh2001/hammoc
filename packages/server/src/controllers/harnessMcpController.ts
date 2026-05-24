/**
 * Story 28.3: Harness MCP list / read / update / copy / delete controller.
 *
 * Mirrors the inline error-mapping pattern from `harnessSkillController` —
 * each handler catches and walks the shared `HARNESS_ERRORS` table to emit
 * the common `{ error: { code, message, details? } }` envelope.
 *
 * Route surface (mounted at /api/harness from routes/harness.ts):
 *   GET    /mcps?projectSlug=<slug>?
 *   GET    /mcps/:name?scope=<project|user|plugin>&projectSlug?&pluginKey?&fileKind?
 *   PUT    /mcps/:name?scope=<project|user>&projectSlug?
 *   POST   /mcps/copy
 *   DELETE /mcps/:name?scope=<project|user>&projectSlug?
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import {
  HARNESS_ERRORS,
  type HarnessMcpCopyRequest,
} from '@hammoc/shared';
import {
  harnessMcpService,
  resolveSourceLocation,
} from '../services/harnessMcpService.js';

const mcpScopeSchema = z.enum(['project', 'user', 'plugin']);
const editableMcpScopeSchema = z.enum(['project', 'user']);
const serverTypeSchema = z.enum(['stdio', 'sse', 'http', 'ws']);
const fileKindSchema = z.enum(['mcp.json', 'settings.json', 'plugin.json']);

const listQuery = z.object({
  projectSlug: z.string().min(1).optional(),
});

const readQuery = z.object({
  scope: mcpScopeSchema,
  projectSlug: z.string().min(1).optional(),
  pluginKey: z.string().min(1).optional(),
  fileKind: fileKindSchema.optional(),
});

const updateQuery = z.object({
  scope: editableMcpScopeSchema,
  projectSlug: z.string().min(1).optional(),
});

const mcpConfigSchema = z
  .object({
    type: serverTypeSchema.optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    const type = v.type ?? 'stdio';
    if (type === 'stdio' && !v.command) {
      ctx.addIssue({ code: 'custom', message: 'command is required for stdio', path: ['command'] });
    }
    if (type !== 'stdio' && !v.url) {
      ctx.addIssue({ code: 'custom', message: 'url is required for ' + type, path: ['url'] });
    }
    if (type !== 'http' && v.headers && Object.keys(v.headers).length > 0) {
      ctx.addIssue({ code: 'custom', message: 'headers only allowed for http type', path: ['headers'] });
    }
  });

const updateBody = z
  .object({
    config: mcpConfigSchema.optional(),
    raw: z.string().optional(),
    enabled: z.boolean().optional(),
    expectedMtime: z.string().optional(),
    /**
     * Story 30.7 (Task A.3): when present and equal to `'local'`, the
     * controller routes the save to `<projectRoot>/.mcp.local.json` via
     * `harnessMcpService.writeLocalSibling()` instead of the main
     * `.mcp.json`. Only valid alongside `config` or `raw` — sibling save
     * does not honor the enabled toggle path.
     */
    scope: z.literal('local').optional(),
  })
  .refine(
    (v) => [v.config, v.raw, v.enabled].filter((x) => x !== undefined).length === 1,
    { message: 'exactly one of config / raw / enabled is required' },
  )
  .refine(
    (v) => v.scope !== 'local' || v.enabled === undefined,
    { message: "scope='local' is incompatible with enabled toggle" },
  );

// OS-reserved characters and trailing dot/space — blocked at validation time so
// the rename UI can rely on inline errors. Matches the SkillCopyConflictDialog
// regex one-for-one.
// eslint-disable-next-line no-control-regex
const RESERVED_NAME_RE = /[\\/<>:"|?*\x00-\x1F]|[. ]$/;

function validateMcpName(name: string): void {
  if (RESERVED_NAME_RE.test(name)) {
    const err = new Error('mcp name contains reserved or path-traversal characters') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_PATH_DENIED.code;
    throw err;
  }
}

const copyBody = z
  .object({
    sourceScope: mcpScopeSchema,
    sourceProjectSlug: z.string().min(1).optional(),
    sourcePluginKey: z.string().min(1).optional(),
    sourceFileKind: fileKindSchema.optional(),
    sourceName: z.string().min(1),
    targetScope: editableMcpScopeSchema,
    targetProjectSlug: z.string().min(1).optional(),
    targetName: z.string().min(1),
    onConflict: z.enum(['overwrite', 'skip', 'rename']),
    acknowledgedSecret: z.boolean().optional(),
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
  )
  .refine(
    (v) => !RESERVED_NAME_RE.test(v.targetName),
    { message: 'targetName contains reserved characters' },
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
  // client can route to the cross-device toast (Risk Mitigation #2 from 28.2).
  const body: { code: string; message: string; details?: Record<string, unknown> } = {
    code: HARNESS_ERRORS.HARNESS_WRITE_ERROR.code,
    message: req.t ? req.t('harness.error.writeError') : HARNESS_ERRORS.HARNESS_WRITE_ERROR.code,
  };
  if (typeof nodeError.cause === 'string') {
    body.details = { cause: nodeError.cause };
  }
  res.status(HARNESS_ERRORS.HARNESS_WRITE_ERROR.httpStatus).json({ error: body });
}

export const harnessMcpController = {
  /** GET /mcps */
  async list(req: Request, res: Response): Promise<void> {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    try {
      const result = await harnessMcpService.listCards(parsed.data.projectSlug);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** GET /mcps/:name */
  async read(req: Request, res: Response): Promise<void> {
    const query = readQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: query.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    const name = decodeURIComponent(req.params.name ?? '');
    if (!name) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'name is required' } });
      return;
    }
    try {
      validateMcpName(name);
      const source = await resolveSourceLocation({
        scope: query.data.scope,
        name,
        projectSlug: query.data.projectSlug,
        pluginKey: query.data.pluginKey,
        fileKind: query.data.fileKind,
      });
      const result = await harnessMcpService.readServer(source, name);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** PUT /mcps/:name */
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
    const name = decodeURIComponent(req.params.name ?? '');
    if (!name) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'name is required' } });
      return;
    }
    try {
      validateMcpName(name);
      // Story 30.7 (Task A.3): { scope: 'local' } reroutes to the
      // `.mcp.local.json` sibling. Only the project scope owns a sibling —
      // user scope is rejected since `~/.claude/.mcp.json` has no shared/local
      // distinction. `config` (or `raw` parsed back to config) is required.
      if (body.data.scope === 'local') {
        if (query.data.scope !== 'project' || !query.data.projectSlug) {
          res.status(400).json({
            error: { code: 'INVALID_REQUEST', message: "scope='local' requires project scope with projectSlug" },
          });
          return;
        }
        let config = body.data.config;
        if (!config && body.data.raw !== undefined) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(body.data.raw);
          } catch (cause) {
            res.status(400).json({
              error: {
                code: HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
                message: `raw payload is not valid JSON: ${(cause as Error).message}`,
              },
            });
            return;
          }
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            res.status(400).json({
              error: {
                code: HARNESS_ERRORS.HARNESS_PARSE_ERROR.code,
                message: 'raw payload must be an object',
              },
            });
            return;
          }
          config = parsed as unknown as typeof config;
        }
        if (!config) {
          res.status(400).json({
            error: { code: 'INVALID_REQUEST', message: "scope='local' requires config or raw payload" },
          });
          return;
        }
        const local = await harnessMcpService.writeLocalSibling({
          projectSlug: query.data.projectSlug,
          name,
          config,
          expectedMtime: body.data.expectedMtime,
        });
        res.json(local);
        return;
      }
      const source = await resolveSourceLocation({
        scope: query.data.scope,
        name,
        projectSlug: query.data.projectSlug,
      });
      const result = await harnessMcpService.updateServer(source, name, body.data);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** POST /mcps/copy */
  async copy(req: Request, res: Response): Promise<void> {
    const body = copyBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: body.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await harnessMcpService.copyServer(body.data as HarnessMcpCopyRequest);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** DELETE /mcps/:name */
  async delete(req: Request, res: Response): Promise<void> {
    const query = updateQuery.safeParse(req.query);
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
    const name = decodeURIComponent(req.params.name ?? '');
    if (!name) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'name is required' } });
      return;
    }
    try {
      validateMcpName(name);
      const source = await resolveSourceLocation({
        scope: query.data.scope,
        name,
        projectSlug: query.data.projectSlug,
      });
      const result = await harnessMcpService.deleteServer(source, name, {
        scope: query.data.scope,
        projectSlug: query.data.projectSlug,
        expectedMtime: body.data?.expectedMtime,
      });
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
