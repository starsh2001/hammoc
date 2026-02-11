/**
 * Preferences API - Global user preferences endpoints
 */

import { api } from './client';
import type { UserPreferences } from '@bmad-studio/shared';

export const preferencesApi = {
  /** Get all preferences */
  get: () => api.get<UserPreferences>('/preferences'),

  /** Update preferences (merge) */
  update: (data: Partial<UserPreferences>) => api.patch<UserPreferences>('/preferences', data),
};
