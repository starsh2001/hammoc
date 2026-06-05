/**
 * PreferencesStore engineModeToggleEnabled Tests (Story 33.1)
 * Verifies the server-only billing-gate flag (_engineModeToggleEnabled) from
 * GET /api/preferences is surfaced as store state and excluded from the cache.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePreferencesStore } from '../preferencesStore';

const mockGet = vi.fn();
vi.mock('../../services/api/preferences', () => ({
  preferencesApi: {
    get: (...args: unknown[]) => mockGet(...args),
    update: vi.fn().mockResolvedValue({}),
  },
}));

describe('preferencesStore.engineModeToggleEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    usePreferencesStore.setState({
      preferences: {},
      overrides: [],
      engineModeToggleEnabled: false,
      loaded: false,
    });
  });

  it('surfaces _engineModeToggleEnabled=true from the server response', async () => {
    mockGet.mockResolvedValue({ theme: 'dark', _overrides: [], _engineModeToggleEnabled: true });
    await usePreferencesStore.getState().init();
    expect(usePreferencesStore.getState().engineModeToggleEnabled).toBe(true);
  });

  it('defaults engineModeToggleEnabled to false when the flag is absent', async () => {
    mockGet.mockResolvedValue({ theme: 'dark', _overrides: [] });
    await usePreferencesStore.getState().init();
    expect(usePreferencesStore.getState().engineModeToggleEnabled).toBe(false);
  });

  it('does not persist the server-only flag into the localStorage cache', async () => {
    mockGet.mockResolvedValue({ theme: 'dark', _engineModeToggleEnabled: true });
    await usePreferencesStore.getState().init();
    const cached = JSON.parse(localStorage.getItem('hammoc-preferences') || '{}');
    expect(cached._engineModeToggleEnabled).toBeUndefined();
    expect(cached.theme).toBe('dark');
  });
});
