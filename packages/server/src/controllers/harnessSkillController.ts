/**
 * Story 28.2: Harness skill list / read / update / copy controller.
 *
 * Mirrors the inline error-mapping pattern from `harnessPluginController` —
 * each handler catches and walks the shared `HARNESS_ERRORS` table to emit
 * the common `{ error: { code, message, details? } }` envelope. There is no
 * global Express error middleware in this codebase.
 *
 * Route surface (mounted at /api/harness from routes/harness.ts):
 *   GET    /skills?projectSlug=<slug>?
 *   GET    /skills/:name?scope=<project|user|plugin>&projectSlug=...&pluginKey=...
 *   PUT    /skills/:name?scope=<project|user>&projectSlug=...
 *   POST   /skills/copy
 *   GET    /skills/:name/bundle/<resourcePath>?scope=<project|user|plugin>&...
 *   PUT    /skills/:name/bundle/<resourcePath>?scope=<project|user>&...
 */

import { Request, Response } from 'express';
import path from 'path';
import { z } from 'zod';
import {
  HARNESS_ERRORS,
  type HarnessSkillCopyRequest,
  type HarnessSkillSourceLocation,
  type HarnessSkillSourceScope,
} from '@hammoc/shared';
import { harnessService } from '../services/harnessService.js';
import { harnessSkillService } from '../services/harnessSkillService.js';
import { projectService } from '../services/projectService.js';
import { getUserHarnessRoot } from '../utils/harnessPaths.js';

const skillScopeSchema = z.enum(['project', 'user', 'plugin']);
const editableScopeSchema = z.enum(['project', 'user']);

const listQuery = z.object({
  projectSlug: z.string().min(1).optional(),
});

const readQuery = z.object({
  scope: skillScopeSchema,
  projectSlug: z.string().min(1).optional(),
  pluginKey: z.string().min(1).optional(),
});

const updateQuery = z.object({
  scope: editableScopeSchema,
  projectSlug: z.string().min(1).optional(),
});

const updateBody = z
  .object({
    frontmatter: z
      .object({
        name: z.string().optional(),
        description: z.string().optional(),
        version: z.string().optional(),
      })
      .optional(),
    body: z.string().optional(),
    raw: z.string().optional(),
    expectedMtime: z.string().optional(),
  })
  .refine(
    (v) => v.frontmatter !== undefined || v.body !== undefined || v.raw !== undefined,
    { message: 'one of frontmatter / body / raw is required' },
  );

const copyBody = z
  .object({
    sourceScope: skillScopeSchema,
    sourceProjectSlug: z.string().min(1).optional(),
    sourcePluginKey: z.string().min(1).optional(),
    sourceName: z.string().min(1),
    targetScope: editableScopeSchema, // plugin destinations are forbidden
    targetProjectSlug: z.string().min(1).optional(),
    targetName: z.string().min(1),
    onConflict: z.enum(['overwrite', 'skip', 'rename']),
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

// OS-reserved characters and trailing dot/space — blocked at validation time so
// the rename UI can rely on inline errors. Also catches path-traversal segments
// like `..` (trailing dot), `/foo`, `\foo`. Applied to both copy bodies (Zod
// .refine) and read/update name params (validateSkillName).
// eslint-disable-next-line no-control-regex
const RESERVED_NAME_RE = /[\\/<>:"|?*\x00-\x1F]|[. ]$/;

function validateSkillName(name: string): void {
  if (RESERVED_NAME_RE.test(name)) {
    const err = new Error('skill name contains reserved or path-traversal characters') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_PATH_DENIED.code;
    throw err;
  }
}

const bundleWriteBody = z.object({
  content: z.string(),
  expectedMtime: z.string().optional(),
});

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
  'HARNESS_STALE_WRITE',
  'HARNESS_SKILL_NAME_CONFLICT',
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
  HARNESS_STALE_WRITE: 'harness.error.staleWrite',
  HARNESS_SKILL_NAME_CONFLICT: 'harness.error.skillNameConflict',
  HARNESS_PARSE_ERROR: 'harness.error.parseError',
};

function handleError(req: Request, res: Response, error: unknown): void {
  const nodeError = error as NodeJS.ErrnoException & {
    currentMtime?: string;
    cause?: string;
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
      res.status(entry.httpStatus).json({ error: body });
      return;
    }
  }
  // Fall-through: surface as HARNESS_WRITE_ERROR but preserve `cause` so the
  // client can route to the cross-device toast (Risk Mitigation #2).
  const body: { code: string; message: string; details?: Record<string, unknown> } = {
    code: HARNESS_ERRORS.HARNESS_WRITE_ERROR.code,
    message: req.t ? req.t('harness.error.writeError') : HARNESS_ERRORS.HARNESS_WRITE_ERROR.code,
  };
  if (typeof nodeError.cause === 'string') {
    body.details = { cause: nodeError.cause };
  }
  res.status(HARNESS_ERRORS.HARNESS_WRITE_ERROR.httpStatus).json({ error: body });
}

async function resolveSourceLocation(input: {
  scope: HarnessSkillSourceScope;
  name: string;
  projectSlug?: string;
  pluginKey?: string;
}): Promise<HarnessSkillSourceLocation> {
  validateSkillName(input.name);
  if (input.scope === 'project') {
    if (!input.projectSlug) {
      throwInvalid('projectSlug required for scope=project');
    }
    const projectRoot = await projectService.resolveOriginalPath(input.projectSlug!);
    return {
      scope: 'project',
      absoluteRoot: path.join(projectRoot, '.claude', 'skills', input.name),
      projectSlug: input.projectSlug,
    };
  }
  if (input.scope === 'user') {
    return {
      scope: 'user',
      absoluteRoot: path.join(getUserHarnessRoot(), 'skills', input.name),
    };
  }
  // plugin
  if (!input.pluginKey) {
    throwInvalid('pluginKey required for scope=plugin');
  }
  const installPath = await readPluginInstallPath(input.pluginKey!);
  if (!installPath) {
    const err = new Error('plugin not installed') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_PLUGIN_NOT_FOUND.code;
    throw err;
  }
  return {
    scope: 'plugin',
    absoluteRoot: path.join(installPath, 'skills', input.name),
    pluginKey: input.pluginKey,
  };
}

function throwInvalid(message: string): never {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = 'INVALID_REQUEST';
  throw err;
}

async function readPluginInstallPath(pluginKey: string): Promise<string | undefined> {
  try {
    const res = await harnessService.read({
      scope: 'user',
      relativePath: 'plugins/installed_plugins.json',
    });
    const trimmed = (res.content ?? '').trim();
    if (!trimmed) return undefined;
    const parsed = JSON.parse(trimmed) as {
      plugins?: Record<string, unknown>;
    };
    const raw = parsed.plugins?.[pluginKey];
    const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const e of entries) {
      if (e && typeof e === 'object' && typeof (e as Record<string, unknown>).installPath === 'string') {
        return (e as { installPath: string }).installPath;
      }
    }
    return undefined;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === HARNESS_ERRORS.HARNESS_FILE_NOT_FOUND.code) {
      return undefined;
    }
    throw err;
  }
}

/**
 * Resolve the bundle resource path inside a skill folder, enforcing that the
 * resolved absolute path stays under the skill root. Returns the absolute path
 * along with the relative path used to call harnessService.read/write.
 */
function resolveBundleRef(
  source: HarnessSkillSourceLocation,
  resourcePath: string,
): { ref: { scope: 'user' | 'project'; projectSlug?: string; relativePath: string } } {
  if (source.scope === 'plugin') {
    const err = new Error('plugin scope is read-only') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_FORBIDDEN.code;
    throw err;
  }
  // Defensive normalization — Zod already filters `..` segments below but the
  // explicit guard catches anything sneaking in via URL decoding.
  const skillName = path.basename(source.absoluteRoot);
  const normalized = resourcePath.replace(/\\/g, '/');
  if (normalized.includes('..') || normalized.startsWith('/')) {
    const err = new Error('path traversal blocked') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_PATH_DENIED.code;
    throw err;
  }
  if (source.scope === 'project') {
    return {
      ref: {
        scope: 'project',
        projectSlug: source.projectSlug,
        relativePath: `skills/${skillName}/${normalized}`,
      },
    };
  }
  return {
    ref: { scope: 'user', relativePath: `skills/${skillName}/${normalized}` },
  };
}

export const harnessSkillController = {
  /** GET /skills */
  async list(req: Request, res: Response): Promise<void> {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    try {
      const result = await harnessSkillService.listCards(parsed.data.projectSlug);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** GET /skills/:name */
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
      const source = await resolveSourceLocation({
        scope: query.data.scope,
        name,
        projectSlug: query.data.projectSlug,
        pluginKey: query.data.pluginKey,
      });
      const result = await harnessSkillService.readSkill(source);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** PUT /skills/:name */
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
      const source = await resolveSourceLocation({
        scope: query.data.scope,
        name,
        projectSlug: query.data.projectSlug,
      });
      const result = await harnessSkillService.updateSkill(source, body.data);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** POST /skills/copy */
  async copy(req: Request, res: Response): Promise<void> {
    const body = copyBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: body.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await harnessSkillService.copySkill(body.data as HarnessSkillCopyRequest);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** GET /skills/:name/bundle/<resourcePath> */
  async readBundle(req: Request, res: Response): Promise<void> {
    const query = readQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: query.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    const name = decodeURIComponent(req.params.name ?? '');
    const resourcePath = req.params[0] ?? ''; // express splat
    if (!name || !resourcePath) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'name and resource path are required' },
      });
      return;
    }
    try {
      const source = await resolveSourceLocation({
        scope: query.data.scope,
        name,
        projectSlug: query.data.projectSlug,
        pluginKey: query.data.pluginKey,
      });
      if (source.scope === 'plugin') {
        // Plugin bundle reads are allowed (read-only); short-circuit to direct fs.
        const filePath = path.join(source.absoluteRoot, resourcePath);
        const abs = path.resolve(filePath);
        const root = path.resolve(source.absoluteRoot);
        if (abs !== root && !abs.startsWith(root + path.sep)) {
          const err = new Error('path traversal blocked') as NodeJS.ErrnoException;
          err.code = HARNESS_ERRORS.HARNESS_PATH_DENIED.code;
          throw err;
        }
        const out = await readFileForResponse(abs, resourcePath);
        res.json(out);
        return;
      }
      const { ref } = resolveBundleRef(source, resourcePath);
      const result = await harnessService.read(ref);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** PUT /skills/:name/bundle/<resourcePath> */
  async writeBundle(req: Request, res: Response): Promise<void> {
    const query = updateQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: query.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    const body = bundleWriteBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: body.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    const name = decodeURIComponent(req.params.name ?? '');
    const resourcePath = req.params[0] ?? '';
    if (!name || !resourcePath) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'name and resource path are required' },
      });
      return;
    }
    try {
      const source = await resolveSourceLocation({
        scope: query.data.scope,
        name,
        projectSlug: query.data.projectSlug,
      });
      const { ref } = resolveBundleRef(source, resourcePath);
      const result = await harnessService.write(ref, body.data);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },
};

// ---- helpers shared with the bundle plugin-read short-circuit ------------

async function readFileForResponse(absolutePath: string, relPath: string): Promise<{
  scope: 'plugin';
  path: string;
  content: string | null;
  isBinary: boolean;
  isTruncated: boolean;
  size: number;
  mtime: string;
  mimeType: string;
}> {
  const fs = await import('fs/promises');
  const { isBinaryFile, getMimeType, MAX_FILE_SIZE } = await import('../utils/pathUtils.js');

  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) {
    const err = new Error('not a file') as NodeJS.ErrnoException;
    err.code = HARNESS_ERRORS.HARNESS_NOT_A_FILE.code;
    throw err;
  }
  const size = stat.size;
  const mtime = stat.mtime.toISOString();
  const mimeType = getMimeType(absolutePath);
  const base = { scope: 'plugin' as const, path: relPath, size, mtime, mimeType };

  if (size > 0) {
    const binary = await isBinaryFile(absolutePath);
    if (binary) return { ...base, content: null, isBinary: true, isTruncated: false };
  }
  if (size > MAX_FILE_SIZE) {
    const handle = await fs.open(absolutePath, 'r');
    try {
      const buffer = Buffer.alloc(MAX_FILE_SIZE);
      await handle.read(buffer, 0, MAX_FILE_SIZE, 0);
      return { ...base, content: buffer.toString('utf-8'), isBinary: false, isTruncated: true };
    } finally {
      await handle.close();
    }
  }
  const content = await fs.readFile(absolutePath, 'utf-8');
  return { ...base, content, isBinary: false, isTruncated: false };
}
