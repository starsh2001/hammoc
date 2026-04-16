/**
 * Auth Routes Integration Tests
 * [Source: Story 2.2 - Task 10]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieSession from 'cookie-session';

// Create hoisted mocks
const { mockVerifyPassword, mockIsPasswordConfigured } = vi.hoisted(() => ({
  mockVerifyPassword: vi.fn().mockResolvedValue(true),
  mockIsPasswordConfigured: vi.fn().mockReturnValue(true),
}));

// Mock authConfigService before importing routes
vi.mock('../../services/authConfigService', () => ({
  AuthConfigService: vi.fn().mockImplementation(() => ({
    verifyPassword: mockVerifyPassword,
    isPasswordConfigured: mockIsPasswordConfigured,
  })),
}));

// Reset rateLimiter between tests
vi.mock('../../services/rateLimiter', () => ({
  rateLimiter: {
    canAttempt: vi.fn().mockReturnValue({ allowed: true }),
    recordFailure: vi.fn(),
    reset: vi.fn(),
  },
}));

import authRoutes from '../auth';
import { rateLimiter } from '../../services/rateLimiter';

describe('Auth Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    // Create fresh express app for each test
    app = express();
    app.use(express.json());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use((req: any, _res: any, next: any) => { req.t = (key: string) => key; req.language = 'en'; next(); });
    app.use(
      cookieSession({
        name: 'test-session',
        keys: ['test-secret'],
        maxAge: 24 * 60 * 60 * 1000,
      })
    );
    app.use('/api/auth', authRoutes);

    // Reset mocks
    vi.clearAllMocks();
    vi.mocked(rateLimiter.canAttempt).mockReturnValue({ allowed: true });
    mockVerifyPassword.mockResolvedValue(true);
    mockIsPasswordConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should return 200 and set session on successful login', async () => {
      mockVerifyPassword.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'correct-password' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'auth.login.success',
      });

      // Verify session cookie is set
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should return 401 on failed login', async () => {
      mockVerifyPassword.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'wrong-password' })
        .expect(401);

      expect(response.body).toEqual({
        error: {
          code: 'INVALID_PASSWORD',
          message: 'auth.login.invalidPassword',
        },
      });
    });

    it('should return 429 when rate limited', async () => {
      vi.mocked(rateLimiter.canAttempt).mockReturnValue({
        allowed: false,
        retryAfter: 30,
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'any-password' })
        .expect(429);

      expect(response.body).toEqual({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'auth.login.rateLimitExceeded',
          details: {
            retryAfter: 30,
            remainingAttempts: 0,
          },
        },
      });
    });

    it('should return 400 on empty password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: '' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/auth/status', () => {
    it('should return authenticated: false for new session', async () => {
      const response = await request(app).get('/api/auth/status').expect(200);

      expect(response.body).toEqual({ authenticated: false, passwordConfigured: true });
    });

    it('should return authenticated: true after successful login', async () => {
      mockVerifyPassword.mockResolvedValue(true);

      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ password: 'correct-password' });

      // Get cookies from login response
      const cookies = loginResponse.headers['set-cookie'];

      // Check status with session cookie
      const statusResponse = await request(app)
        .get('/api/auth/status')
        .set('Cookie', cookies)
        .expect(200);

      expect(statusResponse.body).toEqual({ authenticated: true, passwordConfigured: true });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear session and return success with message', async () => {
      mockVerifyPassword.mockResolvedValue(true);

      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ password: 'correct-password' });

      const cookies = loginResponse.headers['set-cookie'];

      // Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookies)
        .expect(200);

      expect(logoutResponse.body).toEqual({
        success: true,
        message: 'auth.logout.success',
      });

      // Verify session is cleared
      const statusResponse = await request(app)
        .get('/api/auth/status')
        .set('Cookie', logoutResponse.headers['set-cookie'] || cookies)
        .expect(200);

      expect(statusResponse.body).toEqual({ authenticated: false, passwordConfigured: true });
    });
  });
});
