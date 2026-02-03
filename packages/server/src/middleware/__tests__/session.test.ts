/**
 * Session Middleware Tests
 * [Source: Story 2.3 - Task 9, Story 2.4 - Task 2]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSessionMiddleware, THIRTY_DAYS_MS } from '../session';

// Mock AuthConfigService
vi.mock('../../services/authConfigService', () => ({
  AuthConfigService: vi.fn().mockImplementation(() => ({
    getSessionSecret: vi.fn().mockResolvedValue('mock-session-secret'),
  })),
}));

describe('session middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('configuration', () => {
    it('[HIGH] should have default maxAge of 30 days', () => {
      expect(THIRTY_DAYS_MS).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('[HIGH] should create async session middleware', async () => {
      const middleware = await createSessionMiddleware();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('THIRTY_DAYS_MS constant', () => {
    it('should be exported and equal to 30 days in milliseconds', () => {
      const expectedMs = 30 * 24 * 60 * 60 * 1000;
      expect(THIRTY_DAYS_MS).toBe(expectedMs);
    });
  });
});
