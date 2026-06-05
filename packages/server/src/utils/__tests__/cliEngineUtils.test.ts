/**
 * CLI Engine Utilities Tests (Story 33.3)
 * Progress-callback gating: forward only in CLI mode with the preference enabled.
 */

import { describe, it, expect } from 'vitest';
import { shouldForwardCliProgress } from '../cliEngineUtils.js';

describe('shouldForwardCliProgress (Story 33.3)', () => {
  it('forwards in CLI mode when the preference is ON', () => {
    expect(shouldForwardCliProgress('cli', true)).toBe(true);
  });

  it('forwards in CLI mode when the preference is unset (default ON)', () => {
    expect(shouldForwardCliProgress('cli', undefined)).toBe(true);
  });

  it('does not forward in CLI mode when the preference is OFF', () => {
    expect(shouldForwardCliProgress('cli', false)).toBe(false);
  });

  it('never forwards in SDK mode, regardless of the preference', () => {
    expect(shouldForwardCliProgress('sdk', true)).toBe(false);
    expect(shouldForwardCliProgress('sdk', undefined)).toBe(false);
    expect(shouldForwardCliProgress('sdk', false)).toBe(false);
  });
});
