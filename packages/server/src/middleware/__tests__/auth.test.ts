/**
 * Authentication Middleware Tests
 * [Source: Story 2.5 - Task 6]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authMiddleware, authMiddlewareWithExclusions } from '../auth.js';
import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES } from '@hammoc/shared';

// Mock request factory
function mockReq(
  session: { authenticated?: boolean } | null | undefined,
  path: string,
  method: string = 'GET'
): Request {
  return {
    session,
    path,
    method,
  } as unknown as Request;
}

// Mock response factory
function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  return res as Response;
}

describe('authMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('calls next() for authenticated session', () => {
    const req = mockReq({ authenticated: true }, '/api/projects');
    const res = mockRes();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 for unauthenticated session (null)', () => {
    const req = mockReq(null, '/api/projects');
    const res = mockRes();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: AUTH_ERROR_CODES.UNAUTHORIZED,
        message: AUTH_ERROR_MESSAGES.UNAUTHORIZED,
      },
    });
  });

  it('returns 401 for unauthenticated session (authenticated: false)', () => {
    const req = mockReq({ authenticated: false }, '/api/projects');
    const res = mockRes();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 for undefined session', () => {
    const req = mockReq(undefined, '/api/projects');
    const res = mockRes();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('authMiddlewareWithExclusions', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  describe('public routes (AC4)', () => {
    it('skips authentication for /api/auth/login', () => {
      const req = mockReq(null, '/api/auth/login');
      const res = mockRes();

      authMiddlewareWithExclusions(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('skips authentication for /api/auth/status', () => {
      const req = mockReq(null, '/api/auth/status');
      const res = mockRes();

      authMiddlewareWithExclusions(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('skips authentication for /api/health', () => {
      const req = mockReq(null, '/api/health');
      const res = mockRes();

      authMiddlewareWithExclusions(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('static files (AC5)', () => {
    it('skips authentication for static file paths', () => {
      const req = mockReq(null, '/index.html');
      const res = mockRes();

      authMiddlewareWithExclusions(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('skips authentication for root path', () => {
      const req = mockReq(null, '/');
      const res = mockRes();

      authMiddlewareWithExclusions(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('skips authentication for assets path', () => {
      const req = mockReq(null, '/assets/main.js');
      const res = mockRes();

      authMiddlewareWithExclusions(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('protected routes (AC1)', () => {
    it('requires authentication for /api/projects', () => {
      const req = mockReq(null, '/api/projects');
      const res = mockRes();

      authMiddlewareWithExclusions(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('allows authenticated access to /api/projects', () => {
      const req = mockReq({ authenticated: true }, '/api/projects');
      const res = mockRes();

      authMiddlewareWithExclusions(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('requires authentication for /api/sessions', () => {
      const req = mockReq(null, '/api/sessions');
      const res = mockRes();

      authMiddlewareWithExclusions(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('CORS preflight (OPTIONS)', () => {
    it('skips authentication for OPTIONS requests', () => {
      const req = mockReq(null, '/api/projects', 'OPTIONS');
      const res = mockRes();

      authMiddlewareWithExclusions(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
