/**
 * Story 31.3 (Task A.6): Observability controller (Epic 31).
 *
 * Mounts at:
 *   GET  /api/harness/observability/:projectSlug/mcp-calls         → aggregates + timeline (AC-A1/A2)
 *   GET  /api/harness/observability/:projectSlug/token-attribution → element sizes (AC-B1)
 *   POST /api/harness/observability/:projectSlug/exact-count       → count_tokens proxy (AC-B3)
 *   GET  /api/harness/observability/tokenizer-pref                 → global tokenizer pref (AC-B4)
 *   PUT  /api/harness/observability/tokenizer-pref                 → set it (AC-B4)
 *
 * Mirrors `contextBuilderController` (Story 31.2): success responses are the raw
 * result object; failures are `{ error: { code, message } }` with the message
 * resolved through `req.t!()`. There is no global Express error middleware —
 * codes map to HTTP statuses inline.
 *
 * MCP log itself has NO write endpoint — records are appended by the
 * `streamCallbacks` recorder (read-only collection); only exact-count is a POST.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import {
  OBSERVABILITY_TOKENIZER_DEFAULT,
  OBSERVABILITY_TOKENIZER_OPTIONS,
  type ObservabilityTokenizer,
} from '@hammoc/shared';
import { observabilityService } from '../services/observabilityService.js';
import { tokenCountService } from '../services/tokenCountService.js';
import { preferencesService } from '../services/preferencesService.js';

const projectSlugSchema = z.string().min(1, 'projectSlug is required');

const mcpCallsQuerySchema = z.object({
  server: z.string().optional(),
  tool: z.string().optional(),
  sessionId: z.string().optional(),
  sinceDays: z.coerce.number().int().positive().optional(),
});

const exactCountBodySchema = z.object({
  kind: z.enum(['claudeMd-project', 'claudeMd-global', 'skill', 'contextBuilder']),
  path: z.string().optional(),
  contentHash: z.string(),
});

const tokenizerPrefBodySchema = z.object({
  // Only the active options (spike #1 — size/4) are accepted; the toggle still
  // renders any reserved tier disabled (AC-B4.b) but cannot be persisted.
  tokenizer: z.enum(
    OBSERVABILITY_TOKENIZER_OPTIONS as unknown as [ObservabilityTokenizer, ...ObservabilityTokenizer[]],
  ),
});

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

function handleError(req: Request, res: Response, error: unknown): void {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'PROJECT_NOT_FOUND') {
    res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('harness.error.rootMissing') } });
    return;
  }
  if (code === 'EACCES') {
    res.status(403).json({ error: { code: 'HARNESS_FORBIDDEN', message: req.t!('harness.error.forbidden') } });
    return;
  }
  res.status(500).json({ error: { code: 'OBSERVABILITY_ERROR', message: req.t!('harness.error.writeError') } });
}

export const observabilityController = {
  /** GET …/:projectSlug/mcp-calls — filtered aggregates + recent timeline. */
  async mcpCalls(req: Request, res: Response): Promise<void> {
    const projectSlug = parseSlug(req, res);
    if (!projectSlug) return;
    const parsed = mcpCallsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid query' },
      });
      return;
    }
    try {
      const result = await observabilityService.query(projectSlug, parsed.data);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** GET …/:projectSlug/token-attribution — measured harness element sizes. */
  async tokenAttribution(req: Request, res: Response): Promise<void> {
    const projectSlug = parseSlug(req, res);
    if (!projectSlug) return;
    try {
      const items = await tokenCountService.listTokenAttribution(projectSlug);
      res.json({ items });
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** POST …/:projectSlug/exact-count — official count_tokens (cached, non-blocking). */
  async exactCount(req: Request, res: Response): Promise<void> {
    const projectSlug = parseSlug(req, res);
    if (!projectSlug) return;
    const parsed = exactCountBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      const result = await tokenCountService.exactCount(projectSlug, parsed.data);
      res.json(result);
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** GET …/tokenizer-pref — current global approximation tokenizer (AC-B4). */
  async getTokenizerPref(req: Request, res: Response): Promise<void> {
    try {
      const prefs = await preferencesService.readPreferences();
      res.json({
        tokenizer: prefs.observabilityTokenizer ?? OBSERVABILITY_TOKENIZER_DEFAULT,
        options: [...OBSERVABILITY_TOKENIZER_OPTIONS],
      });
    } catch (error) {
      handleError(req, res, error);
    }
  },

  /** PUT …/tokenizer-pref — persist the global tokenizer preference (AC-B4). */
  async setTokenizerPref(req: Request, res: Response): Promise<void> {
    const parsed = tokenizerPrefBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0]?.message ?? 'invalid body' },
      });
      return;
    }
    try {
      await preferencesService.writePreferences({ observabilityTokenizer: parsed.data.tokenizer });
      res.json({ tokenizer: parsed.data.tokenizer, options: [...OBSERVABILITY_TOKENIZER_OPTIONS] });
    } catch (error) {
      handleError(req, res, error);
    }
  },
};
