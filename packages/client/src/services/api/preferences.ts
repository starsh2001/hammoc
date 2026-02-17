/**
 * Preferences API - Global user preferences endpoints
 */

import { api } from './client';
import type { UserPreferences, PreferencesApiResponse } from '@bmad-studio/shared';

export const preferencesApi = {
  /** Get all preferences (includes _overrides metadata) */
  get: () => api.get<PreferencesApiResponse>('/preferences'),

  /** Update preferences (merge) */
  update: (data: Partial<UserPreferences>) => api.patch<UserPreferences>('/preferences', data),
};
