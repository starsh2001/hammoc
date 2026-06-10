/**
 * CLI Engine Utilities Tests (Story 33.3)
 * Progress-callback gating: forward only in CLI mode with the preference enabled.
 */

import { describe, it, expect } from 'vitest';
import { shouldForwardCliProgress, shouldForwardCliPtyMirror } from '../cliEngineUtils.js';

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

describe('shouldForwardCliPtyMirror (debug PTY mirror)', () => {
  it('forwards in CLI mode when the preference is ON', () => {
    expect(shouldForwardCliPtyMirror('cli', true)).toBe(true);
  });

  // The mirror is a diagnostic, so it defaults OFF (unlike the progress counter).
  it('does NOT forward in CLI mode when the preference is unset (default OFF)', () => {
    expect(shouldForwardCliPtyMirror('cli', undefined)).toBe(false);
  });

  it('does not forward in CLI mode when the preference is OFF', () => {
    expect(shouldForwardCliPtyMirror('cli', false)).toBe(false);
  });

  it('never forwards in SDK mode, regardless of the preference', () => {
    expect(shouldForwardCliPtyMirror('sdk', true)).toBe(false);
    expect(shouldForwardCliPtyMirror('sdk', undefined)).toBe(false);
    expect(shouldForwardCliPtyMirror('sdk', false)).toBe(false);
  });
});
