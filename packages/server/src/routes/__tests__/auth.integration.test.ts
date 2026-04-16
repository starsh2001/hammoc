/**
 * Auth Integration Tests
 * [Source: Story 2.5 - Task 7]
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Express } from 'express';

// Mock AuthConfigService before importing app
vi.mock('../../services/authConfigService.js', () => ({
  AuthConfigService: vi.fn().mockImplementation(() => ({
    getSessionSecret: vi.fn().mockResolvedValue('test-secret-key-for-integration-tests'),
    verifyPassword: vi.fn().mockResolvedValue(true),
    isPasswordConfigured: vi.fn().mockReturnValue(true),
  })),
}));

// Mock rateLimiter
vi.mock('../../services/rateLimiter.js', () => ({
  rateLimiter: {
    canAttempt: vi.fn().mockReturnValue({ allowed: true }),
    recordFailure: vi.fn(),
    reset: vi.fn(),
  },
}));

import { createApp } from '../../app.js';

describe('Auth Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe('Public Routes (AC4)', () => {
    it('[HIGH] GET /api/auth/status - accessible without auth, returns authenticated: false', async () => {
      const response = await request(app)
        .get('/api/auth/status')
        .expect(200);

      expect(response.body).toEqual({ authenticated: false, passwordConfigured: true });
    });

    it('[HIGH] GET /api/health - accessible without auth', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });

    it('[MEDIUM] POST /api/auth/login - accessible without auth', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'test-password' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Protected Routes (AC1)', () => {
    it('[HIGH] GET /api/cli-status - returns 401 without auth', async () => {
      const response = await request(app)
        .get('/api/cli-status')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Authentication required');
    });
  });

  describe('CORS Preflight (OPTIONS)', () => {
    it('[MEDIUM] OPTIONS /api/cli-status - passes without auth', async () => {
      const response = await request(app)
        .options('/api/cli-status')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Authenticated Access', () => {
    it('[HIGH] GET /api/auth/status after login - returns authenticated: true', async () => {
      const agent = request.agent(app);

      // Login first
      await agent
        .post('/api/auth/login')
        .send({ password: 'test-password' })
        .expect(200);

      // Check status with session cookie
      const response = await agent
        .get('/api/auth/status')
        .expect(200);

      expect(response.body).toEqual({ authenticated: true, passwordConfigured: true });
    });

    it('[HIGH] GET /api/cli-status after login - returns 200', async () => {
      const agent = request.agent(app);

      // Login first
      await agent
        .post('/api/auth/login')
        .send({ password: 'test-password' })
        .expect(200);

      // Access protected route with session cookie
      const response = await agent
        .get('/api/cli-status')
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('Static Files (AC5)', () => {
    it('[HIGH] non-API paths skip authentication', async () => {
      // Static file paths that don't start with /api/ should not return 401
      // Note: actual static files may not exist in test environment
      // We're testing that the middleware doesn't block, not that files are served
      const response = await request(app)
        .get('/some-static-path.js');

      // Should not be 401 (may be 404 if file doesn't exist, which is fine)
      expect(response.status).not.toBe(401);
    });
  });
});
