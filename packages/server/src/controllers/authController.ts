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
} from '@bmad-studio/shared';
import { AuthConfigService } from '../services/authConfigService.js';
import { rateLimiter } from '../services/rateLimiter.js';

const loginSchema = z.object({
  password: z.string().min(1, '패스워드를 입력해주세요.'),
  rememberMe: z.boolean().optional().default(true),
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
      console.error('[auth] Login handler error:', err);
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
   * Check if user is authenticated
   */
  status(req: Request, res: Response): void {
    const authenticated = req.session?.authenticated === true;
    res.json({ authenticated });
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
