/**
 * Story 29.2: Snippet management controller.
 *
 * Mounts at `/api/snippets/*` (NOT `/api/harness/*`) — the snippet system is
 * Hammoc-native (`%name%` chat-input expansion via `snippetResolver`), not a
 * Claude Code harness primitive, so its API namespace is intentionally
 * separate from `/api/harness/snippets` to keep intent boundaries crisp.
 *
 * Error envelope mirrors `claudeMdController` and `harnessController` so the
 * client can route both response shapes through the same error-display logic:
 *   `{ error: { code, message, details? } }`
 *
 * Origin-socket broadcast (AC1.e): mutation endpoints (POST/PUT/DELETE/copy)
 * read `X-Hammoc-Socket-Id` and `X-Hammoc-Working-Directory` headers and
 * forward them to `broadcastSnippetList()` so the originating client's
 * autocomplete surfaces (`SnippetPalette` via `useSnippets`) re-receive a
 * fresh `snippets:list` payload without an explicit `refresh()` call.
 * Phase-1 fan-out is single-socket; multi-tab sync is deferred (story AC1.e).
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { HARNESS_ERRORS } from '@hammoc/shared';
import { snippetService } from '../services/snippetService.js';
import { broadcastSnippetList } from '../handlers/websocket.js';
import type { SnippetPathRef, SnippetScope } from '../utils/snippetPaths.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const SCOPE_SCHEMA = z.enum(['project', 'user', 'bundled']);
const MUTABLE_SCOPE_SCHEMA = z.enum(['project', 'user']);

const refParamsSchema = z
  .object({
    scope: SCOPE_SCHEMA,
    name: z.string().min(1),
  });

const refQuerySchema = z.object({
  projectSlug: z.string().optional(),
});

const listQuerySchema = z.object({
  projectSlug: z.string().optional(),
});

const writeBodySchema = z.object({
  content: z.string(),
  expectedMtime: z.string().optional(),
  projectSlug: z.string().optional(),
});

const deleteBodySchema = z.object({
  expectedMtime: z.string().optional(),
  projectSlug: z.string().optional(),
});

const copyBodySchema = z.object({
  sourceScope: SCOPE_SCHEMA,
  sourceName: z.string().min(1),
  sourceProjectSlug: z.string().optional(),
  targetScope: MUTABLE_SCOPE_SCHEMA,
  targetName: z.string().min(1).optional(),
  targetProjectSlug: z.string().optional(),
  onConflict: z.enum(['abort', 'overwrite', 'rename']).optional(),
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

const MAPPED_CODES = [
  'HARNESS_PATH_DENIED',
  'HARNESS_FORBIDDEN',
  'HARNESS_FILE_NOT_FOUND',
  'HARNESS_ROOT_MISSING',
  'HARNESS_STALE_WRITE',
  'HARNESS_FILE_EXISTS',
  'HARNESS_BUNDLED_READONLY',
  'HARNESS_PARSE_ERROR',
] as const;

const MESSAGE_KEY: Record<typeof MAPPED_CODES[number], string> = {
  HARNESS_PATH_DENIED: 'harness.error.pathDenied',
  HARNESS_FORBIDDEN: 'harness.error.forbidden',
  HARNESS_FILE_NOT_FOUND: 'harness.error.fileNotFound',
  HARNESS_ROOT_MISSING: 'harness.error.rootMissing',
  HARNESS_STALE_WRITE: 'harness.error.staleWrite',
  HARNESS_FILE_EXISTS: 'harness.snippets.error.fileExists',
  HARNESS_BUNDLED_READONLY: 'harness.snippets.error.bundledReadOnly',
  HARNESS_PARSE_ERROR: 'harness.error.parseError',
};

function handleError(req: Request, res: Response, error: unknown): void {
  const nodeError = error as NodeJS.ErrnoException & {
    currentMtime?: string;
    absolutePath?: string;
  };
  for (const key of MAPPED_CODES) {
    const entry = HARNESS_ERRORS[key as keyof typeof HARNESS_ERRORS];
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseRefParams(
  req: Request,
  res: Response,
  projectSlug?: string,
): SnippetPathRef | null {
  const parsed = refParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: parsed.error.issues[0]?.message ?? 'invalid params',
      },
    });
    return null;
  }
  if (parsed.data.scope === 'project' && !projectSlug) {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'projectSlug is required for project scope',
      },
    });
    return null;
  }
  return {
    scope: parsed.data.scope as SnippetScope,
    projectSlug: parsed.data.scope === 'project' ? projectSlug : undefined,
    name: parsed.data.name,
  };
}

function readBroadcastHeaders(req: Request): {
  socketId: string | undefined;
  workingDirectory: string | undefined;
} {
  const socketId = stringHeader(req.header('x-hammoc-socket-id'));
  const workingDirectory = stringHeader(req.header('x-hammoc-working-directory'));
  return { socketId, workingDirectory };
}

function stringHeader(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function emitOriginRefresh(req: Request): Promise<void> {
  const { socketId, workingDirectory } = readBroadcastHeaders(req);
  if (!socketId || !workingDirectory) return;
  await broadcastSnippetList(workingDirectory, socketId);
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export const snippetController = {
  /** GET /api/snippets?projectSlug=<slug> */
  async list(req: Request, res: Response): Promise<void> {
    const parsed = listQuerySchema.safeParse(req.query);
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
      const result = await snippetService.list({ projectSlug: parsed.data.projectSlug });
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** GET /api/snippets/:scope/:name?projectSlug=<slug> */
  async read(req: Request, res: Response): Promise<void> {
    const query = refQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'invalid query' } });
      return;
    }
    const ref = parseRefParams(req, res, query.data.projectSlug);
    if (!ref) return;
    try {
      const result = await snippetService.read(ref);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** POST /api/snippets/:scope/:name  body: { content, projectSlug? } */
  async create(req: Request, res: Response): Promise<void> {
    const body = writeBodySchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: body.error.issues[0]?.message ?? 'invalid body',
        },
      });
      return;
    }
    const ref = parseRefParams(req, res, body.data.projectSlug);
    if (!ref) return;
    try {
      const result = await snippetService.create(ref, { content: body.data.content });
      await emitOriginRefresh(req);
      res.status(201).json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** PUT /api/snippets/:scope/:name  body: { content, expectedMtime?, projectSlug? } */
  async update(req: Request, res: Response): Promise<void> {
    const body = writeBodySchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: body.error.issues[0]?.message ?? 'invalid body',
        },
      });
      return;
    }
    const ref = parseRefParams(req, res, body.data.projectSlug);
    if (!ref) return;
    try {
      const result = await snippetService.update(ref, {
        content: body.data.content,
        expectedMtime: body.data.expectedMtime,
      });
      await emitOriginRefresh(req);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** DELETE /api/snippets/:scope/:name  body: { expectedMtime?, projectSlug? } */
  async delete(req: Request, res: Response): Promise<void> {
    const body = deleteBodySchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: body.error.issues[0]?.message ?? 'invalid body',
        },
      });
      return;
    }
    const ref = parseRefParams(req, res, body.data.projectSlug);
    if (!ref) return;
    try {
      const result = await snippetService.delete(ref, {
        expectedMtime: body.data.expectedMtime,
      });
      await emitOriginRefresh(req);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** POST /api/snippets/copy  body: SnippetCopyRequest */
  async copy(req: Request, res: Response): Promise<void> {
    const parsed = copyBodySchema.safeParse(req.body ?? {});
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
      const result = await snippetService.copy(parsed.data);
      await emitOriginRefresh(req);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
