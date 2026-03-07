/**
 * Rate Limiter Service Tests
 * [Source: Story 2.2 - Task 10]
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// We need to reset the module between tests to get a fresh rateLimiter instance
let rateLimiter: typeof import('../rateLimiter').rateLimiter;

describe('RateLimiter', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    // Reset module to get fresh instance
    vi.resetModules();
    const module = await import('../rateLimiter');
    rateLimiter = module.rateLimiter;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('canAttempt', () => {
    it('should allow first attempt', () => {
      const result = rateLimiter.canAttempt('127.0.0.1');
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should allow attempts under limit', () => {
      const ip = '127.0.0.1';

      // Record 4 failures (under the limit of 5)
      for (let i = 0; i < 4; i++) {
        rateLimiter.recordFailure(ip);
      }

      const result = rateLimiter.canAttempt(ip);
      expect(result.allowed).toBe(true);
    });

    it('should block after 5 failed attempts', () => {
      const ip = '127.0.0.1';

      // Record 5 failures
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordFailure(ip);
      }

      const result = rateLimiter.canAttempt(ip);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(30);
    });

    it('should allow attempt after lockout expires (30 seconds)', () => {
      const ip = '127.0.0.1';

      // Record 5 failures
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordFailure(ip);
      }

      // Verify blocked
      expect(rateLimiter.canAttempt(ip).allowed).toBe(false);

      // Advance time by 30 seconds
      vi.advanceTimersByTime(30 * 1000);

      // Should be allowed again
      const result = rateLimiter.canAttempt(ip);
      expect(result.allowed).toBe(true);
    });

    it('should return decreasing retryAfter time', () => {
      const ip = '127.0.0.1';

      // Record 5 failures
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordFailure(ip);
      }

      // Check initial retryAfter
      let result = rateLimiter.canAttempt(ip);
      expect(result.retryAfter).toBe(30);

      // Advance 10 seconds
      vi.advanceTimersByTime(10 * 1000);

      // Should have 20 seconds left
      result = rateLimiter.canAttempt(ip);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(20);
    });
  });

  describe('recordFailure', () => {
    it('should increment failure count until lockout', () => {
      const ip = '127.0.0.1';

      expect(rateLimiter.canAttempt(ip).allowed).toBe(true);

      rateLimiter.recordFailure(ip);
      expect(rateLimiter.canAttempt(ip).allowed).toBe(true);

      // Exhaust all attempts
      for (let i = 0; i < 4; i++) {
        rateLimiter.recordFailure(ip);
      }
      expect(rateLimiter.canAttempt(ip).allowed).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset attempt count', () => {
      const ip = '127.0.0.1';

      // Record some failures
      rateLimiter.recordFailure(ip);
      rateLimiter.recordFailure(ip);

      // Reset
      rateLimiter.reset(ip);

      // Should be back to full attempts
      expect(rateLimiter.canAttempt(ip).allowed).toBe(true);
    });

    it('should clear lockout', () => {
      const ip = '127.0.0.1';

      // Trigger lockout
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordFailure(ip);
      }
      expect(rateLimiter.canAttempt(ip).allowed).toBe(false);

      // Reset
      rateLimiter.reset(ip);

      // Should be allowed again
      expect(rateLimiter.canAttempt(ip).allowed).toBe(true);
    });
  });
});
