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
} from '@bmad-studio/shared';
import { AuthConfigService } from '../services/authConfigService.js';
import { rateLimiter } from '../services/rateLimiter.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('auth');

const loginSchema = z.object({
  password: z.string().min(1, '패스워드를 입력해주세요.'),
  rememberMe: z.boolean().optional().default(true),
});

const setupSchema = z.object({
  password: z.string().min(MIN_PASSWORD_LENGTH, `패스워드는 최소 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`),
  confirmPassword: z.string().min(1, '패스워드 확인을 입력해주세요.'),
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
          message: LOGIN_ERRORS.RATE_LIMIT_EXCEEDED.message,
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
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.error.issues[0]?.message || '잘못된 요청입니다.',
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
          message: LOGIN_ERRORS.INVALID_PASSWORD.message,
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
      message: '로그인 성공',
    });
    } catch (err) {
      log.error('Login handler error:', err);
      res.status(500).json({
        error: {
          code: 'LOGIN_ERROR',
          message: `로그인 처리 중 서버 오류: ${err instanceof Error ? err.message : String(err)}`,
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
            message: '패스워드가 이미 설정되어 있습니다.',
          },
        });
        return;
      }

      const validation = setupSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error.issues[0]?.message || '잘못된 요청입니다.',
          },
        });
        return;
      }

      const { password, confirmPassword } = validation.data;

      if (password !== confirmPassword) {
        res.status(400).json({
          error: {
            code: 'PASSWORD_MISMATCH',
            message: '패스워드가 일치하지 않습니다.',
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

      res.json({ success: true, message: '패스워드가 설정되었습니다.' });
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
          message: '패스워드 설정 중 서버 오류가 발생했습니다.',
        },
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
        message: '로그아웃 성공',
      };
      res.json(response);
    } catch {
      res.status(500).json({
        error: {
          code: AUTH_ERROR_CODES.LOGOUT_FAILED,
          message: '로그아웃 처리 중 오류가 발생했습니다',
        },
      });
    }
  },
};
