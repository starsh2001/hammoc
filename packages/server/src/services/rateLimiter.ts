/**
 * Rate Limiter Service
 * In-memory rate limiting for login attempts
 * [Source: Story 2.2 - AC 5]
 */

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 1000; // 30 seconds

interface AttemptRecord {
  count: number;
  lockoutUntil: number | null;
}

/**
 * Rate limiter for login attempts
 * Singleton class that tracks failed login attempts by IP
 */
class RateLimiterService {
  private attempts: Map<string, AttemptRecord> = new Map();

  /**
   * Check if an IP is allowed to attempt login
   * @returns Object with allowed status and optional retryAfter seconds
   */
  canAttempt(ip: string): { allowed: boolean; retryAfter?: number } {
    const record = this.attempts.get(ip);

    if (!record) {
      return { allowed: true };
    }

    // Check if lockout has expired
    if (record.lockoutUntil !== null) {
      const now = Date.now();
      if (now < record.lockoutUntil) {
        const retryAfter = Math.ceil((record.lockoutUntil - now) / 1000);
        return { allowed: false, retryAfter };
      }
      // Lockout expired, reset the record
      this.attempts.delete(ip);
      return { allowed: true };
    }

    return { allowed: true };
  }

  /**
   * Record a failed login attempt
   * If MAX_ATTEMPTS reached, set lockout
   */
  recordFailure(ip: string): void {
    const record = this.attempts.get(ip);

    if (!record) {
      this.attempts.set(ip, { count: 1, lockoutUntil: null });
      return;
    }

    record.count += 1;

    if (record.count >= MAX_ATTEMPTS) {
      record.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
  }

  /**
   * Reset attempt count for an IP (called on successful login)
   */
  reset(ip: string): void {
    this.attempts.delete(ip);
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiterService();
