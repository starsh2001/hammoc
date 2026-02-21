/**
 * Authentication Middleware
 * Validates session authentication for protected routes
 * [Source: Story 2.5 - Task 1, 2]
 */

import { Request, Response, NextFunction } from 'express';
import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES } from '@bmad-studio/shared';

/**
 * Public routes that don't require authentication (AC4)
 */
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/status',
  '/api/auth/setup',
  '/api/health',
];

/**
 * API request authentication middleware
 * Checks session cookie authenticated state
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.session?.authenticated) {
    return next();
  }

  res.status(401).json({
    error: {
      code: AUTH_ERROR_CODES.UNAUTHORIZED,
      message: AUTH_ERROR_MESSAGES.UNAUTHORIZED,
    },
  });
}

/**
 * Authentication middleware with route exclusions
 * Skips authentication for public routes and static files
 * [Source: Story 2.5 - Task 2]
 */
export function authMiddlewareWithExclusions(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // CORS preflight (OPTIONS) requests are handled by cors middleware before auth
  // Note: cors middleware is applied before auth middleware in the middleware chain
  if (req.method === 'OPTIONS') {
    return next();
  }

  // Public routes skip authentication
  if (PUBLIC_ROUTES.some((route) => req.path === route)) {
    return next();
  }

  // Static files skip authentication (non-api paths) (AC5)
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  return authMiddleware(req, res, next);
}
