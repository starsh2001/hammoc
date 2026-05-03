/**
 * Story 28.6: Harness sub-agent list / read / create / update / copy / delete controller.
 *
 * Mirrors the inline error-mapping pattern from harnessCommandController. New
 * mapped codes for this story: HARNESS_AGENT_NOT_FOUND and
 * HARNESS_AGENT_NAME_CONFLICT.
 *
 * Route surface (mounted at /api/harness from routes/harness.ts):
 *   GET    /agents?projectSlug=<slug>?
 *   GET    /agents/:name
 *   POST   /agents
 *   PUT    /agents/:name
 *   POST   /agents/copy
 *   DELETE /agents/:name
 *
 * Single-segment :name path param — flat-only policy (AC1.a) of the agents
 * directory means no path-as-glob is needed (vs 28.5 commands which used `*`).
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  HARNESS_ERRORS,
  type HarnessAgentCopyRequest,
  type HarnessAgentCreateRequest,
  type HarnessAgentDeleteRequest,
  type HarnessAgentUpdateRequest,
} from '@hammoc/shared';
import {
  harnessAgentService,
  resolveAgentSourceLocation,
} from '../services/harnessAgentService.js';

const agentScopeSchema = z.enum(['project', 'user', 'plugin']);
const editableScopeSchema = z.enum(['project', 'user']);
const modelSchema = z.enum(['inherit', 'sonnet', 'opus', 'haiku']);
const colorSchema = z.enum(['blue', 'cyan', 'green', 'yellow', 'magenta', 'red']);
const toolsStateSchema = z.enum(['omitted', 'empty', 'populated']);

/**
 * 3-50 chars, lowercase letters / digits / hyphens, must start with a letter
 * and end with letter-or-digit (cannot start or end with a hyphen).
 */
const agentNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,48}[a-z0-9]$/, {
    message:
      'name must be 3-50 lowercase letters / digits / hyphens; cannot start or end with a hyphen',
  });

const frontmatterSchema = z
  .object({
    name: agentNameSchema,
    description: z.string().min(1).max(8192),
    model: modelSchema,
    color: colorSchema,
    tools: z.array(z.string().min(1).max(64)).max(64).optional(),
  })
  .strict();

const listQuery = z.object({
  projectSlug: z.string().min(1).optional(),
});

const readQuery = z.object({
  scope: agentScopeSchema,
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
    toolsState: toolsStateSchema.optional(),
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
    name: agentNameSchema,
    frontmatter: frontmatterSchema,
    body: z.string().optional(),
    toolsState: toolsStateSchema.optional(),
  })
  .refine((v) => v.scope !== 'project' || !!v.projectSlug, {
    message: 'projectSlug is required when scope is project',
  })
  .refine((v) => v.frontmatter.name === v.name, {
    message: 'frontmatter.name must equal name',
  });

const copyBody = z
  .object({
    sourceScope: agentScopeSchema,
    sourceProjectSlug: z.string().min(1).optional(),
    sourcePluginKey: z.string().min(1).optional(),
    sourceName: agentNameSchema,
    targetScope: editableScopeSchema,
    targetProjectSlug: z.string().min(1).optional(),
    targetName: agentNameSchema.optional(),
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
  'HARNESS_AGENT_NOT_FOUND',
  'HARNESS_STALE_WRITE',
  'HARNESS_SKILL_NAME_CONFLICT',
  'HARNESS_MCP_NAME_CONFLICT',
  'HARNESS_COMMAND_NAME_CONFLICT',
  'HARNESS_AGENT_NAME_CONFLICT',
  'HARNESS_PARSE_ERROR',
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
  HARNESS_AGENT_NOT_FOUND: 'harness.error.agentNotFound',
  HARNESS_STALE_WRITE: 'harness.error.staleWrite',
  HARNESS_SKILL_NAME_CONFLICT: 'harness.error.skillNameConflict',
  HARNESS_MCP_NAME_CONFLICT: 'harness.error.mcpNameConflict',
  HARNESS_COMMAND_NAME_CONFLICT: 'harness.error.commandNameConflict',
  HARNESS_AGENT_NAME_CONFLICT: 'harness.error.agentNameConflict',
  HARNESS_PARSE_ERROR: 'harness.error.parseError',
};

function handleError(req: Request, res: Response, error: unknown): void {
  const nodeError = error as NodeJS.ErrnoException & {
    currentMtime?: string;
    cause?: string;
    detail?: string;
    details?: Record<string, unknown>;
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
      if (key === 'HARNESS_PARSE_ERROR' && typeof nodeError.detail === 'string') {
        body.details = { detail: nodeError.detail, ...(nodeError.details ?? {}) };
      }
      if (key === 'HARNESS_AGENT_NAME_CONFLICT' && nodeError.details) {
        body.details = { ...nodeError.details };
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

function readNameParam(req: Request): string {
  const params = req.params as Record<string, string>;
  const name = params.name ?? '';
  if (!name) {
    const err = new Error('name is required') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_PARSE_ERROR.code;
    throw err;
  }
  return name;
}

export const harnessAgentController = {
  async list(req: Request, res: Response): Promise<void> {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    try {
      const result = await harnessAgentService.listCards(parsed.data.projectSlug);
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
      const name = readNameParam(req);
      const source = await resolveAgentSourceLocation({
        scope: query.data.scope,
        name,
        projectSlug: query.data.projectSlug,
        pluginKey: query.data.pluginKey,
      });
      const result = await harnessAgentService.readAgent(source);
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
      const result = await harnessAgentService.createAgent(body.data as HarnessAgentCreateRequest);
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
      const name = readNameParam(req);
      const source = await resolveAgentSourceLocation({
        scope: query.data.scope,
        name,
        projectSlug: query.data.projectSlug,
      });
      const result = await harnessAgentService.updateAgent(source, body.data as HarnessAgentUpdateRequest);
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
      const result = await harnessAgentService.copyAgent(body.data as HarnessAgentCopyRequest);
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
      const name = readNameParam(req);
      const result = await harnessAgentService.deleteAgent({
        scope: query.data.scope,
        projectSlug: query.data.projectSlug,
        name,
        expectedMtime: body.data?.expectedMtime,
      } as HarnessAgentDeleteRequest);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
