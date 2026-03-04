/**
 * Auth Controller Tests
 * [Source: Story 2.2 - Task 10, Story 2.3 - Task 9]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';

// Create hoisted mocks (must be hoisted to be available in vi.mock)
const { mockVerifyPassword, mockIsPasswordConfigured } = vi.hoisted(() => ({
  mockVerifyPassword: vi.fn(),
  mockIsPasswordConfigured: vi.fn().mockReturnValue(true),
}));

// Mock dependencies
vi.mock('../../services/authConfigService', () => ({
  AuthConfigService: vi.fn().mockImplementation(() => ({
    verifyPassword: mockVerifyPassword,
    isPasswordConfigured: mockIsPasswordConfigured,
  })),
}));

vi.mock('../../services/rateLimiter', () => ({
  rateLimiter: {
    canAttempt: vi.fn(),
    recordFailure: vi.fn(),
    reset: vi.fn(),
  },
}));

import { rateLimiter } from '../../services/rateLimiter';
import { authController } from '../authController';

// Session constants (from session.ts)
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

describe('authController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      body: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as Request['socket'],
      session: {},
      sessionOptions: { maxAge: THIRTY_DAYS_MS },
      t: vi.fn((key: string) => key),
      language: 'en',
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    // Reset mocks
    vi.clearAllMocks();

    // Setup default mock behavior
    vi.mocked(rateLimiter.canAttempt).mockReturnValue({ allowed: true });
    mockIsPasswordConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('login', () => {
    it('should return 200 on successful login with correct password', async () => {
      mockReq.body = { password: 'correct-password' };
      mockVerifyPassword.mockResolvedValue(true);

      await authController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'auth.login.success',
      });
      expect(rateLimiter.reset).toHaveBeenCalledWith('127.0.0.1');
      expect(mockReq.session?.authenticated).toBe(true);
    });

    it('should return 401 on failed login with wrong password', async () => {
      mockReq.body = { password: 'wrong-password' };
      mockVerifyPassword.mockResolvedValue(false);

      await authController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_PASSWORD',
          message: 'auth.login.invalidPassword',
        },
      });
      expect(rateLimiter.recordFailure).toHaveBeenCalledWith('127.0.0.1');
    });

    it('should return 429 when rate limited', async () => {
      mockReq.body = { password: 'any-password' };
      vi.mocked(rateLimiter.canAttempt).mockReturnValue({
        allowed: false,
        retryAfter: 25,
      });

      await authController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'auth.login.rateLimitExceeded',
          details: {
            retryAfter: 25,
            remainingAttempts: 0,
          },
        },
      });
    });

    it('should return 400 on empty password', async () => {
      mockReq.body = { password: '' };

      await authController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'auth.validation.passwordRequired',
        },
      });
    });

    it('should return 400 when password is missing', async () => {
      mockReq.body = {};

      await authController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.any(String),
        },
      });
    });

    // Story 2.3 - rememberMe tests
    describe('rememberMe handling', () => {
      it('[HIGH] should keep 30-day cookie when rememberMe=true', async () => {
        mockReq.body = { password: 'test1234', rememberMe: true };
        mockVerifyPassword.mockResolvedValue(true);

        await authController.login(mockReq as Request, mockRes as Response);

        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'auth.login.success',
        });
        expect(mockReq.session?.authenticated).toBe(true);
        expect(mockReq.session?.rememberMe).toBe(true);
        // maxAge should remain unchanged (middleware default of 30 days)
        expect(mockReq.sessionOptions?.maxAge).toBe(THIRTY_DAYS_MS);
      });

      it('[HIGH] should set session cookie when rememberMe=false (maxAge=undefined)', async () => {
        mockReq.body = { password: 'test1234', rememberMe: false };
        mockVerifyPassword.mockResolvedValue(true);

        await authController.login(mockReq as Request, mockRes as Response);

        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'auth.login.success',
        });
        expect(mockReq.session?.authenticated).toBe(true);
        expect(mockReq.session?.rememberMe).toBe(false);
        // maxAge should be undefined for session cookie
        expect(mockReq.sessionOptions?.maxAge).toBeUndefined();
      });

      it('[MEDIUM] should default to rememberMe=true when not specified', async () => {
        mockReq.body = { password: 'test1234' };
        mockVerifyPassword.mockResolvedValue(true);

        await authController.login(mockReq as Request, mockRes as Response);

        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'auth.login.success',
        });
        expect(mockReq.session?.authenticated).toBe(true);
        expect(mockReq.session?.rememberMe).toBe(true);
        // maxAge should remain unchanged (default true)
        expect(mockReq.sessionOptions?.maxAge).toBe(THIRTY_DAYS_MS);
      });
    });
  });

  describe('status', () => {
    it('should return authenticated: true when session is authenticated', () => {
      mockReq.session = { authenticated: true };

      authController.status(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({ authenticated: true, passwordConfigured: true });
    });

    it('should return authenticated: false when session is not authenticated', () => {
      mockReq.session = { authenticated: false };

      authController.status(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({ authenticated: false, passwordConfigured: true });
    });

    it('should return authenticated: false when session is null', () => {
      mockReq.session = null;

      authController.status(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({ authenticated: false, passwordConfigured: true });
    });
  });

  describe('logout', () => {
    it('[HIGH] should set session to null for cookie deletion', () => {
      mockReq.session = { authenticated: true, rememberMe: true };

      authController.logout(mockReq as Request, mockRes as Response);

      // cookie-session: setting to null deletes the cookie
      expect(mockReq.session).toBeNull();
    });

    it('[HIGH] should return success response with message', () => {
      mockReq.session = { authenticated: true };

      authController.logout(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'auth.logout.success',
      });
    });
  });
});
