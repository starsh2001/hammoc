/**
 * Auth Controller
 * Handles login and session status endpoints
 * [Source: Story 2.2 - Task 3, Story 2.3 - Task 3]
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import {
  LOGIN_ERRORS,
  RateLimitErrorResponse,
  LogoutResponse,
  AUTH_ERROR_CODES,
  AuthConfigError,
  MIN_PASSWORD_LENGTH,
} from '@hammoc/shared';
import { AuthConfigService } from '../services/authConfigService.js';
import { rateLimiter } from '../services/rateLimiter.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('auth');

const loginSchema = z.object({
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(true),
});

const setupSchema = z.object({
  password: z.string().min(MIN_PASSWORD_LENGTH),
  confirmPassword: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
  confirmNewPassword: z.string().min(1),
});

const authConfigService = new AuthConfigService();

export const authController = {
  /**
   * POST /api/auth/login
   * Authenticate user with password
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
    // Get client IP
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    // Check rate limit
    const rateLimitResult = rateLimiter.canAttempt(ip);
    if (!rateLimitResult.allowed) {
      res.status(429).json({
        error: {
          code: LOGIN_ERRORS.RATE_LIMIT_EXCEEDED.code,
          message: req.t!('auth.login.rateLimitExceeded'),
          details: {
            retryAfter: rateLimitResult.retryAfter ?? 0,
            remainingAttempts: 0,
          },
        },
      } satisfies RateLimitErrorResponse);
      return;
    }

    // Validate request body
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      const field = validation.error.issues[0]?.path[0];
      const message = field === 'password'
        ? req.t!('auth.validation.passwordRequired')
        : req.t!('auth.validation.invalidRequest');
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message,
        },
      });
      return;
    }

    const { password, rememberMe } = validation.data;

    // Verify password
    const isValid = await authConfigService.verifyPassword(password);

    if (!isValid) {
      // Record failed attempt
      rateLimiter.recordFailure(ip);

      res.status(401).json({
        error: {
          code: LOGIN_ERRORS.INVALID_PASSWORD.code,
          message: req.t!('auth.login.invalidPassword'),
        },
      });
      return;
    }

    // Reset rate limiter on successful login
    rateLimiter.reset(ip);

    // Set session cookie
    if (req.session) {
      req.session.authenticated = true;
      req.session.rememberMe = rememberMe;

      // cookie-session dynamic maxAge (per-request override)
      // @see https://github.com/expressjs/cookie-session#per-request-options
      if (!rememberMe) {
        // Session cookie (expires on browser close)
        // IMPORTANT: maxAge=undefined → session cookie
        //            maxAge=0 → immediate expiration (deletes cookie) - DO NOT USE!
        req.sessionOptions.maxAge = undefined;
      }
      // rememberMe=true: keep middleware default (30 days)
    }

    res.json({
      success: true,
      message: req.t!('auth.login.success'),
    });
    } catch (err) {
      log.error('Login handler error:', err);
      res.status(500).json({
        error: {
          code: 'LOGIN_ERROR',
          message: req.t!('auth.login.serverError'),
        },
      });
    }
  },

  /**
   * GET /api/auth/status
   * Check if user is authenticated and if password is configured
   */
  status(req: Request, res: Response): void {
    const authenticated = req.session?.authenticated === true;
    const passwordConfigured = authConfigService.isPasswordConfigured();
    res.json({ authenticated, passwordConfigured });
  },

  /**
   * POST /api/auth/setup
   * Initial password setup (only works when no password is configured)
   */
  async setup(req: Request, res: Response): Promise<void> {
    try {
      if (authConfigService.isPasswordConfigured()) {
        res.status(403).json({
          error: {
            code: 'ALREADY_CONFIGURED',
            message: req.t!('auth.password.alreadySet'),
          },
        });
        return;
      }

      const validation = setupSchema.safeParse(req.body);
      if (!validation.success) {
        const field = validation.error.issues[0]?.path[0];
        let message: string;
        if (field === 'password') {
          message = req.t!('auth.validation.passwordMinLength', { value: MIN_PASSWORD_LENGTH });
        } else if (field === 'confirmPassword') {
          message = req.t!('auth.validation.passwordConfirmRequired');
        } else {
          message = req.t!('auth.validation.invalidRequest');
        }
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message,
          },
        });
        return;
      }

      const { password, confirmPassword } = validation.data;

      if (password !== confirmPassword) {
        res.status(400).json({
          error: {
            code: 'PASSWORD_MISMATCH',
            message: req.t!('auth.password.mismatch'),
          },
        });
        return;
      }

      await authConfigService.setPassword(password);

      // Auto-login after setup
      if (req.session) {
        req.session.authenticated = true;
        req.session.rememberMe = true;
      }

      res.json({ success: true, message: req.t!('auth.password.setSuccess') });
    } catch (err) {
      if (err instanceof AuthConfigError) {
        res.status(400).json({
          error: { code: err.code, message: err.message },
        });
        return;
      }
      log.error('Setup handler error:', err);
      res.status(500).json({
        error: {
          code: 'SETUP_ERROR',
          message: req.t!('auth.password.setError'),
        },
      });
    }
  },

  /**
   * POST /api/auth/change-password
   * Change password (requires current password verification)
   */
  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const validation = changePasswordSchema.safeParse(req.body);
      if (!validation.success) {
        const field = validation.error.issues[0]?.path[0];
        let message: string;
        if (field === 'currentPassword') {
          message = req.t!('auth.validation.passwordRequired');
        } else if (field === 'newPassword') {
          message = req.t!('auth.validation.passwordMinLength', { value: MIN_PASSWORD_LENGTH });
        } else if (field === 'confirmNewPassword') {
          message = req.t!('auth.validation.passwordConfirmRequired');
        } else {
          message = req.t!('auth.validation.invalidRequest');
        }
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
        return;
      }

      const { currentPassword, newPassword, confirmNewPassword } = validation.data;

      // Verify current password
      const isValid = await authConfigService.verifyPassword(currentPassword);
      if (!isValid) {
        res.status(401).json({
          error: { code: 'INVALID_PASSWORD', message: req.t!('auth.login.invalidPassword') },
        });
        return;
      }

      if (newPassword !== confirmNewPassword) {
        res.status(400).json({
          error: { code: 'PASSWORD_MISMATCH', message: req.t!('auth.password.mismatch') },
        });
        return;
      }

      await authConfigService.resetPassword(newPassword);

      // Clear current session so user must re-login with new password
      req.session = null;

      res.json({ success: true, message: req.t!('auth.password.changeSuccess') });
    } catch (err) {
      if (err instanceof AuthConfigError) {
        res.status(400).json({ error: { code: err.code, message: err.message } });
        return;
      }
      log.error('Change password handler error:', err);
      res.status(500).json({
        error: { code: 'CHANGE_PASSWORD_ERROR', message: req.t!('auth.password.changeError') },
      });
    }
  },

  /**
   * POST /api/auth/logout
   * Logout user and clear session cookie
   * [Source: Story 2.4 - Task 1]
   */
  logout(req: Request, res: Response): void {
    try {
      // cookie-session: setting to null deletes the cookie
      req.session = null;

      const response: LogoutResponse = {
        success: true,
        message: req.t!('auth.logout.success'),
      };
      res.json(response);
    } catch {
      res.status(500).json({
        error: {
          code: AUTH_ERROR_CODES.LOGOUT_FAILED,
          message: req.t!('auth.logout.error'),
        },
      });
    }
  },
};
