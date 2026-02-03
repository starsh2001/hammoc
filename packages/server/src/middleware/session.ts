/**
 * Session Middleware
 * cookie-session configuration for authentication
 * [Source: Story 2.2 - Task 4, Story 2.3 - Task 2, Story 2.4 - Task 2]
 */

import cookieSession from 'cookie-session';
import { RequestHandler } from 'express';
import { AuthConfigService } from '../services/authConfigService.js';

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Create session middleware with persisted secret
 * [Source: Story 2.4 - Task 2]
 *
 * @note cookie-session maxAge behavior:
 * - maxAge: number → expires after that many milliseconds
 * - maxAge: undefined → session cookie (expires on browser close)
 * - maxAge: 0 → immediate expiration (deletes cookie) - DO NOT USE!
 */
export async function createSessionMiddleware(): Promise<RequestHandler> {
  const authConfig = new AuthConfigService();
  const secret = await authConfig.getSessionSecret();

  return cookieSession({
    name: 'bmad-session',
    keys: [secret],
    maxAge: THIRTY_DAYS_MS,
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // localhost only
  });
}
