/**
 * Projects Routes
 * Project list endpoints
 * [Source: Story 3.1 - Task 4]
 * [Extended: Story 3.6 - Task 3: Project creation routes]
 */

import { Router, Request, Response, NextFunction } from 'express';
import { projectController } from '../controllers/projectController.js';

const router = Router();

/**
 * Per-endpoint in-memory rate limiter.
 *
 * Why: Hammoc runs locally for a single user, so this is not a DoS defense
 * (that belongs upstream of the app). The only legitimate purpose here is to
 * backstop a runaway client (infinite retry loop, debounce gone wild) so it
 * cannot pin the server. Limits are therefore set well above any human-reachable
 * rate but low enough to trip a true polling loop within seconds.
 */
interface RateLimitRecord {
  count: number;
  windowStart: number;
}

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const RECORD_TTL_MS = 2 * 60 * 1000;

function createRateLimiter(maxRequests: number, windowMs: number, messageKey: string) {
  // Each limiter owns its own store — sharing one Map across endpoints lets
  // bursts on a noisy endpoint (e.g. debounced path validation) eat the quota
  // of an unrelated endpoint (project create).
  const store = new Map<string, RateLimitRecord>();

  // unref() so the cleanup timer never blocks process exit on its own —
  // otherwise the event loop stays "busy" forever and `beforeExit` never fires.
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of store.entries()) {
      if (now - record.windowStart > RECORD_TTL_MS) {
        store.delete(ip);
      }
    }
  }, CLEANUP_INTERVAL_MS).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = store.get(ip);

    if (!record || now - record.windowStart > windowMs) {
      store.set(ip, { count: 1, windowStart: now });
      next();
      return;
    }

    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.windowStart + windowMs - now) / 1000);
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: req.t!(messageKey),
          details: { retryAfter },
        },
      });
      return;
    }

    record.count++;
    next();
  };
}

// Limits target "client bug backstop" only — humans cannot reach 1000/min,
// but a tight retry loop will trip within ~1s.
const createProjectLimiter = createRateLimiter(
  1000,
  60 * 1000,
  'preferences.rateLimit.projectCreate',
);
const validatePathLimiter = createRateLimiter(
  1000,
  60 * 1000,
  'preferences.rateLimit.pathValidation',
);

// GET /api/projects - List all projects
router.get('/', projectController.list);

// POST /api/projects - Create new project (rate limited)
router.post('/', createProjectLimiter, projectController.create);

// GET /api/projects/bmad-versions - List available BMad method versions
router.get('/bmad-versions', projectController.bmadVersions);

// POST /api/projects/:projectSlug/setup-bmad - Setup BMad for existing project
router.post('/:projectSlug/setup-bmad', createProjectLimiter, projectController.setupBmad);

// DELETE /api/projects/:projectSlug - Delete a project
router.delete('/:projectSlug', projectController.delete);

// GET /api/projects/:projectSlug/settings - Get project settings with effective values
router.get('/:projectSlug/settings', projectController.getSettings);

// PATCH /api/projects/:projectSlug/settings - Update project settings
router.patch('/:projectSlug/settings', projectController.updateSettings);

// GET /api/projects/:projectSlug/system-prompt - Get default system prompt
router.get('/:projectSlug/system-prompt', projectController.getSystemPrompt);

// POST /api/projects/:projectSlug/open-explorer - Open project in system file explorer (localhost only)
router.post('/:projectSlug/open-explorer', projectController.openExplorer);

// POST /api/projects/validate-path - Validate directory path (rate limited)
router.post('/validate-path', validatePathLimiter, projectController.validatePath);

export default router;
