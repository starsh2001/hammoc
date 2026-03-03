/**
 * PreferencesStore setLanguage Tests (Story 22.1 - Task 10.2)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePreferencesStore } from '../preferencesStore';
import i18n from '../../i18n';

vi.mock('../../services/api/preferences', () => ({
  preferencesApi: {
    get: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
}));

describe('preferencesStore.setLanguage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePreferencesStore.setState({
      preferences: { theme: 'dark' },
      overrides: [],
      loaded: true,
    });
  });

  it('calls i18n.changeLanguage with the given language', () => {
    const changeSpy = vi.spyOn(i18n, 'changeLanguage');
    usePreferencesStore.getState().setLanguage('ko');
    expect(changeSpy).toHaveBeenCalledWith('ko');
  });

  it('updates preferences.language in the store', () => {
    usePreferencesStore.getState().setLanguage('ja');
    expect(usePreferencesStore.getState().preferences.language).toBe('ja');
  });

  it('persists language to localStorage cache', () => {
    usePreferencesStore.getState().setLanguage('es');
    const cached = JSON.parse(localStorage.getItem('bmad-studio-preferences') || '{}');
    expect(cached.language).toBe('es');
  });
});
