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
 * Simple in-memory rate limiter for project endpoints
 * [Source: Story 3.6 - Task 3]
 */
interface RateLimitRecord {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Cleanup expired rate limit records periodically
 * Runs every 5 minutes to prevent memory growth
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const RECORD_TTL_MS = 2 * 60 * 1000; // Keep records for 2 minutes after window expires

function cleanupExpiredRecords(): void {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    // Remove records that are older than TTL
    if (now - record.windowStart > RECORD_TTL_MS) {
      rateLimitStore.delete(ip);
    }
  }
}

// Start periodic cleanup
const cleanupInterval = setInterval(cleanupExpiredRecords, CLEANUP_INTERVAL_MS);

// Cleanup on process exit (for graceful shutdown)
if (typeof process !== 'undefined' && process.on) {
  process.on('beforeExit', () => {
    clearInterval(cleanupInterval);
  });
}

function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = rateLimitStore.get(ip);

    if (!record || now - record.windowStart > windowMs) {
      // New window
      rateLimitStore.set(ip, { count: 1, windowStart: now });
      next();
      return;
    }

    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.windowStart + windowMs - now) / 1000);
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message:
            maxRequests === 10
              ? req.t!('preferences.rateLimit.projectCreate')
              : req.t!('preferences.rateLimit.pathValidation'),
          details: { retryAfter },
        },
      });
      return;
    }

    record.count++;
    next();
  };
}

// Rate limiters
const createProjectLimiter = createRateLimiter(10, 60 * 1000); // 10 requests per minute
const validatePathLimiter = createRateLimiter(30, 60 * 1000); // 30 requests per minute

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

// POST /api/projects/validate-path - Validate directory path (rate limited)
router.post('/validate-path', validatePathLimiter, projectController.validatePath);

export default router;
